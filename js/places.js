import { CONFIG } from './config.js';

/** Error de aplicación con una categoría que la UI sabe traducir. */
export class PlacesError extends Error {
  /**
   * @param {'auth'|'network'|'api'|'geo'} kind
   * @param {string} message Mensaje para el usuario.
   * @param {string} [detail] Detalle técnico opcional.
   */
  constructor(kind, message, detail = '') {
    super(message);
    this.name = 'PlacesError';
    this.kind = kind;
    this.detail = detail;
  }
}

const LOAD_TIMEOUT_MS = 15000;
const SEARCH_TIMEOUT_MS = 15000;
const CALLBACK_NAME = '__nfcMapsReady';

/** Campos solicitados a Places API (New). Pedir sólo lo que se muestra. */
const SEARCH_FIELDS = [
  'displayName',
  'formattedAddress',
  'addressComponents',
  'location',
  'businessStatus',
  'primaryTypeDisplayName',
];

let loadPromise = null;
let placesLib = null;
let authFailed = false;
const authListeners = new Set();

/* Google invoca este hook global cuando rechaza la API key: clave inválida,
   API no habilitada para la clave o referente HTTP no autorizado. */
window.gm_authFailure = () => {
  authFailed = true;
  for (const listener of authListeners) listener();
};

/** Registra un callback para el rechazo de la API key. */
export function onAuthFailure(listener) {
  authListeners.add(listener);
  if (authFailed) listener();
}

export function hasAuthFailed() {
  return authFailed;
}

/** `true` si Maps JavaScript API ya se ha cargado (o está cargándose). */
export function isLibraryLoaded() {
  return Boolean(placesLib || loadPromise);
}

function authError() {
  return new PlacesError(
    'auth',
    'Google ha rechazado la API key. Revisa que sea correcta, que tenga habilitadas ' +
      '«Maps JavaScript API» y «Places API (New)», y que el dominio actual esté ' +
      'autorizado en las restricciones de referente HTTP.',
    `Origen actual: ${location.origin}`
  );
}

/**
 * Carga Maps JavaScript API y la librería Places (nueva). Idempotente.
 * @param {string} apiKey
 * @returns {Promise<object>} El namespace `google.maps.places`.
 */
export function loadPlacesLibrary(apiKey) {
  if (placesLib) return Promise.resolve(placesLib);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      key: apiKey,
      v: CONFIG.mapsVersion,
      libraries: 'places',
      language: CONFIG.language,
      region: CONFIG.region,
      loading: 'async',
      callback: CALLBACK_NAME,
    });

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;

    const cleanup = () => {
      clearTimeout(timer);
      delete window[CALLBACK_NAME];
    };

    const fail = (error) => {
      cleanup();
      script.remove();
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(new PlacesError('network', 'Google Maps no ha respondido. Comprueba la conexión e inténtalo de nuevo.'));
    }, LOAD_TIMEOUT_MS);

    script.onerror = () => {
      fail(new PlacesError('network', 'No se ha podido cargar Google Maps. Comprueba la conexión a internet.'));
    };

    window[CALLBACK_NAME] = async () => {
      try {
        placesLib = await google.maps.importLibrary('places');
        cleanup();
        resolve(placesLib);
      } catch (error) {
        fail(
          new PlacesError(
            'api',
            'No se ha podido inicializar la librería Places. Comprueba que «Places API (New)» está habilitada en Google Cloud.',
            String(error?.message || error)
          )
        );
      }
    };

    document.head.appendChild(script);
  }).catch((error) => {
    // Permitir un reintento limpio tras un fallo de carga.
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

function withTimeout(promise, ms, error) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(error), ms);
    }),
  ]);
}

/**
 * Busca establecimientos por texto con Text Search (New).
 * @param {string} apiKey
 * @param {string} query Texto libre, p. ej. "Bar Catalunya".
 * @param {{center:{lat:number,lng:number}, radiusMeters:number}} bias
 * @returns {Promise<Array<object>>} Lista normalizada de negocios.
 */
export async function searchBusinesses(apiKey, query, bias) {
  const lib = await loadPlacesLibrary(apiKey);
  if (authFailed) throw authError();

  const request = {
    textQuery: query,
    fields: SEARCH_FIELDS,
    locationBias: { center: bias.center, radius: bias.radiusMeters },
    language: CONFIG.language,
    region: CONFIG.region,
    maxResultCount: CONFIG.maxResults,
  };

  let places;
  try {
    const result = await withTimeout(
      lib.Place.searchByText(request),
      SEARCH_TIMEOUT_MS,
      new PlacesError('network', 'La búsqueda ha tardado demasiado. Comprueba la conexión e inténtalo de nuevo.')
    );
    places = result.places || [];
  } catch (error) {
    if (error instanceof PlacesError) throw error;
    if (authFailed) throw authError();
    if (!navigator.onLine) {
      throw new PlacesError('network', 'Sin conexión a internet.');
    }
    throw new PlacesError(
      'api',
      'Google Places ha devuelto un error. Comprueba que «Places API (New)» está habilitada y que la clave tiene cuota disponible.',
      String(error?.message || error)
    );
  }

  if (authFailed) throw authError();
  return places.map(normalizePlace).filter((place) => place.id);
}

const LOCALITY_TYPES = ['locality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2'];

/** Extrae el municipio de los componentes de dirección. */
function extractLocality(components) {
  if (!Array.isArray(components)) return '';
  for (const type of LOCALITY_TYPES) {
    const match = components.find((component) => component.types?.includes(type));
    if (match) return match.longText || match.shortText || '';
  }
  return '';
}

/** Reduce un `Place` de Google al mínimo que necesita la aplicación. */
function normalizePlace(place) {
  const location = place.location
    ? { lat: place.location.lat(), lng: place.location.lng() }
    : null;

  return {
    id: place.id || '',
    name: place.displayName || '(sin nombre)',
    address: place.formattedAddress || '',
    locality: extractLocality(place.addressComponents),
    type: place.primaryTypeDisplayName || '',
    closed: place.businessStatus === 'CLOSED_PERMANENTLY',
    location,
  };
}

/** Distancia en metros entre dos coordenadas (fórmula del haversine). */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Reordena los resultados sin destruir la relevancia de Google: primero los
 * del municipio prioritario, después los que caen dentro del radio de sesgo y
 * por último el resto. La ordenación es estable dentro de cada grupo.
 * @param {Array<object>} places
 * @param {{center:{lat:number,lng:number}, radiusMeters:number, cityName:string}} bias
 */
export function prioritizeResults(places, bias) {
  const city = (bias.cityName || '').toLowerCase();
  const rank = (place) => {
    if (city && place.locality.toLowerCase() === city) return 0;
    if (distanceMeters(bias.center, place.location) <= bias.radiusMeters) return 1;
    return 2;
  };
  return places
    .map((place, index) => ({ place, index, rank: rank(place) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.place);
}

/**
 * Pide la ubicación del dispositivo.
 * @returns {Promise<{lat:number,lng:number}>}
 */
export function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new PlacesError('geo', 'Este navegador no permite obtener la ubicación.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => {
        const messages = {
          1: 'Permiso de ubicación denegado.',
          2: 'Ubicación no disponible en este momento.',
          3: 'Se ha agotado el tiempo al obtener la ubicación.',
        };
        reject(new PlacesError('geo', messages[error.code] || 'No se ha podido obtener la ubicación.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
