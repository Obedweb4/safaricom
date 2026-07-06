/* Handles camera access and barcode decoding via html5-qrcode.
   Calls window.onBarcodeScanned(text, format) whenever a code is read. */

const Scanner = (() => {
  let html5QrCode = null;
  let currentCameraId = null;
  let lastScan = { text: null, at: 0 };

  const bezel = document.querySelector('.scanner-bezel');
  const idleOverlay = document.getElementById('scanner-idle');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const cameraSelect = document.getElementById('cameraSelect');
  const scanStatus = document.getElementById('scanStatus');

  const formatsToTry = [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.QR_CODE,
  ];

  async function populateCameras() {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        cameraSelect.innerHTML = devices
          .map((d) => `<option value="${d.id}">${d.label || 'Camera'}</option>`)
          .join('');
        // Prefer a rear/back camera on phones if labeled
        const rear = devices.find((d) => /back|rear|environment/i.test(d.label));
        currentCameraId = rear ? rear.id : devices[0].id;
        cameraSelect.value = currentCameraId;
        cameraSelect.hidden = devices.length < 2;
      }
      return devices;
    } catch (err) {
      console.error('Camera enumeration failed', err);
      return [];
    }
  }

  async function start() {
    scanStatus.textContent = 'Requesting camera access…';
    html5QrCode = new Html5Qrcode('reader', {
      formatsToSupport: formatsToTry,
      verbose: false,
    });

    const devices = await populateCameras();
    const cameraConfig = currentCameraId
      ? { deviceId: { exact: currentCameraId } }
      : { facingMode: 'environment' };

    try {
      await html5QrCode.start(
        cameraConfig,
        { fps: 12, qrbox: { width: 280, height: 160 } },
        (decodedText, decodedResult) => {
          handleDetection(decodedText, decodedResult);
        },
        () => {
          /* per-frame decode failures are expected while aiming - ignore */
        }
      );
      bezel.classList.add('active');
      idleOverlay.hidden = true;
      startBtn.hidden = true;
      stopBtn.hidden = false;
      scanStatus.textContent = 'Scanning… hold the barcode steady in the frame';
    } catch (err) {
      console.error(err);
      scanStatus.textContent =
        'Could not access the camera. Check permissions and try again, or type the code manually below.';
    }
  }

  async function stop() {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        await html5QrCode.clear();
      } catch (err) {
        // ignore - camera may already be stopped
      }
    }
    bezel.classList.remove('active');
    idleOverlay.hidden = false;
    startBtn.hidden = false;
    stopBtn.hidden = true;
    scanStatus.textContent = 'Point the camera at the barcode on the SIM pack';
  }

  function handleDetection(text, result) {
    const now = Date.now();
    // Debounce: ignore the same code re-firing within 2.5s while camera stays open
    if (text === lastScan.text && now - lastScan.at < 2500) return;
    lastScan = { text, at: now };

    const format =
      result && result.result && result.result.format
        ? String(result.result.format.formatName || result.result.format)
        : '';

    if (navigator.vibrate) navigator.vibrate(80);
    if (typeof window.onBarcodeScanned === 'function') {
      window.onBarcodeScanned(text, format);
    }
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  cameraSelect.addEventListener('change', async (e) => {
    currentCameraId = e.target.value;
    if (html5QrCode) {
      await stop();
      await start();
    }
  });

  return { start, stop };
})();
