// PAMR — Airport model (was: table `airports`)
const { Schema, model } = require('mongoose');

const airportSchema = new Schema(
  {
    a_code:       { type: String, required: true, unique: true, trim: true, uppercase: true }, // ICAO / FIR code
    cc:           { type: String, required: true, unique: true, trim: true, uppercase: true }, // IATA city code
    airport_name: { type: String, trim: true },
    city_name:    { type: String, trim: true },
    airport_type: { type: String, trim: true, enum: ['International', 'Domestic'] },
  },
  { collection: 'airports', versionKey: false, timestamps: true }
);

airportSchema.index({ airport_name: 1 });

module.exports = model('Airport', airportSchema);
