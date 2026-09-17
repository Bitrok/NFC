import { STORAGE_KEYS } from './config.js';

/**
 * Contador local de llamadas a la API, para vigilar de un vistazo que el uso
 * se mantiene dentro del nivel gratuito. Sólo cuenta búsquedas que han salido
 * realmente a Google: los aciertos de caché y el historial no suman.
 *
 * Es informativo y por dispositivo; el dato autoritativo está en Google Cloud.
 */

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.usage);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* Almacenamiento no disponible. */
  }
  return { day: todayKey(), dayCount: 0, month: monthKey(), monthCount: 0 };
}

/** Descarta los contadores cuyo periodo ya ha cambiado. */
function roll(entry) {
  const day = todayKey();
  const month = monthKey();
  return {
    day,
    dayCount: entry.day === day ? entry.dayCount || 0 : 0,
    month,
    monthCount: entry.month === month ? entry.monthCount || 0 : 0,
  };
}

export function getUsage() {
  return roll(read());
}

/** Registra una llamada a la API y devuelve el recuento actualizado. */
export function recordApiCall() {
  const entry = roll(read());
  entry.dayCount += 1;
  entry.monthCount += 1;
  try {
    localStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(entry));
  } catch {
    /* El contador es prescindible. */
  }
  return entry;
}
