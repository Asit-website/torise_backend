const mongoose = require('mongoose');

const avatarSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['text', 'voice'], required: true },
  assigned_language: { type: String },
  supports_text: { type: Boolean, default: false },
  supports_voice: { type: Boolean, default: false },
  status: { type: String, enum: ['live', 'draft'], default: 'draft' },
  category: { type: String },
  assigned_on: { type: Date },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Avatar', avatarSchema); 