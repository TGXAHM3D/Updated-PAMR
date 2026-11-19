// PAMR — Arrival model (was: table `arrival`)
//
// Field orientation matches the original data set (note it is the mirror of
// the column comments in the old SQL file, which were swapped):
//   cc     = the airport this arrival lands AT (the board's own airport)
//   ac     = origin city code
//   a_name = origin city name
const { Schema, model } = require('mongoose');

const STATUSES = ['Scheduled', 'Arriving', 'Landed', 'Delayed', 'Cancelled', 'Estimated'];

const arrivalSchema = new Schema(
  {
    cs:     { type: String, required: true, unique: true, trim: true, uppercase: true }, // callsign
    airl:   { type: String, required: true, trim: true },                               // airline
    ac:     { type: String, required: true, trim: true, uppercase: true },               // origin code
    cc:     { type: String, required: true, trim: true, uppercase: true },               // arrival airport code
    a_name: { type: String, required: true, trim: true },                                // origin name
    times:  {                                                                            // scheduled time HH:MM:SS
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, 'times must be HH:MM:SS'],
    },
    stat:   { type: String, default: 'Scheduled', enum: STATUSES },
  },
  { collection: 'arrivals', versionKey: false, timestamps: true }
);

arrivalSchema.index({ cc: 1, times: 1 });
arrivalSchema.index({ stat: 1 });

module.exports = model('Arrival', arrivalSchema);
module.exports.STATUSES = STATUSES;
