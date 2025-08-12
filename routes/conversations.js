const express = require('express');
const router = express.Router();
const Conversation = require("../models/Conversation");
const ConversationLog = require("../models/ConversationLog");
const Bot = require("../models/Bot");
const axios = require('axios');

// Validate webhook URL
const validateWebhookUrl = async (url) => {
  try {
    const testPayload = {
      message: 'test',
      sessionId: 'test_session',
      timestamp: new Date().toISOString()
    };

    const response = await axios.post(url, testPayload, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });

    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error('Webhook validation failed:', error);
    return false;
  }
};

// POST /api/conversations/save - Save td_engine data to ConversationLog table
router.post('/api/conversations/save', async (req, res) => {
  try {
    console.log('Received conversation data:', JSON.stringify(req.body, null, 2));
    
    // Check if this is a chat conversation
    if (req.body.channel_type === 'chat' || req.body.bot_id) {
      // Validate webhook URL for chat conversations
      try {
        const bot = await Bot.findById(req.body.bot_id);
        if (bot && bot.webhook_url) {
          const isWebhookValid = await validateWebhookUrl(bot.webhook_url);
          if (!isWebhookValid) {
            console.log('❌ Not saving conversation - webhook URL is invalid');
            return res.status(400).json({ 
              message: 'Webhook URL is not responding. Conversation not saved.',
              error: 'Invalid webhook URL'
            });
          }
        }
      } catch (error) {
        console.error('Error validating webhook:', error);
        return res.status(400).json({ 
          message: 'Failed to validate webhook URL. Conversation not saved.',
          error: 'Webhook validation failed'
        });
      }
      // Handle chat conversation
      const conversationLogData = {
        call_sid: req.body.conversation_id,
        application_sid: req.body.bot_id, // Keep bot_id as application_sid for compatibility
        conversation_id: req.body.conversation_id,
        account_sid: req.body.bot_id,
        client_id: req.body.client_id, // Add client_id for chat conversations
        channel_type: 'chat', // Chat conversations are chat type
        call_type: 'inbound',
        started_at: req.body.started_at || new Date(),
        answered_at: req.body.started_at || new Date(),
        ended_at: req.body.ended_at || new Date(),
        answered: true,
        duration_minutes: req.body.duration_minutes || '0s',
        from_number: req.body.user_details?.phone || req.body.user_details?.email || 'chat_user',
        to_number: req.body.bot_id || 'chat_bot',
        calling_number: req.body.user_details?.phone || req.body.user_details?.email || 'chat_user',
        ivr_number: req.body.bot_id || 'chat_bot',
        disposition: 'answered',
        language: 'en',
        handled_by: 'AI',
        message_log: req.body.message_log || [],
        created_at: new Date()
      };
      
      console.log('Saving chat conversation to ConversationLog:', conversationLogData);
      
      const conversationLog = new ConversationLog(conversationLogData);
      await conversationLog.save();
      
      // Update the conversation_id with the database-generated ID
      conversationLog.conversation_id = `conv_${conversationLog._id}`;
      await conversationLog.save();
      
      console.log('Chat conversation saved successfully:', conversationLog._id);
      res.status(201).json({ 
        message: 'Chat conversation saved successfully',
        conversation_id: conversationLog.conversation_id
      });
      return;
    }
    
    // Handle voice conversation (existing logic)
    const conversationLogData = {
      call_sid: req.body.call_sid,
      application_sid: req.body.application_sid,
      conversation_id: req.body.conversation_id,
      account_sid: req.body.account_sid,
      channel_type: 'voice', // Default to voice for td_engine calls
      call_type: req.body.summary?.direction || 'inbound',
      started_at: req.body.summary?.attempted_at || new Date(),
      answered_at: req.body.summary?.answered_at,
      ended_at: req.body.summary?.terminated_at,
      answered: req.body.summary?.answered || false,
      duration_minutes: req.body.summary?.duration_minutes || '0s',
      from_number: req.body.summary?.from,
      to_number: req.body.summary?.to,
      calling_number: req.body.summary?.from,
      ivr_number: req.body.summary?.to,
      disposition: req.body.summary?.answered ? 'answered' : 'no-answer',
      language: 'en', // Default language
      handled_by: 'AI', // Default to AI for td_engine calls
      message_log: req.body.events ? req.body.events.map((event, index) => ({
        sender: event.type === 'user_input' ? 'user' : 'agent',
        message: event.user_transcript || event.agent_response || '',
        timestamp: event.timestamp || new Date(Date.now() + (index * 1000)),
        sentiment: 'neutral',
        tags: []
      })) : [],
      created_at: new Date()
    };
    
    console.log('Saving to ConversationLog:', conversationLogData);
    
    const conversationLog = new ConversationLog(conversationLogData);
    await conversationLog.save();
    
    // Update the conversation_id with the database-generated ID
    conversationLog.conversation_id = `conv_${conversationLog._id}`;
    await conversationLog.save();
    
    console.log('ConversationLog saved successfully:', conversationLog._id);
    console.log('Conversation ID generated:', conversationLog.conversation_id);
    res.status(201).json({ 
      message: 'Conversation saved to reports table successfully',
      conversation_id: conversationLog.conversation_id
    });
  } catch (err) {
    console.error('Error saving conversation to reports table:', err);
    console.error('Payload that caused error:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      message: 'Failed to save conversation to reports table', 
      error: err.message,
      stack: err.stack
    });
  }
});

// POST /report/entry - Handle td_engine data (same as /api/conversations/save)
router.post('/report/entry', async (req, res) => {
  try {
    console.log('Received td_engine data at /report/entry:', JSON.stringify(req.body, null, 2));
    
    // Transform td_engine data to ConversationLog format
    const conversationLogData = {
      call_sid: req.body.call_sid,
      application_sid: req.body.application_sid,
      conversation_id: req.body.conversation_id,
      account_sid: req.body.account_sid,
      channel_type: 'voice', // Default to voice for td_engine calls
      call_type: req.body.summary?.direction || 'inbound',
      started_at: req.body.summary?.attempted_at || new Date(),
      answered_at: req.body.summary?.answered_at,
      ended_at: req.body.summary?.terminated_at,
      answered: req.body.summary?.answered || false,
      duration_minutes: req.body.summary?.duration_minutes || '0s',
      from_number: req.body.summary?.from,
      to_number: req.body.summary?.to,
      calling_number: req.body.summary?.from,
      ivr_number: req.body.summary?.to,
      disposition: req.body.summary?.answered ? 'answered' : 'no-answer',
      language: 'en', // Default language
      handled_by: 'AI', // Default to AI for td_engine calls
      message_log: req.body.events ? req.body.events.map((event, index) => ({
        sender: event.type === 'user_input' ? 'user' : 'agent',
        message: event.user_transcript || event.agent_response || '',
        timestamp: event.timestamp || new Date(Date.now() + (index * 1000)),
        sentiment: 'neutral',
        tags: []
      })) : [],
      created_at: new Date()
    };
    
    console.log('Saving to ConversationLog:', conversationLogData);
    
    const conversationLog = new ConversationLog(conversationLogData);
    await conversationLog.save();
    
    // Update the conversation_id with the database-generated ID
    conversationLog.conversation_id = `conv_${conversationLog._id}`;
    await conversationLog.save();
    
    console.log('ConversationLog saved successfully:', conversationLog._id);
    console.log('Conversation ID generated:', conversationLog.conversation_id);
    res.status(201).json({ 
      message: 'Conversation saved to reports table successfully',
      conversation_id: conversationLog.conversation_id
    });
  } catch (err) {
    console.error('Error saving conversation to reports table:', err);
    console.error('Payload that caused error:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      message: 'Failed to save conversation to reports table', 
      error: err.message,
      stack: err.stack
    });
  }
});

// GET /api/conversations - Get all conversations with filters and pagination
router.get('/api/conversations', async (req, res) => {
  try {
    const { clientId, channel_type, application_sid, page = 1, limit = 1000 } = req.query;
    const filter = {};
    
    if (clientId && clientId !== '') filter.client_id = clientId;
    if (channel_type && channel_type !== '') filter.channel_type = channel_type;
    if (application_sid && application_sid !== '') filter.application_sid = application_sid;

    // If no specific filters, get all conversations (for admin view)
    const conversations = await ConversationLog.find(filter)
      .sort({ created_at: -1 });
      
    const totalDocs = conversations.length;

    res.json({
      conversations,
      pagination: {
        current: parseInt(page),
        total: 1,
        totalDocs
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id - Get a specific conversation
router.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await ConversationLog.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
