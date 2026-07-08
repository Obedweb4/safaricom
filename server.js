require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const simcardRoutes = require('./routes/simcards');
const dealerRoutes = require('./routes/dealers');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safaricom_sim_scanner';

connectDB();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGODB_URI, ttl: 60 * 60 * 24 * 7 }), // 7 days
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // requires HTTPS in production
      sameSite: 'lax',
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/simcards', simcardRoutes);
app.use('/api/dealers', dealerRoutes);

// The scanner page is for dealers; admins get their own dashboard instead.
app.get(['/', '/index.html'], (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin.html');
  }
  if (!req.session || !req.session.dealerId) {
    return res.redirect('/login.html');
  }
  next();
});

app.get('/admin.html', (req, res, next) => {
  if (!req.session || !req.session.isAdmin) {
    return res.redirect('/login.html');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[server] Safaricom SIM Scanner running at http://localhost:${PORT}`);
});
