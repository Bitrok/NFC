import { CONFIG, STORAGE_KEYS } from './config.js';

/**
 * Resolución de la API key.
 *
 * Orden de preferencia:
 *   1. `CONFIG.apiKey` (útil en repositorios privados o despliegues internos).
 *   2. `localStorage` del dispositivo, introducida por el usuario en la propia
 *      aplicación. Es el modo recomendado con GitHub Pages porque la clave no
 *      llega nunca al repositorio público.
 */

/** Formato de las claves de Google Cloud: prefijo `AIza` y 39 caracteres. */
const API_KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;

export function looksLikeApiKey(value) {
  return API_KEY_RE.test(String(value || '').trim());
}

export function getApiKey() {
  if (CONFIG.apiKey) return CONFIG.apiKey.trim();
  try {
    return (localStorage.getItem(STORAGE_KEYS.apiKey) || '').trim();
  } catch {
    return '';
  }
}

/** @returns {boolean} `true` si la clave se ha podido persistir. */
export function saveApiKey(value) {
  try {
    localStorage.setItem(STORAGE_KEYS.apiKey, String(value).trim());
    return true;
  } catch {
    return false;
  }
}

export function forgetApiKey() {
  try {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
  } catch {
    /* Nada que hacer. */
  }
}

/** La clave de `config.js` no se puede cambiar desde la interfaz. */
export function isApiKeyFixed() {
  return Boolean(CONFIG.apiKey);
}
