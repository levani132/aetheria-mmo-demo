// Player model + a tiny memory-store adapter so the same calls work
// whether or not MongoDB is connected.

const mongoose = require('mongoose');
const { isUsingMemory } = require('./db');

const PlayerSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    charClass: { type: String, enum: ['warrior', 'mage'], required: true },
    gender: { type: String, enum: ['male', 'female'], required: true },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    gold: { type: Number, default: 50 },
    hp: { type: Number, default: 100 },
    maxHp: { type: Number, default: 100 },
    mp: { type: Number, default: 50 },
    maxMp: { type: Number, default: 50 },
    pos: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      z: { type: Number, default: 5 },
    },
    inventory: [{ id: String, qty: Number }],
    equipment: {
      weapon: String,
      armor: String,
      helmet: String,
      ring: String,
    },
  },
  { timestamps: true }
);

const Player = mongoose.models.Player || mongoose.model('Player', PlayerSchema);

// In-memory fallback so the app runs end-to-end with no DB.
const memStore = new Map();

const PlayerStore = {
  async findOne(query) {
    if (!isUsingMemory()) return Player.findOne(query).lean();
    return memStore.get(query.username) || null;
  },
  async create(data) {
    if (!isUsingMemory()) {
      const doc = await Player.create(data);
      return doc.toObject();
    }
    const record = { _id: 'mem-' + Math.random().toString(36).slice(2), ...data };
    memStore.set(data.username, record);
    return record;
  },
  async update(username, patch) {
    if (!isUsingMemory()) {
      return Player.findOneAndUpdate({ username }, patch, { new: true }).lean();
    }
    const existing = memStore.get(username);
    if (!existing) return null;
    const merged = mergeDeep(existing, patch);
    memStore.set(username, merged);
    return merged;
  },
};

function mergeDeep(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const v = source[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[key] = mergeDeep(target[key] || {}, v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

module.exports = { Player, PlayerStore };
