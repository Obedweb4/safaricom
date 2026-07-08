const express = require('express');
const router = express.Router();
const SimCard = require('../models/SimCard');
const Dealer = require('../models/Dealer');
const { requireDealer, requireAnyAuth, requireAdmin } = require('../middleware/requireAuth');

// POST /api/simcards - a BA scans a barcode. The barcode must already
// exist as a stock line allocated to THIS dealer - nothing is created
// here anymore, only updated. This is what enforces "you can only scan
// what's been allocated to you".
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

    const record = await SimCard.findOne({ barcode: barcode.trim() });

    if (!record) {
      return res.status(404).json({
        error: 'This SIM is not in stock. Ask your admin to add and allocate it before scanning.',
      });
    }

    if (record.status === 'unallocated') {
      return res.status(403).json({
        error: 'This SIM has not been allocated to you yet. Ask your admin to allocate it.',
      });
    }

    if (record.dealer && String(record.dealer) !== String(dealer._id)) {
      return res.status(403).json({
        error: `This SIM is allocated to another BA (${record.dealerName || 'unknown'}), not you.`,
      });
    }

    if (record.status !== 'allocated') {
      return res.status(409).json({
        error: 'This SIM has already been scanned/processed',
        existing: record,
      });
    }

    record.barcodeFormat = barcodeFormat ?? record.barcodeFormat;
    record.msisdn = msisdn ?? record.msisdn;
    record.dealerName = dealer.fullName;
    record.dealerIdNumber = dealer.idNumber;
    record.dealerCode = dealer.dealerCode;
    record.customerName = customerName ?? record.customerName;
    record.customerIdNumber = customerIdNumber ?? record.customerIdNumber;
    record.status = status && status !== 'unallocated' && status !== 'allocated' ? status : 'scanned';
    record.notes = notes ?? record.notes;
    record.scannedAt = new Date();

    await record.save();

    return res.status(201).json(record);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save SIM record' });
  }
});

// GET /api/simcards - list records, newest first, with optional search +
// pagination. A BA only ever sees their own lines, regardless of what
// dealer filter they pass in; admins can filter by any BA.
router.get('/', requireAnyAuth, async (req, res) => {
  try {
    const { q, status, dealer, page = 1, limit = 25 } = req.query;
    const filter = { status: { $ne: 'unallocated' } };

    if (req.session.isAdmin) {
      if (dealer) filter.dealer = dealer;
    } else {
      filter.dealer = req.session.dealerId;
    }

    if (status) filter.status = status;
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

// GET /api/simcards/export.csv - download all matching records as CSV.
// Same per-role scoping as the listing route above.
router.get('/export.csv', requireAnyAuth, async (req, res) => {
  try {
    const { q, status, dealer } = req.query;
    const filter = { status: { $ne: 'unallocated' } };

    if (req.session.isAdmin) {
      if (dealer) filter.dealer = dealer;
    } else {
      filter.dealer = req.session.dealerId;
    }

    if (status) filter.status = status;
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

// PATCH /api/simcards/:id - update customer info or status after a scan.
// A BA may only edit their own lines; an admin may edit any.
router.patch('/:id', requireAnyAuth, async (req, res) => {
  try {
    const record = await SimCard.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    if (!req.session.isAdmin && String(record.dealer) !== String(req.session.dealerId)) {
      return res.status(403).json({ error: 'You can only edit your own scanned lines' });
    }

    const allowedFields = ['msisdn', 'customerName', 'customerIdNumber', 'status', 'notes'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) record[field] = req.body[field];
    });

    await record.save();
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update SIM record' });
  }
});

// DELETE /api/simcards/:id - admin only. Deleting removes the line from
// stock entirely (use /api/stock/deallocate to just unassign a BA instead).
router.delete('/:id', requireAdmin, async (req, res) => {
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
