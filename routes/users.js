const express = require('express');
const User = require('../models/User');
const Client = require('../models/Client');
const { auth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const router = express.Router();

// GET /api/users - List users with filters, search, sort, pagination
router.get('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { search, client, role, status, page = 1, limit = 20, sort = '-created_at' } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } }
    ];
  }
  if (client) query.client_id = client;
  if (role) query.role = role;
  if (status) query.status = status;
  const users = await User.find(query)
    .populate('client_id')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort(sort);
  const total = await User.countDocuments(query);
  res.json({ users, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// POST /api/users - Create/invite user
router.post('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  let { firstName, lastName, email, role, client_id, application_sid, status, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ message: 'Email already exists' });
  let plainPassword = password;
  if (!plainPassword) {
    plainPassword = Math.random().toString(36).slice(-8);
  }
  const hashed_password = await bcrypt.hash(plainPassword, 12);

  // If client_id is provided and application_sid is not, fetch from client
  if (client_id && (!application_sid || application_sid.length === 0)) {
    const client = await Client.findById(client_id);
    if (client && Array.isArray(client.application_sid)) {
      application_sid = client.application_sid;
    }
  }

  const user = new User({ firstName, lastName, email, role, client_id, application_sid, status: status || 'invited', hashed_password });
  await user.save();
  // Debug log
  console.log('User created:', { email: user.email, status: user.status, hashed_password: user.hashed_password, plainPassword });
  // TODO: Send invite email with plainPassword
  res.status(201).json({ user, password: plainPassword });
});

// PUT /api/users/:id - Edit user (role, status, application_sid)
router.put('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { firstName, lastName, role, client_id, application_sid, status } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { firstName, lastName, role, client_id, application_sid, status },
    { new: true, runValidators: true }
  );
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// PATCH /api/users/:id/status - Toggle/Set status
router.patch('/:id/status', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { status } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'Status updated', user });
});

// DELETE /api/users/:id - Delete user (only if no conversation logs)
router.delete('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  // TODO: Check for conversation logs before deleting
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
});

module.exports = router; 