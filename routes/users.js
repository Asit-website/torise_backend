const express = require('express');
const User = require('../models/User');
const Client = require('../models/Client');
const { auth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const router = express.Router();

// GET /api/users - Get all users
router.get('/', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, status, role } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    if (role) query.role = role;
    
    // Filter by client if provided
    if (req.query.client) {
      query.client_id = req.query.client;
      console.log('Filtering users by client_id:', req.query.client);
    }
    
    const users = await User.find(query)
      .populate('client_id', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ created_at: -1 });
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalUsers: total
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// POST /api/users - Create new user
router.post('/', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, client_id, status = 'active' } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const bcrypt = require('bcryptjs');
    const hashed_password = await bcrypt.hash(password, 12);
    
    // Fetch client's application_sid if client_id is provided
    let application_sid = [];
    if (client_id) {
      const Client = require('../models/Client');
      const client = await Client.findById(client_id);
      if (client && client.application_sid) {
        application_sid = client.application_sid;
        console.log(`Fetched application_sid from client ${client_id}:`, application_sid);
      }
    }
    
    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      hashed_password,
      role,
      client_id,
      application_sid, // Set the application_sid from client
      status,
      created_by: req.user._id
    });
    
    await user.save();
    
    console.log(`User created with application_sid:`, application_sid);
    
    res.status(201).json({
      message: 'User created successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { firstName, lastName, email, role, client_id, status } = req.body;
    const userId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (role) user.role = role;
    if (status) user.status = status;
    
    // Update client_id and application_sid
    if (client_id !== undefined) {
      user.client_id = client_id;
      
      // Fetch client's application_sid if client_id is provided
      if (client_id) {
        const Client = require('../models/Client');
        const client = await Client.findById(client_id);
        if (client && client.application_sid) {
          user.application_sid = client.application_sid;
          console.log(`Updated user application_sid from client ${client_id}:`, client.application_sid);
        } else {
          user.application_sid = [];
          console.log(`Cleared user application_sid - no client found or no application_sid`);
        }
      } else {
        user.application_sid = [];
        console.log(`Cleared user application_sid - no client_id provided`);
      }
    }
    
    await user.save();
    
    res.json({
      message: 'User updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});

// PATCH /api/users/:id/status - Update user status
router.patch('/:id/status', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.status = status;
    await user.save();
    
    res.json({
      message: 'User status updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    await User.findByIdAndDelete(userId);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

module.exports = router; 