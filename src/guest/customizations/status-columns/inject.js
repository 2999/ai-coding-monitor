// Injected into the New API dashboards (ap-sub.top / svips.org).
// The "中转站渠道状态" table (/status/) lists "可用率趋势" as the last column.
// Move it right after "渠道" so the availability bar sits next to the channel
// name. /custom/status embeds /status/ in a same-origin iframe, so the table
// may live in the top document or in a child frame.
// Host/path matching lives in index.js; this file only handles the page DOM.
(() => {
  if (window.__aimonStatusColumnsInstalled) return;
  window.__aimonStatusColumnsInstalled = true;

  const CHANNEL = '渠道';
  const TREND = '可用率趋势';

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function reorderTable(table) {
    const head = table.tHead && table.tHead.rows[0];
    if (!head) return;

    const headers = Array.from(head.cells);
    const channelIndex = headers.findIndex((cell) => textOf(cell) === CHANNEL);
    if (channelIndex < 0) return;
    const trendIndex = headers.findIndex((cell) => textOf(cell) === TREND);
    if (trendIndex < 0) return;
    if (trendIndex === channelIndex + 1) return; // already moved

    for (const row of Array.from(table.rows)) {
      const cells = Array.from(row.cells);
      if (cells.length <= Math.max(channelIndex, trendIndex)) continue;

      const channelCell = cells[channelIndex];
      const trendCell = cells[trendIndex];
      if (!channelCell || !trendCell || channelCell === trendCell) continue;

      const rest = cells.filter((cell) => cell !== trendCell);
      const at = rest.indexOf(channelCell);
      if (at < 0) continue;
      rest.splice(at + 1, 0, trendCell);
      for (const cell of rest) row.appendChild(cell);
    }
  }

  function scanDocument(doc) {
    if (!doc) return;

    let tables;
    try {
      tables = doc.querySelectorAll('table');
    } catch {
      return;
    }
    for (const table of tables) reorderTable(table);

    let frames;
    try {
      frames = doc.querySelectorAll('iframe');
    } catch {
      return;
    }
    for (const frame of frames) {
      let inner = null;
      try {
        inner = frame.contentDocument;
      } catch {
        inner = null;
      }
      if (inner) scanDocument(inner);
    }
  }

  function ensure() {
    scanDocument(document);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensure();
    });
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('load', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  setInterval(ensure, 1000);
  ensure();
})();
