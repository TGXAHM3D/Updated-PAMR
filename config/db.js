// PAMR — MongoDB connection (Mongoose)
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/PAMR';

let connected = false;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    connected = true;
    console.log('MongoDB connected -', mongoose.connection.name, '@', mongoose.connection.host);
  } catch (err) {
    connected = false;
    console.error('MongoDB connection failed:', err.message);
    console.warn('Server will start anyway; API routes will report the DB as disconnected.');
  }

  mongoose.connection.on('disconnected', () => { connected = false; });
  mongoose.connection.on('connected', () => { connected = true; });

  return connected;
}

function isConnected() {
  return connected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isConnected, MONGO_URI, mongoose };
