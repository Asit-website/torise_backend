const express = require('express');
const Client = require('../models/Client');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/clients - Get all clients
router.get('/', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    
    const clients = await Client.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ created_at: -1 });
    
    const total = await Client.countDocuments(query);
    
    res.json({
      clients,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalClients: total
      }
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Error fetching clients' });
  }
});

// GET /api/clients/:id - Get client by ID
router.get('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ message: 'Error fetching client' });
  }
});

// POST /api/clients - Create new client
router.post('/', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { name, email, phone, address, status = 'active', application_sid } = req.body;
    
    // Check if client already exists
    const existingClient = await Client.findOne({ email });
    if (existingClient) {
      return res.status(400).json({ message: 'Client with this email already exists' });
    }
    
    // Create client
    const client = new Client({
      name,
      email,
      phone,
      address,
      status,
      application_sid: application_sid || [],
      created_by: req.user._id
    });
    
    await client.save();
    
    res.status(201).json({
      message: 'Client created successfully',
      client: client.toJSON()
    });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ message: 'Error creating client' });
  }
});

// PUT /api/clients/:id - Update client
router.put('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { name, email, phone, address, status, application_sid } = req.body;
    const clientId = req.params.id;
    
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    // Update fields
    if (name) client.name = name;
    if (email) client.email = email;
    if (phone) client.phone = phone;
    if (address) client.address = address;
    if (status) client.status = status;
    if (application_sid) client.application_sid = application_sid;
    
    await client.save();
    
    res.json({
      message: 'Client updated successfully',
      client: client.toJSON()
    });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ message: 'Error updating client' });
  }
});

// PATCH /api/clients/:id/status - Update client status
router.patch('/:id/status', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const { status } = req.body;
    const clientId = req.params.id;
    
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    client.status = status;
    await client.save();
    
    res.json({
      message: 'Client status updated successfully',
      client: client.toJSON()
    });
  } catch (error) {
    console.error('Error updating client status:', error);
    res.status(500).json({ message: 'Error updating client status' });
  }
});

// Temporary route to update client's application_sid
router.post('/update-application-sids', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    console.log('Updating client application_sid...');
    
    // Update the specific client with application_sid
    const clientId = '687d09614bac8f92b252fbaa';
    const applicationSids = ['687fd45b998676bde66dd2e9', '18be6086-dc87-479a-8ec9-dd31d166cb82'];
    
    const client = await Client.findById(clientId);
    if (client) {
      client.application_sid = applicationSids;
      await client.save();
      console.log(`Updated client ${client.name} with application_sid:`, applicationSids);
      
      res.json({
        message: 'Client application_sid updated successfully',
        client: client.toJSON()
      });
    } else {
      res.status(404).json({ message: 'Client not found' });
    }
  } catch (error) {
    console.error('Error updating client application_sid:', error);
    res.status(500).json({ message: 'Error updating client application_sid' });
  }
});

module.exports = router; 