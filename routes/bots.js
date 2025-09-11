const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Bot = require('../models/Bot');
const { auth } = require('../middleware/auth');

// Create a new bot
router.post('/', auth(['admin']), async (req, res) => {
  try {
    // Always sanitize dnis for non-voice/sms bots
    if (!['voice', 'sms'].includes(req.body.type)) {
      delete req.body.dnis;
    }
    console.log('Payload (POST /api/admin/bots):', req.body);
    // Only keep dnis if it's a non-empty array of strings for voice/sms
    if (req.body.type === 'voice' || req.body.type === 'sms') {
      if (!Array.isArray(req.body.dnis) || req.body.dnis.length === 0) {
        return res.status(400).json({ error: 'DNIS is required for Voice/SMS bots' });
      }
    }
    
    // Set default chat settings for chat bots
    if (req.body.type === 'chat') {
      // Validate webhook URL for chat bots
      if (!req.body.webhook_url || req.body.webhook_url.trim() === '') {
        return res.status(400).json({ error: 'Webhook URL is required for Chat bots' });
      }
      
      if (!req.body.welcome_message) {
        req.body.welcome_message = 'Welcome! How can I help you today?';
      }
      if (!req.body.user_prompt_fields) {
        req.body.user_prompt_fields = [
          { name: 'name', label: 'Your Name', required: true, type: 'text' },
          { name: 'email', label: 'Email Address', required: true, type: 'email' },
          { name: 'phone', label: 'Phone Number', required: false, type: 'phone' }
        ];
      }
      if (!req.body.chat_settings) {
        req.body.chat_settings = {
          require_user_details: true,
          auto_save_conversations: true
        };
      }
    }
    
    const bot = new Bot(req.body);
    await bot.save();
    res.status(201).json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all bots with filters and pagination
router.get('/', auth(['admin']), async (req, res) => {
  try {
    const { clientId, type, active, category, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (clientId && clientId !== '') filter.clientId = clientId;
    if (type && type !== '') filter.type = type;
    if (active !== undefined && active !== '') filter.active = active === 'true';
    if (category && category !== '') filter.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const bots = await Bot.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('clientId');
    const totalDocs = await Bot.countDocuments(filter);

    res.json({
      bots,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(totalDocs / limit),
        totalDocs
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup bot by DNIS
router.get('/lookup/:dnis', async (req, res) => {
  try {
    const { dnis } = req.params;
    const bot = await Bot.findOne({ dnis: dnis });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bots for a specific client
router.get('/client/:clientId', auth(['client_admin', 'client_manager', 'client_viewer', 'admin']), async (req, res) => {
  try {
    const clientId = req.params.clientId;
    console.log('🔍 Fetching bots for client:', clientId);
    
    // Convert string to ObjectId
    const bots = await Bot.find({ clientId: new mongoose.Types.ObjectId(clientId) });
    console.log('✅ Found bots:', bots.length);
    res.json(bots);
  } catch (err) {
    console.error('❌ Error fetching client bots:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a bot by ID
router.get('/:id', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a bot
router.put('/:id', async (req, res) => {
  try {
    // Always sanitize dnis for non-voice/sms bots
    if (!['voice', 'sms'].includes(req.body.type)) {
      delete req.body.dnis;
    }
    console.log('Payload (PUT /api/admin/bots/:id):', req.body);
    // Only keep dnis if it's a non-empty array of strings for voice/sms
    if (req.body.type === 'voice' || req.body.type === 'sms') {
      if (!Array.isArray(req.body.dnis) || req.body.dnis.length === 0) {
        return res.status(400).json({ error: 'DNIS is required for Voice/SMS bots' });
      }
    }
    
    // Set default chat settings for chat bots
    if (req.body.type === 'chat') {
      // Validate webhook URL for chat bots
      if (!req.body.webhook_url || req.body.webhook_url.trim() === '') {
        return res.status(400).json({ error: 'Webhook URL is required for Chat bots' });
      }
      
      if (!req.body.welcome_message) {
        req.body.welcome_message = 'Welcome! How can I help you today?';
      }
      if (!req.body.user_prompt_fields) {
        req.body.user_prompt_fields = [
          { name: 'name', label: 'Your Name', required: true, type: 'text' },
          { name: 'email', label: 'Email Address', required: true, type: 'email' },
          { name: 'phone', label: 'Phone Number', required: false, type: 'phone' }
        ];
      }
      if (!req.body.chat_settings) {
        req.body.chat_settings = {
          require_user_details: true,
          auto_save_conversations: true
        };
      }
    }
    
    const bot = await Bot.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle bot status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    bot.active = !bot.active;
    await bot.save();
    res.json(bot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a bot
router.delete('/:id', async (req, res) => {
  try {
    const bot = await Bot.findByIdAndDelete(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json({ message: 'Bot deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 