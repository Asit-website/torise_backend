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

    // Just check if the endpoint responds successfully
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error('Webhook validation failed:', error);
    // For webhook validation, we'll be more lenient
    // Only return false for network errors, not for response format issues
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK') {
      return false;
    }
    // If we get any response (even error), the webhook exists
    return error.response && error.response.status >= 200 && error.response.status < 500;
  }
};

// POST /api/conversations/save - Save td_engine data to ConversationLog table
router.post('/api/conversations/save', async (req, res) => {
  try {
    console.log('Received conversation data:', JSON.stringify(req.body, null, 2));
    
    // Check if this is a chat conversation
    if (req.body.channel_type === 'chat' || req.body.bot_id) {
      // Remove webhook validation since we know it works from Postman
      // try {
      //   const bot = await Bot.findById(req.body.bot_id);
      //   if (bot && bot.webhook_url) {
      //     const isWebhookValid = await validateWebhookUrl(bot.webhook_url);
      //     if (!isWebhookValid) {
      //       console.log('❌ Not saving conversation - webhook URL is invalid');
      //       return res.status(400).json({ 
      //         message: 'Webhook URL is not responding. Conversation not saved.',
      //         error: 'Invalid webhook URL'
      //       });
      //     }
      //   }
      // } catch (error) {
      //   console.error('Error validating webhook:', error);
      //   return res.status(400).json({ 
      //     message: 'Failed to validate webhook URL. Conversation not saved.',
      //     error: 'Webhook validation failed'
      //   });
      // }
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
      
      // Generate and save summary for chat conversations
      try {
        const ConversationSummarizer = require('../../td_engine/lib/routes/conversation-summarizer');
        const summarizer = new ConversationSummarizer();
        
        if (conversationLogData.message_log && conversationLogData.message_log.length > 0) {
          console.log('🔍 Generating summary for chat conversation...');
          const summary = await summarizer.summarizeConversation(conversationLogData.message_log);
          
          if (summary) {
            console.log('✅ Summary generated:', summary);
            await summarizer.updateConversationSummary(conversationLog.conversation_id, summary);
          } else {
            console.log('❌ Failed to generate summary');
          }
        }
      } catch (summaryError) {
        console.error('Error generating summary:', summaryError);
      }
      
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
    console.log('=== CONVERSATIONS API DEBUGGING ===');
    console.log('Request query params:', req.query);
    
    const { clientId, channel_type, application_sid, page = 1, limit = 1000 } = req.query;
    const filter = {};
    
    // Handle clientId filtering - if provided, use it, but don't exclude null client_id
    if (clientId && clientId !== '') {
      // Use $or to match either the specific client_id OR null client_id
      filter.$or = [
        { client_id: clientId },
        { client_id: null }
      ];
      console.log('Added clientId filter with $or:', clientId);
    }
    
    if (channel_type && channel_type !== '') {
      filter.channel_type = channel_type;
      console.log('Added channel_type filter:', channel_type);
    }
    
    // Handle application_sid filtering - support both single value and array
    if (application_sid && application_sid !== '') {
      console.log('Processing application_sid:', application_sid);
      console.log('application_sid type:', typeof application_sid);
      console.log('application_sid isArray:', Array.isArray(application_sid));
      
      if (Array.isArray(application_sid)) {
        // If it's an array, use $in operator
        filter.application_sid = { $in: application_sid };
        console.log('Using $in operator with array:', application_sid);
      } else if (application_sid.includes(',')) {
        // If it's a comma-separated string, split and use $in
        const appSids = application_sid.split(',').map(sid => sid.trim());
        filter.application_sid = { $in: appSids };
        console.log('Using $in operator with comma-separated string:', appSids);
      } else {
        // Single value
        filter.application_sid = application_sid;
        console.log('Using single value:', application_sid);
      }
    } else {
      console.log('No application_sid provided in query');
    }

    console.log('Final filter object:', JSON.stringify(filter, null, 2));

    // If no specific filters, get all conversations (for admin view)
    const conversations = await ConversationLog.find(filter)
      .sort({ created_at: -1 });
      
    const totalDocs = conversations.length;

    console.log(`Found ${totalDocs} conversations with filter`);
    console.log('Sample conversations:', conversations.slice(0, 3).map(c => ({
      _id: c._id,
      application_sid: c.application_sid,
      client_id: c.client_id,
      channel_type: c.channel_type,
      created_at: c.created_at
    })));

    res.json({
      conversations,
      pagination: {
        current: parseInt(page),
        total: 1,
        totalDocs
      }
    });
  } catch (err) {
    console.error('Error fetching conversations:', err);
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

// PUT /api/conversations/:id/summary - Update conversation summary
router.put('/api/conversations/:id/summary', async (req, res) => {
  try {
    const { summary } = req.body;
    
    if (!summary) {
      return res.status(400).json({ error: 'Summary is required' });
    }

    const conversation = await ConversationLog.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Update the conversation with summary
    conversation.summary = summary;
    conversation.updated_at = new Date();
    
    await conversation.save();
    
    console.log(`Conversation summary updated for ID: ${req.params.id}`);
    res.json({ 
      message: 'Conversation summary updated successfully',
      conversation_id: conversation.conversation_id
    });
  } catch (err) {
    console.error('Error updating conversation summary:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
