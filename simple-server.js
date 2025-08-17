const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

// Load environment variables
dotenv.config({ path: './config.env' });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// Test route
app.get('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth route is working', timestamp: new Date().toISOString() });
});

// Profile update route (simplified)
app.put('/api/auth/me', async (req, res) => {
  try {
    console.log('PUT /api/auth/me - Request received at:', new Date().toISOString());
    console.log('PUT /api/auth/me - Request body:', req.body);
    console.log('PUT /api/auth/me - Request headers:', req.headers);
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    console.log('Current user:', user.email);
    console.log('User role:', user.role);
    
    // Check if user is admin
    if (!['internal_admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ 
        message: 'Only administrators can edit their profile' 
      });
    }
    
    const { firstName, lastName, email } = req.body;
    
    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          message: 'Email is already taken' 
        });
      }
    }
    
    // Update user - only update fields that are provided and not empty
    const updateData = {};
    let hasChanges = false;
    
    if (firstName && firstName.trim() !== '') {
      updateData.firstName = firstName.trim();
      hasChanges = true;
    }
    
    if (lastName && lastName.trim() !== '') {
      updateData.lastName = lastName.trim();
      hasChanges = true;
    }
    
    if (email && email.trim() !== '') {
      updateData.email = email.trim();
      hasChanges = true;
    }
    
    console.log('Update data:', updateData);
    
    // If no valid data to update, return current user
    if (!hasChanges) {
      console.log('No changes to update');
      return res.json({
        message: 'No valid changes to update',
        user: user.toJSON()
      });
    }
    
    // Use $set to update only the provided fields
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true, runValidators: false }
    );
    
    console.log('Updated user:', updatedUser);
    
    if (!updatedUser) {
      return res.status(404).json({
        message: 'User not found'
      });
    }
    
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser.toJSON()
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      message: 'Error updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// Get current user profile
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    const userData = {
      _id: user._id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      application_sid: user.application_sid || [],
      client_id: user.client_id
    };
    
    res.json({ user: userData });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Simple server is running on port ${PORT}`);
});
