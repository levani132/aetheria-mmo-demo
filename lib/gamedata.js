// Single source of truth for game balance & content.
// Items, mobs, leveling curve, and world layout constants live here.
// Imported by both server (authoritative) and client (rendering hints).

const ITEMS = {
  // weapons
  rusty_sword:    { id: 'rusty_sword',    name: 'Rusty Sword',    slot: 'weapon', class: 'warrior', tier: 1, atk: 5,  price: 30 },
  iron_sword:     { id: 'iron_sword',     name: 'Iron Sword',     slot: 'weapon', class: 'warrior', tier: 2, atk: 12, price: 180 },
  steel_blade:    { id: 'steel_blade',    name: 'Steel Blade',    slot: 'weapon', class: 'warrior', tier: 3, atk: 22, price: 600 },
  oaken_staff:    { id: 'oaken_staff',    name: 'Oaken Staff',    slot: 'weapon', class: 'mage',    tier: 1, atk: 4,  matk: 8,  price: 35 },
  arcane_staff:   { id: 'arcane_staff',   name: 'Arcane Staff',   slot: 'weapon', class: 'mage',    tier: 2, atk: 6,  matk: 18, price: 200 },
  voidcaller:     { id: 'voidcaller',     name: 'Voidcaller',     slot: 'weapon', class: 'mage',    tier: 3, atk: 8,  matk: 30, price: 650 },

  // armor
  leather_vest:   { id: 'leather_vest',   name: 'Leather Vest',   slot: 'armor',  tier: 1, def: 5,  price: 40 },
  chainmail:      { id: 'chainmail',      name: 'Chainmail',      slot: 'armor',  tier: 2, def: 14, price: 220 },
  plate_armor:    { id: 'plate_armor',    name: 'Plate Armor',    slot: 'armor',  tier: 3, def: 26, price: 700 },
  apprentice_robe:{ id: 'apprentice_robe',name: 'Apprentice Robe',slot: 'armor',  tier: 1, def: 3, mdef: 6, price: 45 },
  mages_robe:     { id: 'mages_robe',     name: "Mage's Robe",    slot: 'armor',  tier: 2, def: 6, mdef: 16, price: 240 },
  archmage_robe:  { id: 'archmage_robe',  name: 'Archmage Robe',  slot: 'armor',  tier: 3, def: 10, mdef: 28, price: 720 },

  // helmets
  leather_cap:    { id: 'leather_cap',    name: 'Leather Cap',    slot: 'helmet', tier: 1, def: 2,  price: 25 },
  iron_helm:      { id: 'iron_helm',      name: 'Iron Helm',      slot: 'helmet', tier: 2, def: 7,  price: 150 },
  hood_of_focus:  { id: 'hood_of_focus',  name: 'Hood of Focus',  slot: 'helmet', tier: 1, mdef: 4, price: 30 },

  // rings
  ring_of_vigor:  { id: 'ring_of_vigor',  name: 'Ring of Vigor',  slot: 'ring', tier: 1, hp: 20, price: 80 },
  ring_of_might:  { id: 'ring_of_might',  name: 'Ring of Might',  slot: 'ring', tier: 2, atk: 5,  price: 250 },
  ring_of_arcana: { id: 'ring_of_arcana', name: 'Ring of Arcana', slot: 'ring', tier: 2, matk: 6, mp: 20, price: 280 },
};

// Mobs are spawned in the forest. Each has a level requirement and reward XP.
const MOBS = {
  forest_wolf: { id: 'forest_wolf', name: 'Forest Wolf', level: 2,  hp: 35,  atk: 6,  xp: 18, gold: [4, 9],   color: 0x6e6e7a, scale: 0.9 },
  goblin:      { id: 'goblin',      name: 'Goblin',      level: 4,  hp: 60,  atk: 10, xp: 35, gold: [8, 16],  color: 0x4a6840, scale: 0.85 },
  bandit:      { id: 'bandit',      name: 'Bandit',      level: 7,  hp: 110, atk: 16, xp: 65, gold: [14, 28], color: 0x5a3a2a, scale: 1.0 },
  dire_bear:   { id: 'dire_bear',   name: 'Dire Bear',   level: 11, hp: 220, atk: 24, xp: 130, gold: [25, 45],color: 0x3d2817, scale: 1.4 },
  troll:       { id: 'troll',       name: 'Forest Troll',level: 15, hp: 380, atk: 34, xp: 220, gold: [40, 70],color: 0x2d4a30, scale: 1.7 },
};

// XP needed to reach level N+1 from level N. Soft cap at 20.
function xpForLevel(level) {
  // cumulative XP required to BE at this level
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 2.1));
}

function statsForLevel(charClass, level) {
  const base = charClass === 'warrior'
    ? { hp: 100, mp: 30, atk: 10, def: 6,  matk: 2,  mdef: 4 }
    : { hp: 70,  mp: 80, atk: 5,  def: 3,  matk: 12, mdef: 8 };
  const growth = charClass === 'warrior'
    ? { hp: 18, mp: 4,  atk: 2.5, def: 1.6, matk: 0.5, mdef: 1.0 }
    : { hp: 11, mp: 10, atk: 1.0, def: 0.8, matk: 3.0, mdef: 2.0 };
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = Math.floor(base[k] + growth[k] * (level - 1));
  }
  return out;
}

// World layout: city is centered at origin with radius CITY_RADIUS (safe zone).
// Forest extends out to FOREST_RADIUS. Beyond CITY_RADIUS = PvP enabled.
const WORLD = {
  CITY_RADIUS: 35,        // safe zone radius
  FOREST_RADIUS: 140,     // edge of playable map
  GROUND_SIZE: 320,       // visual ground extent
  SPAWN_POINT: { x: 0, y: 0, z: 5 },
  MOB_SPAWN_COUNT: 24,
};

// Starting inventory by class
const STARTER = {
  warrior: { weapon: 'rusty_sword',  armor: 'leather_vest',    helmet: null,           ring: null },
  mage:    { weapon: 'oaken_staff',  armor: 'apprentice_robe', helmet: 'hood_of_focus', ring: null },
};

module.exports = { ITEMS, MOBS, WORLD, STARTER, xpForLevel, statsForLevel };
