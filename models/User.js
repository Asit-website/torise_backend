const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  hashed_password: { type: String, required: true },
  role: {
    type: String,
    enum: [
      'admin', 'internal_admin', 'super_admin', 'client_admin', 'client_manager', 'client_viewer',
      'business_manager', 'campaign_manager', 'support_agent'
    ],
    required: true
  },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  application_sid: [String], // renamed for consistency
  status: { type: String, enum: ['active', 'disabled', 'invited'], default: 'active' },
  reset_token: String,
  reset_token_expiry: Date,
  last_login_at: Date,
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.hashed_password);
};

module.exports = mongoose.model('User', userSchema); 