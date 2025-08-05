// Usage: node backend/scripts/fix_client_indexes.js
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://shubham:XEhbqsmjt4cnACyz@cluster0.ewetbgm.mongodb.net/';

async function fixIndexes() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const collection = db.collection('clients');

  // 1. Migrate primary_email to contact_email if needed
  const docsToUpdate = await collection.find({ primary_email: { $exists: true } }).toArray();
  for (const doc of docsToUpdate) {
    if (!doc.contact_email && doc.primary_email) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { contact_email: doc.primary_email }, $unset: { primary_email: "" } }
      );
      console.log(`Migrated primary_email to contact_email for _id: ${doc._id}`);
    } else {
      await collection.updateOne(
        { _id: doc._id },
        { $unset: { primary_email: "" } }
      );
      console.log(`Removed primary_email from _id: ${doc._id}`);
    }
  }

  // 2. Drop unique index on primary_email if it exists
  const indexes = await collection.indexes();
  const primaryEmailIndex = indexes.find(idx => idx.key && idx.key.primary_email === 1);
  if (primaryEmailIndex) {
    await collection.dropIndex(primaryEmailIndex.name);
    console.log('Dropped unique index on primary_email');
  } else {
    console.log('No unique index on primary_email found');
  }

  // 3. Drop existing contact_email_1 index if it exists
  const contactEmailIndex = indexes.find(idx => idx.key && idx.key.contact_email === 1);
  if (contactEmailIndex) {
    await collection.dropIndex(contactEmailIndex.name);
    console.log('Dropped existing index on contact_email');
  } else {
    console.log('No existing index on contact_email found');
  }

  // 4. Create unique sparse index on contact_email
  await collection.createIndex({ contact_email: 1 }, { unique: true, sparse: true });
  console.log('Created unique sparse index on contact_email');

  // 5. Fix bots collection dnis index
  const botsCollection = db.collection('bots');
  const botsIndexes = await botsCollection.indexes();
  const dnisIndex = botsIndexes.find(idx => idx.key && idx.key.dnis === 1);
  if (dnisIndex) {
    await botsCollection.dropIndex(dnisIndex.name);
    console.log('Dropped existing index on dnis in bots');
  } else {
    console.log('No existing index on dnis in bots found');
  }
  // Create partial unique index (only for docs where dnis exists, is array, and not empty)
  await botsCollection.createIndex(
    { dnis: 1 },
    {
      unique: true,
      partialFilterExpression: {
        dnis: { $exists: true, $type: 'array', $ne: [] }
      }
    }
  );
  console.log('Created partial unique index on dnis in bots');

  // 6. Cleanup: Remove dnis from all non-voice/sms bots and from any bot where dnis is null/undefined/empty
  const cleanupResult1 = await botsCollection.updateMany(
    { type: { $nin: ["voice", "sms"] } },
    { $unset: { dnis: "" } }
  );
  console.log(`Removed dnis from ${cleanupResult1.modifiedCount} non-voice/sms bots.`);

  const cleanupResult2 = await botsCollection.updateMany(
    { $or: [ { dnis: { $exists: false } }, { dnis: null }, { dnis: [] }, { dnis: "" } ] },
    { $unset: { dnis: "" } }
  );
  console.log(`Removed dnis from ${cleanupResult2.modifiedCount} bots with null/undefined/empty dnis.`);

  // 7. Aggressive cleanup: Remove dnis from all bots where dnis is null, undefined, empty string, or empty array
  const cleanupResult3 = await botsCollection.updateMany(
    { $or: [
      { dnis: { $exists: false } },
      { dnis: null },
      { dnis: "" },
      { dnis: { $size: 0 } }
    ] },
    { $unset: { dnis: "" } }
  );
  console.log(`Aggressive cleanup: Removed dnis from ${cleanupResult3.modifiedCount} bots with dnis: null/undefined/empty string/empty array.`);

  // Extra aggressive cleanup: Remove dnis from all bots where dnis is missing, null, empty string, empty array, or is a string
  const extraCleanup = await botsCollection.updateMany(
    { $or: [
      { dnis: { $exists: false } },
      { dnis: null },
      { dnis: "" },
      { dnis: { $size: 0 } },
      { dnis: { $type: 'string' } }
    ] },
    { $unset: { dnis: "" } }
  );
  console.log(`Extra aggressive cleanup: Removed dnis from ${extraCleanup.modifiedCount} bots with missing/null/empty/string dnis.`);

  // Optional: Log how many bots still have a dnis field
  const stillHasDnis = await botsCollection.countDocuments({ dnis: { $exists: true } });
  console.log('Bots with dnis field still present after cleanup:', stillHasDnis);

  // NUCLEAR CLEANUP: Remove dnis from all bots
  const nuke = await botsCollection.updateMany({}, { $unset: { dnis: "" } });
  console.log(`NUCLEAR: Removed dnis from ${nuke.modifiedCount} bots (all bots).`);

  // Drop and recreate the index
  const dnisIndex2 = (await botsCollection.indexes()).find(idx => idx.key && idx.key.dnis === 1);
  if (dnisIndex2) {
    await botsCollection.dropIndex(dnisIndex2.name);
    console.log('NUCLEAR: Dropped existing index on dnis in bots');
  }
  await botsCollection.createIndex(
    { dnis: 1 },
    {
      unique: true,
      partialFilterExpression: {
        dnis: { $exists: true, $type: 'array', $ne: [] }
      }
    }
  );
  console.log('NUCLEAR: Created partial unique index on dnis in bots');

  await mongoose.disconnect();
  console.log('Done.');
}

fixIndexes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 