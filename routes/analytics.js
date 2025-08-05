const express = require('express');
const ConversationLog = require('../models/ConversationLog');
const Client = require('../models/Client');
const Avatar = require('../models/Avatar');
const { auth } = require('../middleware/auth');
const router = express.Router();
const { Parser } = require('json2csv');

// GET /api/analytics/kpis - Top row metrics
router.get('/kpis', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const totalClients = await Client.countDocuments({ status: 'active' });
  const totalUsers = 0; // Implement user count as needed
  const totalConversations = await ConversationLog.countDocuments();
  const activeAvatars = await Avatar.countDocuments({ status: 'live' });
  res.json({ totalClients, totalUsers, totalConversations, activeAvatars });
});

// GET /api/analytics/conversations-over-time
router.get('/conversations-over-time', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { days = 30, client } = req.query;
  const match = {};
  if (client) match.client_id = client;
  const data = await ConversationLog.aggregate([
    { $match: match },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
      count: { $sum: 1 }
    }},
    { $sort: { _id: 1 } }
  ]);
  res.json(data);
});

// GET /api/analytics/voice-minutes-over-time
router.get('/voice-minutes-over-time', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { days = 30, client } = req.query;
  const match = { channel_type: 'voice' };
  if (client) match.client_id = client;
  const data = await ConversationLog.aggregate([
    { $match: match },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
      minutes: { $sum: '$duration_minutes' }
    }},
    { $sort: { _id: 1 } }
  ]);
  res.json(data);
});

// GET /api/analytics/top-avatars
router.get('/top-avatars', auth(['internal_admin', 'super_admin']), async (req, res) => {
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

// GET /api/analytics/fallback-rate
router.get('/fallback-rate', auth(['internal_admin', 'super_admin']), async (req, res) => {
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
router.get('/clients-table', auth(['internal_admin', 'super_admin']), async (req, res) => {
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
router.get('/avatars-table', auth(['internal_admin', 'super_admin']), async (req, res) => {
  // Aggregate usage by avatar
  const data = await ConversationLog.aggregate([
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
  res.json(data);
});

// GET /api/analytics/export
router.get('/export', auth(['internal_admin', 'super_admin']), async (req, res) => {
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