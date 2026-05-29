// api/rfid.js — handles RFID scans POSTed from ESP32
const { handlePreflight } = require('./_cors');
const { getDb } = require('./_db');

function getStatus(quantity, capacity) {
  if (!capacity || quantity <= 0) return 'EMPTY';
  const r = quantity / capacity;
  if (r >= 1)    return 'FULL';
  if (r <= 0.25) return 'LOW STOCK';
  return 'OK';
}

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ✅ Expects: { uid, containerId, action }
  const { uid, containerId, action = 'ADD' } = req.body || {};

  if (!uid)         return res.status(400).json({ error: 'uid required' });
  if (!containerId) return res.status(400).json({ error: 'containerId required' });

  const db  = await getDb();
  const col = db.collection('containers');
  const doc = await col.findOne({ id: containerId });

  if (!doc) return res.status(404).json({ error: `Container "${containerId}" not found` });

  const qty = 1; // each RFID scan counts as 1 unit
  let newQty;

  if (action === 'REMOVE') {
    newQty = Math.max(0, doc.quantity - qty);
  } else {
    // Default: ADD
    newQty = Math.min(doc.quantity + qty, doc.capacity);
  }

  const logEntry = {
    type: action === 'REMOVE' ? 'REMOVE' : 'ADD',
    productName: 'RFID Item',
    quantity: qty,
    newTotal: newQty,
    source: 'rfid',
    uid: uid.toUpperCase(),
    timestamp: new Date().toISOString(),
  };

  await col.updateOne(
    { id: containerId },
    {
      $set: { quantity: newQty },
      $push: { logs: { $each: [logEntry], $slice: -200 } },
    }
  );

  const updated = await col.findOne({ id: containerId }, { projection: { _id: 0 } });
  const status  = getStatus(updated.quantity, updated.capacity);

  console.log(`RFID ${uid} → ${containerId} [${action}] → qty now ${newQty}`);

  return res.status(200).json({
    success: true,
    container: { ...updated, status },
    action: logEntry.type,
    newQuantity: newQty,
  });
};
