const express = require('express');
const mongoose = require('mongoose');
const ConversationLog = require('../models/ConversationLog');
const Avatar = require('../models/Avatar');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Middleware: Only allow client roles
const clientAuth = auth(['client_admin', 'client_manager', 'client_viewer']);

// GET /api/client/dashboard
router.get('/dashboard', clientAuth, async (req, res) => {
  const clientId = req.user.client_id;
  // KPIs
  const totalConversations = await ConversationLog.countDocuments({ client_id: new mongoose.Types.ObjectId(clientId) });
  const totalVoiceMinutes = await ConversationLog.aggregate([
    { $match: { client_id: new mongoose.Types.ObjectId(clientId), channel_type: 'voice' } },
    { $group: { 
        _id: null, 
        minutes: { 
          $sum: { 
            $cond: {
              if: { $eq: ['$duration_minutes', null] },
              then: 0,
              else: {
                $cond: {
                  if: { $eq: ['$duration_minutes', ''] },
                  then: 0,
                  else: {
                    $cond: {
                      if: { $regexMatch: { input: '$duration_minutes', regex: /^[0-9]+m?$/ } },
                      then: {
                        $toDouble: {
                          $replaceAll: {
                            input: '$duration_minutes',
                            find: 'm',
                            replacement: ''
                          }
                        }
                      },
                      else: 0
                    }
                  }
                }
              }
            } 
          } 
        } 
      } 
    }
  ]);
  const totalTextSessions = await ConversationLog.countDocuments({ client_id: new mongoose.Types.ObjectId(clientId), channel_type: 'text' });
  const totalChatSessions = await ConversationLog.countDocuments({ client_id: new mongoose.Types.ObjectId(clientId), channel_type: 'chat' });
  const mostUsedAvatar = await ConversationLog.aggregate([
    { $match: { client_id: new mongoose.Types.ObjectId(clientId) } },
    { $group: { _id: '$avatar_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 1 },
    { $lookup: { from: 'avatars', localField: '_id', foreignField: '_id', as: 'avatar' } },
    { $unwind: '$avatar' }
  ]);
  const lastSession = await ConversationLog.findOne({ client_id: new mongoose.Types.ObjectId(clientId) }).sort({ started_at: -1 });

  // Charts
  const voiceMinutesOverTime = await ConversationLog.aggregate([
    { $match: { client_id: new mongoose.Types.ObjectId(clientId), channel_type: 'voice' } },
    { $group: { 
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } }, 
        minutes: { 
          $sum: { 
            $cond: {
              if: { $eq: ['$duration_minutes', null] },
              then: 0,
              else: {
                $cond: {
                  if: { $eq: ['$duration_minutes', ''] },
                  then: 0,
                  else: {
                    $cond: {
                      if: { $regexMatch: { input: '$duration_minutes', regex: /^[0-9]+m?$/ } },
                      then: {
                        $toDouble: {
                          $replaceAll: {
                            input: '$duration_minutes',
                            find: 'm',
                            replacement: ''
                          }
                        }
                      },
                      else: 0
                    }
                  }
                }
              }
            } 
          } 
        } 
      } 
    },
    { $sort: { _id: 1 } }
  ]);
  const textSessionsOverTime = await ConversationLog.aggregate([
    { $match: { client_id: new mongoose.Types.ObjectId(clientId), channel_type: 'text' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } }, sessions: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const chatSessionsOverTime = await ConversationLog.aggregate([
    { $match: { client_id: new mongoose.Types.ObjectId(clientId), channel_type: 'chat' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } }, sessions: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const avatarUsage = await ConversationLog.aggregate([
    { $match: { client_id: new mongoose.Types.ObjectId(clientId) } },
    { $group: {
      _id: '$avatar_id',
      voice_minutes: { 
        $sum: { 
          $cond: [
            { $eq: ['$channel_type', 'voice'] }, 
            {
              $cond: {
                if: { $eq: ['$duration_minutes', null] },
                then: 0,
                else: {
                  $cond: {
                    if: { $eq: ['$duration_minutes', ''] },
                    then: 0,
                    else: {
                      $cond: {
                        if: { $regexMatch: { input: '$duration_minutes', regex: /^[0-9]+m?$/ } },
                        then: {
                          $toDouble: {
                            $replaceAll: {
                              input: '$duration_minutes',
                              find: 'm',
                              replacement: ''
                            }
                          }
                        },
                        else: 0
                      }
                    }
                  }
                }
              }
            },
            0
          ] 
        } 
      },
      text_sessions: { $sum: { $cond: [{ $eq: ['$channel_type', 'text'] }, 1, 0] } },
      chat_sessions: { $sum: { $cond: [{ $eq: ['$channel_type', 'chat'] }, 1, 0] } }
    }},
    { $lookup: { from: 'avatars', localField: '_id', foreignField: '_id', as: 'avatar' } },
    { $unwind: '$avatar' },
    { $project: { name: '$avatar.name', voice_minutes: 1, text_sessions: 1, chat_sessions: 1 } }
  ]);

  res.json({
    kpis: {
      total_conversations: totalConversations,
      total_voice_minutes: totalVoiceMinutes[0]?.minutes || 0,
      total_text_sessions: totalTextSessions,
      total_chat_sessions: totalChatSessions,
      most_used_avatar: mostUsedAvatar[0]?.avatar?.name || null,
      last_session_date: lastSession?.started_at || null
    },
    charts: {
      voice_minutes_over_time: voiceMinutesOverTime,
      text_sessions_over_time: textSessionsOverTime,
      chat_sessions_over_time: chatSessionsOverTime
    },
    avatar_usage: avatarUsage
  });
});

// GET /api/client/analytics/chat-over-time
router.get('/analytics/chat-over-time', clientAuth, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { days = 7 } = req.query;
    
    console.log(`🔍 Fetching chat analytics for client ${clientId} for ${days} days`);
    console.log('🔍 User object:', req.user);
    console.log('🔍 Client ID type:', typeof clientId);
    console.log('🔍 Client ID value:', clientId);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const result = await ConversationLog.aggregate([
      {
        $match: {
          client_id: new mongoose.Types.ObjectId(clientId),
          channel_type: 'chat',
          $or: [
            { started_at: { $gte: startDate } },
            { created_at: { $gte: startDate } }
          ]
        }
      },
      {
        $addFields: {
          dateField: {
            $cond: {
              if: { $ne: ['$started_at', null] },
              then: '$started_at',
              else: '$created_at'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$dateField'
            }
          },
          count: { $sum: 1 },
          minutes: { 
            $sum: { 
              $cond: {
                if: { $eq: ['$duration_minutes', null] },
                then: 0,
                else: {
                  $cond: {
                    if: { $eq: ['$duration_minutes', ''] },
                    then: 0,
                    else: {
                      $cond: {
                        if: { $regexMatch: { input: '$duration_minutes', regex: /^[0-9]+m?$/ } },
                        then: {
                          $toDouble: {
                            $replaceAll: {
                              input: '$duration_minutes',
                              find: 'm',
                              replacement: ''
                            }
                          }
                        },
                        else: 0
                      }
                    }
                  }
                }
              }
            } 
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Generate labels for all dates in range
    const labels = [];
    const data = [];
    const minutes = [];
    const currentDate = new Date(startDate);
    const endDate = new Date();
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      labels.push(dateStr);
      
      const matchingData = result.find(item => item._id === dateStr);
      data.push(matchingData ? matchingData.count : 0);
      minutes.push(matchingData ? matchingData.minutes : 0);
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log('✅ Chat analytics result:', { labels, data, minutes });
    
    res.json({ labels, data, minutes });
  } catch (error) {
    console.error('❌ Error fetching chat analytics:', error);
    res.status(500).json({ error: 'Failed to fetch chat analytics' });
  }
});

// GET /api/client/analytics/voice-over-time
router.get('/analytics/voice-over-time', clientAuth, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const { days = 7 } = req.query;
    
    console.log(`🔍 Fetching voice analytics for client ${clientId} for ${days} days`);
    console.log('🔍 User object:', req.user);
    console.log('🔍 Client ID type:', typeof clientId);
    console.log('🔍 Client ID value:', clientId);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const result = await ConversationLog.aggregate([
      {
        $match: {
          client_id: new mongoose.Types.ObjectId(clientId),
          channel_type: 'voice',
          $or: [
            { started_at: { $gte: startDate } },
            { created_at: { $gte: startDate } }
          ]
        }
      },
      {
        $addFields: {
          dateField: {
            $cond: {
              if: { $ne: ['$started_at', null] },
              then: '$started_at',
              else: '$created_at'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$dateField'
            }
          },
          count: { $sum: 1 },
          minutes: { 
            $sum: { 
              $cond: {
                if: { $eq: ['$duration_minutes', null] },
                then: 0,
                else: {
                  $cond: {
                    if: { $eq: ['$duration_minutes', ''] },
                    then: 0,
                    else: {
                      $cond: {
                        if: { $regexMatch: { input: '$duration_minutes', regex: /^[0-9]+m?$/ } },
                        then: {
                          $toDouble: {
                            $replaceAll: {
                              input: '$duration_minutes',
                              find: 'm',
                              replacement: ''
                            }
                          }
                        },
                        else: 0
                      }
                    }
                  }
                }
              }
            } 
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Generate labels for all dates in range
    const labels = [];
    const data = [];
    const minutes = [];
    const currentDate = new Date(startDate);
    const endDate = new Date();
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      labels.push(dateStr);
      
      const matchingData = result.find(item => item._id === dateStr);
      data.push(matchingData ? matchingData.count : 0);
      minutes.push(matchingData ? matchingData.minutes : 0);
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log('✅ Voice analytics result:', { labels, data, minutes });
    
    res.json({ labels, data, minutes });
  } catch (error) {
    console.error('❌ Error fetching voice analytics:', error);
    res.status(500).json({ error: 'Failed to fetch voice analytics' });
  }
});

// GET /api/client/kpis
router.get('/kpis', clientAuth, async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const applicationSid = req.user.application_sid;
    
    console.log('🔍 Fetching KPIs for client:', clientId, 'application_sid:', applicationSid);
    
    // Count text conversations (filtered by client_id)
    const textUsed = await ConversationLog.countDocuments({ 
      client_id: new mongoose.Types.ObjectId(clientId), 
      channel_type: 'chat' 
    });
    
    // Count voice conversations (filtered by application_sid)
    const voiceUsed = await ConversationLog.countDocuments({ 
      application_sid: applicationSid, 
      channel_type: 'voice' 
    });
    
    // Total conversations (text + voice)
    const totalConversations = textUsed + voiceUsed;
    
    // Count unique application SIDs for this client
    const applicationSids = await ConversationLog.distinct('application_sid', { 
      client_id: new mongoose.Types.ObjectId(clientId) 
    });
    
    console.log('✅ KPI Results:', {
      textUsed,
      voiceUsed,
      totalConversations,
      applicationSids: applicationSids.length
    });
    
    res.json({
      textUsed,
      voiceUsed,
      totalConversations,
      applicationSids: applicationSids.length
    });
  } catch (error) {
    console.error('❌ Error fetching client KPIs:', error);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// GET /api/client/logs
router.get('/logs', clientAuth, async (req, res) => {
  const clientId = req.user.client_id;
  const { channel_type, date_from, date_to, avatar, application_sid, page = 1, limit = 25 } = req.query;
  const query = { client_id: new mongoose.Types.ObjectId(clientId) };
  
  if (channel_type) query.channel_type = channel_type;
  if (avatar) query.avatar_id = avatar;
  
  // Handle application_sid filtering - support both single value and array
  if (application_sid && application_sid !== '') {
    console.log('Client Portal - Processing application_sid:', application_sid);
    console.log('Client Portal - application_sid type:', typeof application_sid);
    console.log('Client Portal - application_sid isArray:', Array.isArray(application_sid));
    
    if (Array.isArray(application_sid)) {
      // If it's already an array, use $in operator
      query.application_sid = { $in: application_sid };
      console.log('Client Portal - Using $in operator with array:', application_sid);
    } else if (application_sid.includes(',')) {
      // If it's a comma-separated string, split it
      const appSids = application_sid.split(',').map(sid => sid.trim());
      query.application_sid = { $in: appSids };
      console.log('Client Portal - Using $in operator with split string:', appSids);
    } else {
      // Single value
      query.application_sid = application_sid;
      console.log('Client Portal - Using single value:', application_sid);
    }
  } else {
    console.log('Client Portal - No application_sid provided in query');
  }
  
  if (date_from || date_to) query.started_at = {};
  if (date_from) query.started_at.$gte = new Date(date_from);
  if (date_to) query.started_at.$lte = new Date(date_to);

  console.log('Client Portal - Final query:', JSON.stringify(query, null, 2));

  const logs = await ConversationLog.find(query)
    .populate('avatar_id')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ started_at: -1 });
  const total = await ConversationLog.countDocuments(query);
  
  console.log(`Client Portal - Found ${logs.length} logs out of ${total} total`);
  
  res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// GET /api/client/logs/:id
router.get('/logs/:id', clientAuth, async (req, res) => {
  const log = await ConversationLog.findOne({ _id: req.params.id, client_id: req.user.client_id }).populate('avatar_id');
  if (!log) return res.status(404).json({ message: 'Log not found' });
  res.json(log);
});

// GET /api/client/reports - Reports route for client portal
router.get('/reports', clientAuth, async (req, res) => {
  const clientId = req.user.client_id;
  const { channel_type, date_from, date_to, avatar, application_sid, page = 1, limit = 25 } = req.query;
  
  // Create a complex query that handles mixed filtering:
  // - Chat conversations: filter by client_id
  // - Voice conversations: filter by application_sid
  const query = {
    $or: [
      // Chat conversations filtered by client_id
      {
        channel_type: 'chat',
        client_id: new mongoose.Types.ObjectId(clientId)
      },
      // Voice conversations filtered by application_sid
      {
        channel_type: 'voice'
      }
    ]
  };
  
  // Add application_sid filtering for voice conversations
  if (application_sid && application_sid !== '') {
    console.log('Client Portal Reports - Processing application_sid:', application_sid);
    console.log('Client Portal Reports - application_sid type:', typeof application_sid);
    console.log('Client Portal Reports - application_sid isArray:', Array.isArray(application_sid));
    
    let appSids = [];
    if (Array.isArray(application_sid)) {
      appSids = application_sid;
    } else if (application_sid.includes(',')) {
      appSids = application_sid.split(',').map(sid => sid.trim());
    } else {
      appSids = [application_sid];
    }
    
    // Update the voice part of the $or query to include application_sid
    query.$or[1].application_sid = { $in: appSids };
    console.log('Client Portal Reports - Using $in operator with:', appSids);
  } else {
    console.log('Client Portal Reports - No application_sid provided in query');
  }
  
  // Add other filters
  if (channel_type) {
    // If specific channel_type is requested, override the $or logic
    query.$or = undefined;
    query.channel_type = channel_type;
    if (channel_type === 'chat') {
      query.client_id = new mongoose.Types.ObjectId(clientId);
    } else if (channel_type === 'voice' && application_sid && application_sid !== '') {
      let appSids = [];
      if (Array.isArray(application_sid)) {
        appSids = application_sid;
      } else if (application_sid.includes(',')) {
        appSids = application_sid.split(',').map(sid => sid.trim());
      } else {
        appSids = [application_sid];
      }
      query.application_sid = { $in: appSids };
    }
  }
  
  if (avatar) query.avatar_id = avatar;
  
  if (date_from || date_to) query.started_at = {};
  if (date_from) query.started_at.$gte = new Date(date_from);
  if (date_to) query.started_at.$lte = new Date(date_to);

  console.log('Client Portal Reports - Final query:', JSON.stringify(query, null, 2));

  const logs = await ConversationLog.find(query)
    .populate('avatar_id')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ started_at: -1 });
  const total = await ConversationLog.countDocuments(query);
  
  console.log(`Client Portal Reports - Found ${logs.length} logs out of ${total} total`);
  
  res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

module.exports = router; 