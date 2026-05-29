// api/inventory.js
const { handlePreflight } = require('./_cors');
const { getDb } = require('./_db');

function getStatus(quantity, capacity) {
  if (!capacity || quantity <= 0) return 'EMPTY';
  const r = quantity / capacity;
  if (r >= 1)    return 'FULL';
  if (r <= 0.25) return 'LOW STOCK';
  return 'OK';
}

const DEFAULT_CONTAINERS = [
  { id: 'c1', name: 'Container A', quantity: 0, capacity: 50, logs: [] },
  { id: 'c2', name: 'Container B', quantity: 0, capacity: 50, logs: [] },
  { id: 'c3', name: 'Container C', quantity: 0, capacity: 50, logs: [] },
  { id: 'c4', name: 'Container D', quantity: 0, capacity: 50, logs: [] },
];

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const db         = await getDb();
  const containers = db.collection('containers');

  // Seed only truly missing containers — never overwrite existing ones
  for (const defaults of DEFAULT_CONTAINERS) {
    await containers.updateOne(
      { id: defaults.id },
      { $setOnInsert: defaults },  // only sets fields on a NEW insert
      { upsert: true }
    );
  }

  if (req.method === 'GET') {
    const docs = await containers.find({}, { projection: { _id: 0 } }).toArray();
    const data = docs.map(c => ({ ...c, status: getStatus(c.quantity, c.capacity) }));
    return res.status(200).json({ success: true, containers: data, lastUpdated: new Date().toISOString() });
  }

  if (req.method === 'POST') {
    const { containerId, capacity } = req.body || {};
    if (!containerId) return res.status(400).json({ error: 'containerId required' });
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 1) return res.status(400).json({ error: 'invalid capacity' });

    await containers.updateOne({ id: containerId }, { $set: { capacity: Math.floor(cap) } });
    const doc = await containers.findOne({ id: containerId }, { projection: { _id: 0 } });
    return res.status(200).json({ success: true, container: { ...doc, status: getStatus(doc.quantity, doc.capacity) } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};