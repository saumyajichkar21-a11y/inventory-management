// api/logs.js
const { handlePreflight } = require('./_cors');
const { getDb } = require('./_db');

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const db  = await getDb();
  const col = db.collection('containers');
  const { id } = req.query;

  if (id) {
    const doc = await col.findOne({ id }, { projection: { _id: 0, logs: 1 } });
    if (!doc) return res.status(404).json({ error: 'Container not found' });
    return res.status(200).json({ success: true, logs: [...(doc.logs || [])].reverse() });
  }

  const docs = await col.find({}, { projection: { _id: 0, id: 1, name: 1, logs: 1 } }).toArray();
  const logs = docs
    .flatMap(c => (c.logs || []).map(l => ({ ...l, containerName: c.name, containerId: c.id })))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100);

  return res.status(200).json({ success: true, logs });
};
