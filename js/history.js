import { CONFIG, STORAGE_KEYS } from './config.js';

/**
 * Historial local de negocios consultados. Vive sólo en el dispositivo; si
 * `localStorage` no está disponible (modo privado, almacenamiento bloqueado),
 * la aplicación sigue funcionando sin historial.
 */

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.id) : [];
  } catch {
    return [];
  }
}

function write(entries) {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(entries));
  } catch {
    /* Almacenamiento lleno o no disponible: el historial es prescindible. */
  }
}

export function getHistory() {
  return read();
}

/** Añade (o promociona) un negocio al principio del historial. */
export function addToHistory(place) {
  const entry = {
    id: place.id,
    name: place.name || '',
    address: place.address || '',
    locality: place.locality || '',
    ts: Date.now(),
  };
  const entries = read().filter((item) => item.id !== entry.id);
  entries.unshift(entry);
  write(entries.slice(0, CONFIG.historyLimit));
}

export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEYS.history);
  } catch {
    /* Nada que hacer. */
  }
}
