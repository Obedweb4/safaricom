const express = require('express');
const router = express.Router();
const Dealer = require('../models/Dealer');

// POST /api/auth/login - identify by ID number + full name, create the
// dealer record on first login, then start a session.
router.post('/login', async (req, res) => {
  try {
    const idNumber = String(req.body.idNumber || '').trim();
    const fullName = String(req.body.fullName || '').trim();

    if (!idNumber || !fullName) {
      return res.status(400).json({ error: 'ID number and full name are both required' });
    }

    let dealer = await Dealer.findOne({ idNumber });

    if (dealer) {
      // Guard against someone else's ID number being reused with a different name
      const sameName = dealer.fullName.trim().toLowerCase() === fullName.toLowerCase();
      if (!sameName) {
        return res.status(409).json({
          error: 'This ID number is already registered under a different name. Check your details or contact your supervisor.',
        });
      }
      dealer.lastLoginAt = new Date();
      await dealer.save();
    } else {
      dealer = await Dealer.create({ idNumber, fullName, lastLoginAt: new Date() });
    }

    // Clear any previous admin session before starting a dealer one
    req.session.isAdmin = false;
    req.session.adminEmail = undefined;
    req.session.dealerId = dealer._id.toString();

    res.json({
      role: 'dealer',
      _id: dealer._id,
      idNumber: dealer.idNumber,
      fullName: dealer.fullName,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This ID number is already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/admin-login - fixed email/password login for the admin.
// Credentials are read from environment variables so they aren't sitting
// in the source code; ADMIN_EMAIL/ADMIN_PASSWORD fall back to defaults
// below only if those env vars haven't been set.
router.post('/admin-login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'techobed4@gmail.com').toLowerCase();
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trippleo1802';

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Clear any previous dealer session before starting an admin one
  req.session.dealerId = undefined;
  req.session.isAdmin = true;
  req.session.adminEmail = email;

  res.json({ role: 'admin', email });
});

// GET /api/auth/me - return the currently logged-in dealer or admin, if any
router.get('/me', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  if (req.session.isAdmin) {
    return res.json({ role: 'admin', email: req.session.adminEmail });
  }

  if (!req.session.dealerId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const dealer = await Dealer.findById(req.session.dealerId);
    if (!dealer) return res.status(401).json({ error: 'Not logged in' });
    res.json({ role: 'dealer', _id: dealer._id, idNumber: dealer.idNumber, fullName: dealer.fullName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

module.exports = router;
