const express = require('express');
const Client = require('../models/Client');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/clients - List all clients (with filters, search, pagination)
router.get('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { search, industry, country, status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) query.name = { $regex: search, $options: 'i' };
  if (industry) query.industry = industry;
  if (country) query.country = country;
  if (status) query.status = status;
  const clients = await Client.find(query)
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ created_at: -1 });
  const total = await Client.countDocuments(query);
  res.json({ clients, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// GET /api/clients/:id - Fetch client details
router.get('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const client = await Client.findById(req.params.id).populate('assigned_avatar_ids');
  if (!client) return res.status(404).json({ message: 'Client not found' });
  res.json(client);
});

// POST /api/clients - Create new client
router.post('/', auth(['internal_admin', 'super_admin']), async (req, res) => {
  let {
    name,
    industry,
    country,
    contact_email,
    assigned_avatar_ids,
    application_sid,
    supports_text,
    supports_voice,
    status,
    notes,
    service,
    default_language
  } = req.body;

  if (!default_language) {
    return res.status(400).json({ message: 'Default language is required' });
  }
  // Normalize name and email
  if (name) name = name.trim();
  if (contact_email) contact_email = contact_email.trim().toLowerCase();

  try {
    console.log('Checking for existing client name:', name);
    const existingClient = await Client.findOne({ name });
    if (existingClient) {
      console.log('Duplicate name found:', name);
      return res.status(400).json({ message: 'Client name must be unique' });
    }

    // Check email if it's provided and not empty
    if (
      typeof contact_email !== 'undefined' &&
      contact_email !== null &&
      contact_email.trim() !== ''
    ) {
      console.log('Checking for existing client email:', contact_email);
      const emailExists = await Client.findOne({ contact_email });
      if (emailExists) {
        console.log('Duplicate email found:', contact_email);
        return res.status(400).json({ message: 'Primary email already exists for another client' });
      }
    } else {
      // If email is not provided, remove it from the object entirely
      contact_email = undefined;
    }

    // Ensure application_sid is an array
    if (typeof application_sid === 'string') {
      application_sid = application_sid.split(',').map(sid => sid.trim()).filter(Boolean);
    }

    const client = new Client({
      name,
      industry,
      country,
      contact_email,
      assigned_avatar_ids,
      application_sid,
      supports_text,
      supports_voice,
      status,
      notes,
      service,
      default_language
    });

    await client.save();
    res.status(201).json(client);
  } catch (err) {
    console.error('Error during client creation:', err);
    if (err.code === 11000) {
      if (err.keyPattern?.name) {
        return res.status(400).json({ message: 'Client name must be unique' });
      }
      if (err.keyPattern?.contact_email) {
        return res.status(400).json({ message: 'Primary email already exists for another client' });
      }
      return res.status(400).json({ message: 'Duplicate key error' });
    }
    res.status(500).json({ message: 'Error creating client', error: err.message });
  }
});


// PUT /api/clients/:id - Update client
router.put('/:id', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const { default_language } = req.body;
  if (!default_language) {
    return res.status(400).json({ message: 'Default language is required' });
  }
  let update = { ...req.body };
  if (typeof update.application_sid === 'string') {
    update.application_sid = update.application_sid.split(',').map(sid => sid.trim()).filter(Boolean);
  }
  
  // Add updated_at timestamp
  update.updated_at = new Date();
  
  const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!client) return res.status(404).json({ message: 'Client not found' });
  res.json(client);
});

// PATCH /api/clients/:id/status - Toggle status
router.patch('/:id/status', auth(['internal_admin', 'super_admin']), async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  client.status = client.status === 'active' ? 'inactive' : 'active';
  client.updated_at = new Date();
  await client.save();
  res.json({ message: 'Status updated', status: client.status });
});

module.exports = router; 