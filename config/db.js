// PAMR — MongoDB connection (Mongoose)
//
// Works both as a long-running server (npm start) and on Vercel serverless
// functions, where each cold start must (re)connect: the connection promise is
// cached so concurrent requests share one connect, and a failed attempt is
// retried on the next request.
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/PAMR';

let pending = null;

function isConnected() {
  return mongoose.connection.readyState === 1;
}

async function connectDB() {
  if (isConnected()) return true;
  if (!pending) {
    pending = mongoose
      .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
      .then(() => {
        console.log('MongoDB connected -', mongoose.connection.name, '@', mongoose.connection.host);
        return true;
      })
      .catch(err => {
        console.error('MongoDB connection failed:', err.message);
        pending = null; // allow a retry on the next request
        return false;
      });
  }
  return pending;
}

module.exports = { connectDB, isConnected, MONGO_URI, mongoose };
