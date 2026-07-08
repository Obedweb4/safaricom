const express = require('express');
const router = express.Router();
const Dealer = require('../models/Dealer');
const SimCard = require('../models/SimCard');
const { requireAdmin } = require('../middleware/requireAuth');

// GET /api/dealers - list all staff, each with how many lines they've scanned.
// Admin only - used to populate the "filter by staff" dropdown.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const dealers = await Dealer.find().sort({ fullName: 1 });

    const counts = await SimCard.aggregate([
      { $group: { _id: '$dealer', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    const result = dealers.map((d) => ({
      _id: d._id,
      idNumber: d.idNumber,
      fullName: d.fullName,
      lineCount: countMap.get(String(d._id)) || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff list' });
  }
});

module.exports = router;
