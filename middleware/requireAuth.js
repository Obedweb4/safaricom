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

module.exports = { requireDealer, requireAnyAuth };
