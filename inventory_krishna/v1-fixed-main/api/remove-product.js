// api/remove-product.js
const { handlePreflight } = require('./_cors');
const { getDb } = require('./_db');

function getStatus(quantity, capacity) {
  if (!capacity || quantity <= 0) return 'EMPTY';
  const r = quantity / capacity;
  if (r >= 1) return 'FULL';
  if (r <= 0.25) return 'LOW STOCK';
  return 'OK';
}

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { containerId, productName = 'Item', quantity = 1 } = req.body || {};
  if (!containerId) return res.status(400).json({ error: 'containerId required' });

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const db  = await getDb();
  const col = db.collection('containers');
  const doc = await col.findOne({ id: containerId });
  if (!doc) return res.status(404).json({ error: 'Container not found' });
  if (doc.quantity <= 0) return res.status(400).json({ error: 'Container is already empty' });

  const newQty = Math.max(0, doc.quantity - qty);
  const logEntry = {
    type: 'REMOVE', productName, quantity: qty,
    newTotal: newQty, source: 'manual',
    timestamp: new Date().toISOString(),
  };

  await col.updateOne(
    { id: containerId },
    { $set: { quantity: newQty }, $push: { logs: { $each: [logEntry], $slice: -200 } } }
  );

  const updated = await col.findOne({ id: containerId }, { projection: { _id: 0 } });
  return res.status(200).json({ success: true, container: { ...updated, status: getStatus(updated.quantity, updated.capacity) } });
};
