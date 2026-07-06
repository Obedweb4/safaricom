# SIM Line Scanner — Safaricom Dealer Terminal

A small Node.js + Express + MongoDB web app that lets a Safaricom dealer/agent
scan the barcode on a SIM card line using their phone or laptop camera, then
save the details to a database.

## Features

- **Login with ID number + full name.** A dealer signs in with their national ID/passport number and full name before they can scan anything. First login creates their record automatically; later logins just re-recognize them. Sessions last 7 days and are stored in MongoDB.
- Every scanned line is tagged to the dealer who scanned it (no manual "who am I" field to fill in or fake).
- Camera-based barcode scanning in the browser (no app install, works on phone or laptop) via `html5-qrcode`, supporting CODE_128, CODE_39, CODE_93, EAN, UPC and QR formats — covers the common SIM/ICCID barcode types.
- Manual entry fallback if a camera isn't available or a barcode won't scan.
- Duplicate protection — the same barcode can't be saved twice.
- Customer name/ID, MSISDN, status (scanned / registered / activated / rejected), and notes per line.
- Live "ledger" of scanned lines with search and CSV export.
- MongoDB storage via Mongoose.

## Requirements

- Node.js 18+
- A MongoDB database (local install, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- A device with a camera, served over **HTTPS or localhost** (browsers only allow camera access on secure origins)

## Setup

```bash
cd safaricom-sim-scanner
npm install
cp .env.example .env
# edit .env and set MONGODB_URI to your database connection string
npm start
```

Then open `http://localhost:3000` in your browser (or on your phone, once the
server is reachable over HTTPS — see below).

## Using it on a phone in the shop

Browsers block camera access on plain HTTP except for `localhost`. To scan
with a phone camera you'll need the app served over HTTPS. Easiest options:

- Deploy it to any Node host (Render, Railway, Fly.io, a VPS with a domain + free
  Let's Encrypt certificate, etc.) — then just open the HTTPS URL on the phone.
- For quick local testing, tunnel your local server with a tool like `ngrok`
  (`ngrok http 3000`) and open the HTTPS URL it gives you.

## Project structure

```
safaricom-sim-scanner/
├── server.js               # Express app entry point + session setup
├── config/db.js            # MongoDB connection
├── middleware/requireAuth.js # Blocks API routes for anonymous requests
├── models/
│   ├── Dealer.js           # ID number + full name records
│   └── SimCard.js          # Scanned lines, linked to a Dealer
├── routes/
│   ├── auth.js             # login / me / logout
│   └── simcards.js         # REST API: create, list, update, delete, CSV export
└── public/                 # Front-end (plain HTML/CSS/JS, no build step)
    ├── login.html          # ID number + full name sign-in
    ├── index.html          # Scanner + ledger (requires login)
    ├── css/style.css
    └── js/
        ├── login.js        # Login form logic
        ├── scanner.js      # Camera + barcode decoding logic
        └── app.js           # Form handling, ledger rendering, search, logout
```

## How login works

1. A dealer opens the app and is redirected to `/login.html` if they don't have a session.
2. They enter their **ID number** and **full name** and submit.
3. On the server: if that ID number has been seen before, it must match the same name on file (this stops one ID number being hijacked under a different name); otherwise a new dealer record is created.
4. A session cookie is set (7-day expiry, stored in MongoDB via `connect-mongo`), and they're taken to the scanner page.
5. Every line they scan is saved with a reference to their dealer record, plus a snapshot of their name/ID at scan time for the ledger and CSV export.

This is **identification**, not password-based authentication — it assumes dealers are trusted staff and the goal is knowing who scanned what, not locking out untrusted users. If you need stronger security (e.g. dealers could be impersonated by typing someone else's ID number), add a PIN or OTP step in `routes/auth.js`.

## API reference

| Method | Route                        | Auth required | Description                              |
|--------|------------------------------|:---:|-------------------------------------------|
| POST   | `/api/auth/login`            | –  | Log in with `{ idNumber, fullName }`      |
| GET    | `/api/auth/me`                | –  | Get the current session's dealer          |
| POST   | `/api/auth/logout`            | –  | End the session                           |
| POST   | `/api/simcards`               | ✅ | Save a newly scanned line                 |
| GET    | `/api/simcards?q=&status=`    | ✅ | List/search lines (paginated)             |
| GET    | `/api/simcards/export.csv`    | ✅ | Download all lines as CSV                 |
| PATCH  | `/api/simcards/:id`           | ✅ | Update a line's details/status            |
| DELETE | `/api/simcards/:id`           | ✅ | Remove a line                             |

## Extending this

Ideas if you want to take it further:

- Add dealer login/authentication (e.g. `passport` + sessions, or a simple PIN)
  so each agent's scans are tied to their own account.
- Add a "duplicate SIM/MSISDN across dealers" alert for fraud checks.
- Sync scanned lines to Safaricom's own registration systems via an internal API,
  once you have credentials/access to those endpoints.
- Add offline support (service worker) for shops with patchy connectivity.
