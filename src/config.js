// Local JSON config store. Everything lives in the app's userData folder.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PARTITION = 'persist:aimon';
const MAX_FAVORITES = 80;

function configFile() {
  return path.join(app.getPath('userData'), 'config.json');
}

function defaults() {
  return {
    version: 1,
    favorites: [],
    settings: {
      residentLimit: 4,
      openOnLaunch: 'last',
      railPinned: false,
    },
    lastActiveId: null,
    window: null,
  };
}

let state = null;
let writeTimer = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeUrl(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const isLocal =
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value) ||
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value);
    value = (isLocal ? 'http://' : 'https://') + value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hashColor(seed) {
  let hash = 0;
  const text = String(seed || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return hslToHex(hue, 62, 46);
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function sanitizeFavorite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = normalizeUrl(raw.url);
  if (!url) return null;

  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = url;
  }

  const id =
    typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(raw.id)
      ? raw.id
      : crypto.randomUUID();

  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 40)
      : host.slice(0, 40);

  const icon = typeof raw.icon === 'string' && /^https?:\/\//i.test(raw.icon) ? raw.icon : '';
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color || ''))
    ? String(raw.color).toLowerCase()
    : hashColor(id + url);

  return {
    id,
    name,
    url,
    icon,
    color,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const favorite = sanitizeFavorite(item);
    if (!favorite) continue;
    if (seen.has(favorite.id)) favorite.id = crypto.randomUUID();
    seen.add(favorite.id);
    result.push(favorite);
    if (result.length >= MAX_FAVORITES) break;
  }
  return result;
}

function sanitizeSettings(raw) {
  const base = defaults().settings;
  const settings = Object.assign({}, base, raw && typeof raw === 'object' ? raw : {});
  const limit = Number(settings.residentLimit);
  settings.residentLimit = Number.isFinite(limit) ? Math.min(5, Math.max(0, Math.round(limit))) : base.residentLimit;
  settings.openOnLaunch = ['last', 'first', 'empty'].includes(settings.openOnLaunch)
    ? settings.openOnLaunch
    : base.openOnLaunch;
  settings.railPinned = Boolean(settings.railPinned);
  return settings;
}

function sanitizeWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) out[key] = Math.round(value);
  }
  if (!out.width || !out.height) return null;
  return out;
}

function load() {
  if (state) return state;
  const base = defaults();
  let disk = null;
  try {
    disk = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    disk = null;
  }

  state = base;
  if (disk && typeof disk === 'object') {
    state.favorites = sanitizeList(disk.favorites);
    state.settings = sanitizeSettings(disk.settings);
    state.lastActiveId =
      typeof disk.lastActiveId === 'string' && state.favorites.some((f) => f.id === disk.lastActiveId)
        ? disk.lastActiveId
        : null;
    state.window = sanitizeWindow(disk.window);
  }
  return state;
}

function writeNow() {
  if (!state) return;
  const file = configFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.error('[config] write failed:', error);
  }
}

function scheduleWrite(delay = 300) {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeNow, delay);
}

function get() {
  return clone(load());
}

function getPath() {
  return configFile();
}

function saveFavorites(list) {
  load();
  state.favorites = sanitizeList(list);
  if (state.lastActiveId && !state.favorites.some((f) => f.id === state.lastActiveId)) {
    state.lastActiveId = null;
  }
  writeNow();
  return get();
}

function updateSettings(patch) {
  load();
  state.settings = sanitizeSettings(Object.assign({}, state.settings, patch || {}));
  writeNow();
  return get();
}

function setActive(id) {
  load();
  if (id && !state.favorites.some((f) => f.id === id)) return;
  state.lastActiveId = id || null;
  scheduleWrite(400);
}

function setWindow(bounds) {
  load();
  state.window = sanitizeWindow(bounds);
  scheduleWrite(600);
}

function importFavorites(payload) {
  load();
  const incoming = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.favorites)
      ? payload.favorites
      : [];
  const existing = new Set(state.favorites.map((f) => normalizeUrl(f.url)));
  const merged = state.favorites.slice();
  let added = 0;
  for (const raw of incoming) {
    const favorite = sanitizeFavorite(raw);
    if (!favorite) continue;
    if (existing.has(normalizeUrl(favorite.url))) continue;
    existing.add(normalizeUrl(favorite.url));
    merged.push(favorite);
    added += 1;
    if (merged.length >= MAX_FAVORITES) break;
  }
  state.favorites = sanitizeList(merged);
  writeNow();
  return { added, config: get() };
}

module.exports = {
  PARTITION,
  normalizeUrl,
  hashColor,
  get,
  getPath,
  saveFavorites,
  updateSettings,
  setActive,
  setWindow,
  importFavorites,
  sanitizeList,
};
