const form = document.getElementById('detailsForm');
const barcodeInput = document.getElementById('barcode');
const formMessage = document.getElementById('formMessage');
const ledgerStrip = document.getElementById('ledgerStrip');
const ledgerEmpty = document.getElementById('ledgerEmpty');
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const dealerDisplayName = document.getElementById('dealerDisplayName');
const logoutBtn = document.getElementById('logoutBtn');

const modeScanBtn = document.getElementById('modeScanBtn');
const modeManualBtn = document.getElementById('modeManualBtn');
const scanMode = document.getElementById('scanMode');
const manualMode = document.getElementById('manualMode');
const manualBarcode = document.getElementById('manualBarcode');
const useManualBtn = document.getElementById('useManualBtn');

let searchDebounce = null;

// ---- Scan vs. manual entry toggle ----
function showScanMode() {
  modeScanBtn.classList.add('active');
  modeManualBtn.classList.remove('active');
  scanMode.hidden = false;
  manualMode.hidden = true;
}

function showManualMode() {
  modeManualBtn.classList.add('active');
  modeScanBtn.classList.remove('active');
  manualMode.hidden = false;
  scanMode.hidden = true;
  // Stop the camera if it's running so it isn't left on in the background
  if (typeof Scanner !== 'undefined' && typeof Scanner.stop === 'function') {
    Scanner.stop();
  }
  manualBarcode.focus();
}

modeScanBtn.addEventListener('click', showScanMode);
modeManualBtn.addEventListener('click', showManualMode);

useManualBtn.addEventListener('click', () => {
  const value = manualBarcode.value.trim();
  if (!value) {
    manualBarcode.focus();
    return;
  }
  barcodeInput.value = value;
  barcodeInput.dataset.format = 'MANUAL';
  showMessage(`Serial entered: ${value}`, 'success');
  manualBarcode.value = '';
  document.getElementById('msisdn').focus();
});

manualBarcode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    useManualBtn.click();
  }
});

// Confirm there's a live session; the server also guards this route, but
// this covers the case of a session expiring while the page stays open.
async function loadSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    if (data.role === 'admin') {
      window.location.href = '/admin.html';
      return;
    }
    dealerDisplayName.textContent = data.fullName;
  } catch (err) {
    window.location.href = '/login.html';
  }
}

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

async function loadStockOverview() {
  try {
    const [mineRes, summaryRes] = await Promise.all([
      fetch('/api/stock/mine'),
      fetch('/api/stock/summary'),
    ]);
    if (mineRes.ok) {
      const mine = await mineRes.json();
      document.getElementById('myAllocated').textContent = mine.allocated ?? '0';
      document.getElementById('myScanned').textContent = mine.scanned ?? '0';
      document.getElementById('myRemaining').textContent = mine.remaining ?? '0';
    }
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      document.getElementById('companyTotal').textContent = summary.total ?? '0';
      document.getElementById('companyUnallocated').textContent = summary.unallocated ?? '0';
    }
  } catch (err) {
    console.error('Failed to load stock overview', err);
  }
}

loadSession();
loadStockOverview();

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
    `;
    ledgerStrip.appendChild(row);
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
    loadStockOverview();
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
