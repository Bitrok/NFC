/**
 * Configuración de la aplicación.
 *
 * IMPORTANTE — API KEY
 * --------------------
 * `apiKey` se deja VACÍO a propósito y no debe rellenarse en un repositorio
 * público. Con el valor vacío la aplicación pide la clave la primera vez y la
 * guarda en `localStorage` del propio dispositivo, de modo que nunca llega a
 * publicarse en GitHub Pages.
 *
 * Rellenar `apiKey` aquí sólo es razonable si el repositorio es privado o si se
 * acepta que la clave sea pública; en ese caso es obligatorio restringirla por
 * referente HTTP y limitar su cuota (ver README).
 */
export const CONFIG = {
  apiKey: '',

  /** Centro del sesgo geográfico por defecto: Terrassa (Barcelona, España). */
  bias: {
    center: { lat: 41.5630, lng: 2.0087 },
    /** Radio del sesgo en metros. Es un sesgo, no un filtro: los negocios de
     *  fuera del radio siguen apareciendo si son la mejor coincidencia. */
    radiusMeters: 12000,
    /** Nombre del municipio que se prioriza al ordenar los resultados. */
    cityName: 'Terrassa',
  },

  /** Radio de sesgo cuando se usa la ubicación real del dispositivo. */
  deviceBiasRadiusMeters: 4000,

  /** Idioma y región de los resultados de Google Places. */
  language: 'es',
  region: 'es',

  /** Máximo de resultados por búsqueda (Places API (New) admite hasta 20). */
  maxResults: 12,

  /** Entradas conservadas en el historial local. */
  historyLimit: 12,

  /** Versión del runtime de Maps JavaScript API. */
  mapsVersion: 'weekly',
};

/** Plantilla del enlace de reseña de Google. */
export const REVIEW_URL_BASE = 'https://search.google.com/local/writereview';

/** Claves usadas en localStorage. */
export const STORAGE_KEYS = {
  apiKey: 'nfc.reviewlinks.apikey',
  history: 'nfc.reviewlinks.history',
};
