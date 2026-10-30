/* AI Coding Monitor - main window renderer */
(() => {
const api = window.api;
const PARTITION = 'persist:aimon';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pageLayer = $('#page-layer');
const rail = $('#rail');
const railList = $('#rail-list');
const railTrigger = $('#rail-trigger');
const railTip = $('#rail-tip');
const hud = $('#hud');
const hudIcon = $('#hud-icon');
const hudName = $('#hud-name');
const hudMeta = $('#hud-meta');
const hudDots = $('#hud-dots');
const gridOverlay = $('#grid-overlay');
const gridItems = $('#grid-items');
const gridSearch = $('#grid-search');
const gridCount = $('#grid-count');
const topbar = $('#topbar');
const topTitle = $('#top-title');
const topHost = $('#top-host');
const topFavicon = $('#top-favicon');
const address = $('#address');
const addressForm = $('#address-form');
const btnBack = $('#btn-back');
const btnForward = $('#btn-forward');
const btnReload = $('#btn-reload');
const home = $('#home');
const homeTitle = $('#home-title');
const homeDesc = $('#home-desc');
const homeCards = $('#home-cards');
const homePrimary = $('#home-primary');
const homeSecondary = $('#home-secondary');
const pageError = $('#page-error');
const errDesc = $('#err-desc');
const errUrl = $('#err-url');
const toastEl = $('#toast');

const state = {
  config: null,
  favorites: [],
  settings: { residentLimit: 4, openOnLaunch: 'last', railPinned: false },
  currentId: null,
  pages: new Map(),
  lru: [],
  thumbs: new Map(),
  favicons: new Map(),
  gridOpen: false,
  settingsOpen: false,
  gridResults: [],
  gridIndex: 0,
  hudTimer: 0,
  toastTimer: 0,
  railHideTimer: 0,
  ready: false,
};

function setChromeInert(inert) {
  for (const node of [$('#topbar'), $('#stage'), gridOverlay, hud]) {
    if (node) node.inert = inert;
  }
}

window.addEventListener('aimon:settings-opened', () => {
  state.settingsOpen = true;
  setChromeInert(true);
  if (state.gridOpen) closeGrid({ focus: false });
  hideRailTip();
  rail.classList.remove('open');
});

window.addEventListener('aimon:settings-closed', () => {
  state.settingsOpen = false;
  setChromeInert(false);
  const favorite = currentFavorite();
  api.setWindowTitle(state.currentId && favorite ? favorite.name : 'AI Coding Monitor');
  if (!state.gridOpen) focusPage();
});

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function div(className, text) {
  const node = document.createElement('div');
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function hostOf(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    return parsed.port && !/:(80|443)$/.test(parsed.port) ? `${host}:${parsed.port}` : host;
  } catch {
    return url || '';
  }
}

function fallbackIcon(url) {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function initialOf(favorite) {
  const text = (favorite.name || hostOf(favorite.url) || '?').trim();
  return text.slice(0, 1).toUpperCase();
}

function iconUrlFor(favorite) {
  return state.favicons.get(favorite.id) || favorite.icon || fallbackIcon(favorite.url);
}

function renderAvatar(host, favorite) {
  host.innerHTML = '';
  if (!favorite) return;

  const letter = () => {
    host.innerHTML = '';
    const span = div('letter', initialOf(favorite));
    span.style.background = favorite.color || '#4f6ef7';
    host.appendChild(span);
  };

  const src = iconUrlFor(favorite);
  if (!src) return letter();

  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', letter, { once: true });
  img.src = src;
  host.appendChild(img);
}

function normalizeInput(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;

  if (/\s/.test(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const isLocal =
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value) ||
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value);
    value = (isLocal ? 'http://' : 'https://') + value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2200);
}

function currentFavorite() {
  return state.favorites.find((favorite) => favorite.id === state.currentId) || null;
}

function currentRecord() {
  return state.currentId ? state.pages.get(state.currentId) || null : null;
}

function residentLimit() {
  const value = Number(state.settings.residentLimit);
  return Number.isFinite(value) ? Math.min(5, Math.max(0, Math.round(value))) : 4;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  const [config, appInfo] = await Promise.all([api.getConfig(), api.getAppInfo()]);
  state.config = config;
  state.appInfo = appInfo;
  state.favorites = config.favorites;
  state.settings = config.settings;

  bindEvents();
  applyRailMode();
  renderRail();
  renderHome();
  updateTopbar();

  api.onConfigChanged(onConfigChanged);
  api.onCommand(onCommand);
  api.onWindowShown(() => {
    if (!state.gridOpen && !state.settingsOpen) focusPage();
  });
  api.onDataCleared(onDataCleared);

  state.ready = true;
  pickStartupPage();
}

function pickStartupPage() {
  if (!state.favorites.length) {
    showHome();
    return;
  }
  let id = null;
  if (state.settings.openOnLaunch === 'last') {
    id = state.config.lastActiveId || state.favorites[0].id;
  } else if (state.settings.openOnLaunch === 'first') {
    id = state.favorites[0].id;
  }
  if (id) activate(id, { hud: false });
  else showHome();
}

/* ------------------------------------------------------------------ */
/* Pages / LRU                                                         */
/* ------------------------------------------------------------------ */

function ensurePage(favorite) {
  const existing = state.pages.get(favorite.id);
  if (existing) return existing;

  const view = document.createElement('webview');
  view.className = 'page-view';
  view.dataset.id = favorite.id;
  view.setAttribute('partition', PARTITION);
  view.setAttribute('allowpopups', '');
  view.setAttribute('src', favorite.url);

  const record = {
    id: favorite.id,
    wv: view,
    ready: false,
    url: favorite.url,
    baseUrl: favorite.url,
    title: '',
    error: null,
    thumbPending: false,
  };
  state.pages.set(favorite.id, record);

  view.addEventListener('dom-ready', () => {
    record.ready = true;
    if (state.currentId === favorite.id) {
      updateTopbar();
      updateError();
      focusPage();
    }
  });

  view.addEventListener('did-start-loading', () => {
    record.error = null;
    if (state.currentId === favorite.id) {
      setLoading(true);
      updateError();
    }
  });

  view.addEventListener('did-stop-loading', () => {
    if (state.currentId === favorite.id) {
      setLoading(false);
      setTimeout(() => captureThumb(favorite.id, record), 700);
    }
    updateTopbar();
  });

  view.addEventListener('did-navigate', (event) => {
    record.url = event.url || record.url;
    record.error = null;
    if (state.currentId === favorite.id) {
      updateTopbar();
      updateError();
    }
  });

  view.addEventListener('did-navigate-in-page', (event) => {
    record.url = event.url || record.url;
    if (state.currentId === favorite.id) updateTopbar();
  });

  view.addEventListener('page-title-updated', (event) => {
    record.title = event.title || '';
  });

  view.addEventListener('page-favicon-updated', (event) => {
    const icons = event.favicons || [];
    if (icons.length) {
      state.favicons.set(favorite.id, icons[icons.length - 1]);
      renderRail();
      updateTopbar();
      if (state.gridOpen) renderGrid();
    }
  });

  view.addEventListener('did-fail-load', (event) => {
    if (!event.isMainFrame) return;
    if (event.errorCode === -3) return; // aborted by a new navigation
    record.error = {
      code: event.errorCode,
      description: event.errorDescription || '无法加载该页面',
      url: event.validatedURL || record.url,
    };
    if (state.currentId === favorite.id) {
      setLoading(false);
      updateError();
    }
  });

  view.addEventListener('render-process-gone', () => {
    record.ready = false;
    record.error = { code: 0, description: '页面进程意外退出', url: record.url };
    if (state.currentId === favorite.id) updateError();
  });

  pageLayer.appendChild(view);
  return record;
}

function destroyPage(id) {
  const record = state.pages.get(id);
  if (!record) return;
  try {
    record.wv.remove();
  } catch {
    /* ignore */
  }
  state.pages.delete(id);
  state.lru = state.lru.filter((item) => item !== id);
}

function destroyAllPages() {
  for (const id of Array.from(state.pages.keys())) destroyPage(id);
  state.currentId = null;
  state.lru = [];
}

function touchLru(id) {
  state.lru = state.lru.filter((item) => item !== id);
  state.lru.push(id);
}

function evictPages() {
  const limit = residentLimit();
  while (state.lru.length > limit) {
    const victim = state.lru.find((id) => id !== state.currentId && state.pages.has(id));
    if (!victim) break;
    state.lru = state.lru.filter((id) => id !== victim);
    destroyPage(victim);
  }
}

async function captureThumb(id, record) {
  if (!record || record.thumbPending || !record.ready) return;
  record.thumbPending = true;
  try {
    const guestId = record.wv.getWebContentsId();
    if (guestId) {
      const dataUrl = await api.captureThumb(guestId);
      if (dataUrl) {
        state.thumbs.set(id, dataUrl);
        if (state.gridOpen) renderGrid();
      }
    }
  } catch {
    /* capture is best-effort */
  } finally {
    record.thumbPending = false;
  }
}

/* ------------------------------------------------------------------ */
/* Activation                                                          */
/* ------------------------------------------------------------------ */

function activate(id, options = {}) {
  const favorite = state.favorites.find((item) => item.id === id);
  if (!favorite) {
    showHome();
    return;
  }

  if (state.currentId === id) {
    closeGrid({ focus: false });
    if (options.reset) reloadActive();
    if (options.hud !== false) showHud(favorite);
    updateTopbar();
    setTimeout(focusPage, 0);
    return;
  }

  const previousId = state.currentId;
  if (previousId) {
    const previous = state.pages.get(previousId);
    if (previous) {
      captureThumb(previousId, previous);
      previous.wv.classList.remove('active');
    }
  }

  const record = ensurePage(favorite);
  record.wv.classList.add('active');
  state.currentId = id;
  touchLru(id);
  evictPages();

  document.body.classList.add('has-page');
  closeGrid({ focus: false });
  renderRail();
  updateTopbar();
  updateError();
  api.setActive(id);
  if (!state.settingsOpen) api.setWindowTitle(favorite.name);

  if (options.hud !== false) showHud(favorite);
  if (!options.keepRail) scheduleRailHide(120);

  if (!state.settingsOpen) setTimeout(focusPage, 0);

  if (record.ready) setLoading(record.wv.isLoading());
}

function showHome() {
  document.body.classList.remove('has-page');
  for (const record of state.pages.values()) record.wv.classList.remove('active');
  state.currentId = null;
  setLoading(false);
  hideError();
  renderRail();
  renderHome();
  updateTopbar();
  if (!state.settingsOpen) api.setWindowTitle('AI Coding Monitor');
}

function reloadActive() {
  const record = currentRecord();
  const favorite = currentFavorite();
  if (!record || !record.ready || !favorite) return;
  const hadError = Boolean(record.error);
  record.error = null;
  updateError();
  setLoading(true);
  try {
    if (hadError) record.wv.loadURL(record.url || favorite.url);
    else record.wv.reload();
  } catch {
    /* ignore */
  }
}

function goBack() {
  const record = currentRecord();
  if (!record || !record.ready) return;
  try {
    if (record.wv.canGoBack()) record.wv.goBack();
  } catch {
    /* ignore */
  }
  setTimeout(updateTopbar, 120);
}

function goForward() {
  const record = currentRecord();
  if (!record || !record.ready) return;
  try {
    if (record.wv.canGoForward()) record.wv.goForward();
  } catch {
    /* ignore */
  }
  setTimeout(updateTopbar, 120);
}

function focusPage() {
  if (state.gridOpen) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  const record = currentRecord();
  if (!record || !record.ready) return;
  try {
    record.wv.focus();
  } catch {
    /* ignore */
  }
}

function cycle(direction) {
  if (!state.favorites.length) return;
  if (state.gridOpen) closeGrid({ focus: false });
  const index = state.favorites.findIndex((favorite) => favorite.id === state.currentId);
  let nextIndex;
  if (index === -1) nextIndex = direction > 0 ? 0 : state.favorites.length - 1;
  else nextIndex = (index + direction + state.favorites.length) % state.favorites.length;
  activate(state.favorites[nextIndex].id, { hud: true });
}

/* ------------------------------------------------------------------ */
/* Chrome UI                                                           */
/* ------------------------------------------------------------------ */

function setLoading(loading) {
  topbar.classList.toggle('loading', Boolean(loading));
}

function updateTopbar() {
  const favorite = currentFavorite();
  const record = currentRecord();

  topTitle.textContent = favorite ? favorite.name : 'AI Coding Monitor';
  topHost.textContent = favorite ? hostOf(record ? record.url : favorite.url) : '本地收藏切换器';
  renderAvatar(topFavicon, favorite);

  let canGoBack = false;
  let canGoForward = false;
  const ready = Boolean(record && record.ready);
  if (ready) {
    try {
      canGoBack = record.wv.canGoBack();
      canGoForward = record.wv.canGoForward();
    } catch {
      /* ignore */
    }
  }

  btnBack.disabled = !canGoBack;
  btnForward.disabled = !canGoForward;
  btnReload.disabled = !ready;
  address.disabled = !ready;

  if (document.activeElement !== address) {
    address.value = record ? record.url || favorite.url : '';
  }
}

function renderRail() {
  railList.innerHTML = '';
  state.favorites.forEach((favorite, index) => {
    const button = document.createElement('button');
    button.className = `rail-item${favorite.id === state.currentId ? ' active' : ''}`;
    button.dataset.id = favorite.id;
    button.setAttribute('aria-label', favorite.name);

    const avatar = div('rail-avatar');
    renderAvatar(avatar, favorite);
    button.appendChild(avatar);

    if (index < 9) {
      const key = div('rail-key', String(index + 1));
      button.appendChild(key);
    }

    button.addEventListener('click', () => activate(favorite.id));
    button.addEventListener('mouseenter', () => showRailTip(favorite, button, index));
    button.addEventListener('mouseleave', hideRailTip);
    railList.appendChild(button);
  });

  $('#rail-pin').classList.toggle('on', Boolean(state.settings.railPinned));
}

function renderHome() {
  const empty = state.favorites.length === 0;
  const hasPage = Boolean(state.currentId);

  homeTitle.textContent = empty ? '把常用页面收进来' : '选择一个页面';
  homeDesc.textContent = empty
    ? '添加你的第一个收藏，之后用 ⌃Tab 或 ⌘⇧Space 就能秒切。'
    : '侧边栏会在不需要时自动隐藏，鼠标移到窗口左边缘即可唤出。';

  homePrimary.textContent = empty ? '添加收藏' : '页面总览';
  homeSecondary.hidden = empty;
  homeSecondary.textContent = '添加收藏';

  homeCards.innerHTML = '';
  if (!empty) {
    state.favorites.slice(0, 12).forEach((favorite) => {
      const card = document.createElement('button');
      card.className = 'home-card';
      const avatar = div('avatar');
      renderAvatar(avatar, favorite);

      const text = div('hc-text');
      const name = div('hc-name', favorite.name);
      const host = div('hc-host', hostOf(favorite.url));
      text.appendChild(name);
      text.appendChild(host);

      card.appendChild(avatar);
      card.appendChild(text);
      card.addEventListener('click', () => activate(favorite.id));
      homeCards.appendChild(card);
    });
  }

  document.body.classList.toggle('has-page', hasPage);
}

function showHud(favorite) {
  if (!favorite) return;
  hud.hidden = false;
  renderAvatar(hudIcon, favorite);
  hudName.textContent = favorite.name;

  const index = state.favorites.findIndex((item) => item.id === favorite.id);
  const total = state.favorites.length;
  hudMeta.textContent = index >= 0 ? `⌘${index + 1} · ${index + 1} / ${total}` : `${total} 个收藏`;

  hudDots.innerHTML = '';
  state.favorites.slice(0, 9).forEach((item) => {
    const dot = document.createElement('i');
    if (item.id === favorite.id) dot.className = 'on';
    hudDots.appendChild(dot);
  });

  hud.style.animation = 'none';
  void hud.offsetWidth;
  hud.style.animation = '';

  clearTimeout(state.hudTimer);
  state.hudTimer = setTimeout(() => {
    hud.hidden = true;
  }, 1300);
}

function updateError() {
  const record = currentRecord();
  if (record && record.error) {
    pageError.hidden = false;
    errDesc.textContent = record.error.description || '加载失败';
    errUrl.textContent = record.error.url || record.url || '';
  } else {
    pageError.hidden = true;
  }
}

function hideError() {
  pageError.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Rail auto-hide / tooltip                                            */
/* ------------------------------------------------------------------ */

function openRail() {
  clearTimeout(state.railHideTimer);
  rail.classList.add('open');
}

function scheduleRailHide(delay = 420) {
  if (state.settings.railPinned) return;
  clearTimeout(state.railHideTimer);
  state.railHideTimer = setTimeout(() => {
    if (rail.matches(':hover') || rail.contains(document.activeElement)) return;
    rail.classList.remove('open');
    hideRailTip();
  }, delay);
}

function applyRailMode() {
  document.body.classList.toggle('rail-pinned', Boolean(state.settings.railPinned));
  if (state.settings.railPinned) {
    rail.classList.add('open');
  } else {
    rail.classList.remove('open');
  }
}

function showRailTip(favorite, button, index) {
  const rect = button.getBoundingClientRect();
  railTip.hidden = false;

  const thumb = $('#tip-thumb');
  const dataUrl = state.thumbs.get(favorite.id);
  if (dataUrl) {
    thumb.classList.remove('empty');
    thumb.style.backgroundImage = `url("${dataUrl}")`;
  } else {
    thumb.classList.add('empty');
    thumb.style.backgroundImage = '';
  }

  $('#tip-name').textContent = favorite.name;
  $('#tip-host').textContent = hostOf(favorite.url);
  $('#tip-key').textContent = index < 9 ? `⌘${index + 1} 直接切换` : '';

  const width = 238;
  const height = dataUrl ? 190 : 190;
  let left = Math.round(rect.right + 10);
  let top = Math.round(rect.top + rect.height / 2 - height / 2);
  if (top < 48) top = 48;
  if (top + height > window.innerHeight - 12) top = window.innerHeight - height - 12;
  if (left + width > window.innerWidth - 12) left = Math.round(rect.left - width - 10);

  railTip.style.left = `${left}px`;
  railTip.style.top = `${top}px`;
}

function hideRailTip() {
  railTip.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Grid overview                                                       */
/* ------------------------------------------------------------------ */

function openGrid() {
  if (state.gridOpen) return;
  if (!state.favorites.length) {
    api.openSettings({ add: true });
    return;
  }

  state.gridOpen = true;
  state.gridIndex = 0;
  state.gridResults = state.favorites.slice();
  gridOverlay.hidden = false;
  gridSearch.value = '';
  renderGrid();
  captureAllThumbs();
  hideRailTip();
  closeRailNow();

  requestAnimationFrame(() => {
    gridOverlay.classList.add('open');
    gridSearch.focus();
    gridSearch.select();
  });
}

function closeGrid(options = {}) {
  if (!state.gridOpen) return;
  state.gridOpen = false;
  gridOverlay.classList.remove('open');
  gridSearch.blur();
  setTimeout(() => {
    if (!state.gridOpen) gridOverlay.hidden = true;
  }, 160);
  if (options.focus !== false) setTimeout(focusPage, 0);
}

function closeRailNow() {
  if (state.settings.railPinned) return;
  rail.classList.remove('open');
  hideRailTip();
}

function captureAllThumbs() {
  for (const [id, record] of state.pages.entries()) {
    if (!state.thumbs.has(id)) captureThumb(id, record);
  }
}

function renderGrid() {
  const query = gridSearch.value.trim().toLowerCase();
  const results = state.favorites.filter((favorite) => {
    if (!query) return true;
    return (
      favorite.name.toLowerCase().includes(query) ||
      favorite.url.toLowerCase().includes(query) ||
      hostOf(favorite.url).toLowerCase().includes(query)
    );
  });

  state.gridResults = results;
  if (state.gridIndex > results.length - 1) state.gridIndex = Math.max(0, results.length - 1);
  if (state.gridIndex < 0) state.gridIndex = 0;

  gridCount.textContent = query
    ? `${results.length} / ${state.favorites.length}`
    : `${state.favorites.length} 个收藏`;
  gridItems.innerHTML = '';

  if (!results.length) {
    gridItems.appendChild(div('grid-empty', '没有匹配的页面'));
    return;
  }

  results.forEach((favorite, resultIndex) => {
    const card = document.createElement('button');
    card.className = `grid-item${resultIndex === state.gridIndex ? ' selected' : ''}`;
    card.dataset.id = favorite.id;

    const placeholder = div('placeholder');
    const bigAvatar = div('avatar');
    renderAvatar(bigAvatar, favorite);
    placeholder.appendChild(bigAvatar);
    card.appendChild(placeholder);

    const thumb = state.thumbs.get(favorite.id);
    if (thumb) {
      const image = document.createElement('img');
      image.className = 'thumb';
      image.alt = '';
      image.src = thumb;
      card.appendChild(image);
    }

    card.appendChild(div('shade'));

    const globalIndex = state.favorites.indexOf(favorite);
    if (globalIndex > -1 && globalIndex < 9) {
      card.appendChild(div('badge', String(globalIndex + 1)));
    }
    if (favorite.id === state.currentId) {
      card.appendChild(div('active-mark'));
    }

    const meta = div('meta');
    const avatar = div('avatar');
    renderAvatar(avatar, favorite);
    meta.appendChild(avatar);

    const text = div('meta-text');
    text.appendChild(div('g-name', favorite.name));
    text.appendChild(div('g-host', hostOf(favorite.url)));
    meta.appendChild(text);
    card.appendChild(meta);

    card.addEventListener('mouseenter', () => {
      state.gridIndex = resultIndex;
      highlightGridSelection(false);
    });
    card.addEventListener('click', () => {
      activate(favorite.id);
    });

    gridItems.appendChild(card);
  });
}

function highlightGridSelection(scroll = true) {
  const cards = $$('.grid-item', gridItems);
  cards.forEach((card, index) => {
    card.classList.toggle('selected', index === state.gridIndex);
  });
  const selected = cards[state.gridIndex];
  if (selected && scroll) selected.scrollIntoView({ block: 'nearest' });
}

function moveGridSelection(delta) {
  if (!state.gridResults.length) return;
  const length = state.gridResults.length;
  state.gridIndex = (state.gridIndex + delta + length) % length;
  highlightGridSelection(true);
}

function openGridItem(index) {
  const favorite = state.gridResults[index];
  if (favorite) activate(favorite.id);
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

function openSettingsView(options = {}) {
  if (!window.aimonSettings) return;
  state.settingsOpen = true;
  window.aimonSettings.open(options);
}

function closeSettingsView(options = {}) {
  if (!window.aimonSettings) return;
  window.aimonSettings.close(options);
}

function onCommand(command) {
  if (!command || !command.type) return;
  if (state.settingsOpen && !['settings', 'settings-close', 'open'].includes(command.type)) return;

  switch (command.type) {
    case 'grid':
      if (state.gridOpen) closeGrid();
      else openGrid();
      break;
    case 'cycle':
      cycle(command.dir === -1 ? -1 : 1);
      break;
    case 'index': {
      const favorite = state.favorites[Number(command.index) - 1];
      if (favorite) activate(favorite.id, { hud: true });
      break;
    }
    case 'open': {
      if (state.settingsOpen) closeSettingsView({ force: true });
      if (command.id) activate(command.id);
      break;
    }
    case 'reload':
      reloadActive();
      break;
    case 'back':
      goBack();
      break;
    case 'forward':
      goForward();
      break;
    case 'address':
      focusAddress();
      break;
    case 'settings':
      openSettingsView({ add: Boolean(command.add) });
      break;
    case 'settings-close':
      closeSettingsView();
      break;
    default:
      break;
  }
}

function focusAddress() {
  const record = currentRecord();
  if (!record) {
    toast('先选择一个收藏页面');
    return;
  }
  updateTopbar();
  topbar.classList.add('reveal');
  address.focus();
  address.select();
  setTimeout(() => topbar.classList.remove('reveal'), 2400);
}

function onConfigChanged(config) {
  if (!config) return;
  state.config = config;
  state.favorites = config.favorites;
  state.settings = config.settings;

  for (const [id, record] of Array.from(state.pages.entries())) {
    if (!state.favorites.some((favorite) => favorite.id === id)) {
      destroyPage(id);
      continue;
    }
    const favorite = state.favorites.find((item) => item.id === id);
    if (favorite && record.baseUrl !== favorite.url) {
      record.baseUrl = favorite.url;
      record.error = null;
      if (record.ready) {
        try {
          record.wv.loadURL(favorite.url);
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (state.currentId && !state.favorites.some((favorite) => favorite.id === state.currentId)) {
    showHome();
  }

  applyRailMode();
  renderRail();
  renderHome();
  updateTopbar();
  evictPages();
  if (state.gridOpen) renderGrid();
}

function onDataCleared() {
  const previousId = state.currentId;
  destroyAllPages();
  state.thumbs.clear();
  state.favicons.clear();
  state.currentId = null;
  if (previousId) activate(previousId);
  else showHome();
  toast('已清除所有网站数据');
}

/* ------------------------------------------------------------------ */
/* Event binding                                                       */
/* ------------------------------------------------------------------ */

function bindEvents() {
  railTrigger.addEventListener('mouseenter', openRail);
  rail.addEventListener('mouseenter', openRail);
  rail.addEventListener('mouseleave', () => scheduleRailHide(380));

  railList.addEventListener('scroll', hideRailTip, { passive: true });

  $('#rail-brand').addEventListener('click', openGrid);
  $('#rail-add').addEventListener('click', () => openSettingsView({ add: true }));
  $('#rail-settings').addEventListener('click', () => openSettingsView());
  $('#rail-pin').addEventListener('click', async () => {
    const next = !state.settings.railPinned;
    state.settings.railPinned = next;
    applyRailMode();
    renderRail();
    const updated = await api.updateSettings({ railPinned: next });
    if (updated) onConfigChanged(updated);
  });

  btnBack.addEventListener('click', goBack);
  btnForward.addEventListener('click', goForward);
  btnReload.addEventListener('click', reloadActive);
  $('#btn-grid').addEventListener('click', openGrid);
  $('#btn-settings').addEventListener('click', () => openSettingsView());

  addressForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = normalizeInput(address.value);
    if (!url) {
      toast('网址格式不正确');
      return;
    }
    const record = currentRecord();
    if (!record) {
      toast('先选择一个收藏页面');
      return;
    }
    try {
      if (record.ready) record.wv.loadURL(url);
      else record.wv.setAttribute('src', url);
      record.url = url;
      address.blur();
      updateTopbar();
      setTimeout(focusPage, 60);
    } catch {
      toast('无法打开该网址');
    }
  });

  address.addEventListener('focus', () => {
    address.select();
  });

  address.addEventListener('blur', () => {
    updateTopbar();
  });

  address.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      address.blur();
      updateTopbar();
      focusPage();
    }
  });

  homePrimary.addEventListener('click', () => {
    if (!state.favorites.length) openSettingsView({ add: true });
    else openGrid();
  });
  homeSecondary.addEventListener('click', () => openSettingsView({ add: true }));

  $('#err-retry').addEventListener('click', reloadActive);

  gridSearch.addEventListener('input', () => {
    state.gridIndex = 0;
    renderGrid();
  });

  gridSearch.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveGridSelection(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveGridSelection(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openGridItem(state.gridIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeGrid();
    }
  });

  gridItems.addEventListener('click', (event) => {
    if (event.target === gridItems) closeGrid();
  });

  gridOverlay.addEventListener('click', (event) => {
    if (event.target === gridOverlay) closeGrid();
  });

  document.addEventListener('keydown', (event) => {
    if (state.settingsOpen) return;
    if (event.key !== 'Escape') return;
    if (state.gridOpen) {
      event.preventDefault();
      closeGrid();
      return;
    }
    if (rail.classList.contains('open') && !state.settings.railPinned) {
      rail.classList.remove('open');
      hideRailTip();
      return;
    }
    if (document.activeElement === address) {
      address.blur();
      updateTopbar();
      focusPage();
    }
  });

  window.addEventListener('blur', hideRailTip);
}

boot().catch((error) => {
  console.error('[boot]', error);
  toast('启动失败，请查看控制台');
});
})();
