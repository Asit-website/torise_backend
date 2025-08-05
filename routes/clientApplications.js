const express = require('express');
const ClientApplication = require('../models/ClientApplication');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/client-applications - List all App SIDs
router.get('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const apps = await ClientApplication.find().populate('client_id');
  res.json(apps);
});

// POST /api/client-applications - Create new App SID
router.post('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { client_id, app_sid, status, channels } = req.body;
  const exists = await ClientApplication.findOne({ app_sid });
  if (exists) return res.status(400).json({ message: 'App SID must be unique' });
  const app = new ClientApplication({ client_id, app_sid, status, channels });
  await app.save();
  res.status(201).json(app);
});

// PUT /api/client-applications/:id - Update App SID
router.put('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const app = await ClientApplication.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!app) return res.status(404).json({ message: 'App SID not found' });
  res.json(app);
});

// PATCH /api/client-applications/:id/status - Toggle status
router.patch('/:id/status', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const app = await ClientApplication.findById(req.params.id);
  if (!app) return res.status(404).json({ message: 'App SID not found' });
  app.status = app.status === 'active' ? 'inactive' : 'active';
  await app.save();
  res.json({ message: 'Status updated', status: app.status });
});

module.exports = router; 