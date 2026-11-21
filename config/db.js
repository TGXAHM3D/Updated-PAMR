// PAMR — MongoDB connection (Mongoose)
//
// Works both as a long-running server (npm start) and on Vercel serverless
// functions, where each cold start must (re)connect: the connection promise is
// cached so concurrent requests share one connect, and a failed attempt is
// retried on the next request.
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/PAMR';

let pending = null;
let lastError = null;

// Never expose credentials in error text.
const redact = s => String(s).replace(/\/\/[^@/\s]*@/g, '//***@');

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
        lastError = null;
        return true;
      })
      .catch(err => {
        lastError = redact(err.message);
        console.error('MongoDB connection failed:', lastError);
        pending = null; // allow a retry on the next request
        return false;
      });
  }
  return pending;
}

const getLastError = () => lastError;

module.exports = { connectDB, isConnected, getLastError, MONGO_URI, mongoose };
