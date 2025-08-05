// const mongoose = require('mongoose');

// const eventSchema = new mongoose.Schema({
//   type: String,
//   agent_response: String,
//   agent_response_time: Number,
//   user_transcript: String,
//   user_transcript_time: Number,
//   raw: Object,
// }, { timestamps: true });

// const conversationSchema = new mongoose.Schema({
//   call_sid: String,
//   conversation_id: String,
//   audio_url: String,
//   events: [eventSchema],
//   summary: {
//     attempted_at: Date,
//     account_sid: String,
//     answered: Boolean,
//     answered_at: Date,
//     application_sid: String,
//     direction: String,
//     duration: Number,
//     from: String,
//     host: String,
//     remote_host: String,
//     service_provider_sid: String,
//     sip_callid: String,
//     sip_parent_callid: String,
//     sip_status: String,
//     terminated_at: Date,
//     termination_reason: String,
//     to: String,
//     trace_id: String,
//     trunk: String
//   }
// }, { timestamps: true });

// module.exports = mongoose.model('Conversation', conversationSchema); 

// const mongoose = require('mongoose');
// const eventSchema = new mongoose.Schema({
//   type: String,
//   agent_response: String,
//   agent_response_time: Number,
//   user_transcript: String,
//   user_transcript_time: Number,
//   raw: Object,
// },{timestamps:true});

// const conversationSchema = new mongoose.Schema({
//   call_sid: String,
//   conversation_id: String,
//   events: [eventSchema],
//   summary: Object,
// }, { timestamps: true });

// module.exports = mongoose.model('Conversation', conversationSchema);

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  type: String,
  agent_response: String,
  agent_response_time: Number,
  user_transcript: String,
  user_transcript_time: Number,
  raw: Object,
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  call_sid: String,
  conversation_id: String,
  audio_url:String,
  events: [eventSchema],
  summary: {
    attempted_at: Date,
    account_sid: String,
    answered: Boolean,
    answered_at: Date,
    application_sid: String,
    direction: String,
    duration: Number,
    from: String,
    host: String,
    remote_host: String,
    service_provider_sid: String,
    sip_callid: String,
    sip_parent_callid: String,
    sip_status: String,
    terminated_at: Date,
    termination_reason: String,
    to: String,
    trace_id: String,
    trunk: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);



