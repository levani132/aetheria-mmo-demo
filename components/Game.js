import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import * as THREE from 'three';
import { buildWorld, tickWorld } from '../lib/three/world';
import {
  buildCharacter, buildMob, animateCharacter,
  playAttackSwing, tickAttackSwing, buildNameplate,
} from '../lib/three/characters';
import { FxManager } from '../lib/three/effects';
import { loadElfMageFemale } from '../lib/three/glbAssets';
import { ATTACK_RANGE_SQ } from '../lib/gamedata';
import HUD from './HUD';
import Inventory from './Inventory';
import Shop from './Shop';
import Chat from './Chat';

export default function Game({ session, onExit }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});

  const [vitals, setVitals]       = useState({ hp: 1, maxHp: 1, mp: 0, maxMp: 1, xp: 0, level: 1, gold: 0 });
  const [self, setSelf]           = useState(null);
  const [chatLog, setChatLog]     = useState([]);
  const [showInv, setShowInv]     = useState(false);
  const [showShop, setShowShop]   = useState(false);
  const [inSafeZone, setInSafeZone] = useState(true);
  const [dead, setDead]           = useState(false);
  const [zoneLabel, setZoneLabel] = useState('Town of Aetheria');
  const [target, setTarget]       = useState(null);    // {kind, id, name, hp, maxHp}

  // ── Mount: build scene & connect ──────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Scene & camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 600);

    // Build world
    const world = buildWorld(scene, { CITY_RADIUS: 35, FOREST_RADIUS: 140, GROUND_SIZE: 320 });

    // Kick off elf-mage-female GLB load eagerly. The first elf player to spawn
    // will get a brief procedural-placeholder before swap; subsequent elves are
    // instant because the asset is cached.
    loadElfMageFemale().catch(() => { /* glbAssets logs; silent here */ });

    // FX manager
    const fx = new FxManager(scene);

    // Local self placeholder created on join ack
    const players = new Map();   // id -> { mesh, lastPos, lastTime, nameplate, equipKey }
    const mobs = new Map();      // id -> { mesh, kind, lastHp, maxHp, dead, nameplate }
    const otherSnapshot = new Map(); // for interpolation

    stateRef.current = { renderer, scene, camera, world, fx, players, mobs };

    // Camera target (follows self)
    const camTarget = new THREE.Vector3(0, 1.4, 0);
    let camYaw = 0;          // controlled by RMB drag
    let camPitch = 0.6;
    let camDist = 9;
    let mouseDown = false;
    let lastMouse = { x: 0, y: 0 };

    // Move target (click-to-move)
    let moveTarget = null;
    let attackTarget = null; // { kind, id }

    // Local self ref
    let selfMesh = null;
    let selfId = null;

    // Local mirrors of zone state — used inside the rAF loop so we don't depend
    // on stale React closures. We update both the local var AND React state
    // only when the value actually transitions.
    let localInSafeZone = true;
    let localDead = false;

    // ── Socket setup ────────────────────────────────────────────────────────
    const socket = io({ path: '/socket.io/' });
    stateRef.current.socket = socket;

    socket.on('connect', () => {
      socket.emit('join', session, (resp) => {
        if (!resp?.ok) {
          alert(resp?.error || 'Failed to join');
          onExit?.();
          return;
        }
        selfId = resp.self.id;
        // Build self
        const sm = buildCharacter({
          charClass: resp.self.charClass,
          gender: resp.self.gender,
          race: resp.self.race,
          level: resp.self.level,
          equipment: resp.self.equipment,
          isSelf: true,
        });
        sm.position.set(resp.self.pos.x, 0, resp.self.pos.z);
        sm.rotation.y = resp.self.rot || 0;
        scene.add(sm);
        const np = buildNameplate(resp.self.username, resp.self.level, '#ffd76e');
        np.position.y = 2.7;
        sm.add(np);
        selfMesh = sm;
        players.set(selfId, {
          mesh: sm, nameplate: np, lastPos: { ...resp.self.pos }, lastTime: performance.now(),
          equipKey: keyOf(resp.self.equipment), level: resp.self.level,
        });

        setSelf({ ...resp.self });
        setVitals({
          hp: resp.self.hp, maxHp: resp.self.maxHp,
          mp: resp.self.mp, maxMp: resp.self.maxMp,
          xp: resp.self.xp, level: resp.self.level, gold: resp.self.gold,
        });

        // Build others & mobs
        for (const o of resp.others) addOtherPlayer(o);
        for (const m of resp.mobs)   addMob(m);
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
          window.__aetheria = { scene, camera, fx, players, mobs, socket, get self() { return players.get(selfId); } };
        }
      });
    });

    socket.on('player:join', (p) => addOtherPlayer(p));
    socket.on('player:leave', ({ id }) => {
      const rec = players.get(id);
      if (rec) { scene.remove(rec.mesh); players.delete(id); }
    });
    socket.on('player:equip', ({ id, equipment }) => {
      const rec = players.get(id);
      if (!rec) return;
      const key = keyOf(equipment);
      if (rec.equipKey === key) return;
      // Rebuild mesh (cheap for our small meshes)
      const oldMesh = rec.mesh;
      const charClass = oldMesh.userData.charClass;
      const gender = oldMesh.userData.gender;
      const race = oldMesh.userData.race;
      const level = rec.level || 1;
      const newMesh = buildCharacter({ charClass, gender, race, level, equipment, isSelf: id === selfId });
      newMesh.position.copy(oldMesh.position);
      newMesh.rotation.copy(oldMesh.rotation);
      scene.remove(oldMesh);
      scene.add(newMesh);
      rec.mesh = newMesh;
      rec.equipKey = key;
      // Re-attach nameplate
      const username = oldMesh.userData.username || (id === selfId ? session.username : 'Player');
      const np = buildNameplate(username, level, id === selfId ? '#ffd76e' : '#e8dcc4');
      np.position.y = 2.7;
      newMesh.add(np);
      newMesh.userData.username = username;
      rec.nameplate = np;
      if (id === selfId) selfMesh = newMesh;
    });

    socket.on('player:levelup', ({ id, level }) => {
      const rec = players.get(id);
      if (!rec) return;
      rec.level = level;
      fx.spawnLevelUpBurst(rec.mesh.position);
      // refresh nameplate
      const username = rec.mesh.userData.username || (id === selfId ? session.username : 'Player');
      rec.mesh.remove(rec.nameplate);
      const np = buildNameplate(username, level, id === selfId ? '#ffd76e' : '#e8dcc4');
      np.position.y = 2.7;
      rec.mesh.add(np);
      rec.nameplate = np;
    });

    socket.on('player:respawn', (p) => {
      const rec = players.get(p.id);
      if (!rec) return;
      rec.mesh.position.set(p.pos.x, 0, p.pos.z);
      if (p.id === selfId) {
        localDead = false;
        setDead(false);
      }
    });

    socket.on('combat:hit', ({ targetType, targetId, attackerId, dmg, spell }) => {
      // Show damage popup on target
      const tRec = targetType === 'mob' ? mobs.get(targetId) : players.get(targetId);
      if (!tRec) return;
      const pos = tRec.mesh.position;
      fx.spawnDamage(pos, dmg, '#ff6060');
      fx.spawnHitSparks(pos, spell ? 0x9a8aff : 0xffe080);
      // Trigger swing on attacker
      const aRec = players.get(attackerId);
      if (aRec) playAttackSwing(aRec.mesh);
    });

    socket.on('combat:kill', ({ mobId, killerId, gold, xp }) => {
      if (mobId) {
        const m = mobs.get(mobId);
        if (m) {
          // death animation: tilt over and fade
          m.dead = true;
          m.deadT = 0;
        }
      }
      if (killerId === selfId && gold) {
        fx.spawnDamage({ x: selfMesh.position.x, y: 1, z: selfMesh.position.z }, `+${gold}g  +${xp}xp`, '#ffd76e');
      }
    });

    socket.on('vitals', (v) => {
      setVitals(v);
      if (v.hp <= 0 && !localDead) {
        localDead = true;
        setDead(true);
      }
    });

    socket.on('snapshot', (snap) => {
      // Update other players + mobs from authoritative state
      const now = performance.now();
      for (const p of snap.players) {
        if (p.id === selfId) continue;
        let rec = players.get(p.id);
        if (!rec) { addOtherPlayer(p); rec = players.get(p.id); }
        if (!rec) continue;
        rec.targetPos = { x: p.pos.x, z: p.pos.z };
        rec.targetRot = p.rot;
        rec.moving = p.moving;
        rec.level = p.level;
      }
      for (const m of snap.mobs) {
        let rec = mobs.get(m.id);
        if (!rec) { addMob(m); rec = mobs.get(m.id); }
        if (!rec) continue;
        rec.targetPos = { x: m.pos.x, z: m.pos.z };
        rec.targetRot = m.rot;
        rec.lastHp = m.hp;
        rec.maxHp = m.maxHp;
        if (m.hp <= 0 && !rec.dead) {
          rec.dead = true; rec.deadT = 0;
        }
      }
      // update target panel
      if (attackTarget) {
        const t = attackTarget.kind === 'mob' ? mobs.get(attackTarget.id) : players.get(attackTarget.id);
        if (t) {
          if (attackTarget.kind === 'mob') {
            setTarget({ kind: 'mob', id: attackTarget.id, name: prettyMobName(t.kind), hp: t.lastHp, maxHp: t.maxHp });
          }
        } else {
          attackTarget = null; setTarget(null);
        }
      }
    });

    socket.on('chat:msg', (msg) => {
      setChatLog(log => [...log.slice(-40), msg]);
    });
    socket.on('chat:system', (text) => {
      setChatLog(log => [...log.slice(-40), { from: 'SYSTEM', text, ts: Date.now(), system: true }]);
    });

    function addOtherPlayer(p) {
      const m = buildCharacter({
        charClass: p.charClass, gender: p.gender, race: p.race, level: p.level,
        equipment: p.equipment, isSelf: false,
      });
      m.position.set(p.pos.x, 0, p.pos.z);
      m.rotation.y = p.rot || 0;
      m.userData.username = p.username;
      scene.add(m);
      const np = buildNameplate(p.username, p.level, '#e8dcc4');
      np.position.y = 2.7;
      m.add(np);
      players.set(p.id, {
        mesh: m, nameplate: np,
        targetPos: { x: p.pos.x, z: p.pos.z }, targetRot: p.rot,
        equipKey: keyOf(p.equipment), level: p.level,
      });
    }

    function addMob(m) {
      const mesh = buildMob(m.kind);
      mesh.position.set(m.pos.x, 0, m.pos.z);
      mesh.rotation.y = m.rot || 0;
      mesh.userData = { mobId: m.id, kind: m.kind, type: 'mob' };
      scene.add(mesh);
      mobs.set(m.id, {
        mesh, kind: m.kind,
        targetPos: { x: m.pos.x, z: m.pos.z }, targetRot: m.rot,
        lastHp: m.hp, maxHp: m.maxHp, dead: m.state === 'dead',
      });
    }

    // ── Input ───────────────────────────────────────────────────────────────
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.addEventListener('contextmenu', e => e.preventDefault());

    const keys = new Set();
    const onKeyDown = (e) => {
      keys.add(e.code);
      if (e.code === 'KeyI') setShowInv(s => !s);
      if (e.code === 'KeyB') {
        // Open shop only if near a shop building (we treat anything in town as "shop accessible")
        if (selfMesh && Math.hypot(selfMesh.position.x, selfMesh.position.z) < 32) setShowShop(s => !s);
        else setShowShop(false);
      }
      if (e.code === 'Escape') { setShowInv(false); setShowShop(false); }
    };
    const onKeyUp = (e) => keys.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onMouseDown = (e) => {
      if (e.button === 2) {
        mouseDown = true;
        lastMouse = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0) {
        // Pick mob/player or set move target
        const rect = dom.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);

        // Try mob hit first
        const mobMeshes = [];
        for (const rec of mobs.values()) if (!rec.dead) mobMeshes.push(rec.mesh);
        const playerMeshes = [];
        for (const [id, rec] of players) if (id !== selfId) playerMeshes.push(rec.mesh);

        const allTargets = [...mobMeshes, ...playerMeshes];
        const hits = ray.intersectObjects(allTargets, true);
        if (hits.length > 0) {
          // Walk up to find the mob/player root
          let root = hits[0].object;
          while (root.parent && !root.userData.mobId && !root.userData.username) root = root.parent;
          if (root.userData.mobId) {
            attackTarget = { kind: 'mob', id: root.userData.mobId };
            const r = mobs.get(root.userData.mobId);
            setTarget({ kind: 'mob', id: root.userData.mobId, name: prettyMobName(r.kind), hp: r.lastHp, maxHp: r.maxHp });
            return;
          }
          if (root.userData.username) {
            // find id
            let pid = null;
            for (const [id, rec] of players) { if (rec.mesh === root) { pid = id; break; } }
            if (pid && pid !== selfId) {
              attackTarget = { kind: 'player', id: pid };
              setTarget({ kind: 'player', id: pid, name: root.userData.username });
              return;
            }
          }
        }

        // Otherwise: ground click → set move target
        const groundHits = ray.intersectObject(world.ground);
        if (groundHits.length > 0) {
          const p = groundHits[0].point;
          moveTarget = new THREE.Vector3(p.x, 0, p.z);
          attackTarget = null;
          setTarget(null);
        }
      }
    };
    const onMouseUp = (e) => {
      if (e.button === 2) mouseDown = false;
    };
    const onMouseMove = (e) => {
      if (mouseDown) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        camYaw -= dx * 0.005;
        camPitch = Math.max(0.15, Math.min(1.4, camPitch - dy * 0.004));
        lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const onWheel = (e) => {
      camDist = Math.max(4, Math.min(20, camDist + Math.sign(e.deltaY) * 0.6));
    };
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    dom.addEventListener('wheel', onWheel);

    // ── Resize ──────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // ── Main loop ───────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let lastSync = 0;
    let lastAttack = 0;

    function loop() {
      const dt = Math.min(0.05, clock.getDelta());
      const now = performance.now();
      const time = clock.elapsedTime;

      tickWorld(world, time);
      fx.tick(dt);

      // ── Self movement (WASD or click-to-move) ─────────────────────────────
      if (selfMesh && !localDead) {
        const speed = 5.5;
        // Forward = the direction the camera is looking (away from the camera).
        // Camera is at target + (sin(yaw), _, cos(yaw)) * dist, so the look
        // direction is the negation.
        const forward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
        // Right = camera's right (perpendicular to forward in the XZ plane).
        // At yaw=0: forward=(0,0,-1), right should be (1,0,0).
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const move = new THREE.Vector3();

        let isMoving = false;

        if (keys.has('KeyW')) { move.add(forward); isMoving = true; }
        if (keys.has('KeyS')) { move.sub(forward); isMoving = true; }
        if (keys.has('KeyA')) { move.sub(right);   isMoving = true; }
        if (keys.has('KeyD')) { move.add(right);   isMoving = true; }

        if (isMoving) {
          moveTarget = null; // WASD overrides click-move
        } else if (moveTarget) {
          const dx = moveTarget.x - selfMesh.position.x;
          const dz = moveTarget.z - selfMesh.position.z;
          const len = Math.hypot(dx, dz);
          if (len < 0.3) {
            moveTarget = null;
          } else {
            move.set(dx / len, 0, dz / len);
            isMoving = true;
          }
        }

        if (isMoving) {
          move.normalize().multiplyScalar(speed * dt);
          selfMesh.position.add(move);
          // clamp to map
          const r = Math.hypot(selfMesh.position.x, selfMesh.position.z);
          if (r > 138) {
            selfMesh.position.x *= 138 / r;
            selfMesh.position.z *= 138 / r;
          }
          // face direction of motion
          const targetRot = Math.atan2(move.x, move.z);
          selfMesh.rotation.y = lerpAngle(selfMesh.rotation.y, targetRot, 0.25);
        }

        animateCharacter(selfMesh, dt, isMoving);
        tickAttackSwing(selfMesh, dt);

        // Auto-attack target if in range. Range is class-flavored — mages cast
        // from afar; warriors close to melee distance. Read class from the mesh
        // userData (not the React `self` state, which the rAF closure cant see).
        if (attackTarget && now - lastAttack > 700) {
          const t = attackTarget.kind === 'mob' ? mobs.get(attackTarget.id) : players.get(attackTarget.id);
          if (t && !t.dead) {
            const dx = t.mesh.position.x - selfMesh.position.x;
            const dz = t.mesh.position.z - selfMesh.position.z;
            const d2 = dx * dx + dz * dz;
            const myClass = selfMesh.userData.charClass;
            const rangeSq = ATTACK_RANGE_SQ[myClass] ?? 9;
            if (d2 < rangeSq) {
              lastAttack = now;
              socket.emit('attack', { targetType: attackTarget.kind, targetId: attackTarget.id });
              // local swing feedback (server confirms via combat:hit)
              playAttackSwing(selfMesh);
              if (myClass === 'mage') {
                fx.spawnSpellProjectile(
                  selfMesh.position, t.mesh.position,
                  0x9a6aff,
                );
              }
            } else {
              // walk toward target
              const len = Math.sqrt(d2);
              const m = new THREE.Vector3(dx / len, 0, dz / len).multiplyScalar(speed * dt);
              selfMesh.position.add(m);
              selfMesh.rotation.y = lerpAngle(selfMesh.rotation.y, Math.atan2(m.x, m.z), 0.25);
              animateCharacter(selfMesh, dt, true);
            }
          } else {
            attackTarget = null;
            setTarget(null);
          }
        }

        // Sync to server (10 Hz)
        if (now - lastSync > 100) {
          lastSync = now;
          socket.emit('move', {
            pos: { x: selfMesh.position.x, y: 0, z: selfMesh.position.z },
            rot: selfMesh.rotation.y,
            moving: isMoving,
          });
        }

        // Safe-zone check — use local mirror to avoid React-closure staleness
        const inCity = Math.hypot(selfMesh.position.x, selfMesh.position.z) < 35;
        if (inCity !== localInSafeZone) {
          localInSafeZone = inCity;
          setInSafeZone(inCity);
          setZoneLabel(inCity ? 'Town of Aetheria' : 'Whispering Forest  ⚔  PvP enabled');
        }
      }

      // ── Interpolate other players ─────────────────────────────────────────
      for (const [id, rec] of players) {
        if (id === selfId) continue;
        if (rec.targetPos) {
          rec.mesh.position.x += (rec.targetPos.x - rec.mesh.position.x) * 0.18;
          rec.mesh.position.z += (rec.targetPos.z - rec.mesh.position.z) * 0.18;
        }
        if (rec.targetRot != null) {
          rec.mesh.rotation.y = lerpAngle(rec.mesh.rotation.y, rec.targetRot, 0.18);
        }
        animateCharacter(rec.mesh, dt, !!rec.moving);
        tickAttackSwing(rec.mesh, dt);
      }

      // ── Interpolate mobs ──────────────────────────────────────────────────
      for (const [id, rec] of mobs) {
        if (rec.dead) {
          rec.deadT = (rec.deadT || 0) + dt;
          // tilt over and sink
          rec.mesh.rotation.x = Math.min(rec.deadT * 3, Math.PI / 2);
          rec.mesh.position.y = -Math.min(rec.deadT * 0.5, 0.4);
          if (rec.deadT > 14) {
            // wait for server-side respawn snapshot to put it back; reset visuals lazily
            rec.mesh.rotation.x = 0;
            rec.mesh.position.y = 0;
            rec.dead = false;
            rec.deadT = 0;
          }
          continue;
        }
        if (rec.targetPos) {
          rec.mesh.position.x += (rec.targetPos.x - rec.mesh.position.x) * 0.18;
          rec.mesh.position.z += (rec.targetPos.z - rec.mesh.position.z) * 0.18;
        }
        if (rec.targetRot != null) rec.mesh.rotation.y = lerpAngle(rec.mesh.rotation.y, rec.targetRot, 0.18);
      }

      // ── Camera follow ─────────────────────────────────────────────────────
      if (selfMesh) {
        camTarget.lerp(new THREE.Vector3(selfMesh.position.x, 1.4, selfMesh.position.z), 0.15);
        const cx = camTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
        const cz = camTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
        const cy = camTarget.y + Math.sin(camPitch) * camDist;
        camera.position.set(cx, cy, cz);
        camera.lookAt(camTarget);
      }

      renderer.render(scene, camera);
      stateRef.current.raf = requestAnimationFrame(loop);
    }
    stateRef.current.raf = requestAnimationFrame(loop);

    // Cleanup
    return () => {
      cancelAnimationFrame(stateRef.current.raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      dom.removeEventListener('mousedown', onMouseDown);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', e => e.preventDefault());
      socket.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line
  }, []);

  // ── Actions exposed to UI ──────────────────────────────────────────────────
  const sendChat = (text) => stateRef.current.socket?.emit('chat', { text });
  const buyItem = (itemId) => new Promise((res) => {
    stateRef.current.socket?.emit('shop:buy', { itemId }, (resp) => {
      if (resp?.ok) {
        setSelf(s => s ? ({ ...s, gold: resp.gold, inventory: resp.inventory }) : s);
        setVitals(v => ({ ...v, gold: resp.gold }));
      }
      res(resp);
    });
  });
  const equipItem = (itemId) => new Promise((res) => {
    stateRef.current.socket?.emit('equip', { itemId }, (resp) => {
      if (resp?.ok) {
        setSelf(s => s ? ({ ...s, equipment: resp.equipment, ...resp.stats }) : s);
        setVitals(v => ({ ...v, hp: resp.stats.hp, maxHp: resp.stats.maxHp, mp: resp.stats.mp, maxMp: resp.stats.maxMp }));
      }
      res(resp);
    });
  });
  const respawn = () => stateRef.current.socket?.emit('respawn');

  return (
    <div className="game-root">
      <div className="canvas-mount" ref={mountRef} />

      <HUD vitals={vitals} self={self} target={target} zoneLabel={zoneLabel} inSafeZone={inSafeZone} />

      <Chat log={chatLog} onSend={sendChat} />

      <div className="hotbar">
        <button onClick={() => setShowInv(s => !s)} title="Inventory (I)">
          <span>𓀉</span> Inventory <kbd>I</kbd>
        </button>
        <button
          onClick={() => setShowShop(s => !s)}
          disabled={!inSafeZone}
          title={inSafeZone ? 'Shop (B)' : 'Return to town to shop'}
        >
          <span>⚒</span> Shop <kbd>B</kbd>
        </button>
        <button onClick={onExit} title="Exit">
          <span>⤴</span> Exit
        </button>
      </div>

      {showInv && self && (
        <Inventory self={self} vitals={vitals} onEquip={equipItem} onClose={() => setShowInv(false)} />
      )}
      {showShop && self && (
        <Shop self={self} vitals={vitals} onBuy={buyItem} onClose={() => setShowShop(false)} />
      )}

      {dead && (
        <div className="death-overlay">
          <div className="death-card">
            <h1>You have fallen.</h1>
            <p>Your spirit lingers in the wood. Return to town?</p>
            <button onClick={respawn}>Respawn at fountain</button>
          </div>
        </div>
      )}
    </div>
  );
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

function keyOf(eq) {
  return [eq?.weapon, eq?.armor, eq?.helmet, eq?.ring].join('|');
}

function prettyMobName(kind) {
  return ({
    forest_wolf: 'Forest Wolf',
    goblin: 'Goblin',
    bandit: 'Bandit',
    dire_bear: 'Dire Bear',
    troll: 'Forest Troll',
  })[kind] || kind;
}
