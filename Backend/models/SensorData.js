const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  heartrate: { type: Number, required: true },
  temperature: { type: Number, required: true },
  spo2: { type: Number, required: true },
  touchDetected: { type: Boolean, default: false },
  airQuality: { type: Number, default: null },
}, { timestamps: true });

const SensorData = mongoose.model('SensorData', sensorDataSchema);
module.exports = SensorData;
