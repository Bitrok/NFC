import { CONFIG, STORAGE_KEYS } from './config.js';

/**
 * Caché de resultados de búsqueda.
 *
 * Repetir la misma consulta (al volver atrás, al reintentar tras un error o al
 * buscar dos veces el mismo negocio) no debe gastar una llamada a la API. Las
 * entradas caducan para que un negocio nuevo en Google acabe apareciendo.
 */

const ttlMs = () => CONFIG.cacheTtlHours * 3600 * 1000;

/** La clave incluye el sesgo: los mismos términos dan resultados distintos. */
export function cacheKey(query, bias) {
  const where = bias.cityName
    ? `city:${bias.cityName}`
    : `dev:${bias.center.lat.toFixed(3)},${bias.center.lng.toFixed(3)}`;
  return `${where}|${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cache);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(entries) {
  try {
    localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(entries));
  } catch {
    /* La caché es prescindible. */
  }
}

/** @returns {?Array<object>} Resultados vigentes, o `null` si no hay. */
export function getCached(key) {
  const entry = read()[key];
  if (!entry || !Array.isArray(entry.places)) return null;
  if (Date.now() - entry.ts > ttlMs()) return null;
  return entry.places;
}

export function setCached(key, places) {
  const entries = read();
  entries[key] = { places, ts: Date.now() };

  // Poda: primero lo caducado, y si aún sobra, lo más antiguo.
  const now = Date.now();
  for (const [k, v] of Object.entries(entries)) {
    if (now - (v?.ts || 0) > ttlMs()) delete entries[k];
  }
  const keys = Object.keys(entries);
  if (keys.length > CONFIG.cacheLimit) {
    keys
      .sort((a, b) => entries[a].ts - entries[b].ts)
      .slice(0, keys.length - CONFIG.cacheLimit)
      .forEach((k) => delete entries[k]);
  }

  write(entries);
}

export function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEYS.cache);
  } catch {
    /* Nada que hacer. */
  }
}
