// api/_db.js — MongoDB connection (serverless-safe for Vercel)
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

// Cache the client promise at module scope so it survives warm re-use,
// but a new promise is created if the module is re-loaded (cold start).
let clientPromise;

function getClientPromise() {
  if (!clientPromise) {
    const client = new MongoClient(uri, {
      // These settings are important for serverless environments
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function getDb() {
  try {
    const client = await getClientPromise();
    return client.db('rfid_inventory');
  } catch (err) {
    // Reset so next call retries a fresh connection
    clientPromise = null;
    throw err;
  }
}

module.exports = { getDb };