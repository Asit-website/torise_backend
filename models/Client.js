const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  industry: String,
  country: { type: String, required: true },
  contact_email: { type: String }, // Ensure unique email for each client
  assigned_avatar_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Avatar' }],
  application_sid: [String], // renamed for consistency
  supports_text: Boolean,
  supports_voice: Boolean,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  notes: String,
  service: { type: String, default: 'Standard' }, // Service type
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }, // Last activity timestamp
  default_language: { type: String, required: true },
});

module.exports = mongoose.model('Client', clientSchema); 