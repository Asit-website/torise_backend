const mongoose = require('mongoose');

const clientApplicationSchema = new mongoose.Schema({
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  app_sid: { type: String, required: true, unique: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  channels: [{ type: String, enum: ['voice', 'text'] }],
  date_linked: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ClientApplication', clientApplicationSchema); 