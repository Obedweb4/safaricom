# Dream World Dealer — SIM Line Scanner

_Powered by Obed Tech_

A small Node.js + Express + MongoDB web app that lets Dream World Dealer staff
scan the barcode on a SIM card line using their phone or laptop camera — or
type the serial in manually — then save the details to a shared database
everyone signed in can see.

## Features

- **Login with ID number + full name.** A dealer signs in with their national ID/passport number and full name before they can scan anything. First login creates their record automatically; later logins just re-recognize them. Sessions last 7 days and are stored in MongoDB.
- Every scanned line is tagged to the dealer who scanned it (no manual "who am I" field to fill in or fake).
- Camera-based barcode scanning in the browser (no app install, works on phone or laptop) via `html5-qrcode`, supporting CODE_128, CODE_39, CODE_93, EAN, UPC and QR formats — covers the common SIM/ICCID barcode types.
- A one-tap **"Type serial manually"** mode for when a barcode won't scan or there's no camera available — no need to fumble with the camera at all.
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

There are two roles:

- **Staff** sign in with their **ID number + full name** (`/login.html`, Staff tab). First login creates their record; later logins just recognize them. They land on the scanner page (`/`).
- **Admin** signs in with a fixed **email + password** (`/login.html`, click **"Admin Login"** at the top of the page) - by default `techobed4@gmail.com` / `Trippleo1802`, but this should be overridden via the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables in production rather than left as the default. Admin lands on a dashboard (`/admin.html`) showing every line scanned by every staff member, with search, status filtering, a **filter by BA (staff member)** dropdown to see everything one specific person has scanned, and CSV export that respects whatever filters are active.

Staff identification works like this:
1. They enter their **ID number** and **full name** and submit.
2. If that ID number has been seen before, it must match the same name on file (stops one ID number being hijacked under a different name); otherwise a new record is created.
3. A session cookie is set (7-day expiry, stored in MongoDB via `connect-mongo`).
4. Every line they scan is saved with a reference to their record, plus a snapshot of their name/ID for the ledger and CSV export.

This is **identification**, not password-based authentication for staff - it assumes they're trusted staff and the goal is knowing who scanned what. The admin login is the one place with an actual password, since that account can see and delete everything.

## API reference

| Method | Route                        | Auth required | Description                              |
|--------|------------------------------|:---:|-------------------------------------------|
| POST   | `/api/auth/login`            | –  | Staff login with `{ idNumber, fullName }` |
| POST   | `/api/auth/admin-login`      | –  | Admin login with `{ email, password }`    |
| GET    | `/api/auth/me`                | –  | Get the current session's role/identity   |
| POST   | `/api/auth/logout`            | –  | End the session                           |
| POST   | `/api/simcards`               | Staff only | Save a newly scanned line          |
| GET    | `/api/simcards?q=&status=&dealer=` | Staff or Admin | List/search lines (paginated), optionally filtered to one BA's ObjectId |
| GET    | `/api/simcards/export.csv?q=&status=&dealer=` | Staff or Admin | Download matching lines as CSV, same filters as above |
| GET    | `/api/dealers`                | Admin only | List every BA with their scan count (powers the admin BA filter) |
| PATCH  | `/api/simcards/:id`           | Staff or Admin | Update a line's details/status |
| DELETE | `/api/simcards/:id`           | Staff or Admin | Remove a line                  |

## Extending this

Ideas if you want to take it further:

- Add dealer login/authentication (e.g. `passport` + sessions, or a simple PIN)
  so each agent's scans are tied to their own account.
- Add a "duplicate SIM/MSISDN across dealers" alert for fraud checks.
- Sync scanned lines to Safaricom's own registration systems via an internal API,
  once you have credentials/access to those endpoints.
- Add offline support (service worker) for shops with patchy connectivity.
