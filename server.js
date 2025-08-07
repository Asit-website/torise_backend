const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './config.env' });

const app = express();

const { createServer } = require('http');
const { createEndpoint } = require('@jambonz/node-client-ws');
const server = createServer(app);
const makeService = createEndpoint({ server });
const logger = require('pino')({ level: process.env.LOGLEVEL || 'info' });

app.locals = {
  ...app.locals,
  logger
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
// mongodb+srv://kayuar:fQl8JqeHeoky7Mt4@cluster0.c6rbzjx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
// mongodb+srv://shubham:XEhbqsmjt4cnACyz@cluster0.ewetbgm.mongodb.net/
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
// const conversationRoutes = require('./routes/conversations');
const avatarRoutes = require('./routes/avatars');
const analyticsRoutes = require('./routes/analytics');
const clientApplicationRoutes = require('./routes/clientApplications');
const clientPortalRoutes = require('./routes/clientPortal');
const botRoutes = require('./routes/bots');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
// app.use('/api/conversations', conversationRoutes);
app.use(require("./routes/conversations"));
app.use('/api/avatars', avatarRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/client-applications', clientApplicationRoutes);
app.use('/api/client', clientPortalRoutes);
app.use('/api/admin/bots', botRoutes);
require('./routes/elevenlabs-s2s')({ logger, makeService });

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

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 