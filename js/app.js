import { CONFIG } from './config.js';
import { buildReviewUrl, isValidPlaceId } from './review.js';
import {
  PlacesError,
  distanceMeters,
  getDeviceLocation,
  hasAuthFailed,
  isLibraryLoaded,
  onAuthFailure,
  prioritizeResults,
  searchBusinesses,
} from './places.js';
import { addToHistory, clearHistory, getHistory } from './history.js';
import { cacheKey, clearCache, getCached, setCached } from './cache.js';
import { getUsage, recordApiCall } from './usage.js';
import { forgetApiKey, getApiKey, isApiKeyFixed, looksLikeApiKey, saveApiKey } from './apikey.js';
import { renderQr } from './qr.js';

/* ------------------------------------------------------------------ DOM --- */

const $ = (id) => document.getElementById(id);

const el = {
  body: document.body,
  // setup
  formKey: $('form-key'),
  inputKey: $('input-key'),
  chkShowKey: $('chk-show-key'),
  btnForgetKey: $('btn-forget-key'),
  btnSetupBack: $('btn-setup-back'),
  setupFixedNote: $('setup-fixed-note'),
  btnSettings: $('btn-settings'),
  // search
  formSearch: $('form-search'),
  inputQuery: $('input-query'),
  btnGeo: $('btn-geo'),
  biasLabel: $('bias-label'),
  history: $('history'),
  historyList: $('history-list'),
  btnClearHistory: $('btn-clear-history'),
  usage: $('usage'),
  // results
  resultsTitle: $('results-h'),
  resultsMeta: $('results-meta'),
  resultsList: $('results-list'),
  // detail
  detailName: $('detail-name'),
  detailAddress: $('detail-address'),
  detailBadges: $('detail-badges'),
  detailPlaceId: $('detail-placeid'),
  detailUrl: $('detail-url'),
  btnOpen: $('btn-open'),
  btnShare: $('btn-share'),
  qrBox: $('qr-box'),
  qrTarget: $('qr-target'),
  // states
  loading: $('loading'),
  loadingText: $('loading-text'),
  error: $('error'),
  errorTitle: $('error-title'),
  errorText: $('error-text'),
  errorDetail: $('error-detail'),
  btnErrorRetry: $('btn-error-retry'),
  toast: $('toast'),
};

/* ---------------------------------------------------------------- state --- */

const state = {
  query: '',
  results: [],
  selected: null,
  deviceLocation: null,
  /** 'results' | 'history': desde dónde se ha abierto el detalle. */
  detailOrigin: 'results',
  /** Acción a repetir desde la pantalla de error. */
  retry: null,
};

/** Sesgo geográfico activo: ubicación del dispositivo si está disponible. */
function activeBias() {
  if (state.deviceLocation) {
    // Con ubicación real manda la proximidad, no el municipio por defecto.
    return {
      center: state.deviceLocation,
      radiusMeters: CONFIG.deviceBiasRadiusMeters,
      cityName: '',
    };
  }
  return { ...CONFIG.bias };
}

/* ------------------------------------------------------------ navegación --- */

function showView(view) {
  el.body.classList.remove('is-busy');
  el.loading.hidden = true;
  el.error.hidden = true;
  el.body.dataset.view = view;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function showLoading(text) {
  el.loadingText.textContent = text;
  el.error.hidden = true;
  el.loading.hidden = false;
  el.body.classList.add('is-busy');
}

/**
 * @param {Error} error
 * @param {?Function} retry Acción del botón principal; `null` lo oculta.
 */
function showError(error, retry) {
  const isAuth = error instanceof PlacesError && error.kind === 'auth';

  el.errorTitle.textContent = isAuth
    ? 'API key rechazada'
    : error instanceof PlacesError && error.kind === 'network'
      ? 'Problema de conexión'
      : 'Error';
  el.errorText.textContent = error.message;

  const detail = error instanceof PlacesError ? error.detail : '';
  el.errorDetail.textContent = detail;
  el.errorDetail.hidden = !detail;

  if (isAuth && !isApiKeyFixed()) {
    state.retry = () => openSetup();
    el.btnErrorRetry.textContent = 'Configurar API key';
    el.btnErrorRetry.hidden = false;
  } else if (retry) {
    state.retry = retry;
    el.btnErrorRetry.textContent = 'Reintentar';
    el.btnErrorRetry.hidden = false;
  } else {
    state.retry = null;
    el.btnErrorRetry.hidden = true;
  }

  el.loading.hidden = true;
  el.error.hidden = false;
  el.body.classList.add('is-busy');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

let toastTimer = null;
function toast(message, variant = 'ok') {
  el.toast.textContent = message;
  el.toast.classList.toggle('toast--warn', variant === 'warn');
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2200);
}

/* ------------------------------------------------------------- API key ---- */

function openSetup() {
  const hasKey = Boolean(getApiKey());
  el.inputKey.value = '';
  el.btnSetupBack.hidden = !hasKey;
  el.btnForgetKey.hidden = !hasKey || isApiKeyFixed();
  el.formKey.hidden = isApiKeyFixed();
  el.setupFixedNote.hidden = !isApiKeyFixed();
  showView('setup');
  if (!isApiKeyFixed()) el.inputKey.focus();
}

el.formKey.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = el.inputKey.value.trim();
  if (!value) return;

  const alreadyLoaded = isLibraryLoaded();
  if (!saveApiKey(value)) {
    toast('No se ha podido guardar la clave en este navegador.', 'warn');
    return;
  }
  if (!looksLikeApiKey(value)) {
    toast('La clave no tiene el formato habitual de Google.', 'warn');
  }

  // Maps JavaScript API sólo acepta una clave por carga de página.
  if (alreadyLoaded || hasAuthFailed()) {
    location.reload();
    return;
  }
  el.inputKey.value = '';
  goToSearch();
});

el.chkShowKey.addEventListener('change', () => {
  el.inputKey.type = el.chkShowKey.checked ? 'text' : 'password';
});

el.btnForgetKey.addEventListener('click', () => {
  forgetApiKey();
  location.reload();
});

el.btnSetupBack.addEventListener('click', () => goToSearch());
el.btnSettings.addEventListener('click', () => openSetup());

/* -------------------------------------------------------------- búsqueda --- */

function goToSearch() {
  renderHistory();
  renderUsage();
  showView('search');
}

el.formSearch.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = el.inputQuery.value.trim();
  if (query.length < 2) {
    toast('Escribe al menos dos caracteres.', 'warn');
    return;
  }
  el.inputQuery.blur();
  runSearch(query);
});

async function runSearch(query) {
  const apiKey = getApiKey();
  if (!apiKey) {
    openSetup();
    toast('Configura primero la API key.', 'warn');
    return;
  }

  state.query = query;
  const bias = activeBias();
  const key = cacheKey(query, bias);

  const cached = getCached(key);
  if (cached) {
    state.results = prioritizeResults(cached, bias);
    renderResults({ fromCache: true });
    showView('results');
    return;
  }

  showLoading('Buscando establecimientos…');
  try {
    const found = await searchBusinesses(apiKey, query, bias);
    recordApiCall();
    setCached(key, found);
    state.results = prioritizeResults(found, bias);
    renderResults();
    showView('results');
  } catch (error) {
    showError(error, () => runSearch(query));
  }
}

/** Resumen de llamadas consumidas, para no salirse del nivel gratuito. */
function renderUsage() {
  const { dayCount, monthCount } = getUsage();
  const { perDay, perMonth } = CONFIG.freeTier;
  el.usage.textContent =
    `${dayCount} ${dayCount === 1 ? 'búsqueda' : 'búsquedas'} hoy · ${monthCount} este mes`;
  el.usage.classList.toggle(
    'usage--warn',
    dayCount >= perDay * 0.8 || monthCount >= perMonth * 0.8
  );
}

/* -------------------------------------------------------------- ubicación --- */

el.btnGeo.addEventListener('click', async () => {
  if (state.deviceLocation) {
    state.deviceLocation = null;
    el.btnGeo.setAttribute('aria-pressed', 'false');
    el.biasLabel.textContent = `Priorizando ${CONFIG.bias.cityName}`;
    return;
  }

  el.btnGeo.disabled = true;
  el.biasLabel.textContent = 'Obteniendo ubicación…';
  try {
    state.deviceLocation = await getDeviceLocation();
    el.btnGeo.setAttribute('aria-pressed', 'true');
    el.biasLabel.textContent = 'Priorizando tu ubicación actual';
  } catch (error) {
    el.btnGeo.setAttribute('aria-pressed', 'false');
    el.biasLabel.textContent = `Priorizando ${CONFIG.bias.cityName}`;
    toast(error.message, 'warn');
  } finally {
    el.btnGeo.disabled = false;
  }
});

/* --------------------------------------------------------------- render --- */

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function badge(text, variant) {
  const span = document.createElement('span');
  span.className = variant ? `badge badge--${variant}` : 'badge';
  span.textContent = text;
  return span;
}

/**
 * Tarjeta pulsable de un negocio.
 * @param {object} place
 * @param {{bias?:object, showDistance?:boolean}} options
 */
function buildCard(place, options = {}) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card';
  button.dataset.placeId = place.id;

  const isPriorityCity =
    place.locality &&
    place.locality.toLowerCase() === CONFIG.bias.cityName.toLowerCase();
  if (isPriorityCity) button.classList.add('card--near');
  if (place.closed) button.classList.add('card--closed');

  const name = document.createElement('p');
  name.className = 'card__name';
  name.textContent = place.name;
  button.appendChild(name);

  if (place.address) {
    const address = document.createElement('p');
    address.className = 'card__addr';
    address.textContent = place.address;
    button.appendChild(address);
  }

  const foot = document.createElement('div');
  foot.className = 'card__foot';
  if (place.locality) foot.appendChild(badge(place.locality, isPriorityCity ? 'city' : ''));
  if (place.type) foot.appendChild(badge(place.type, ''));
  if (options.showDistance && options.bias && place.location) {
    const label = formatDistance(distanceMeters(options.bias.center, place.location));
    if (label) foot.appendChild(badge(label, ''));
  }
  if (place.closed) foot.appendChild(badge('Cerrado permanentemente', 'alert'));
  if (foot.childElementCount) button.appendChild(foot);

  item.appendChild(button);
  return item;
}

function renderResults(options = {}) {
  const count = state.results.length;
  el.resultsList.replaceChildren();

  if (!count) {
    el.resultsTitle.textContent = 'Sin resultados';
    el.resultsMeta.textContent =
      `No hay establecimientos para «${state.query}». Prueba con el nombre completo ` +
      'o añade la localidad, por ejemplo «Bar Catalunya Terrassa».';
    return;
  }

  el.resultsTitle.textContent = count === 1 ? '1 resultado' : `${count} resultados`;
  el.resultsMeta.textContent = options.fromCache
    ? `«${state.query}» · resultados en caché, sin consumir API`
    : `«${state.query}» · toca el negocio correcto`;

  const bias = activeBias();
  const fragment = document.createDocumentFragment();
  for (const place of state.results) {
    fragment.appendChild(buildCard(place, { bias, showDistance: true }));
  }
  el.resultsList.appendChild(fragment);
}

function renderHistory() {
  const entries = getHistory();
  el.historyList.replaceChildren();
  el.history.hidden = entries.length === 0;
  if (!entries.length) return;

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    fragment.appendChild(buildCard({ ...entry, type: '', closed: false, location: null }));
  }
  el.historyList.appendChild(fragment);
}

/* --------------------------------------------------------------- detalle --- */

function openDetail(place, origin) {
  if (!isValidPlaceId(place.id)) {
    showError(new Error('El establecimiento seleccionado no tiene un Place ID válido.'), null);
    return;
  }

  const url = buildReviewUrl(place.id);
  state.selected = { ...place, url };
  state.detailOrigin = origin;

  el.detailName.textContent = place.name;
  el.detailAddress.textContent = place.address || '';

  el.detailBadges.replaceChildren();
  if (place.locality) el.detailBadges.appendChild(badge(place.locality, 'city'));
  if (place.type) el.detailBadges.appendChild(badge(place.type, ''));
  if (place.closed) el.detailBadges.appendChild(badge('Cerrado permanentemente', 'alert'));

  el.detailPlaceId.textContent = place.id;
  el.detailUrl.textContent = url;
  el.btnOpen.href = url;

  el.btnShare.hidden = typeof navigator.share !== 'function';

  // El QR se vuelve a generar con el nuevo enlace la próxima vez que se abra.
  el.qrBox.open = false;
  el.qrTarget.replaceChildren();

  addToHistory(place);
  showView('detail');
}

function findPlace(placeId) {
  return (
    state.results.find((place) => place.id === placeId) ||
    getHistory().find((entry) => entry.id === placeId) ||
    null
  );
}

el.resultsList.addEventListener('click', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  const place = findPlace(card.dataset.placeId);
  if (place) openDetail(place, 'results');
});

el.historyList.addEventListener('click', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  const place = findPlace(card.dataset.placeId);
  if (place) openDetail(place, 'history');
});

el.qrBox.addEventListener('toggle', () => {
  if (el.qrBox.open && state.selected && !el.qrTarget.childElementCount) {
    renderQr(el.qrTarget, state.selected.url);
  }
});

el.btnShare.addEventListener('click', async () => {
  if (!state.selected) return;
  try {
    await navigator.share({ title: state.selected.name, url: state.selected.url });
  } catch {
    /* El usuario ha cancelado el diálogo del sistema. */
  }
});

/* ------------------------------------------------------------ portapapeles --- */

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Contexto no seguro o permiso denegado: se prueba el método antiguo. */
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

const copyResetTimers = new WeakMap();

async function handleCopy(button, text, okMessage) {
  const copied = await copyText(text);
  if (!copied) {
    toast('No se ha podido copiar. Mantén pulsado el texto para copiarlo.', 'warn');
    return;
  }

  toast(okMessage);
  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  button.textContent = '✓ Copiado';
  button.classList.add('is-ok');

  clearTimeout(copyResetTimers.get(button));
  copyResetTimers.set(
    button,
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('is-ok');
    }, 1800)
  );
}

/* -------------------------------------------------------------- acciones --- */

document.addEventListener('click', (event) => {
  const copyTarget = event.target.closest('[data-copy]');
  if (copyTarget && state.selected) {
    const kind = copyTarget.dataset.copy;
    if (kind === 'url') handleCopy(copyTarget, state.selected.url, 'Enlace copiado');
    if (kind === 'placeid') handleCopy(copyTarget, state.selected.id, 'Place ID copiado');
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;

  switch (actionTarget.dataset.action) {
    case 'to-search':
      goToSearch();
      break;
    case 'back-to-results':
      if (state.detailOrigin === 'results' && state.results.length) {
        renderResults();
        showView('results');
      } else {
        goToSearch();
      }
      break;
    case 'new-search':
      el.inputQuery.value = '';
      goToSearch();
      el.inputQuery.focus();
      break;
  }
});

el.btnErrorRetry.addEventListener('click', () => {
  if (state.retry) state.retry();
});

el.btnClearHistory.addEventListener('click', () => {
  clearHistory();
  clearCache();
  renderHistory();
  toast('Historial borrado');
});

onAuthFailure(() => {
  showError(
    new PlacesError(
      'auth',
      'Google ha rechazado la API key. Comprueba la clave, que «Maps JavaScript API» y ' +
        '«Places API (New)» estén habilitadas y que este dominio figure en las ' +
        'restricciones de referente HTTP.',
      `Origen actual: ${location.origin}`
    ),
    null
  );
});

/* ----------------------------------------------------------------- inicio --- */

if (getApiKey()) {
  goToSearch();
  el.inputQuery.focus({ preventScroll: true });
} else {
  openSetup();
}
