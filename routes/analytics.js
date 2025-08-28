const express = require('express');
const ConversationLog = require('../models/ConversationLog');
const Client = require('../models/Client');
const Avatar = require('../models/Avatar');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();
const { Parser } = require('json2csv');

// GET /api/analytics/kpis - Top row metrics
router.get('/kpis', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  const totalClients = await Client.countDocuments({ status: 'active' });
  const totalUsers = await User.countDocuments(); // Removed status filter to count all users
  const totalConversations = await ConversationLog.countDocuments();
  const activeAvatars = await Avatar.countDocuments({ status: 'live' });
  res.json({ totalClients, totalUsers, totalConversations, activeAvatars });
});

// GET /api/analytics/conversations-over-time
router.get('/conversations-over-time', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { days = 30, client, channel } = req.query;
    const daysNum = parseInt(days);
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    
    const match = {
      started_at: { $gte: startDate, $lte: endDate }
    };
    if (client) match.client_id = client;
    if (channel) match.channel_type = channel;
    
    const data = await ConversationLog.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    console.log(`Conversations over time for ${days} days:`, data);
    res.json(data);
  } catch (error) {
    console.error('Error fetching conversations over time:', error);
    res.status(500).json({ error: 'Failed to fetch conversations over time' });
  }
});

// GET /api/analytics/voice-minutes-over-time
router.get('/voice-minutes-over-time', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { days = 30, client } = req.query;
    const daysNum = parseInt(days);
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    
    const match = {
      channel_type: 'voice',
      $or: [
        { started_at: { $gte: startDate, $lte: endDate } },
        { created_at: { $gte: startDate, $lte: endDate } }
      ]
    };
    if (client) match.client_id = client;
    
    const data = await ConversationLog.aggregate([
      { $match: match },
      { $addFields: {
        // Use the appropriate date field for grouping
        dateField: {
          $cond: {
            if: { $ne: ['$started_at', null] },
            then: '$started_at',
            else: '$created_at'
          }
        },
        durationNumeric: { 
          $let: {
            vars: {
              durationStr: { $ifNull: ['$duration_minutes', '0'] }
            },
            in: {
              $cond: {
                if: { $regexMatch: { input: '$$durationStr', regex: '.*' } },
                then: {
                  $let: {
                    vars: {
                      // Check if it's seconds (ends with 's')
                      isSeconds: { $regexMatch: { input: '$$durationStr', regex: '.*s$' } },
                      // Check if it's minutes (ends with 'm')
                      isMinutes: { $regexMatch: { input: '$$durationStr', regex: '.*m$' } },
                      // Extract numeric value
                      numericValue: {
                        $toDouble: {
                          $replaceAll: {
                            input: { $replaceAll: { input: '$$durationStr', find: 'm', replacement: '' } },
                            find: 's',
                            replacement: ''
                          }
                        }
                      }
                    },
                    in: {
                      $cond: {
                        if: '$$isSeconds',
                        then: { $divide: ['$$numericValue', 60] }, // Convert seconds to minutes
                        else: {
                          $cond: {
                            if: '$$isMinutes',
                            then: '$$numericValue', // Keep minutes as is
                            else: '$$numericValue' // Assume minutes if no unit
                          }
                        }
                      }
                    }
                  }
                },
                else: 0
              }
            }
          }
        }
      }},
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$dateField' } },
        minutes: { $sum: '$durationNumeric' }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    console.log(`Voice minutes over time for ${days} days:`, data);
    
    // Debug: Show raw data for Aug 24 and Aug 25
    const aug24Data = await ConversationLog.find({
      channel_type: 'voice',
      $or: [
        { started_at: { 
          $gte: new Date('2025-08-24T00:00:00.000Z'),
          $lte: new Date('2025-08-24T23:59:59.999Z')
        }},
        { created_at: { 
          $gte: new Date('2025-08-24T00:00:00.000Z'),
          $lte: new Date('2025-08-24T23:59:59.999Z')
        }}
      ]
    }).select('duration_minutes started_at created_at');
    
    const aug25Data = await ConversationLog.find({
      channel_type: 'voice',
      $or: [
        { started_at: { 
          $gte: new Date('2025-08-25T00:00:00.000Z'),
          $lte: new Date('2025-08-25T23:59:59.999Z')
        }},
        { created_at: { 
          $gte: new Date('2025-08-25T00:00:00.000Z'),
          $lte: new Date('2025-08-25T23:59:59.999Z')
        }}
      ]
    }).select('duration_minutes started_at created_at');
    
    console.log('Aug 24 raw data:', aug24Data.map(d => ({
      duration_minutes: d.duration_minutes,
      started_at: d.started_at,
      created_at: d.created_at
    })));
    
    console.log('Aug 25 raw data:', aug25Data.map(d => ({
      duration_minutes: d.duration_minutes,
      started_at: d.started_at,
      created_at: d.created_at
    })));
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching voice minutes over time:', error);
    res.status(500).json({ error: 'Failed to fetch voice minutes over time' });
  }
});

// Test endpoint to find the missing 30s call
router.get('/find-30s-call', async (req, res) => {
  try {
    console.log('🔍 Searching for ALL 30s voice calls...');
    
    const all30sCalls = await ConversationLog.find({
      channel_type: 'voice',
      duration_minutes: '30s'
    }).select('started_at created_at duration_minutes channel_type');
    
    console.log('🔍 ALL 30s voice calls found:', all30sCalls.length);
    all30sCalls.forEach((record, index) => {
      console.log(`30s Call ${index + 1}:`, {
        started_at: record.started_at,
        created_at: record.created_at,
        duration_minutes: record.duration_minutes,
        started_at_date: record.started_at ? record.started_at.toISOString().split('T')[0] : 'null',
        created_at_date: record.created_at ? record.created_at.toISOString().split('T')[0] : 'null'
      });
    });
    
    res.json({
      total30sCalls: all30sCalls.length,
      calls: all30sCalls.map(r => ({
        started_at: r.started_at,
        created_at: r.created_at,
        duration_minutes: r.duration_minutes,
        started_at_date: r.started_at ? r.started_at.toISOString().split('T')[0] : 'null',
        created_at_date: r.created_at ? r.created_at.toISOString().split('T')[0] : 'null'
      }))
    });
  } catch (error) {
    console.error('Error finding 30s calls:', error);
    res.status(500).json({ error: 'Failed to find 30s calls' });
  }
});

// GET /api/analytics/top-avatars
router.get('/top-avatars', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  const { channel = 'text', limit = 5 } = req.query;
  const match = { channel_type: channel };
  const data = await ConversationLog.aggregate([
    { $match: match },
    { $group: {
      _id: '$avatar_id',
      count: { $sum: 1 }
    }},
    { $sort: { count: -1 } },
    { $limit: Number(limit) },
    { $lookup: {
      from: 'avatars',
      localField: '_id',
      foreignField: '_id',
      as: 'avatar'
    }},
    { $unwind: '$avatar' },
    { $project: { _id: 0, avatar: '$avatar.name', count: 1 } }
  ]);
  res.json(data);
});

// Test endpoint without auth
router.get('/test', async (req, res) => {
  res.json({ message: 'Analytics test endpoint working!' });
});

// Test endpoint to check user role
router.get('/check-role', auth([]), async (req, res) => {
  res.json({ 
    message: 'User authenticated!',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      firstName: req.user.firstName,
      lastName: req.user.lastName
    }
  });
});

// Test endpoint to check Aug 25 voice data
router.get('/test-aug25', async (req, res) => {
  try {
    const startDate = new Date('2025-08-25T00:00:00.000Z');
    const endDate = new Date('2025-08-25T23:59:59.999Z');
    
    const voiceData = await ConversationLog.find({
      channel_type: 'voice',
      started_at: { $gte: startDate, $lte: endDate }
    }).select('started_at duration_minutes channel_type');
    
    const totalMinutes = voiceData.reduce((sum, record) => {
      const duration = record.duration_minutes;
      if (duration && typeof duration === 'string') {
        const numericValue = parseFloat(duration.replace('m', ''));
        return sum + (isNaN(numericValue) ? 0 : numericValue);
      }
      return sum;
    }, 0);
    
    res.json({
      date: '2025-08-25',
      totalRecords: voiceData.length,
      totalMinutes: totalMinutes,
      records: voiceData.map(r => ({
        started_at: r.started_at,
        duration_minutes: r.duration_minutes
      }))
    });
  } catch (error) {
    console.error('Error testing Aug 25 data:', error);
    res.status(500).json({ error: 'Failed to test Aug 25 data' });
  }
});

// Test endpoint to check all voice conversations
router.get('/check-all-voice', async (req, res) => {
  try {
    console.log('🔍 Checking ALL voice conversations...');
    
    const allVoiceConversations = await ConversationLog.find({
      channel_type: 'voice'
    }).select('started_at created_at duration_minutes channel_type').sort({ started_at: 1 });
    
    console.log('📊 Total voice conversations found:', allVoiceConversations.length);
    
    allVoiceConversations.forEach((record, index) => {
      const startedDate = record.started_at ? record.started_at.toISOString().split('T')[0] : 'null';
      const createdDate = record.created_at ? record.created_at.toISOString().split('T')[0] : 'null';
      
      console.log(`Voice Call ${index + 1}:`, {
        duration_minutes: record.duration_minutes,
        started_at: record.started_at,
        created_at: record.created_at,
        started_date: startedDate,
        created_date: createdDate,
        is_aug24_started: startedDate === '2025-08-24',
        is_aug24_created: createdDate === '2025-08-24'
      });
    });
    
    // Count August 24th conversations by different criteria
    const aug24ByStarted = allVoiceConversations.filter(r => 
      r.started_at && r.started_at.toISOString().split('T')[0] === '2025-08-24'
    );
    
    const aug24ByCreated = allVoiceConversations.filter(r => 
      r.created_at && r.created_at.toISOString().split('T')[0] === '2025-08-24'
    );
    
    console.log('📊 August 24th counts:');
    console.log('- By started_at:', aug24ByStarted.length);
    console.log('- By created_at:', aug24ByCreated.length);
    
    res.json({
      totalVoiceConversations: allVoiceConversations.length,
      aug24ByStarted: aug24ByStarted.length,
      aug24ByCreated: aug24ByCreated.length,
      conversations: allVoiceConversations.map(r => ({
        duration_minutes: r.duration_minutes,
        started_at: r.started_at,
        created_at: r.created_at,
        started_date: r.started_at ? r.started_at.toISOString().split('T')[0] : 'null',
        created_date: r.created_at ? r.created_at.toISOString().split('T')[0] : 'null'
      }))
    });
  } catch (error) {
    console.error('Error checking voice conversations:', error);
    res.status(500).json({ error: 'Failed to check voice conversations' });
  }
});

// GET /api/analytics/usage-details
router.get('/usage-details', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days);
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    
    // Generate date labels
    const labels = [];
    const minutesData = [];
    const textData = [];
    
    for (let i = 0; i < daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Format label based on days
      if (daysNum === 7) {
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      } else {
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
      
      // Initialize with 0
      minutesData.push(0);
      textData.push(0);
    }
    
    // Fetch voice minutes data
    const voiceMinutesData = await ConversationLog.aggregate([
      {
        $match: {
          channel_type: 'voice',
          started_at: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $addFields: {
          durationNumeric: {
            $let: {
              vars: {
                durationStr: { $ifNull: ['$duration_minutes', '0'] }
              },
              in: {
                $cond: {
                  if: { $regexMatch: { input: '$$durationStr', regex: '^[0-9]+(\\.[0-9]+)?[mh]?$' } },
                  then: {
                    $toDouble: {
                      $replaceAll: {
                        input: { $replaceAll: { input: '$$durationStr', find: 'm', replacement: '' } },
                        find: 'h',
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
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
          minutes: { $sum: '$durationNumeric' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Fetch text sessions data
    const textSessionsData = await ConversationLog.aggregate([
      {
        $match: {
          channel_type: { $in: ['text', 'chat'] },
          started_at: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Map data to arrays
    voiceMinutesData.forEach(item => {
      const dayIndex = Math.floor((new Date(item._id) - startDate) / (1000 * 60 * 60 * 24));
      if (dayIndex >= 0 && dayIndex < daysNum) {
        minutesData[dayIndex] = Math.round(item.minutes);
      }
    });
    
    textSessionsData.forEach(item => {
      const dayIndex = Math.floor((new Date(item._id) - startDate) / (1000 * 60 * 60 * 24));
      if (dayIndex >= 0 && dayIndex < daysNum) {
        textData[dayIndex] = item.count;
      }
    });
    
    res.json({
      labels,
      minutes: minutesData,
      text: textData
    });
  } catch (error) {
    console.error('Error fetching usage details:', error);
    res.status(500).json({ error: 'Failed to fetch usage details' });
  }
});

// GET /api/analytics/fallback-rate
router.get('/fallback-rate', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  // Fallback = message_log with "Sorry, I didn't understand" or similar
  const { client } = req.query;
  const match = { channel_type: 'text' };
  if (client) match.client_id = client;
  const total = await ConversationLog.countDocuments(match);
  const fallback = await ConversationLog.countDocuments({
    ...match,
    'message_log.message': { $regex: 'Sorry, I didn\'t understand', $options: 'i' }
  });
  const rate = total ? (fallback / total) * 100 : 0;
  res.json({ total, fallback, rate });
});

// GET /api/analytics/clients-table
router.get('/clients-table', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  // Aggregate usage by client
  const data = await ConversationLog.aggregate([
    { $group: {
      _id: '$client_id',
      totalSessions: { $sum: 1 },
      voiceMinutes: { $sum: { $cond: [{ $eq: ['$channel_type', 'voice'] }, '$duration_minutes', 0] } },
      textSessions: { $sum: { $cond: [{ $eq: ['$channel_type', 'text'] }, 1, 0] } },
      avgDuration: { $avg: '$duration_minutes' },
      lastActive: { $max: '$started_at' }
    }},
    { $lookup: {
      from: 'clients',
      localField: '_id',
      foreignField: '_id',
      as: 'client'
    }},
    { $unwind: '$client' },
    { $project: {
      _id: 0,
      clientName: '$client.name',
      totalSessions: 1,
      voiceMinutes: 1,
      textSessions: 1,
      avgDuration: 1,
      lastActive: 1
    }}
  ]);
  res.json(data);
});

// GET /api/analytics/avatars-table
router.get('/avatars-table', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  // Aggregate usage by avatar
  const data = await ConversationLog.aggregate([
    { $group: {
      _id: '$avatar_id',
      sessions: { $sum: 1 },
      duration: { $sum: '$duration_minutes' },
      avgDuration: { $avg: '$duration_minutes' },
      lastActive: { $max: '$started_at' }
    }},
    { $lookup: {
      from: 'avatars',
      localField: '_id',
      foreignField: '_id',
      as: 'avatar'
    }},
    { $unwind: '$avatar' },
    { $project: {
      _id: 0,
      avatarName: '$avatar.name',
      sessions: 1,
      duration: 1,
      avgDuration: 1,
      lastActive: 1
    }}
  ]);
  res.json(data);
});

// GET /api/analytics/export
router.get('/export', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  const { type = 'csv', scope = 'client' } = req.query;
  let data;
  if (scope === 'client') {
    data = await ConversationLog.aggregate([
      { $group: {
        _id: '$client_id',
        totalSessions: { $sum: 1 },
        voiceMinutes: { $sum: { $cond: [{ $eq: ['$channel_type', 'voice'] }, '$duration_minutes', 0] } },
        textSessions: { $sum: { $cond: [{ $eq: ['$channel_type', 'text'] }, 1, 0] } },
        avgDuration: { $avg: '$duration_minutes' },
        lastActive: { $max: '$started_at' }
      }},
      { $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: '_id',
        as: 'client'
      }},
      { $unwind: '$client' },
      { $project: {
        _id: 0,
        clientName: '$client.name',
        totalSessions: 1,
        voiceMinutes: 1,
        textSessions: 1,
        avgDuration: 1,
        lastActive: 1
      }}
    ]);
  } else if (scope === 'avatar') {
    data = await ConversationLog.aggregate([
      { $group: {
        _id: '$avatar_id',
        sessions: { $sum: 1 },
        duration: { $sum: '$duration_minutes' },
        lastActive: { $max: '$started_at' }
      }},
      { $lookup: {
        from: 'avatars',
        localField: '_id',
        foreignField: '_id',
        as: 'avatar'
      }},
      { $unwind: '$avatar' },
      { $project: {
        _id: 0,
        avatarName: '$avatar.name',
        type: '$avatar.type',
        sessions: 1,
        duration: 1,
        lastActive: 1
      }}
    ]);
  } else {
    return res.status(400).json({ message: 'Invalid export scope' });
  }
  if (type === 'csv') {
    const parser = new Parser();
    const csv = parser.parse(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(`${scope}-export.csv`);
    return res.send(csv);
  } else {
    res.json(data);
  }
});

module.exports = router; 