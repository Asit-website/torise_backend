const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

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

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const avatarRoutes = require('./routes/avatars');
const analyticsRoutes = require('./routes/analytics');
const clientApplicationRoutes = require('./routes/clientApplications');
const clientPortalRoutes = require('./routes/clientPortal');
const botRoutes = require('./routes/bots');
const sentimentRoutes = require('./routes/sentiment');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use(require("./routes/conversations"));
app.use('/api/avatars', avatarRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/client-applications', clientApplicationRoutes);
app.use('/api/client', clientPortalRoutes);
app.use('/api/admin/bots', botRoutes);
app.use('/api/sentiment', sentimentRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend static files
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 