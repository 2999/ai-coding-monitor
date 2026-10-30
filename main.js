// AI Coding Monitor - Electron main process
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  shell,
  session,
  dialog,
  screen,
  webContents,
  nativeTheme,
} = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');

// Match the domain itself and any subdomain of it.
const HEADER_REFRESH_DOMAINS = ['ap-sub.top', 'svips.org'];

function isHeaderRefreshHost(hostname) {
  return HEADER_REFRESH_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

const HEADER_REFRESH_SCRIPT = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, 'src', 'guest', 'header-refresh.js'), 'utf8');
  } catch {
    return '';
  }
})();

const PARTITION = config.PARTITION;
const CHROME_VERSION = process.versions.chrome || '150.0.0.0';
const CHROME_MAJOR = CHROME_VERSION.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
app.userAgentFallback = CHROME_UA;

app.setName('AI Coding Monitor');

// Keep embedded pages in Chinese by default, regardless of the system UI language.
const ACCEPT_LANGUAGES = 'zh-CN,zh;q=0.9,en;q=0.8';
app.commandLine.appendSwitch('lang', 'zh-CN');
app.commandLine.appendSwitch('accept-lang', ACCEPT_LANGUAGES);

let mainWindow = null;
let settingsOpen = false;
let tray = null;
let isQuitting = false;

function preloadPath() {
  return path.join(__dirname, 'preload.js');
}

function rendererPath(file) {
  return path.join(__dirname, 'src', 'renderer', file);
}

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

function clampBounds(raw) {
  const primary = screen.getPrimaryDisplay().workArea;
  let width = Math.min(raw.width || 1280, primary.width - 40);
  let height = Math.min(raw.height || 860, primary.height - 40);

  if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
    let best = null;
    let bestArea = 0;
    for (const display of screen.getAllDisplays()) {
      const area = display.workArea;
      const overlapX = Math.min(raw.x + width, area.x + area.width) - Math.max(raw.x, area.x);
      const overlapY = Math.min(raw.y + height, area.y + area.height) - Math.max(raw.y, area.y);
      const overlap = Math.max(0, overlapX) * Math.max(0, overlapY);
      if (overlap > bestArea) {
        bestArea = overlap;
        best = area;
      }
    }
    if (best) {
      width = Math.min(width, best.width);
      height = Math.min(height, best.height);
      let x = Math.max(raw.x, best.x);
      let y = Math.max(raw.y, best.y);
      if (x + width > best.x + best.width) x = best.x + best.width - width;
      if (y + height > best.y + best.height) y = best.y + best.height - height;
      return { x, y, width, height };
    }
  }

  return { width, height };
}

function createMainWindow() {
  const saved = config.get().window || {};
  const windowBounds = clampBounds(saved);

  mainWindow = new BrowserWindow({
    ...windowBounds,
    minWidth: 780,
    minHeight: 540,
    show: false,
    title: 'AI Coding Monitor',
    backgroundColor: '#f5f6fa',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 13 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: true,
    },
  });

  mainWindow.loadFile(rendererPath('index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    settingsOpen = false;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    config.setWindow(mainWindow.getBounds());
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    handleKey(mainWindow, event, input);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isFullScreen()) return;
    config.setWindow(mainWindow.getBounds());
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('show', () => {
    mainWindow.webContents.send('window:shown');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

function sendCommand(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();

  const deliver = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('command', Object.assign({ type }, payload));
  };

  // A window that was just created (e.g. from the tray) may still be loading.
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', deliver);
  } else {
    deliver();
  }
}

/* ------------------------------------------------------------------ */
/* Keyboard shortcuts (works while page webviews have focus too)      */
/* ------------------------------------------------------------------ */

function handleKey(window, event, input) {
  if (input.type !== 'keyDown') return;

  const key = input.key;
  const lower = key.toLowerCase();
  const cmd = input.meta;
  const ctrl = input.control;
  const shift = input.shift;
  const alt = input.alt;

  const emit = (command) => {
    event.preventDefault();
    if (settingsOpen && command.type !== 'settings' && command.type !== 'settings-close') return;
    if (window === mainWindow) {
      sendCommand(command.type, command);
    }
  };

  // Grid overview
  if (cmd && shift && key === ' ') return emit({ type: 'grid' });

  // Direct switch Cmd+1..9
  if (cmd && !shift && !ctrl && !alt && /^[1-9]$/.test(key)) {
    return emit({ type: 'index', index: Number(key) });
  }

  // Cycle pages: Ctrl+Tab / Ctrl+Shift+Tab
  if (ctrl && !cmd && lower === 'tab') {
    return emit({ type: 'cycle', dir: shift ? -1 : 1 });
  }

  // Cycle pages: Cmd+Shift+[ / ]
  if (cmd && shift && (key === '[' || key === '{')) return emit({ type: 'cycle', dir: -1 });
  if (cmd && shift && (key === ']' || key === '}')) return emit({ type: 'cycle', dir: 1 });

  // History
  if (cmd && !shift && key === '[') return emit({ type: 'back' });
  if (cmd && !shift && key === ']') return emit({ type: 'forward' });

  // Address bar
  if (cmd && !shift && !alt && lower === 'l') return emit({ type: 'address' });

  // Reload page
  if (cmd && !shift && !alt && lower === 'r') return emit({ type: 'reload' });

  // Settings
  if (cmd && key === ',') return emit({ type: 'settings' });

  // Close settings first; otherwise hide the window.
  if (cmd && !shift && !alt && lower === 'w') {
    event.preventDefault();
    if (settingsOpen) sendCommand('settings-close');
    else hideMainWindow();
    return;
  }
}

/* ------------------------------------------------------------------ */
/* Guest web contents: UA, popups, navigation, shortcuts               */
/* ------------------------------------------------------------------ */

const AUTH_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
  'github.com',
  'auth0.com',
  'okta.com',
  'id.atlassian.com',
  'discord.com',
  'slack.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'open.weixin.qq.com',
  'login.taobao.com',
  'auth.alipay.com',
  'auth.openai.com',
  'account.anthropic.com',
];

function isAuthUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (AUTH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
    return /oauth|authorize|signin|sign-in|login|sso|auth/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function installHeaderRefresh(contents) {
  if (!HEADER_REFRESH_SCRIPT) return;
  try {
    if (!isHeaderRefreshHost(new URL(contents.getURL()).hostname)) return;
  } catch {
    return;
  }
  contents.executeJavaScript(HEADER_REFRESH_SCRIPT).catch(() => {});
}

function handleGuestPopup(guest, url, disposition) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { action: 'deny' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    if (parsed.protocol === 'mailto:') shell.openExternal(url);
    return { action: 'deny' };
  }

  // Keep OAuth / login popups inside a real window so window.opener works.
  if (isAuthUrl(url) || disposition === 'new-window') {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 540,
        height: 740,
        title: '登录',
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          partition: PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    };
  }

  shell.openExternal(url);
  return { action: 'deny' };
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setUserAgent(CHROME_UA);
    contents.on('dom-ready', () => installHeaderRefresh(contents));
    contents.on('did-navigate-in-page', () => installHeaderRefresh(contents));
    contents.on('before-input-event', (event, input) => {
      handleKey(mainWindow, event, input);
    });
    contents.setWindowOpenHandler(({ url, disposition }) => {
      return handleGuestPopup(contents, url, disposition);
    });
    contents.on('will-navigate', (event, url) => {
      if (!/^https?:/i.test(url)) {
        event.preventDefault();
        if (/^mailto:/i.test(url)) shell.openExternal(url);
      }
    });
    contents.on('context-menu', (_e, params) => {
      const template = [];
      if (params.linkURL) {
        template.push({
          label: '在默认浏览器中打开链接',
          click: () => shell.openExternal(params.linkURL),
        });
        template.push({ type: 'separator' });
      }
      if (params.isEditable) {
        template.push({ role: 'cut', label: '剪切' });
        template.push({ role: 'copy', label: '复制' });
        template.push({ role: 'paste', label: '粘贴' });
        template.push({ role: 'selectAll', label: '全选' });
        template.push({ type: 'separator' });
      } else if (params.selectionText) {
        template.push({ role: 'copy', label: '复制' });
        template.push({ type: 'separator' });
      }
      template.push({
        label: '重新加载',
        click: () => contents.reload(),
      });
      template.push({
        label: '检查元素',
        click: () => contents.inspectElement(params.x, params.y),
      });
      Menu.buildFromTemplate(template).popup();
    });
  }
});

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function broadcastConfig() {
  const payload = config.get();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('config:changed', payload);
  }
  refreshTrayMenu();
}

ipcMain.handle('config:get', () => config.get());

ipcMain.handle('favorites:save', (_event, favorites) => {
  const updated = config.saveFavorites(favorites);
  broadcastConfig();
  return updated;
});

ipcMain.handle('settings:update', (_event, patch) => {
  const updated = config.updateSettings(patch);
  broadcastConfig();
  return updated;
});

ipcMain.handle('state:active', (_event, id) => {
  config.setActive(id);
  refreshTrayMenu();
  return true;
});

ipcMain.handle('settings:open', (_event, options) => {
  sendCommand('settings', { add: Boolean(options && options.add) });
  return true;
});

ipcMain.handle('settings:state', (_event, open) => {
  settingsOpen = Boolean(open);
  return true;
});

ipcMain.handle('page:open', (_event, id) => {
  if (!mainWindow || mainWindow.isDestroyed() || !id) return false;
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  mainWindow.webContents.send('command', { type: 'open', id });
  return true;
});

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
  return true;
});

ipcMain.handle('window:title', (_event, title) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(title ? `${title} — AI Coding Monitor` : 'AI Coding Monitor');
  }
  return true;
});

ipcMain.handle('page:thumb', async (_event, guestId) => {
  const contents = webContents.fromId(Number(guestId));
  if (!contents || contents.isDestroyed()) return null;
  try {
    const image = await contents.capturePage();
    if (!image || image.isEmpty()) return null;
    const resized = image.resize({ width: 560, quality: 'good' });
    return resized.toDataURL();
  } catch {
    return null;
  }
});

ipcMain.handle('url:normalize', (_event, input) => config.normalizeUrl(input));

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  configPath: config.getPath(),
  partition: PARTITION,
  bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null,
}));

ipcMain.handle('data:clear', async () => {
  try {
    const ses = session.fromPartition(PARTITION);
    await ses.clearStorageData();
    await ses.clearCache();
  } catch (error) {
    console.error('[data:clear]', error);
    return { ok: false, error: String(error) };
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('data:cleared');
  }
  return { ok: true };
});

ipcMain.handle('favorites:export', async () => {
  const state = config.get();
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: '导出收藏',
    defaultPath: path.join(app.getPath('downloads'), 'ai-coding-monitor-favorites.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(
      result.filePath,
      JSON.stringify({ favorites: state.favorites, settings: state.settings }, null, 2)
    );
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('favorites:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: '导入收藏',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  try {
    const payload = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const merged = config.importFavorites(payload);
    broadcastConfig();
    return { ok: true, added: merged.added };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

/* ------------------------------------------------------------------ */
/* Menu & tray                                                         */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const template = [
    {
      label: 'AI Coding Monitor',
      submenu: [
        { role: 'about', label: '关于 AI Coding Monitor' },
        { type: 'separator' },
        {
          label: '设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendCommand('settings'),
        },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 AI Coding Monitor' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        {
          label: '退出 AI Coding Monitor',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '显示',
      submenu: [
        {
          label: '页面总览（⌘⇧Space）',
          click: () => sendCommand('grid'),
        },
        {
          label: '显示 / 隐藏窗口',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            if (mainWindow && mainWindow.isVisible()) hideMainWindow();
            else showMainWindow();
          },
        },
        { type: 'separator' },
        {
          label: '重新加载当前页面（⌘R）',
          click: () => sendCommand('reload'),
        },
        { role: 'togglefullscreen', label: '切换全屏' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openFavoriteFromTray(id) {
  if (!id) return;
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  sendCommand('open', { id });
}

function favoriteMenuItems() {
  const { favorites, lastActiveId } = config.get();
  if (!favorites.length) {
    return [{ label: '还没有收藏页面', enabled: false }];
  }

  return favorites.map((favorite, index) => ({
    label: `${favorite.id === lastActiveId ? '✓ ' : ''}${favorite.name}${
      index < 9 ? `   ⌘${index + 1}` : ''
    }`,
    sublabel: favorite.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    click: () => openFavoriteFromTray(favorite.id),
  }));
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...favoriteMenuItems(),
      { type: 'separator' },
      { label: '页面总览…', click: () => sendCommand('grid') },
      { label: '显示主窗口', click: showMainWindow },
      { label: '设置…', click: () => sendCommand('settings') },
      { type: 'separator' },
      { label: '退出 AI Coding Monitor', click: () => app.quit() },
    ])
  );
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;
  image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip('AI Coding Monitor');
  refreshTrayMenu();
}

/* ------------------------------------------------------------------ */
/* App lifecycle                                                       */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'light';
    config.get();

    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(CHROME_UA, ACCEPT_LANGUAGES);
    const allowedPermissions = new Set([
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'media',
      'fullscreen',
      'geolocation',
    ]);
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(allowedPermissions.has(permission));
    });
    ses.setPermissionCheckHandler((_wc, permission) => allowedPermissions.has(permission));

    if (process.platform === 'darwin' && app.dock) {
      const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
      if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
    }

    buildMenu();
    createMainWindow();
    createTray();

    app.on('activate', () => showMainWindow());
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // Keep running in the menu bar; quit only via Cmd+Q / tray menu.
  });
}
