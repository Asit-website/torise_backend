const mongoose = require('mongoose');

const conversationLogSchema = new mongoose.Schema({
  call_sid: String,
  application_sid: String,
  conversation_id: String,
  account_sid: String,
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  avatar_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Avatar' },
  channel_type: { type: String, enum: ['voice', 'text', 'chat'] },
  call_type: { type: String, enum: ['inbound', 'outbound', 'transfer'] },
  started_at: Date,
  answered_at: Date,
  ended_at: Date,
  answered: Boolean,
  duration_minutes: String,
  token_count: Number,
  from_number: String,
  to_number: String,
  calling_number: String,
  ivr_number: String,
  disposition: String,
  language: String,
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: String,
  agent_voice_name: String,
  handled_by: { type: String, enum: ['AI', 'Human', 'Hybrid'] },
  message_log: [{
    sender: { type: String, enum: ['user', 'agent'] },
    message: String,
    timestamp: Date,
    sentiment: String,
    tags: [String]
  }],
  sentiment_timeline: [{
    timestamp: Date,
    sentiment: String
  }],
  audio_url: String,
  ai_summary: String,
  summary: String, // New summary field for conversation summarization
  follow_up_status: String,
  follow_up_notes: String,
  lead_source: String,
  rag_confidence_score: { type: String, enum: ['high', 'medium', 'low'] },
  feedback_rating: Number,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ConversationLog', conversationLogSchema); 