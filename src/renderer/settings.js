/* Settings view (rendered inside the main window) */
(() => {
const api = window.api;

const $ = (selector, root = document) => root.querySelector(selector);

const listEl = $('#list');
const listCount = $('#list-count');
const editor = $('#editor');
const editorEmpty = $('#editor-empty');
const fName = $('#f-name');
const fUrl = $('#f-url');
const fIcon = $('#f-icon');
const fColor = $('#f-color');
const btnDelete = $('#btn-delete');
const btnSave = $('#btn-save');
const btnOpen = $('#btn-open');
const dirtyIndicator = $('#dirty-indicator');
const formError = $('#form-error');
const previewAvatar = $('#preview-avatar');
const previewName = $('#preview-name');
const previewUrl = $('#preview-url');
const toastEl = $('#s-toast');
const settingsView = $('#settings-view');

const DEFAULT_COLOR = '#4f6ef7';

const state = {
  config: null,
  favorites: [],
  selectedId: null,
  isNew: false,
  dirty: false,
  saving: false,
  toastTimer: 0,
  dragId: null,
  dropTarget: null,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function hostOf(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    return parsed.port ? `${host}:${parsed.port}` : host;
  } catch {
    return url || '';
  }
}

function normalizeInput(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
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

function genId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function randomColor() {
  return hslToHex(Math.floor(Math.random() * 360), 62, 46);
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2400);
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function hideError() {
  formError.hidden = true;
}

function avatarUrlFor(favorite) {
  if (favorite.icon) return favorite.icon;
  try {
    return `${new URL(favorite.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function renderAvatar(host, name, color, iconUrl) {
  host.innerHTML = '';
  const letter = () => {
    host.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
    span.style.background = color || DEFAULT_COLOR;
    host.appendChild(span);
  };
  if (!iconUrl) return letter();
  const img = document.createElement('img');
  img.alt = '';
  img.addEventListener('error', letter, { once: true });
  img.src = iconUrl;
  host.appendChild(img);
}

function currentFavorite() {
  return state.favorites.find((favorite) => favorite.id === state.selectedId) || null;
}

/* ------------------------------------------------------------------ */
/* View open / close                                                  */
/* ------------------------------------------------------------------ */

function isOpen() {
  return !settingsView.hidden;
}

function setOpenState(open) {
  settingsView.hidden = !open;
  document.body.classList.toggle('settings-open', open);
  if (open) {
    api.setWindowTitle('设置');
    window.dispatchEvent(new CustomEvent('aimon:settings-opened'));
  } else {
    window.dispatchEvent(new CustomEvent('aimon:settings-closed'));
  }
  if (api.setSettingsOpen) {
    try {
      const result = api.setSettingsOpen(open);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

async function refresh() {
  if (state.saving || state.dirty) return;
  const config = await api.getConfig();
  state.config = config;
  state.favorites = config.favorites;
  if (state.selectedId && !state.favorites.some((favorite) => favorite.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (!state.selectedId && state.favorites.length) {
    state.selectedId = state.favorites[0].id;
  }
  state.dirty = false;
  renderList();
  renderGeneral();
  if (state.selectedId) fillForm(currentFavorite());
  else hideEditor();
}

async function open(options = {}) {
  await bootPromise.catch(() => {});
  if (isOpen()) {
    if (options.add) startNew();
    else settingsView.focus({ preventScroll: true });
    return;
  }
  await refresh();
  setOpenState(true);
  if (options.add) {
    startNew();
  } else {
    requestAnimationFrame(() => settingsView.focus({ preventScroll: true }));
  }
}

let closing = false;

async function close(options = {}) {
  if (!isOpen() || closing) return true;
  if (!options.force && state.dirty) {
    const emptyNew = state.isNew && !fName.value.trim() && !normalizeInput(fUrl.value);
    if (emptyNew) {
      state.dirty = false;
      state.isNew = false;
    } else {
      const saved = await commit();
      if (!saved) return false;
    }
  }
  closing = true;
  setOpenState(false);
  closing = false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Render list                                                         */
/* ------------------------------------------------------------------ */

function renderList() {
  listEl.innerHTML = '';
  listCount.textContent = `${state.favorites.length} 个页面`;

  if (!state.favorites.length) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = '还没有收藏。点「新建」添加第一个页面。';
    listEl.appendChild(empty);
    return;
  }

  state.favorites.forEach((favorite, index) => {
    const li = document.createElement('li');
    li.className = `fav-item${favorite.id === state.selectedId ? ' on' : ''}`;
    li.dataset.id = favorite.id;
    li.draggable = true;

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.innerHTML = '<svg><use href="#i-grip" /></svg>';
    li.appendChild(grip);

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    renderAvatar(avatar, favorite.name, favorite.color, avatarUrlFor(favorite));
    li.appendChild(avatar);

    const text = document.createElement('span');
    text.className = 'fav-text';
    const name = document.createElement('span');
    name.className = 'fav-name';
    name.textContent = favorite.name;
    const host = document.createElement('span');
    host.className = 'fav-host';
    host.textContent = hostOf(favorite.url);
    text.appendChild(name);
    text.appendChild(host);
    li.appendChild(text);

    if (index < 9) {
      const key = document.createElement('span');
      key.className = 'fav-key';
      key.textContent = `⌘${index + 1}`;
      li.appendChild(key);
    }

    li.addEventListener('click', () => select(favorite.id));
    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragend', onDragEnd);
    li.addEventListener('dragover', onDragOver);
    li.addEventListener('dragleave', onDragLeave);
    li.addEventListener('drop', onDrop);

    listEl.appendChild(li);
  });
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function showEditor() {
  editor.hidden = false;
  editorEmpty.hidden = true;
}

function hideEditor() {
  editor.hidden = true;
  editorEmpty.hidden = false;
}

function fillForm(favorite) {
  showEditor();
  fName.value = favorite.name || '';
  fUrl.value = favorite.url || '';
  fIcon.value = favorite.icon || '';
  fColor.value = favorite.color || DEFAULT_COLOR;
  btnDelete.hidden = state.isNew;
  btnOpen.hidden = state.isNew;
  hideError();
  updatePreview();
  updateDirtyUi();
}

function updatePreview() {
  const name = fName.value.trim() || hostOf(normalizeInput(fUrl.value) || '') || '未命名';
  const icon = fIcon.value.trim() || (normalizeInput(fUrl.value) ? avatarUrlFor({ url: normalizeInput(fUrl.value), icon: '' }) : '');
  renderAvatar(previewAvatar, name, fColor.value || DEFAULT_COLOR, icon);
  previewName.textContent = name;
  previewUrl.textContent = fUrl.value.trim() || '尚未填写网址';
}

function updateDirtyUi() {
  dirtyIndicator.textContent = state.isNew ? '新建未保存' : state.dirty ? '未保存' : '已保存';
  dirtyIndicator.classList.toggle('changed', state.dirty || state.isNew);
  const url = normalizeInput(fUrl.value);
  btnSave.disabled = !url || (!state.dirty && !state.isNew);
  fUrl.classList.toggle('invalid', Boolean(fUrl.value.trim()) && !url);
}

function markDirty() {
  state.dirty = true;
  hideError();
  updatePreview();
  updateDirtyUi();
}

async function select(id) {
  if (state.dirty) {
    const saved = await commit();
    if (!saved) return;
  }
  const favorite = state.favorites.find((item) => item.id === id);
  if (!favorite) return;
  state.selectedId = id;
  state.isNew = false;
  state.dirty = false;
  fillForm(favorite);
  renderList();
}

function startNew() {
  if (state.isNew && !fUrl.value.trim()) {
    fName.focus();
    return;
  }
  if (state.dirty) {
    commit().then((saved) => {
      if (saved) startNew();
    });
    return;
  }
  state.selectedId = null;
  state.isNew = true;
  state.dirty = true;
  hideError();
  fillForm({ name: '', url: '', icon: '', color: randomColor() });
  btnDelete.hidden = true;
  btnOpen.hidden = true;
  updatePreview();
  updateDirtyUi();
  renderList();
  fName.focus();
}

async function commit() {
  const url = normalizeInput(fUrl.value);
  if (!url) {
    showError('请输入有效的网址，例如 https://github.com');
    fUrl.focus();
    return false;
  }
  const icon = fIcon.value.trim();
  if (icon && !/^https?:\/\//i.test(icon)) {
    showError('图标地址需要以 http:// 或 https:// 开头');
    fIcon.focus();
    return false;
  }

  const data = {
    name: fName.value.trim().slice(0, 40) || hostOf(url).slice(0, 40),
    url,
    icon,
    color: fColor.value || DEFAULT_COLOR,
  };

  let createdId = null;
  if (state.isNew) {
    const favorite = Object.assign({ id: genId(), createdAt: Date.now() }, data);
    state.favorites.push(favorite);
    state.selectedId = favorite.id;
    state.isNew = false;
    createdId = favorite.id;
    state.lastCreatedId = createdId;
  } else {
    const favorite = currentFavorite();
    if (!favorite) return false;
    Object.assign(favorite, data);
    state.lastCreatedId = null;
  }

  const ok = await persist();
  if (!ok) return false;

  state.dirty = false;
  const selected = currentFavorite();
  if (selected) fillForm(selected);
  renderList();
  return true;
}

async function persist() {
  state.saving = true;
  try {
    const updated = await api.saveFavorites(state.favorites);
    state.favorites = updated.favorites;
    state.config = updated;
    if (state.selectedId && !state.favorites.some((favorite) => favorite.id === state.selectedId)) {
      state.selectedId = null;
    }
    renderList();
    return true;
  } catch (error) {
    console.error(error);
    toast('保存失败');
    return false;
  } finally {
    state.saving = false;
  }
}

/* ------------------------------------------------------------------ */
/* Drag & drop reorder                                                 */
/* ------------------------------------------------------------------ */

function clearDropMarks() {
  listEl.querySelectorAll('.fav-item').forEach((item) => {
    item.classList.remove('drop-before', 'drop-after');
  });
}

function onDragStart(event) {
  state.dragId = this.dataset.id;
  this.classList.add('dragging');
  try {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.dragId);
  } catch {
    /* ignore */
  }
}

function onDragEnd() {
  this.classList.remove('dragging');
  clearDropMarks();
  state.dragId = null;
  state.dropTarget = null;
}

function onDragOver(event) {
  if (!state.dragId || this.dataset.id === state.dragId) return;
  event.preventDefault();
  const rect = this.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  clearDropMarks();
  this.classList.add(after ? 'drop-after' : 'drop-before');
  state.dropTarget = { id: this.dataset.id, after };
}

function onDragLeave() {
  this.classList.remove('drop-before', 'drop-after');
}

async function onDrop(event) {
  event.preventDefault();
  const target = state.dropTarget;
  const dragId = state.dragId;
  clearDropMarks();
  state.dragId = null;
  state.dropTarget = null;
  if (!target || !dragId || target.id === dragId) return;

  const from = state.favorites.findIndex((favorite) => favorite.id === dragId);
  if (from === -1) return;
  const [moved] = state.favorites.splice(from, 1);
  let to = state.favorites.findIndex((favorite) => favorite.id === target.id);
  if (to === -1) to = state.favorites.length;
  if (target.after) to += 1;
  state.favorites.splice(to, 0, moved);

  renderList();
  const ok = await persist();
  if (ok) toast('已更新顺序');
}

/* ------------------------------------------------------------------ */
/* General settings                                                    */
/* ------------------------------------------------------------------ */

function renderGeneral() {
  const settings = state.config.settings;
  const resident = $('#s-resident');
  const limit = Number(settings.residentLimit);
  resident.value = String(Number.isFinite(limit) ? Math.min(5, Math.max(0, Math.round(limit))) : 4);
  $('#s-startup').value = settings.openOnLaunch;
  $('#s-pinned').checked = Boolean(settings.railPinned);
}

async function updateSetting(patch) {
  const updated = await api.updateSettings(patch);
  if (updated) {
    state.config = updated;
    state.favorites = updated.favorites;
    renderGeneral();
    renderList();
  }
}

/* ------------------------------------------------------------------ */
/* External updates                                                    */
/* ------------------------------------------------------------------ */

function handleExternalConfig(config) {
  if (!config || state.saving || state.dirty) return;
  state.config = config;
  state.favorites = config.favorites;
  if (state.selectedId && !state.favorites.some((favorite) => favorite.id === state.selectedId)) {
    state.selectedId = null;
    hideEditor();
  }
  renderList();
  renderGeneral();
  if (state.selectedId) {
    const favorite = currentFavorite();
    if (favorite && document.activeElement === document.body) fillForm(favorite);
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  $('#tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    const tab = button.dataset.tab;
    $('#tabs').querySelectorAll('button').forEach((item) => item.classList.toggle('on', item === button));
    document.querySelectorAll('.pane').forEach((pane) => {
      pane.classList.toggle('on', pane.id === `pane-${tab}`);
    });
  });

  $('#btn-new').addEventListener('click', startNew);

  fName.addEventListener('input', markDirty);
  fUrl.addEventListener('input', markDirty);
  fIcon.addEventListener('input', markDirty);
  fColor.addEventListener('input', markDirty);

  fColor.addEventListener('change', updatePreview);

  $('#btn-random-color').addEventListener('click', () => {
    fColor.value = randomColor();
    markDirty();
  });

  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    const wasNew = state.isNew;
    const ok = await commit();
    if (!ok) return;
    toast(wasNew ? '已添加收藏' : '已保存');
    if (wasNew && state.lastCreatedId) {
      api.openPage(state.lastCreatedId);
    }
    hideError();
  });

  btnDelete.addEventListener('click', async () => {
    const favorite = currentFavorite();
    if (!favorite) return;
    if (!window.confirm(`删除「${favorite.name}」？`)) return;
    const index = state.favorites.findIndex((item) => item.id === favorite.id);
    state.favorites.splice(index, 1);
    state.selectedId = null;
    state.isNew = false;
    state.dirty = false;
    const ok = await persist();
    if (!ok) return;
    if (state.favorites.length) {
      const next = state.favorites[Math.min(index, state.favorites.length - 1)];
      await select(next.id);
    } else {
      hideEditor();
    }
    toast('已删除');
  });

  btnOpen.addEventListener('click', async () => {
    if (state.isNew) return;
    if (state.dirty) {
      const saved = await commit();
      if (!saved) return;
    }
    if (state.selectedId) api.openPage(state.selectedId);
  });

  $('#s-resident').addEventListener('change', (event) => {
    const input = event.target;
    if (input.value.trim() === '') {
      input.value = String(state.config.settings.residentLimit);
      return;
    }
    const raw = Number(input.value);
    const next = Number.isFinite(raw) ? Math.min(5, Math.max(0, Math.round(raw))) : 4;
    input.value = String(next);
    updateSetting({ residentLimit: next });
  });
  $('#s-startup').addEventListener('change', (event) => {
    updateSetting({ openOnLaunch: event.target.value });
  });
  $('#s-pinned').addEventListener('change', (event) => {
    updateSetting({ railPinned: event.target.checked });
  });

  $('#btn-clear').addEventListener('click', async () => {
    if (!window.confirm('确定清除所有收藏页面的 Cookie、登录状态与缓存吗？此操作不可撤销。')) return;
    const result = await api.clearData();
    toast(result && result.ok ? '已清除所有网站数据' : '清除失败');
  });

  $('#btn-export').addEventListener('click', async () => {
    const result = await api.exportFavorites();
    if (result && result.ok) toast('已导出收藏');
    else if (result && result.error) toast('导出失败');
  });

  $('#btn-import').addEventListener('click', async () => {
    const result = await api.importFavorites();
    if (result && result.ok) {
      toast(result.added ? `已导入 ${result.added} 个收藏` : '没有新的收藏可导入');
      const config = await api.getConfig();
      state.config = config;
      state.favorites = config.favorites;
      renderList();
      renderGeneral();
      if (state.favorites.length && !state.selectedId) select(state.favorites[0].id);
    } else if (result && result.error) {
      toast('导入失败，请检查文件格式');
    }
  });

  $('#s-close').addEventListener('click', () => close());

  document.addEventListener('keydown', (event) => {
    if (!isOpen() || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') {
      document.activeElement.blur();
    } else {
      close();
    }
  });

  api.onConfigChanged(handleExternalConfig);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  const [config, info] = await Promise.all([api.getConfig(), api.getAppInfo()]);
  state.config = config;
  state.favorites = config.favorites;

  renderList();
  renderGeneral();
  bindEvents();

  $('#data-path').textContent = info.configPath;
  $('#about').textContent = `AI Coding Monitor v${info.version} · 本地自用`;

  if (state.favorites.length) {
    state.selectedId = state.favorites[0].id;
    fillForm(currentFavorite());
    renderList();
  } else {
    hideEditor();
  }
}

const bootPromise = boot();
bootPromise.catch((error) => {
  console.error(error);
  toast('设置加载失败');
});

window.aimonSettings = { open, close, isOpen, startNew, focus: () => settingsView.focus({ preventScroll: true }) };
})();
