const ledgerStrip = document.getElementById('ledgerStrip');
const ledgerEmpty = document.getElementById('ledgerEmpty');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const staffFilter = document.getElementById('staffFilter');
const exportLink = document.getElementById('exportLink');
const adminDisplayEmail = document.getElementById('adminDisplayEmail');
const logoutBtn = document.getElementById('logoutBtn');

let searchDebounce = null;

async function loadSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    if (data.role !== 'admin') {
      window.location.href = '/';
      return;
    }
    adminDisplayEmail.textContent = data.email;
  } catch (err) {
    window.location.href = '/login.html';
  }
}

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Populate the "filter by staff" dropdown with every BA who has an account,
// each showing how many lines they've scanned so far.
async function loadStaffList() {
  try {
    const res = await fetch('/api/dealers');
    if (!res.ok) return;
    const dealers = await res.json();

    dealers.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d._id;
      opt.textContent = `${d.fullName} (${d.lineCount})`;
      staffFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load staff list', err);
  }
}

function currentParams() {
  const params = new URLSearchParams();
  const q = searchInput.value.trim();
  const status = statusFilter.value;
  const dealer = staffFilter.value;
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (dealer) params.set('dealer', dealer);
  return params;
}

function renderLedger(records) {
  ledgerStrip.querySelectorAll('.ledger-row').forEach((el) => el.remove());

  if (!records.length) {
    ledgerEmpty.hidden = false;
    return;
  }
  ledgerEmpty.hidden = true;

  records.forEach((rec) => {
    const row = document.createElement('div');
    row.className = 'ledger-row';
    row.innerHTML = `
      <span class="cell-barcode">${escapeHtml(rec.barcode)}</span>
      <span class="cell-muted">${escapeHtml(rec.msisdn || '—')}</span>
      <span class="cell-muted">${escapeHtml(rec.dealerName || '—')}</span>
      <span><span class="status-pill ${rec.status}">${statusLabel(rec.status)}</span></span>
      <button class="row-delete" data-id="${rec._id}">Remove</button>
    `;
    ledgerStrip.appendChild(row);
  });

  ledgerStrip.querySelectorAll('.row-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteRecord(btn.dataset.id));
  });
}

async function loadLedger() {
  try {
    const params = currentParams();
    params.set('limit', '100');

    // Keep the CSV export link in sync with whatever filters are active
    exportLink.href = `/api/simcards/export.csv?${params.toString()}`;

    const res = await fetch(`/api/simcards?${params.toString()}`);
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    renderLedger(data.records || []);
  } catch (err) {
    console.error('Failed to load ledger', err);
  }
}

async function loadStats() {
  try {
    const [total, scanned, registered, activated] = await Promise.all([
      fetch('/api/simcards?limit=1').then((r) => r.json()),
      fetch('/api/simcards?status=scanned&limit=1').then((r) => r.json()),
      fetch('/api/simcards?status=registered&limit=1').then((r) => r.json()),
      fetch('/api/simcards?status=activated&limit=1').then((r) => r.json()),
    ]);
    document.getElementById('statTotal').textContent = total.total ?? '0';
    document.getElementById('statScanned').textContent = scanned.total ?? '0';
    document.getElementById('statRegistered').textContent = registered.total ?? '0';
    document.getElementById('statActivated').textContent = activated.total ?? '0';
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

async function deleteRecord(id) {
  if (!confirm('Remove this line from the ledger?')) return;
  try {
    await fetch(`/api/simcards/${id}`, { method: 'DELETE' });
    loadLedger();
    loadStats();
  } catch (err) {
    console.error(err);
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadLedger, 300);
});

statusFilter.addEventListener('change', loadLedger);
staffFilter.addEventListener('change', loadLedger);

loadSession();
loadStaffList();
loadLedger();
loadStats();
