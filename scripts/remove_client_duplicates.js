// Usage: node backend/scripts/remove_client_duplicates.js
const mongoose = require('mongoose');
const Client = require('../models/Client');

const MONGO_URI = 'mongodb+srv://shubham:XEhbqsmjt4cnACyz@cluster0.ewetbgm.mongodb.net/';

async function removeDuplicates() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  let totalRemoved = 0;

  // Remove duplicate names (case-insensitive)
  const nameGroups = await Client.aggregate([
    { $group: {
      _id: { $toLower: "$name" },
      ids: { $push: "$_id" },
      count: { $sum: 1 }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);
  for (const group of nameGroups) {
    const [keep, ...remove] = group.ids;
    if (remove.length > 0) {
      await Client.deleteMany({ _id: { $in: remove } });
      totalRemoved += remove.length;
      console.log(`Removed ${remove.length} duplicate(s) for name: ${group._id}`);
    }
  }

  // Remove duplicate contact_email (case-insensitive, not null/empty)
  const emailGroups = await Client.aggregate([
    { $match: { contact_email: { $exists: true, $ne: null, $ne: "" } } },
    { $group: {
      _id: { $toLower: "$contact_email" },
      ids: { $push: "$_id" },
      count: { $sum: 1 }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);
  for (const group of emailGroups) {
    const [keep, ...remove] = group.ids;
    if (remove.length > 0) {
      await Client.deleteMany({ _id: { $in: remove } });
      totalRemoved += remove.length;
      console.log(`Removed ${remove.length} duplicate(s) for email: ${group._id}`);
    }
  }

  console.log(`Total duplicates removed: ${totalRemoved}`);
  await mongoose.disconnect();
  console.log('Done.');
}

removeDuplicates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 