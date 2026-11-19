// PAMR — Departure model (was: table `departures`)
//
// Field orientation matches the original data set:
//   dc     = the airport this departure leaves FROM (the board's own airport)
//   cc     = destination city code
//   d_name = destination city name
const { Schema, model } = require('mongoose');

const STATUSES = ['Scheduled', 'Boarding', 'Departed', 'Delayed', 'Cancelled', 'Estimated'];

const departureSchema = new Schema(
  {
    cs:     { type: String, required: true, unique: true, trim: true, uppercase: true }, // callsign
    airl:   { type: String, required: true, trim: true },                               // airline
    cc:     { type: String, required: true, trim: true, uppercase: true },               // destination code
    dc:     { type: String, required: true, trim: true, uppercase: true },               // origin airport code
    d_name: { type: String, required: true, trim: true },                                // destination name
    times:  {                                                                            // scheduled time HH:MM:SS
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, 'times must be HH:MM:SS'],
    },
    stat:   { type: String, default: 'Scheduled', enum: STATUSES },
  },
  { collection: 'departures', versionKey: false, timestamps: true }
);

departureSchema.index({ dc: 1, times: 1 });
departureSchema.index({ stat: 1 });

module.exports = model('Departure', departureSchema);
module.exports.STATUSES = STATUSES;
