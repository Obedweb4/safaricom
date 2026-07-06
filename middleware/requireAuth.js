function requireAuth(req, res, next) {
  if (req.session && req.session.dealerId) {
    return next();
  }
  return res.status(401).json({ error: 'Not logged in' });
}

module.exports = requireAuth;
