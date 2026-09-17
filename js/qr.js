/**
 * Código QR del enlace de reseña.
 *
 * `vendor/qrcode.js` (MIT, Kazuhiko Arase) se carga de forma diferida: sólo se
 * descarga cuando el usuario despliega el QR, de modo que no penaliza el
 * arranque de la aplicación.
 */

const VENDOR_SRC = new URL('../vendor/qrcode.js', import.meta.url).href;

let vendorPromise = null;

function loadVendor() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (vendorPromise) return vendorPromise;

  vendorPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VENDOR_SRC;
    script.async = true;
    script.onload = () =>
      window.qrcode
        ? resolve(window.qrcode)
        : reject(new Error('qrcode.js no ha expuesto el generador'));
    script.onerror = () => {
      vendorPromise = null;
      script.remove();
      reject(new Error('No se ha podido cargar vendor/qrcode.js'));
    };
    document.head.appendChild(script);
  });

  return vendorPromise;
}

/**
 * Dibuja el QR de `text` dentro de `target`.
 * @param {HTMLElement} target
 * @param {string} text
 */
export async function renderQr(target, text) {
  target.textContent = 'Generando QR…';
  try {
    const qrcode = await loadVendor();
    // typeNumber 0 = detección automática de versión; 'M' = corrección media.
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    target.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 12, scalable: true });
  } catch (error) {
    target.textContent = 'No se ha podido generar el QR.';
    console.error(error);
  }
}
