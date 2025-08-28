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
        { contact_email: { $regex: search, $options: 'i' } }
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
    const { 
      name, 
      contact_email, 
      country, 
      industry,
      status = 'active', 
      application_sid,
      supports_text,
      supports_voice,
      notes,
      service,
      default_language
    } = req.body;
    
    // Check if client already exists with this contact_email
    if (contact_email) {
      const existingClient = await Client.findOne({ contact_email });
      if (existingClient) {
        return res.status(400).json({ message: 'Client with this email already exists' });
      }
    }
    
    // Create client
    const client = new Client({
      name,
      contact_email,
      country,
      industry,
      status,
      application_sid: application_sid && typeof application_sid === 'string' ? application_sid.split(',').map(sid => sid.trim()) : [],
      supports_text: supports_text || false,
      supports_voice: supports_voice || false,
      notes,
      service: service || 'Standard',
      default_language: default_language || 'en'
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
    const { 
      name, 
      contact_email, 
      country, 
      industry,
      status, 
      application_sid,
      supports_text,
      supports_voice,
      notes,
      service,
      default_language
    } = req.body;
    const clientId = req.params.id;
    
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    // Check if contact_email is being changed and if it already exists
    if (contact_email && contact_email !== client.contact_email) {
      const existingClient = await Client.findOne({ contact_email });
      if (existingClient) {
        return res.status(400).json({ message: 'Client with this email already exists' });
      }
    }
    
    // Update fields
    if (name) client.name = name;
    if (contact_email) client.contact_email = contact_email;
    if (country) client.country = country;
    if (industry !== undefined) client.industry = industry;
    if (status) client.status = status;
    if (application_sid && typeof application_sid === 'string') {
      client.application_sid = application_sid.split(',').map(sid => sid.trim());
    } else if (application_sid && Array.isArray(application_sid)) {
      client.application_sid = application_sid;
    }
    if (supports_text !== undefined) client.supports_text = supports_text;
    if (supports_voice !== undefined) client.supports_voice = supports_voice;
    if (notes !== undefined) client.notes = notes;
    if (service) client.service = service;
    if (default_language) client.default_language = default_language;
    
    client.updated_at = new Date();
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

// DELETE /api/clients/:id - Delete client
router.delete('/:id', auth(['admin', 'internal_admin', 'super_admin']), async (req, res) => {
  try {
    const clientId = req.params.id;
    
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    // Check if client has any associated users
    const User = require('../models/User');
    const associatedUsers = await User.find({ client_id: clientId });
    
    if (associatedUsers.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete client. There are users associated with this client. Please remove or reassign users first.' 
      });
    }
    
    // Check if client has any associated conversations
    const ConversationLog = require('../models/ConversationLog');
    const associatedConversations = await ConversationLog.find({ client_id: clientId });
    
    if (associatedConversations.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete client. There are conversations associated with this client. Please remove conversations first.' 
      });
    }
    
    // Delete the client
    await Client.findByIdAndDelete(clientId);
    
    res.json({
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ message: 'Error deleting client' });
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