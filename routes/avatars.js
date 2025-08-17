const express = require('express');
const Avatar = require('../models/Avatar');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/avatars - Get all avatars
router.get('/', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, status, category } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    if (category) query.category = category;
    
    const avatars = await Avatar.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ created_at: -1 });
    
    const total = await Avatar.countDocuments(query);
    
    res.json({
      avatars,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalAvatars: total
      }
    });
  } catch (error) {
    console.error('Error fetching avatars:', error);
    res.status(500).json({ message: 'Error fetching avatars' });
  }
});

// GET /api/avatars/:id - Get avatar by ID
router.get('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const avatar = await Avatar.findById(req.params.id);
    if (!avatar) {
      return res.status(404).json({ message: 'Avatar not found' });
    }
    res.json(avatar);
  } catch (error) {
    console.error('Error fetching avatar:', error);
    res.status(500).json({ message: 'Error fetching avatar' });
  }
});

// POST /api/avatars - Create new avatar
router.post('/', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { name, description, category, status = 'live', image_url } = req.body;
    
    // Check if avatar already exists
    const existingAvatar = await Avatar.findOne({ name });
    if (existingAvatar) {
      return res.status(400).json({ message: 'Avatar with this name already exists' });
    }
    
    // Create avatar
    const avatar = new Avatar({
      name,
      description,
      category,
      status,
      image_url,
      created_by: req.user._id
    });
    
    await avatar.save();
    
    res.status(201).json({
      message: 'Avatar created successfully',
      avatar: avatar.toJSON()
    });
  } catch (error) {
    console.error('Error creating avatar:', error);
    res.status(500).json({ message: 'Error creating avatar' });
  }
});

// PUT /api/avatars/:id - Update avatar
router.put('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { name, description, category, status, image_url } = req.body;
    const avatarId = req.params.id;
    
    const avatar = await Avatar.findById(avatarId);
    if (!avatar) {
      return res.status(404).json({ message: 'Avatar not found' });
    }
    
    // Update fields
    if (name) avatar.name = name;
    if (description) avatar.description = description;
    if (category) avatar.category = category;
    if (status) avatar.status = status;
    if (image_url) avatar.image_url = image_url;
    
    await avatar.save();
    
    res.json({
      message: 'Avatar updated successfully',
      avatar: avatar.toJSON()
    });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ message: 'Error updating avatar' });
  }
});

// DELETE /api/avatars/:id - Delete avatar
router.delete('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const avatarId = req.params.id;
    
    const avatar = await Avatar.findById(avatarId);
    if (!avatar) {
      return res.status(404).json({ message: 'Avatar not found' });
    }
    
    await Avatar.findByIdAndDelete(avatarId);
    
    res.json({ message: 'Avatar deleted successfully' });
  } catch (error) {
    console.error('Error deleting avatar:', error);
    res.status(500).json({ message: 'Error deleting avatar' });
  }
});

module.exports = router; 