// Thin MongoDB connector. If MONGODB_URI is not provided, we silently
// degrade to in-memory storage so the demo can run with zero setup.

const mongoose = require('mongoose');

let dbReady = false;
let usingMemory = false;

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    usingMemory = true;
    console.log('  ⚠  MONGODB_URI not set — using in-memory storage (data lost on restart)');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    dbReady = true;
    console.log('  ✓ MongoDB connected');
    return true;
  } catch (err) {
    usingMemory = true;
    console.log('  ⚠  MongoDB connection failed, falling back to in-memory:', err.message);
    return false;
  }
}

function isUsingMemory() {
  return usingMemory || !dbReady;
}

module.exports = { connectDb, isUsingMemory };
