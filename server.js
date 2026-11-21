// PAMR - Pakistan Airport Management Record
// Backend API Server | Node.js + Express + MongoDB (Mongoose)

const express = require('express');
const path = require('path');

const { connectDB, isConnected, getLastError, MONGO_URI } = require('./config/db');
const Airport = require('./models/Airport');
const Departure = require('./models/Departure');
const Arrival = require('./models/Arrival');
const { calcDepStatus, calcArrStatus } = require('./utils/status');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS - allow frontend origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve frontend static files (locally; on Vercel, public/ is served by the CDN)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// ─── Helpers ────────────────────────────────────────────────────────────────

// Fields returned to the client (same shape the MySQL rows had).
const HIDE = { _id: 0, createdAt: 0, updatedAt: 0 };

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const like = s => new RegExp(escapeRegex(s), 'i'); // SQL `LIKE '%s%'`
const upper = s => String(s).trim().toUpperCase();

/** Keep only keys that were actually sent (so PUT doesn't blank out fields). */
function pick(body, keys) {
  const out = {};
  for (const k of keys) if (body[k] !== undefined && body[k] !== '') out[k] = body[k];
  return out;
}

/** Map Mongo/Mongoose errors to HTTP responses. */
function sendError(res, err) {
  if (err && err.code === 11000) {
    return res.status(409).json({ success: false, error: 'Callsign already exists' });
  }
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    const msg = err.errors
      ? Object.values(err.errors).map(e => e.message).join('; ')
      : err.message;
    return res.status(400).json({ success: false, error: msg });
  }
  return res.status(500).json({ success: false, error: err.message });
}

const withLive = (rows, calc) => rows.map(r => ({ ...r, live_status: calc(r.stat, r.times) }));

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', async (req, res) => {
  await connectDB();
  res.json({
    status: 'ok',
    db: isConnected() ? 'connected' : 'disconnected',
    db_uri_set: Boolean(process.env.MONGO_URI),
    ...(isConnected() ? {} : { db_error: getLastError() }),
    server: 'PAMR API v1.0 (MongoDB)',
    time: new Date().toISOString(),
  });
});

// Everything below needs the database. Connect on demand (serverless cold
// start), then fail fast with 503 instead of hanging if it is unreachable.
app.use('/api', async (req, res, next) => {
  if (!(await connectDB())) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }
  next();
});

// GET /api/airports
app.get('/api/airports', async (req, res) => {
  try {
    const rows = await Airport.find({}, HIDE).sort({ airport_name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Build a filter for departures/arrivals.
 *   boardField - field holding the board's own airport (dep: dc, arr: cc)
 *   nameField  - other-end city name (dep: d_name, arr: a_name)
 */
function flightFilter(q, boardField, nameField) {
  const filter = {};
  if (q.airport) filter[boardField] = upper(q.airport);
  if (q.airline) filter.airl = like(q.airline);
  if (q.search) {
    const rx = like(q.search);
    filter.$or = [{ cs: rx }, { [nameField]: rx }, { airl: rx }];
  }
  return filter;
}

/** ?status= filters on the *live* status, which is what the board displays
 *  (the old MySQL EVENT rewrote `stat` every minute, so the two matched). */
const byStatus = (rows, status) => (status ? rows.filter(r => r.live_status === status) : rows);

// GET /api/departures?airport=LHE&status=Delayed&airline=..&search=..
app.get('/api/departures', async (req, res) => {
  try {
    const rows = await Departure.find(flightFilter(req.query, 'dc', 'd_name'), HIDE)
      .sort({ times: 1 }).lean();
    const data = byStatus(withLive(rows, calcDepStatus), req.query.status);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/arrivals?airport=LHE
// An arrival's `cc` is the airport it lands AT; `ac` is where it comes from.
app.get('/api/arrivals', async (req, res) => {
  try {
    const rows = await Arrival.find(flightFilter(req.query, 'cc', 'a_name'), HIDE)
      .sort({ times: 1 }).lean();
    const data = byStatus(withLive(rows, calcArrStatus), req.query.status);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/flights/:cs
app.get('/api/flights/:cs', async (req, res) => {
  try {
    const cs = upper(req.params.cs);
    const dep = await Departure.findOne({ cs }, HIDE).lean();
    if (dep) return res.json({ success: true, data: { ...dep, type: 'DEP', live_status: calcDepStatus(dep.stat, dep.times) } });

    const arr = await Arrival.findOne({ cs }, HIDE).lean();
    if (arr) return res.json({ success: true, data: { ...arr, type: 'ARR', live_status: calcArrStatus(arr.stat, arr.times) } });

    res.status(404).json({ success: false, error: 'Flight not found' });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/stats?airport=LHE
app.get('/api/stats', async (req, res) => {
  try {
    const { airport } = req.query;
    const proj = { stat: 1, times: 1, _id: 0 };
    const [deps, arrs] = await Promise.all([
      Departure.find(airport ? { dc: upper(airport) } : {}, proj).lean(),
      Arrival.find(airport ? { cc: upper(airport) } : {}, proj).lean(),
    ]);

    const depLive = deps.map(d => calcDepStatus(d.stat, d.times));
    const arrLive = arrs.map(a => calcArrStatus(a.stat, a.times));
    const all = [...depLive, ...arrLive];
    const count = s => all.filter(x => x === s).length;

    res.json({
      success: true,
      data: {
        departures: deps.length,
        arrivals: arrs.length,
        delayed: count('Delayed'),
        cancelled: count('Cancelled'),
        ontime: depLive.filter(s => s === 'Departed').length + arrLive.filter(s => s === 'Landed').length,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/airlines
app.get('/api/airlines', async (req, res) => {
  try {
    const [a, b] = await Promise.all([Departure.distinct('airl'), Arrival.distinct('airl')]);
    const data = [...new Set([...a, ...b])].sort((x, y) => x.localeCompare(y));
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/departures
app.post('/api/departures', async (req, res) => {
  try {
    const { cs, airl, cc, dc, d_name, times, stat } = req.body;
    if (!cs || !airl || !cc || !dc || !d_name || !times) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    // A callsign must be unique across both boards (it was the PK of each table).
    if (await Arrival.exists({ cs: upper(cs) })) {
      return res.status(409).json({ success: false, error: 'Callsign already exists' });
    }
    await Departure.create({ cs, airl, cc, dc, d_name, times, stat: stat || 'Scheduled' });
    res.status(201).json({ success: true, message: `Flight ${upper(cs)} added to departures` });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/arrivals
app.post('/api/arrivals', async (req, res) => {
  try {
    const { cs, airl, ac, cc, a_name, times, stat } = req.body;
    if (!cs || !airl || !ac || !cc || !a_name || !times) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (await Departure.exists({ cs: upper(cs) })) {
      return res.status(409).json({ success: false, error: 'Callsign already exists' });
    }
    await Arrival.create({ cs, airl, ac, cc, a_name, times, stat: stat || 'Scheduled' });
    res.status(201).json({ success: true, message: `Flight ${upper(cs)} added to arrivals` });
  } catch (err) {
    sendError(res, err);
  }
});

const UPDATE_OPTS = { new: true, runValidators: true, projection: HIDE };

// PUT /api/departures/:cs
app.put('/api/departures/:cs', async (req, res) => {
  try {
    const cs = upper(req.params.cs);
    const doc = await Departure.findOneAndUpdate(
      { cs }, { $set: pick(req.body, ['airl', 'cc', 'dc', 'd_name', 'times', 'stat']) }, UPDATE_OPTS
    ).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Flight not found' });
    res.json({ success: true, message: `Departure ${cs} updated`, data: doc });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/arrivals/:cs
app.put('/api/arrivals/:cs', async (req, res) => {
  try {
    const cs = upper(req.params.cs);
    const doc = await Arrival.findOneAndUpdate(
      { cs }, { $set: pick(req.body, ['airl', 'ac', 'cc', 'a_name', 'times', 'stat']) }, UPDATE_OPTS
    ).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Flight not found' });
    res.json({ success: true, message: `Arrival ${cs} updated`, data: doc });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/departures/:cs
app.delete('/api/departures/:cs', async (req, res) => {
  try {
    const cs = upper(req.params.cs);
    const r = await Departure.deleteOne({ cs });
    if (!r.deletedCount) return res.status(404).json({ success: false, error: 'Flight not found' });
    res.json({ success: true, message: `Departure ${cs} deleted` });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/arrivals/:cs
app.delete('/api/arrivals/:cs', async (req, res) => {
  try {
    const cs = upper(req.params.cs);
    const r = await Arrival.deleteOne({ cs });
    if (!r.deletedCount) return res.status(404).json({ success: false, error: 'Flight not found' });
    res.json({ success: true, message: `Arrival ${cs} deleted` });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/departures/:cs/status  and  /api/arrivals/:cs/status
function statusRoute(Model) {
  return async (req, res) => {
    try {
      const cs = upper(req.params.cs);
      const { stat } = req.body;
      if (!Model.STATUSES.includes(stat)) {
        return res.status(400).json({ success: false, error: 'Invalid status value' });
      }
      const r = await Model.updateOne({ cs }, { $set: { stat } });
      if (!r.matchedCount) return res.status(404).json({ success: false, error: 'Flight not found' });
      res.json({ success: true, message: `Status of ${cs} updated to ${stat}` });
    } catch (err) {
      sendError(res, err);
    }
  };
}
app.put('/api/departures/:cs/status', statusRoute(Departure));
app.put('/api/arrivals/:cs/status', statusRoute(Arrival));

// Unknown API route
app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Not found' }));

// Fallback - serve frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Vercel imports the app and runs it as a function.
module.exports = app;

// Start a normal server only when run directly (npm start / npm run dev).
if (require.main === module) connectDB().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║   PAMR API Server - Running          ║');
    console.log(`║   http://localhost:${PORT}              ║`);
    console.log('║   Pakistan  Airspace  Record         ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('');
    console.log('Database:', MONGO_URI.replace(/\/\/[^@]*@/, '//***@'));
    console.log('Endpoints:');
    console.log('  GET  /api/airports');
    console.log('  GET  /api/departures?airport=LHE');
    console.log('  GET  /api/arrivals?airport=LHE');
    console.log('  GET  /api/stats?airport=LHE');
    console.log('  GET  /api/flights/:cs');
    console.log('  GET  /api/airlines');
    console.log('  POST /api/departures');
    console.log('  POST /api/arrivals');
    console.log('  PUT  /api/departures/:cs');
    console.log('  PUT  /api/arrivals/:cs');
    console.log('  PUT  /api/departures/:cs/status');
    console.log('  PUT  /api/arrivals/:cs/status');
    console.log('  DEL  /api/departures/:cs');
    console.log('  DEL  /api/arrivals/:cs');
    console.log('');
  });
});
