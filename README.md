# Dream World Dealer — SIM Line Scanner

_Powered by Obed Tech_

A small Node.js + Express + MongoDB web app that lets Dream World Dealer staff
scan the barcode on a SIM card line using their phone or laptop camera — or
type the serial in manually — then save the details to a shared database
everyone signed in can see.

## How it works — admin controls everything

The admin is the single source of truth. Nothing reaches a BA (Business
Agent / dealer) until the admin puts it there:

1. **Admin adds each BA** (ID number + full name, from the *Manage BAs* tab
   of the admin dashboard). A BA cannot sign in until this exists — there is
   no self-registration anymore. The admin can deactivate a BA at any time
   to instantly block their login without losing their scan history.
2. **Admin adds stock** — pastes a batch of SIM barcodes/serials into the
   *Stock & allocation* tab. These sit in an **unallocated pool**.
3. **Admin allocates stock to a BA** — either "give this BA 50 lines"
   (auto-picks the oldest unallocated lines) or "give this BA exactly these
   barcodes" (paste the list). The lines move from `unallocated` to
   `allocated` and are now tied to that BA.
4. **BA logs in** with their ID number + full name and sees their own
   allocation summary (allocated / scanned / remaining) plus the
   company-wide stock totals.
5. **BA scans** — the app looks up the barcode in stock. If it isn't
   allocated to that BA (unallocated, not yet allocated to them, or
   allocated to someone else), the scan is rejected with a clear reason. If
   it is theirs, the scan fills in the customer/MSISDN details and marks it
   scanned.

This means a BA can never register a line that wasn't handed to them, and
the admin always knows exactly who has what.

## Features

- **Admin-only BA onboarding.** BAs are added by the admin and log in with ID number + full name; unregistered or deactivated IDs are rejected at login.
- **Stock intake & allocation.** Admin pastes barcodes into the unallocated pool, then allocates specific quantities or exact barcodes to a BA.
- **Allocation-enforced scanning.** A BA can only save a scan for a barcode that's been allocated to them — scanning someone else's line, or an unallocated one, is blocked with a clear error.
- Every scanned line is tagged to the dealer who scanned it (no manual "who am I" field to fill in or fake).
- Camera-based barcode scanning in the browser (no app install, works on phone or laptop) via `html5-qrcode`, supporting CODE_128, CODE_39, CODE_93, EAN, UPC and QR formats — covers the common SIM/ICCID barcode types.
- A one-tap **"Type serial manually"** mode for when a barcode won't scan or there's no camera available — no need to fumble with the camera at all.
- Customer name/ID, MSISDN, status (scanned / registered / activated / rejected), and notes per line.
- Live "ledger" of scanned lines with search and CSV export — a BA only ever sees their own lines; the admin sees everyone's.
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
├── middleware/requireAuth.js # Blocks API routes for anonymous/wrong-role requests
├── models/
│   ├── Dealer.js           # BA accounts - ID number + full name, added by admin only
│   └── SimCard.js          # Stock lines: unallocated -> allocated -> scanned/registered/activated/rejected
├── routes/
│   ├── auth.js             # login / me / logout
│   ├── dealers.js          # Admin: add/list/deactivate BAs
│   ├── stock.js            # Admin: add stock, allocate/deallocate to a BA; BA: view own + company stock
│   └── simcards.js         # Scan a line, list/search/update/delete, CSV export
└── public/                 # Front-end (plain HTML/CSS/JS, no build step)
    ├── login.html          # ID number + full name sign-in (staff) / email+password (admin)
    ├── index.html          # BA scanner + stock overview + own ledger (requires login)
    ├── admin.html           # Admin dashboard: manage BAs, stock & allocation, full ledger
    ├── css/style.css
    └── js/
        ├── login.js        # Login form logic
        ├── scanner.js      # Camera + barcode decoding logic
        ├── app.js          # BA: form handling, stock overview, ledger, logout
        └── admin.js        # Admin: BA management, stock intake/allocation, full ledger
```

## How login works

There are two roles:

- **BA (staff)** sign in with their **ID number + full name** (`/login.html`, Staff tab). They must already have been added by the admin - there's no self-registration. They land on the scanner page (`/`), which shows their own stock allocation and lets them scan only what's been allocated to them.
- **Admin** signs in with a fixed **email + password** (`/login.html`, click **"Admin Login"** at the top of the page) - by default `techobed4@gmail.com` / `Trippleo1802`, but this should be overridden via the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables in production rather than left as the default. Admin lands on a dashboard (`/admin.html`) with three tabs: **Manage BAs**, **Stock & allocation**, and the full **ledger** of every scanned line, with search, status filtering, a filter-by-BA dropdown, and CSV export that respects whatever filters are active.

BA login works like this:
1. They enter their **ID number** and **full name** and submit.
2. The server looks for a Dealer record with that ID number. If none exists, login is rejected - an admin must add them first.
3. If it exists, the full name must match what the admin entered (stops one ID number being used under a different name) and the account must be active.
4. A session cookie is set (7-day expiry, stored in MongoDB via `connect-mongo`).
5. Every line they scan updates the pre-allocated stock record with a reference to their account, plus a snapshot of their name/ID for the ledger and CSV export.

This is **identification**, not password-based authentication for BAs - it assumes they're trusted staff added by the admin, and the goal is knowing who scanned what and enforcing that they only scan what they were given. The admin login is the one place with an actual password, since that account can see and control everything.

## API reference

| Method | Route                        | Auth required | Description                              |
|--------|------------------------------|:---:|-------------------------------------------|
| POST   | `/api/auth/login`            | –  | BA login with `{ idNumber, fullName }` - must already exist and be active |
| POST   | `/api/auth/admin-login`      | –  | Admin login with `{ email, password }`    |
| GET    | `/api/auth/me`                | –  | Get the current session's role/identity   |
| POST   | `/api/auth/logout`            | –  | End the session                           |
| GET    | `/api/dealers`                | Admin only | List every BA with allocated/scanned/remaining counts |
| POST   | `/api/dealers`                | Admin only | Add a new BA `{ idNumber, fullName, dealerCode }` |
| PATCH  | `/api/dealers/:id`            | Admin only | Edit a BA, or `{ active: false }` to deactivate |
| DELETE | `/api/dealers/:id`            | Admin only | Remove a BA (blocked if they still have stock allocated) |
| POST   | `/api/stock/add`              | Admin only | Add barcodes to the unallocated pool `{ barcodes: "..." }` |
| POST   | `/api/stock/allocate`         | Admin only | Allocate stock to a BA by `{ dealerId, count }` or `{ dealerId, barcodes }` |
| POST   | `/api/stock/deallocate/:id`   | Admin only | Return an unscanned allocated line to the unallocated pool |
| GET    | `/api/stock/summary`          | BA or Admin | Company-wide stock counts by status |
| GET    | `/api/stock/mine`             | BA only | The logged-in BA's own allocation summary |
| POST   | `/api/simcards`                | BA only | Scan a barcode - must be allocated to this BA |
| GET    | `/api/simcards?q=&status=&dealer=` | BA or Admin | List/search lines (paginated). A BA always sees only their own; admin can filter by any BA's ObjectId |
| GET    | `/api/simcards/export.csv?q=&status=&dealer=` | BA or Admin | Download matching lines as CSV, same scoping as above |
| PATCH  | `/api/simcards/:id`           | BA (own lines) or Admin | Update a line's details/status |
| DELETE | `/api/simcards/:id`           | Admin only | Remove a line from stock entirely |

## Extending this

Ideas if you want to take it further:

- Add a "duplicate SIM/MSISDN across dealers" alert for fraud checks.
- Sync scanned lines to Safaricom's own registration systems via an internal API,
  once you have credentials/access to those endpoints.
- Add offline support (service worker) for shops with patchy connectivity.
- Bulk stock import from a CSV file instead of pasting barcodes into a textarea.
