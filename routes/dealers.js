const express = require('express');
const router = express.Router();
const Dealer = require('../models/Dealer');
const SimCard = require('../models/SimCard');
const { requireAdmin } = require('../middleware/requireAuth');

// GET /api/dealers - list all BAs, each with their stock allocation
// breakdown. Admin only - powers the "manage BAs" table and the
// "filter/allocate by staff" dropdowns.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const dealers = await Dealer.find().sort({ fullName: 1 });

    const counts = await SimCard.aggregate([
      { $match: { dealer: { $ne: null } } },
      { $group: { _id: { dealer: '$dealer', status: '$status' }, count: { $sum: 1 } } },
    ]);

    const byDealer = new Map();
    counts.forEach((c) => {
      const key = String(c._id.dealer);
      if (!byDealer.has(key)) byDealer.set(key, {});
      byDealer.get(key)[c._id.status] = c.count;
    });

    const result = dealers.map((d) => {
      const statusCounts = byDealer.get(String(d._id)) || {};
      const allocated = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const scanned =
        (statusCounts.scanned || 0) + (statusCounts.registered || 0) +
        (statusCounts.activated || 0) + (statusCounts.rejected || 0);
      return {
        _id: d._id,
        idNumber: d.idNumber,
        fullName: d.fullName,
        dealerCode: d.dealerCode,
        active: d.active !== false,
        lastLoginAt: d.lastLoginAt,
        createdAt: d.createdAt,
        allocated,
        scanned,
        remaining: allocated - scanned,
        lineCount: scanned, // kept for backward compatibility with existing UI
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff list' });
  }
});

// POST /api/dealers - admin adds a new BA. The BA can only sign in once
// this record exists (see routes/auth.js).
router.post('/', requireAdmin, async (req, res) => {
  try {
    const idNumber = String(req.body.idNumber || '').trim();
    const fullName = String(req.body.fullName || '').trim();
    const dealerCode = String(req.body.dealerCode || '').trim();

    if (!idNumber || !fullName) {
      return res.status(400).json({ error: 'ID number and full name are both required' });
    }

    const existing = await Dealer.findOne({ idNumber });
    if (existing) {
      return res.status(409).json({ error: 'A BA with this ID number already exists' });
    }

    const dealer = await Dealer.create({ idNumber, fullName, dealerCode });
    res.status(201).json(dealer);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A BA with this ID number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to add BA' });
  }
});

// PATCH /api/dealers/:id - edit a BA's details or activate/deactivate them
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const allowedFields = ['fullName', 'dealerCode', 'active'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const dealer = await Dealer.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!dealer) return res.status(404).json({ error: 'BA not found' });
    res.json(dealer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update BA' });
  }
});

// DELETE /api/dealers/:id - remove a BA. Blocked if they still have stock
// allocated to them, so lines don't end up orphaned - deallocate first.
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const stillHasStock = await SimCard.exists({ dealer: req.params.id });
    if (stillHasStock) {
      return res.status(409).json({
        error: 'This BA still has stock allocated to them. Deallocate their lines first.',
      });
    }

    const dealer = await Dealer.findByIdAndDelete(req.params.id);
    if (!dealer) return res.status(404).json({ error: 'BA not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove BA' });
  }
});

module.exports = router;
