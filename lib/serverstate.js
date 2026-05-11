// Authoritative game state. Clients send intents (move, attack, buy);
// the server validates and broadcasts results. Mobs run a tiny FSM here.

const { PlayerStore } = require('./models');
const { ITEMS, MOBS, WORLD, STARTER, ATTACK_RANGE_SQ, xpForLevel, statsForLevel } = require('./gamedata');
const { hashPassword, verifyPassword } = require('./auth');

// ─── Live state ─────────────────────────────────────────────────────────────
const players = new Map();   // socketId -> player runtime obj
const mobs = new Map();      // mobId -> mob runtime obj
let nextMobId = 1;

// ─── Helpers ────────────────────────────────────────────────────────────────
const dist2 = (a, b) => {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
};
const inSafeZone = (pos) => dist2(pos, { x: 0, z: 0 }) < WORLD.CITY_RADIUS * WORLD.CITY_RADIUS;
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

function computeDerivedStats(p) {
  const base = statsForLevel(p.charClass, p.level);
  let atk = base.atk, def = base.def, matk = base.matk, mdef = base.mdef;
  let hpBonus = 0, mpBonus = 0;
  for (const slot of ['weapon', 'armor', 'helmet', 'ring']) {
    const id = p.equipment?.[slot];
    if (!id) continue;
    const item = ITEMS[id];
    if (!item) continue;
    atk += item.atk || 0;
    def += item.def || 0;
    matk += item.matk || 0;
    mdef += item.mdef || 0;
    hpBonus += item.hp || 0;
    mpBonus += item.mp || 0;
  }
  return {
    atk, def, matk, mdef,
    maxHp: base.hp + hpBonus,
    maxMp: base.mp + mpBonus,
  };
}

function publicPlayerView(p) {
  return {
    id: p.socketId,
    username: p.username,
    charClass: p.charClass,
    gender: p.gender,
    race: p.race,
    level: p.level,
    pos: p.pos,
    rot: p.rot,
    hp: p.hp, maxHp: p.maxHp,
    mp: p.mp, maxMp: p.maxMp,
    equipment: p.equipment,
    moving: p.moving,
    casting: p.casting,
  };
}

function publicMobView(m) {
  return {
    id: m.id, kind: m.kind,
    pos: m.pos, rot: m.rot,
    hp: m.hp, maxHp: m.maxHp,
    level: m.level,
    state: m.state,
  };
}

// ─── Mob spawning ───────────────────────────────────────────────────────────
function spawnMob(kind, x, z) {
  const def = MOBS[kind];
  const id = 'm' + (nextMobId++);
  const mob = {
    id,
    kind,
    pos: { x, y: 0, z },
    home: { x, y: 0, z },
    rot: Math.random() * Math.PI * 2,
    hp: def.hp, maxHp: def.hp,
    level: def.level,
    atk: def.atk,
    state: 'idle',           // idle | wander | chase | attack | dead
    target: null,
    nextThink: Date.now() + rand(1000, 3000),
    lastAttack: 0,
    respawnAt: 0,
  };
  mobs.set(id, mob);
  return mob;
}

function seedWorld() {
  const kinds = Object.keys(MOBS);
  for (let i = 0; i < WORLD.MOB_SPAWN_COUNT; i++) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    // Spawn in forest annulus (between safe-zone edge and forest edge)
    const angle = Math.random() * Math.PI * 2;
    const r = rand(WORLD.CITY_RADIUS + 8, WORLD.FOREST_RADIUS - 10);
    spawnMob(kind, Math.cos(angle) * r, Math.sin(angle) * r);
  }
}

// ─── Mob AI tick ────────────────────────────────────────────────────────────
function mobTick(mob, dt, now) {
  if (mob.state === 'dead') {
    if (now >= mob.respawnAt) {
      const def = MOBS[mob.kind];
      mob.hp = def.hp;
      mob.pos = { ...mob.home };
      mob.state = 'idle';
      mob.target = null;
    }
    return;
  }

  // Find closest player in aggro range (and not in safe zone)
  let closest = null, closestD2 = Infinity;
  for (const p of players.values()) {
    if (p.hp <= 0) continue;
    if (inSafeZone(p.pos)) continue;
    const d2 = dist2(mob.pos, p.pos);
    if (d2 < closestD2) { closestD2 = d2; closest = p; }
  }

  const aggroRange = 12;
  const attackRange = 2.2;
  const leashRange = 25;

  if (closest && closestD2 < aggroRange * aggroRange) {
    mob.state = 'chase';
    mob.target = closest.socketId;
  }

  if (mob.state === 'chase') {
    const target = closest;
    if (!target || dist2(mob.home, mob.pos) > leashRange * leashRange) {
      mob.state = 'idle';
      mob.target = null;
    } else if (closestD2 < attackRange * attackRange) {
      mob.state = 'attack';
      // Attack on cooldown
      if (now - mob.lastAttack > 1400) {
        mob.lastAttack = now;
        const dmg = Math.max(1, mob.atk - Math.floor((target.def || 0) * 0.6));
        target.hp = Math.max(0, target.hp - dmg);
        target._pendingDamage = (target._pendingDamage || 0) + dmg;
        if (target.hp <= 0) {
          target._died = true;
        }
      }
    } else {
      // Move toward target
      const dx = target.pos.x - mob.pos.x;
      const dz = target.pos.z - mob.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const speed = 3.0;
      mob.pos.x += (dx / len) * speed * dt;
      mob.pos.z += (dz / len) * speed * dt;
      mob.rot = Math.atan2(dx, dz);
    }
  } else if (mob.state === 'idle' || mob.state === 'wander') {
    if (now > mob.nextThink) {
      // wander toward a random nearby point
      const angle = Math.random() * Math.PI * 2;
      const r = rand(2, 6);
      mob._wanderTo = {
        x: mob.home.x + Math.cos(angle) * r,
        z: mob.home.z + Math.sin(angle) * r,
      };
      mob.state = 'wander';
      mob.nextThink = now + randInt(2500, 5500);
    }
    if (mob._wanderTo) {
      const dx = mob._wanderTo.x - mob.pos.x;
      const dz = mob._wanderTo.z - mob.pos.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.3) {
        mob._wanderTo = null;
        mob.state = 'idle';
      } else {
        const speed = 1.2;
        mob.pos.x += (dx / len) * speed * dt;
        mob.pos.z += (dz / len) * speed * dt;
        mob.rot = Math.atan2(dx, dz);
      }
    }
  }
}

// ─── Combat resolution from players ─────────────────────────────────────────
function playerAttackMob(player, mobId, io) {
  const mob = mobs.get(mobId);
  if (!mob || mob.state === 'dead') return;
  const rangeSq = ATTACK_RANGE_SQ[player.charClass] ?? 9;
  if (dist2(player.pos, mob.pos) > rangeSq) return;    // out of range
  if (Date.now() - (player._lastAttack || 0) < 700) return;
  player._lastAttack = Date.now();

  const isMage = player.charClass === 'mage';
  const power = isMage ? player.matk : player.atk;
  const dmg = Math.max(1, Math.floor(power * rand(0.85, 1.15)));
  mob.hp = Math.max(0, mob.hp - dmg);

  io.emit('combat:hit', {
    targetType: 'mob',
    targetId: mob.id,
    attackerId: player.socketId,
    dmg,
    isCrit: false,
    spell: isMage,
  });

  if (mob.hp <= 0) {
    const def = MOBS[mob.kind];
    mob.state = 'dead';
    mob.respawnAt = Date.now() + 15000;
    const goldGain = randInt(def.gold[0], def.gold[1]);
    player.gold += goldGain;
    grantXp(player, def.xp, io);
    io.emit('combat:kill', {
      mobId: mob.id,
      killerId: player.socketId,
      gold: goldGain,
      xp: def.xp,
    });
  }
}

function playerAttackPlayer(attacker, targetId, io) {
  const target = players.get(targetId);
  if (!target || target.hp <= 0) return;
  if (inSafeZone(attacker.pos) || inSafeZone(target.pos)) return;
  const rangeSq = ATTACK_RANGE_SQ[attacker.charClass] ?? 9;
  if (dist2(attacker.pos, target.pos) > rangeSq) return;
  if (Date.now() - (attacker._lastAttack || 0) < 700) return;
  attacker._lastAttack = Date.now();

  const isMage = attacker.charClass === 'mage';
  const power = isMage ? attacker.matk : attacker.atk;
  const defense = isMage ? target.mdef : target.def;
  const dmg = Math.max(1, Math.floor(power * rand(0.85, 1.15)) - Math.floor(defense * 0.7));
  target.hp = Math.max(0, target.hp - dmg);

  io.emit('combat:hit', {
    targetType: 'player',
    targetId: target.socketId,
    attackerId: attacker.socketId,
    dmg,
    isCrit: false,
    spell: isMage,
  });

  if (target.hp <= 0) {
    target._died = true;
    io.emit('combat:kill', { playerId: target.socketId, killerId: attacker.socketId });
  }
}

function grantXp(player, amount, io) {
  player.xp += amount;
  let leveled = false;
  while (player.level < 20 && player.xp >= xpForLevel(player.level + 1)) {
    player.level += 1;
    leveled = true;
  }
  if (leveled) {
    Object.assign(player, computeDerivedStats(player));
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    io.emit('player:levelup', { id: player.socketId, level: player.level });
  }
}

function respawnPlayer(player) {
  player.hp = player.maxHp;
  player.mp = player.maxMp;
  player.pos = { ...WORLD.SPAWN_POINT };
  player._died = false;
}

// ─── Persistence ────────────────────────────────────────────────────────────
// Returns { ok, record?, error?, isNew? }
async function authenticateOrRegister({ username, password, charClass, gender, race }) {
  let record = await PlayerStore.findOne({ username });

  if (record) {
    // Existing account → must verify password.
    if (!verifyPassword(password, record.passwordHash)) {
      return { ok: false, error: 'Wrong password' };
    }
    // Legacy records (pre-race) default to human.
    if (!record.race) record.race = 'human';
    return { ok: true, record, isNew: false };
  }

  // New account → must supply class + gender. Race is optional and defaults to human.
  if (!charClass || !gender) {
    return { ok: false, error: 'needs_character', needsCharacter: true };
  }
  if (!['warrior', 'mage'].includes(charClass) || !['male', 'female'].includes(gender)) {
    return { ok: false, error: 'Invalid class or gender' };
  }
  const safeRace = ['human', 'elves'].includes(race) ? race : 'human';
  const stats = statsForLevel(charClass, 1);
  const passwordHash = hashPassword(password);
  record = await PlayerStore.create({
    username, charClass, gender, race: safeRace, passwordHash,
    level: 1, xp: 0, gold: 50,
    hp: stats.hp, maxHp: stats.hp,
    mp: stats.mp, maxMp: stats.mp,
    pos: WORLD.SPAWN_POINT,
    inventory: [],
    equipment: STARTER[charClass],
  });
  return { ok: true, record, isNew: true };
}

async function persistPlayer(player) {
  try {
    await PlayerStore.update(player.username, {
      level: player.level, xp: player.xp, gold: player.gold,
      hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp,
      pos: player.pos, equipment: player.equipment, inventory: player.inventory,
    });
  } catch (e) { /* swallow — demo */ }
}

// ─── Socket handlers ────────────────────────────────────────────────────────
function attachSocketHandlers(io) {
  seedWorld();

  io.on('connection', (socket) => {
    let player = null;

    // Pre-flight: does this username exist? If yes, is the password correct?
    // Lets the client decide whether to show class/gender selection.
    socket.on('auth:check', async ({ username, password }, ack) => {
      try {
        if (!username || !/^[a-zA-Z0-9_]{2,16}$/.test(username)) {
          return ack && ack({ ok: false, error: 'Username must be 2–16 letters, numbers, or underscores.' });
        }
        if (!password || password.length < 4) {
          return ack && ack({ ok: false, error: 'Password must be at least 4 characters.' });
        }
        const record = await PlayerStore.findOne({ username });
        if (!record) {
          return ack && ack({ ok: true, exists: false });
        }
        if (!verifyPassword(password, record.passwordHash)) {
          return ack && ack({ ok: false, exists: true, error: 'Wrong password.' });
        }
        return ack && ack({
          ok: true, exists: true,
          character: {
            charClass: record.charClass,
            gender: record.gender,
            race: record.race || 'human',
            level: record.level,
          },
        });
      } catch (e) {
        console.error('auth:check error', e);
        return ack && ack({ ok: false, error: 'Server error' });
      }
    });

    socket.on('join', async ({ username, password, charClass, gender, race }, ack) => {
      try {
        if (!username || !/^[a-zA-Z0-9_]{2,16}$/.test(username)) {
          return ack && ack({ ok: false, error: 'Username must be 2–16 letters, numbers, or underscores.' });
        }
        if (!password || password.length < 4) {
          return ack && ack({ ok: false, error: 'Password must be at least 4 characters.' });
        }
        // Don't allow same username twice concurrently
        for (const p of players.values()) {
          if (p.username === username) {
            return ack && ack({ ok: false, error: 'That hero is already in the realm.' });
          }
        }

        const auth = await authenticateOrRegister({ username, password, charClass, gender, race });
        if (!auth.ok) {
          return ack && ack({ ok: false, error: auth.error, needsCharacter: auth.needsCharacter });
        }
        const record = auth.record;

        player = {
          socketId: socket.id,
          username: record.username,
          charClass: record.charClass,
          gender: record.gender,
          race: record.race || 'human',
          level: record.level,
          xp: record.xp,
          gold: record.gold,
          hp: record.hp, maxHp: record.maxHp,
          mp: record.mp, maxMp: record.maxMp,
          pos: { ...record.pos },
          rot: 0,
          inventory: record.inventory || [],
          equipment: record.equipment || STARTER[record.charClass],
          moving: false,
          casting: false,
        };
        Object.assign(player, computeDerivedStats(player));
        if (player.hp > player.maxHp) player.hp = player.maxHp;
        if (player.mp > player.maxMp) player.mp = player.maxMp;
        players.set(socket.id, player);

        // Send self-state
        ack && ack({
          ok: true,
          self: {
            ...publicPlayerView(player),
            xp: player.xp,
            gold: player.gold,
            inventory: player.inventory,
            atk: player.atk, def: player.def, matk: player.matk, mdef: player.mdef,
          },
          others: Array.from(players.values())
            .filter(p => p.socketId !== socket.id)
            .map(publicPlayerView),
          mobs: Array.from(mobs.values()).map(publicMobView),
          world: WORLD,
        });

        // Tell others
        socket.broadcast.emit('player:join', publicPlayerView(player));
        io.emit('chat:system', `${player.username} entered the realm.`);
      } catch (e) {
        console.error('join error', e);
        ack && ack({ ok: false, error: 'Server error' });
      }
    });

    socket.on('move', ({ pos, rot, moving }) => {
      if (!player || player.hp <= 0) return;
      // Trust pos but clamp to map bounds
      const r2 = pos.x * pos.x + pos.z * pos.z;
      if (r2 > WORLD.FOREST_RADIUS * WORLD.FOREST_RADIUS) return;
      player.pos = { x: pos.x, y: 0, z: pos.z };
      player.rot = rot;
      player.moving = !!moving;
    });

    socket.on('attack', ({ targetType, targetId }) => {
      if (!player || player.hp <= 0) return;
      if (targetType === 'mob') playerAttackMob(player, targetId, io);
      else if (targetType === 'player') playerAttackPlayer(player, targetId, io);
    });

    socket.on('respawn', () => {
      if (!player || player.hp > 0) return;
      respawnPlayer(player);
      io.emit('player:respawn', publicPlayerView(player));
    });

    socket.on('shop:buy', ({ itemId }, ack) => {
      if (!player) return ack && ack({ ok: false });
      const item = ITEMS[itemId];
      if (!item) return ack && ack({ ok: false, error: 'No such item' });
      if (item.class && item.class !== player.charClass) return ack && ack({ ok: false, error: 'Wrong class' });
      if (player.gold < item.price) return ack && ack({ ok: false, error: 'Not enough gold' });
      if (!inSafeZone(player.pos)) return ack && ack({ ok: false, error: 'Must be in town' });
      player.gold -= item.price;
      const slot = player.inventory.find(s => s.id === itemId);
      if (slot) slot.qty += 1;
      else player.inventory.push({ id: itemId, qty: 1 });
      ack && ack({ ok: true, gold: player.gold, inventory: player.inventory });
    });

    socket.on('equip', ({ itemId }, ack) => {
      if (!player) return ack && ack({ ok: false });
      const has = player.inventory.find(s => s.id === itemId && s.qty > 0);
      if (!has) return ack && ack({ ok: false, error: 'You do not own that' });
      const item = ITEMS[itemId];
      if (!item) return ack && ack({ ok: false });
      if (item.class && item.class !== player.charClass) return ack && ack({ ok: false, error: 'Wrong class' });
      player.equipment[item.slot] = itemId;
      Object.assign(player, computeDerivedStats(player));
      if (player.hp > player.maxHp) player.hp = player.maxHp;
      if (player.mp > player.maxMp) player.mp = player.maxMp;
      io.emit('player:equip', { id: player.socketId, equipment: player.equipment });
      ack && ack({
        ok: true,
        equipment: player.equipment,
        stats: { atk: player.atk, def: player.def, matk: player.matk, mdef: player.mdef, maxHp: player.maxHp, maxMp: player.maxMp, hp: player.hp, mp: player.mp },
      });
    });

    socket.on('chat', ({ text }) => {
      if (!player) return;
      const clean = String(text || '').slice(0, 200).trim();
      if (!clean) return;
      io.emit('chat:msg', { from: player.username, text: clean, ts: Date.now() });
    });

    socket.on('disconnect', async () => {
      if (!player) return;
      await persistPlayer(player);
      players.delete(socket.id);
      io.emit('player:leave', { id: socket.id });
      io.emit('chat:system', `${player.username} left the realm.`);
    });
  });
}

// ─── Game loop (broadcasts state at 15 Hz) ──────────────────────────────────
function startGameLoop(io) {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;

    // Mob tick
    for (const mob of mobs.values()) mobTick(mob, dt, now);

    // HP regen out of combat (lazy)
    for (const p of players.values()) {
      if (p.hp > 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.005); // 0.5%/tick
      }
      if (p.mp < p.maxMp) {
        p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.008);
      }
    }

    // Broadcast snapshot
    io.emit('snapshot', {
      t: now,
      players: Array.from(players.values()).map(p => ({
        ...publicPlayerView(p),
        _dmg: p._pendingDamage || 0,
        _died: !!p._died,
      })),
      mobs: Array.from(mobs.values()).map(publicMobView),
    });

    // Per-player private update (gold/xp/inv changes already pushed via acks,
    // but send vitals + xp every tick for HUD accuracy)
    for (const p of players.values()) {
      io.to(p.socketId).emit('vitals', {
        hp: p.hp, maxHp: p.maxHp,
        mp: p.mp, maxMp: p.maxMp,
        xp: p.xp, level: p.level,
        gold: p.gold,
      });
      p._pendingDamage = 0;
    }
  }, 1000 / 15);

  // Periodic persistence every 30s
  setInterval(async () => {
    for (const p of players.values()) await persistPlayer(p);
  }, 30000);
}

module.exports = { attachSocketHandlers, startGameLoop };
