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
    console.log('Login attempt for:', email, 'User found:', !!user, user && { status: user.status, hashed_password: user.hashed_password });
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

    res.json({
      message: 'Login successful',
      token,
      user: user.toJSON()
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

// Get current user profile
router.get('/me', auth, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('GET /api/auth/me - Token received, user:', req.user ? req.user.email : 'null');
    
    // Only send essential user data
    const userData = {
      _id: req.user._id,
      email: req.user.email,
      name: req.user.name,
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
    
    res.json(response);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// Update user profile
router.put('/me', auth, [
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters')
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

    const { firstName, lastName, bio, profilePicture } = req.body;

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        firstName: firstName || req.user.firstName,
        lastName: lastName || req.user.lastName,
        bio: bio !== undefined ? bio : req.user.bio,
        profilePicture: profilePicture || req.user.profilePicture
      },
      { new: true, runValidators: true }
    );

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

module.exports = router; 