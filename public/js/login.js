const topAdminBtn = document.getElementById('topAdminBtn');
const staffForm = document.getElementById('staffForm');
const adminForm = document.getElementById('adminForm');
const cardTitle = document.getElementById('cardTitle');
const cardTagline = document.getElementById('cardTagline');
const errorBox = document.getElementById('loginError');

let showingAdmin = false;

function showStaff() {
  showingAdmin = false;
  topAdminBtn.classList.remove('active');
  topAdminBtn.textContent = 'Admin Login';
  cardTitle.textContent = 'Staff Sign In';
  cardTagline.textContent = 'Sign in with your ID to start scanning SIM lines';
  staffForm.hidden = false;
  adminForm.hidden = true;
  errorBox.classList.remove('visible');
}

function showAdmin() {
  showingAdmin = true;
  topAdminBtn.classList.add('active');
  topAdminBtn.textContent = 'Back to Staff Login';
  cardTitle.textContent = 'Admin Sign In';
  cardTagline.textContent = 'Sign in to view every line scanned by every BA';
  adminForm.hidden = false;
  staffForm.hidden = true;
  errorBox.classList.remove('visible');
}

topAdminBtn.addEventListener('click', () => {
  if (showingAdmin) showStaff();
  else showAdmin();
});

function redirectForRole(role) {
  window.location.href = role === 'admin' ? '/admin.html' : '/';
}

// If already logged in, skip straight to the right dashboard
fetch('/api/auth/me').then(async (res) => {
  if (res.ok) {
    const data = await res.json();
    redirectForRole(data.role);
  }
});

staffForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('visible');

  const idNumber = document.getElementById('idNumber').value.trim();
  const fullName = document.getElementById('fullName').value.trim();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber, fullName }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Login failed. Please try again.';
      errorBox.classList.add('visible');
      return;
    }

    redirectForRole(data.role);
  } catch (err) {
    errorBox.textContent = 'Network error - could not reach the server.';
    errorBox.classList.add('visible');
  }
});

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('visible');

  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;

  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Login failed. Please try again.';
      errorBox.classList.add('visible');
      return;
    }

    redirectForRole(data.role);
  } catch (err) {
    errorBox.textContent = 'Network error - could not reach the server.';
    errorBox.classList.add('visible');
  }
});
