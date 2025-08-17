const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const crypto = require('crypto');
const sendEmail = require('../utils/email');

const router = express.Router();

// Register user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email already exists' 
      });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashed_password = await bcrypt.hash(password, 12);

    // Create new user
    const user = new User({
      name,
      email,
      hashed_password,
      role
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Error registering user',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// Login user
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    console.log('Login attempt for:', email, 'User found:', !!user, user && { status: user.status, hashed_password: !!user.hashed_password });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (user.status !== 'active') {
      console.log('User not active:', user.status);
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    console.log('Password valid:', isPasswordValid);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last login
    user.last_login_at = new Date();
    await user.save();

    // Prepare user data for response
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      client_id: user.client_id,
      application_sid: user.application_sid,
      last_login_at: user.last_login_at,
      created_at: user.created_at
    };

    res.json({
      message: 'Login successful',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    // For security, always respond with success
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  }
  // Generate token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.reset_token = resetToken;
  user.reset_token_expiry = Date.now() + 1000 * 60 * 60; // 1 hour
  await user.save();
  // Send email
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5001'}/reset-password/${resetToken}`;
  await sendEmail(
    user.email,
    'Reset your password',
    `<div style="font-family:Arial,sans-serif;font-size:16px;color:#222;">
      <h2>Password Reset Request</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password. Click the button below to reset it:</p>
      <p style="margin:24px 0;"><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset Password</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p style="color:#888;font-size:13px;">This link will expire in 1 hour.</p>
    </div>`
  );
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  const user = await User.findOne({ reset_token: token, reset_token_expiry: { $gt: Date.now() } });
  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired reset token.' });
  }
  const bcrypt = require('bcryptjs');
  user.hashed_password = await bcrypt.hash(password, 12);
  user.reset_token = undefined;
  user.reset_token_expiry = undefined;
  await user.save();
  res.json({ message: 'Password reset successful. You can now log in.' });
});

// Test route without auth
router.get('/test', (req, res) => {
  console.log('Test route hit');
  res.json({ message: 'Auth route is working', timestamp: new Date().toISOString() });
});

// Test PUT route without auth
router.put('/test-put', (req, res) => {
  console.log('Test PUT route hit');
  console.log('Request body:', req.body);
  res.json({ message: 'PUT route is working', timestamp: new Date().toISOString() });
});

// Test change password route without auth
router.put('/test-change-password', (req, res) => {
  console.log('Test change password route hit');
  console.log('Request body:', req.body);
  res.json({ message: 'Change password route is working', timestamp: new Date().toISOString() });
});

// Test change password route with auth but simplified
router.put('/test-change-password-auth', auth, (req, res) => {
  console.log('Test change password route with auth hit');
  console.log('Request body:', req.body);
  console.log('User:', req.user?.email);
  res.json({ message: 'Change password route with auth is working', timestamp: new Date().toISOString() });
});

// Get current user profile
router.get('/me', auth, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('GET /api/auth/me - Token received, user:', req.user ? req.user.email : 'null');
    
    // Only send essential user data
    const userData = {
      _id: req.user._id,
      email: req.user.email,
      name: `${req.user.firstName} ${req.user.lastName}`.trim(),
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      status: req.user.status,
      application_sid: req.user.application_sid || [],
      client_id: req.user.client_id
    };
    
    const response = {
      user: userData
    };
    
    const endTime = Date.now();
    console.log(`GET /api/auth/me - Response time: ${endTime - startTime}ms`);
    
    // Set response headers for better performance
    res.setHeader('Cache-Control', 'no-cache');
    res.json(response);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// Update user profile (Admin only) - Temporarily bypass auth for testing
router.put('/me', async (req, res) => {
  try {
         console.log('PUT /api/auth/me - Request received at:', new Date().toISOString());
     console.log('PUT /api/auth/me - Request body:', req.body);
     console.log('PUT /api/auth/me - Request headers:', req.headers);
     console.log('PUT /api/auth/me - Authorization header:', req.headers.authorization);
     
     // Temporarily get user from token for testing
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

// Change password - Direct API call like updateProfile
router.put('/change-password', async (req, res) => {
  try {
    console.log('PUT /api/auth/change-password - Request received at:', new Date().toISOString());
    console.log('PUT /api/auth/change-password - Request body:', req.body);
    console.log('PUT /api/auth/change-password - Request headers:', req.headers);
    console.log('PUT /api/auth/change-password - Authorization header:', req.headers.authorization);
    
    // Get user from token directly (like updateProfile)
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    console.log('PUT /api/auth/change-password - Current user:', user.email);
    
    // Check for validation errors
    const errors = validationResult(req);
    console.log('PUT /api/auth/change-password - Validation errors:', errors.array());
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    user.hashed_password = hashedNewPassword;
    await user.save();

    console.log('PUT /api/auth/change-password - Password changed successfully for user:', user.email);
    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      message: 'Error changing password',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router; 