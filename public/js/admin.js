const ledgerStrip = document.getElementById('ledgerStrip');
const ledgerEmpty = document.getElementById('ledgerEmpty');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const staffFilter = document.getElementById('staffFilter');
const exportLink = document.getElementById('exportLink');
const adminDisplayEmail = document.getElementById('adminDisplayEmail');
const logoutBtn = document.getElementById('logoutBtn');

let searchDebounce = null;

// ---------------- Session & tabs ----------------

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

document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.add('active');
  });
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function setFeedback(el, text, kind) {
  el.textContent = text;
  el.className = `form-feedback ${kind || ''}`;
}

// ---------------- Stock summary stat cards ----------------

async function loadStats() {
  try {
    const res = await fetch('/api/stock/summary');
    const data = await res.json();
    document.getElementById('statTotal').textContent = data.total ?? '0';
    document.getElementById('statUnallocated').textContent = data.unallocated ?? '0';
    document.getElementById('statAllocated').textContent = data.allocated ?? '0';
    document.getElementById('statScanned').textContent =
      (data.scanned || 0) + (data.registered || 0) + (data.activated || 0) + (data.rejected || 0);
    document.getElementById('statActivated').textContent = data.activated ?? '0';
  } catch (err) {
    console.error('Failed to load stock summary', err);
  }
}

// ---------------- BA management ----------------

let dealersCache = [];

async function loadDealers() {
  try {
    const res = await fetch('/api/dealers');
    if (!res.ok) return;
    dealersCache = await res.json();
    renderBaTable();
    renderDealerDropdowns();
  } catch (err) {
    console.error('Failed to load BAs', err);
  }
}

function renderBaTable() {
  const tbody = document.getElementById('baTableBody');
  tbody.innerHTML = '';

  if (!dealersCache.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--muted); padding:16px 6px;">No BAs added yet.</td></tr>';
    return;
  }

  dealersCache.forEach((d) => {
    const tr = document.createElement('tr');
    const active = d.active !== false;
    tr.innerHTML = `
      <td>${escapeHtml(d.fullName)}</td>
      <td>${escapeHtml(d.idNumber)}</td>
      <td>${escapeHtml(d.dealerCode || '—')}</td>
      <td>${d.allocated}</td>
      <td>${d.scanned}</td>
      <td>${d.remaining}</td>
      <td><span class="ba-status-pill ${active ? 'active' : 'inactive'}">${active ? 'Active' : 'Deactivated'}</span></td>
      <td><button class="btn btn-ghost small toggle-active-btn" data-id="${d._id}" data-active="${active}">${active ? 'Deactivate' : 'Activate'}</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.toggle-active-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const nowActive = btn.dataset.active === 'true';
      try {
        await fetch(`/api/dealers/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !nowActive }),
        });
        loadDealers();
      } catch (err) {
        console.error(err);
      }
    });
  });
}

function renderDealerDropdowns() {
  staffFilter.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
  dealersCache.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d._id;
    opt.textContent = `${d.fullName} (${d.scanned}/${d.allocated} scanned)`;
    staffFilter.appendChild(opt);
  });

  const allocateSelect = document.getElementById('allocateDealerSelect');
  const prevValue = allocateSelect.value;
  allocateSelect.innerHTML = '';
  dealersCache
    .filter((d) => d.active !== false)
    .forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d._id;
      opt.textContent = `${d.fullName} — ${d.remaining} pending / ${d.allocated} allocated`;
      allocateSelect.appendChild(opt);
    });
  if (prevValue) allocateSelect.value = prevValue;
}

const addBaForm = document.getElementById('addBaForm');
const addBaFeedback = document.getElementById('addBaFeedback');

addBaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setFeedback(addBaFeedback, 'Adding…', '');

  const payload = {
    idNumber: document.getElementById('baIdNumber').value.trim(),
    fullName: document.getElementById('baFullName').value.trim(),
    dealerCode: document.getElementById('baDealerCode').value.trim(),
  };

  try {
    const res = await fetch('/api/dealers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(addBaFeedback, data.error || 'Could not add BA.', 'error');
      return;
    }
    setFeedback(addBaFeedback, `${data.fullName} added. They can now sign in.`, 'success');
    addBaForm.reset();
    loadDealers();
  } catch (err) {
    setFeedback(addBaFeedback, 'Network error - could not reach the server.', 'error');
  }
});

// ---------------- Stock intake ----------------

document.getElementById('stockAddBtn').addEventListener('click', async () => {
  const feedback = document.getElementById('stockAddFeedback');
  const textarea = document.getElementById('stockAddInput');
  const barcodes = textarea.value.trim();

  if (!barcodes) {
    setFeedback(feedback, 'Paste at least one barcode first.', 'error');
    return;
  }

  setFeedback(feedback, 'Adding…', '');
  try {
    const res = await fetch('/api/stock/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcodes }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(feedback, data.error || 'Could not add stock.', 'error');
      return;
    }
    setFeedback(feedback, `Added ${data.added} new line(s). ${data.skipped} already existed and were skipped.`, 'success');
    textarea.value = '';
    loadStats();
    loadDealers();
  } catch (err) {
    setFeedback(feedback, 'Network error - could not reach the server.', 'error');
  }
});

// ---------------- Allocation ----------------

const allocateByCountBtn = document.getElementById('allocateByCountBtn');
const allocateByListBtn = document.getElementById('allocateByListBtn');
const allocateByCount = document.getElementById('allocateByCount');
const allocateByList = document.getElementById('allocateByList');

allocateByCountBtn.addEventListener('click', () => {
  allocateByCountBtn.classList.add('active');
  allocateByListBtn.classList.remove('active');
  allocateByCount.hidden = false;
  allocateByList.hidden = true;
});
allocateByListBtn.addEventListener('click', () => {
  allocateByListBtn.classList.add('active');
  allocateByCountBtn.classList.remove('active');
  allocateByList.hidden = false;
  allocateByCount.hidden = true;
});

document.getElementById('allocateBtn').addEventListener('click', async () => {
  const feedback = document.getElementById('allocateFeedback');
  const dealerId = document.getElementById('allocateDealerSelect').value;

  if (!dealerId) {
    setFeedback(feedback, 'Add a BA first.', 'error');
    return;
  }

  const payload = { dealerId };
  if (allocateByListBtn.classList.contains('active')) {
    const barcodes = document.getElementById('allocateBarcodesInput').value.trim();
    if (!barcodes) {
      setFeedback(feedback, 'Paste the barcodes to allocate.', 'error');
      return;
    }
    payload.barcodes = barcodes;
  } else {
    const count = document.getElementById('allocateCount').value;
    if (!count || Number(count) < 1) {
      setFeedback(feedback, 'Enter how many lines to allocate.', 'error');
      return;
    }
    payload.count = count;
  }

  setFeedback(feedback, 'Allocating…', '');
  try {
    const res = await fetch('/api/stock/allocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(feedback, data.error || 'Could not allocate stock.', 'error');
      return;
    }
    setFeedback(feedback, `Allocated ${data.allocated} line(s) to ${data.dealer.fullName}.`, 'success');
    document.getElementById('allocateCount').value = '';
    document.getElementById('allocateBarcodesInput').value = '';
    loadStats();
    loadDealers();
  } catch (err) {
    setFeedback(feedback, 'Network error - could not reach the server.', 'error');
  }
});

// ---------------- Ledger of scanned lines ----------------

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

async function deleteRecord(id) {
  if (!confirm('Remove this line from the ledger?')) return;
  try {
    await fetch(`/api/simcards/${id}`, { method: 'DELETE' });
    loadLedger();
    loadStats();
    loadDealers();
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
loadDealers();
loadLedger();
loadStats();
