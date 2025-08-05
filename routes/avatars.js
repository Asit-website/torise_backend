const express = require('express');
const Avatar = require('../models/Avatar');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/avatars - List all avatars (with optional filters)
router.get('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { type, status, category, search, page = 1, limit = 20 } = req.query;
  const query = {};
  if (type) query.type = type;
  if (status) query.status = status;
  if (category) query.category = category;
  if (search) query.name = { $regex: search, $options: 'i' };
  const avatars = await Avatar.find(query)
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ created_at: -1 });
  const total = await Avatar.countDocuments(query);
  res.json({ avatars, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// GET /api/avatars/:id - Fetch avatar details
router.get('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const avatar = await Avatar.findById(req.params.id);
  if (!avatar) return res.status(404).json({ message: 'Avatar not found' });
  res.json(avatar);
});

// POST /api/avatars - Create new avatar
router.post('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { name, type, assigned_language, supports_text, supports_voice, status, category, assigned_on } = req.body;
  const avatar = new Avatar({ name, type, assigned_language, supports_text, supports_voice, status, category, assigned_on });
  await avatar.save();
  res.status(201).json(avatar);
});

// PUT /api/avatars/:id - Update avatar
router.put('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const avatar = await Avatar.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!avatar) return res.status(404).json({ message: 'Avatar not found' });
  res.json(avatar);
});

// DELETE /api/avatars/:id - Delete avatar
router.delete('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const avatar = await Avatar.findByIdAndDelete(req.params.id);
  if (!avatar) return res.status(404).json({ message: 'Avatar not found' });
  res.json({ message: 'Avatar deleted' });
});

module.exports = router; 