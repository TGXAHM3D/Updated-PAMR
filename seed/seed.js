// PAMR — load the original MySQL data set into MongoDB.
//
//   npm run seed           upsert every record (safe to re-run; updates changed rows)
//   npm run seed:reset     wipe the three collections first, then insert
//
// Uses MONGO_URI (default mongodb://127.0.0.1:27017/PAMR).
const path = require('path');
const { mongoose, MONGO_URI } = require('../config/db');
const Airport = require('../models/Airport');
const Departure = require('../models/Departure');
const Arrival = require('../models/Arrival');

const load = f => require(path.join(__dirname, 'data', f));

const SETS = [
  { Model: Airport,   file: 'airports.json',   key: 'a_code' },
  { Model: Departure, file: 'departures.json', key: 'cs' },
  { Model: Arrival,   file: 'arrivals.json',   key: 'cs' },
];

async function main() {
  const reset = process.argv.includes('--reset');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  for (const { Model, file, key } of SETS) {
    const docs = load(file);

    // Validate everything against the schema before touching the DB.
    for (const d of docs) await new Model(d).validate();

    if (reset) await Model.deleteMany({});
    await Model.syncIndexes();

    // timestamps:false so an unchanged record isn't rewritten just to bump updatedAt.
    const now = new Date();
    const ops = docs.map(d => ({
      updateOne: {
        filter: { [key]: d[key] },
        update: { $set: d, $setOnInsert: { createdAt: now, updatedAt: now } },
        upsert: true,
      },
    }));
    const r = await Model.bulkWrite(ops, { ordered: true, timestamps: false });
    const total = await Model.countDocuments();
    console.log(
      `${Model.collection.name.padEnd(10)} ${docs.length} in file | ` +
      `inserted ${r.upsertedCount}, updated ${r.modifiedCount}, unchanged ${r.matchedCount - r.modifiedCount} | ` +
      `${total} in collection`
    );
  }

  await mongoose.disconnect();
  console.log('Seed complete.');
}

main().catch(async err => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
