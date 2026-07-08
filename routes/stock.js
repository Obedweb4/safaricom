const express = require('express');
const router = express.Router();
const SimCard = require('../models/SimCard');
const Dealer = require('../models/Dealer');
const { requireAdmin, requireAnyAuth } = require('../middleware/requireAuth');

// Splits a textarea blob of barcodes into a clean, deduped array.
// Accepts one-per-line, comma separated, or a mix of both.
function parseBarcodeList(raw) {
  return [...new Set(
    String(raw || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

// POST /api/stock/add - admin adds new SIM lines into the unallocated pool.
// Body: { barcodes: "one per line or comma separated" }
router.post('/add', requireAdmin, async (req, res) => {
  try {
    const barcodes = parseBarcodeList(req.body.barcodes);
    if (!barcodes.length) {
      return res.status(400).json({ error: 'Paste at least one barcode/serial number' });
    }

    const existing = await SimCard.find({ barcode: { $in: barcodes } }).select('barcode');
    const existingSet = new Set(existing.map((r) => r.barcode));
    const newBarcodes = barcodes.filter((b) => !existingSet.has(b));

    if (newBarcodes.length) {
      await SimCard.insertMany(
        newBarcodes.map((barcode) => ({ barcode, status: 'unallocated' })),
        { ordered: false }
      );
    }

    res.status(201).json({
      added: newBarcodes.length,
      skipped: barcodes.length - newBarcodes.length,
      total: barcodes.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add stock' });
  }
});

// POST /api/stock/allocate - admin assigns stock to a specific BA, either
// by quantity (auto-picks the oldest unallocated lines) or by pasting an
// exact list of barcodes.
// Body: { dealerId, count } OR { dealerId, barcodes: "..." }
router.post('/allocate', requireAdmin, async (req, res) => {
  try {
    const { dealerId, count } = req.body;
    if (!dealerId) {
      return res.status(400).json({ error: 'dealerId is required' });
    }

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({ error: 'BA not found' });
    }

    let targetIds = [];

    if (req.body.barcodes) {
      const barcodes = parseBarcodeList(req.body.barcodes);
      if (!barcodes.length) {
        return res.status(400).json({ error: 'Paste at least one barcode to allocate' });
      }
      const found = await SimCard.find({ barcode: { $in: barcodes }, status: 'unallocated' });
      const foundBarcodes = new Set(found.map((f) => f.barcode));
      const missing = barcodes.filter((b) => !foundBarcodes.has(b));
      if (missing.length) {
        return res.status(409).json({
          error: `${missing.length} of those barcodes are not available in the unallocated pool (not found, or already allocated/scanned)`,
          missing,
        });
      }
      targetIds = found.map((f) => f._id);
    } else {
      const qty = parseInt(count, 10);
      if (!qty || qty < 1) {
        return res.status(400).json({ error: 'count must be a positive number' });
      }
      const available = await SimCard.find({ status: 'unallocated' })
        .sort({ createdAt: 1 })
        .limit(qty)
        .select('_id');
      if (available.length < qty) {
        return res.status(409).json({
          error: `Only ${available.length} unallocated line(s) left in stock - add more stock first`,
        });
      }
      targetIds = available.map((a) => a._id);
    }

    await SimCard.updateMany(
      { _id: { $in: targetIds } },
      {
        $set: {
          dealer: dealer._id,
          dealerName: dealer.fullName,
          dealerIdNumber: dealer.idNumber,
          dealerCode: dealer.dealerCode,
          status: 'allocated',
          allocatedAt: new Date(),
        },
      }
    );

    res.json({ allocated: targetIds.length, dealer: { _id: dealer._id, fullName: dealer.fullName } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to allocate stock' });
  }
});

// POST /api/stock/deallocate/:id - admin returns an allocated (but not yet
// scanned) line back to the unallocated pool.
router.post('/deallocate/:id', requireAdmin, async (req, res) => {
  try {
    const record = await SimCard.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Stock line not found' });
    if (record.status !== 'allocated') {
      return res.status(409).json({ error: 'Only unscanned allocated lines can be deallocated' });
    }

    record.dealer = null;
    record.dealerName = undefined;
    record.dealerIdNumber = undefined;
    record.dealerCode = undefined;
    record.status = 'unallocated';
    record.allocatedAt = undefined;
    await record.save();

    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deallocate stock' });
  }
});

// GET /api/stock/summary - company-wide stock counts. Any logged-in user
// (admin or BA) can see the overall picture; only /mine below reveals an
// individual BA's own allocated barcodes.
router.get('/summary', requireAnyAuth, async (req, res) => {
  try {
    const counts = await SimCard.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    const total = Object.values(map).reduce((a, b) => a + b, 0);

    res.json({
      total,
      unallocated: map.unallocated || 0,
      allocated: map.allocated || 0,
      scanned: map.scanned || 0,
      registered: map.registered || 0,
      activated: map.activated || 0,
      rejected: map.rejected || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stock summary' });
  }
});

// GET /api/stock/mine - the logged-in BA's own allocation: what's been
// scanned already and what's still pending.
router.get('/mine', async (req, res) => {
  try {
    if (!req.session || !req.session.dealerId) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const lines = await SimCard.find({ dealer: req.session.dealerId }).sort({ allocatedAt: -1 });
    const allocated = lines.length;
    const scanned = lines.filter((l) => l.status !== 'allocated').length;

    res.json({
      allocated,
      scanned,
      remaining: allocated - scanned,
      pending: lines.filter((l) => l.status === 'allocated').map((l) => ({
        _id: l._id,
        barcode: l.barcode,
        allocatedAt: l.allocatedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch your stock' });
  }
});

module.exports = router;
