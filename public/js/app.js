const form = document.getElementById('detailsForm');
const barcodeInput = document.getElementById('barcode');
const formMessage = document.getElementById('formMessage');
const ledgerStrip = document.getElementById('ledgerStrip');
const ledgerEmpty = document.getElementById('ledgerEmpty');
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const dealerDisplayName = document.getElementById('dealerDisplayName');
const logoutBtn = document.getElementById('logoutBtn');

let searchDebounce = null;

// Confirm there's a live session; the server also guards this route, but
// this covers the case of a session expiring while the page stays open.
async function loadSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const dealer = await res.json();
    dealerDisplayName.textContent = dealer.fullName;
  } catch (err) {
    window.location.href = '/login.html';
  }
}

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

loadSession();

// Called by scanner.js whenever a barcode is decoded from the camera
window.onBarcodeScanned = (text, format) => {
  barcodeInput.value = text;
  barcodeInput.dataset.format = format || '';
  showMessage(`Scanned: ${text}`, 'success');
  barcodeInput.focus();
};

function showMessage(text, kind) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${kind || ''}`;
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function loadLedger(query = '') {
  try {
    const params = new URLSearchParams({ limit: '50' });
    if (query) params.set('q', query);
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
    loadLedger(searchInput.value.trim());
  } catch (err) {
    console.error(err);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMessage('Saving…', '');

  const payload = {
    barcode: barcodeInput.value.trim(),
    barcodeFormat: barcodeInput.dataset.format || '',
    msisdn: document.getElementById('msisdn').value.trim(),
    customerName: document.getElementById('customerName').value.trim(),
    customerIdNumber: document.getElementById('customerIdNumber').value.trim(),
    status: document.getElementById('status').value,
    notes: document.getElementById('notes').value.trim(),
  };

  if (!payload.barcode) {
    showMessage('Scan or enter a barcode first.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/simcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || 'Could not save this line.', 'error');
      return;
    }

    showMessage('Line saved to the ledger.', 'success');
    form.reset();
    document.getElementById('status').value = 'scanned';
    loadLedger(searchInput.value.trim());
  } catch (err) {
    console.error(err);
    showMessage('Network error - could not reach the server.', 'error');
  }
});

clearBtn.addEventListener('click', () => {
  form.reset();
  showMessage('', '');
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadLedger(searchInput.value.trim()), 300);
});

loadLedger();
