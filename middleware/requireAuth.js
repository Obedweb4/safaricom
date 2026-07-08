// Requires a logged-in dealer (staff) session specifically - used for
// actions that must be tied to a real dealer, like creating a new scan.
function requireDealer(req, res, next) {
  if (req.session && req.session.dealerId) {
    return next();
  }
  return res.status(401).json({ error: 'Not logged in' });
}

// Requires either a dealer session OR an admin session - used for
// read/manage actions (viewing the ledger, exporting, deleting) that
// both roles should be able to do.
function requireAnyAuth(req, res, next) {
  if (req.session && (req.session.dealerId || req.session.isAdmin)) {
    return next();
  }
  return res.status(401).json({ error: 'Not logged in' });
}

// Requires an admin session specifically - used for admin-only data like
// the full staff/dealer directory.
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Admin login required' });
}

module.exports = { requireDealer, requireAnyAuth, requireAdmin };
