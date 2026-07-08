const express = require('express');
const router = express.Router();
const SimCard = require('../models/SimCard');
const Dealer = require('../models/Dealer');
const { requireDealer, requireAnyAuth } = require('../middleware/requireAuth');

// POST /api/simcards - save a newly scanned barcode, tagged to the logged-in dealer
router.post('/', requireDealer, async (req, res) => {
  try {
    const {
      barcode,
      barcodeFormat,
      msisdn,
      customerName,
      customerIdNumber,
      status,
      notes,
    } = req.body;

    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    const dealer = await Dealer.findById(req.session.dealerId);
    if (!dealer) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const existing = await SimCard.findOne({ barcode: barcode.trim() });
    if (existing) {
      return res.status(409).json({
        error: 'This SIM barcode has already been scanned',
        existing,
      });
    }

    const record = await SimCard.create({
      barcode: barcode.trim(),
      barcodeFormat,
      msisdn,
      dealer: dealer._id,
      dealerName: dealer.fullName,
      dealerIdNumber: dealer.idNumber,
      dealerCode: dealer.dealerCode,
      customerName,
      customerIdNumber,
      status,
      notes,
    });

    return res.status(201).json(record);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This SIM barcode has already been scanned' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Failed to save SIM record' });
  }
});

// GET /api/simcards - list records, newest first, with optional search + pagination
router.get('/', requireAnyAuth, async (req, res) => {
  try {
    const { q, status, dealer, page = 1, limit = 25 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (dealer) filter.dealer = dealer;
    if (q) {
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { barcode: regex },
        { msisdn: regex },
        { dealerName: regex },
        { customerName: regex },
        { customerIdNumber: regex },
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);

    const [records, total] = await Promise.all([
      SimCard.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      SimCard.countDocuments(filter),
    ]);

    res.json({
      records,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch SIM records' });
  }
});

// GET /api/simcards/export.csv - download all matching records as CSV
router.get('/export.csv', requireAnyAuth, async (req, res) => {
  try {
    const { q, status, dealer } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (dealer) filter.dealer = dealer;
    if (q) {
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { barcode: regex },
        { msisdn: regex },
        { dealerName: regex },
        { customerName: regex },
        { customerIdNumber: regex },
      ];
    }

    const records = await SimCard.find(filter).sort({ createdAt: -1 });

    const header = [
      'barcode',
      'barcodeFormat',
      'msisdn',
      'dealerName',
      'dealerCode',
      'customerName',
      'customerIdNumber',
      'status',
      'notes',
      'scannedAt',
    ];

    const escapeCsv = (val = '') => `"${String(val).replace(/"/g, '""')}"`;

    const rows = records.map((r) =>
      header.map((field) => escapeCsv(r[field] ?? '')).join(',')
    );

    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sim-records.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export SIM records' });
  }
});

// PATCH /api/simcards/:id - update dealer/customer info or status after a scan
router.patch('/:id', requireAnyAuth, async (req, res) => {
  try {
    const allowedFields = [
      'msisdn',
      'customerName',
      'customerIdNumber',
      'status',
      'notes',
    ];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const record = await SimCard.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update SIM record' });
  }
});

// DELETE /api/simcards/:id - remove a record (e.g. mis-scan)
router.delete('/:id', requireAnyAuth, async (req, res) => {
  try {
    const record = await SimCard.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete SIM record' });
  }
});

module.exports = router;
