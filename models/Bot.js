const mongoose = require('mongoose');
const { Schema } = mongoose;

const BotSchema = new Schema({
  name: { type: String, required: true },
  dnis: [{ type: String, }], // not required
  type: {
    type: String,
    enum: ['voice', 'chat', 'whatsapp', 'sms'],
    default: 'voice'
  },
  webhook_url: { type: String, required: true },
  asr_provider: { type: Schema.Types.Mixed, required: function() { return this.type === 'voice'; } },
  tts_provider: { type: Schema.Types.Mixed, required: function() { return this.type === 'voice'; } },
  channels: [{ type: String }],
  clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
  description: { type: String },
  category: {
    type: String,
    enum: ['customer_support', 'sales', 'technical', 'general', 'marketing', 'hr', 'finance'],
    default: 'general'
  },
  active: { type: Boolean, default: true },
  settings: { type: Schema.Types.Mixed },
  // Chat-specific fields
  welcome_message: { type: String, default: 'Welcome! How can I help you today?' },
  user_prompt_fields: [{
    name: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: false },
    type: { type: String, enum: ['text', 'email', 'phone'], default: 'text' }
  }],
  chat_settings: {
    require_user_details: { type: Boolean, default: true },
    auto_save_conversations: { type: Boolean, default: true }
  }
}, { timestamps: true });

// Remove old sparse index if present
// Add partial unique index for dnis (only when dnis exists, is array, and not empty)
BotSchema.index(
  { dnis: 1 },
  { unique: true, partialFilterExpression: { dnis: { $exists: true, $type: 'array', $ne: [] } } }
);

module.exports = mongoose.model('Bot', BotSchema); 