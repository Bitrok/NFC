import { REVIEW_URL_BASE } from './config.js';

/**
 * Los Place ID de Google son cadenas opacas seguras para URL, pero se validan
 * antes de construir el enlace para no generar nunca una URL inutilizable que
 * acabe grabada en una placa NFC.
 */
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,255}$/;

export function isValidPlaceId(placeId) {
  return typeof placeId === 'string' && PLACE_ID_RE.test(placeId);
}

/**
 * Construye el enlace directo al formulario de reseña de Google.
 * @param {string} placeId
 * @returns {string}
 */
export function buildReviewUrl(placeId) {
  if (!isValidPlaceId(placeId)) {
    throw new Error(`Place ID no válido: ${String(placeId)}`);
  }
  return `${REVIEW_URL_BASE}?placeid=${encodeURIComponent(placeId)}`;
}
