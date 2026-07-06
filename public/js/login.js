const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');

// If already logged in, skip straight to the scanner
fetch('/api/auth/me').then((res) => {
  if (res.ok) window.location.href = '/';
});

form.addEventListener('submit', async (e) => {
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

    window.location.href = '/';
  } catch (err) {
    errorBox.textContent = 'Network error - could not reach the server.';
    errorBox.classList.add('visible');
  }
});
