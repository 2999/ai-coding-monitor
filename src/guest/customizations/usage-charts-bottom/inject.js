// Injected into the usage pages (New API dashboards and TigerClaw).
// The analytics cards ("模型分布", "分组使用分布", "端点分布", "Token 使用趋势")
// sit above the usage records table, which pushes the records far down the
// page. Move those chart rows below the table (and its pagination) so the
// records are the first thing you see. The chart rows are Vue-rendered, so the
// placement is re-applied whenever the page re-renders.
// Host matching lives in index.js; this file only handles the page DOM.
(() => {
  if (window.__aimonUsageChartsBottomInstalled) return;
  window.__aimonUsageChartsBottomInstalled = true;

  const CHART_TITLES = ['模型分布', '分组使用分布', '端点分布', 'Token 使用趋势'];
  const PAGINATION_TEXT = /共\s*[\d,]+\s*条结果|上一页|下一页/;

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function findChartCard(title) {
    const headings = document.querySelectorAll(
      'main h1, main h2, main h3, main h4, main h5'
    );
    for (const heading of headings) {
      if (textOf(heading) !== title) continue;
      return heading.closest('.card');
    }
    return null;
  }

  // The chart cards live in grid rows (one row per pair of charts). Moving the
  // rows keeps the two-column layout the page already gives them.
  function chartRows() {
    const rows = [];
    for (const title of CHART_TITLES) {
      const card = findChartCard(title);
      if (!card || !card.parentElement) return null;
      rows.push(card.parentElement);
    }
    return [...new Set(rows)];
  }

  function recordsTable(excludeCards) {
    const tables = document.querySelectorAll('main table');
    let best = null;
    for (const table of tables) {
      if (excludeCards.some((card) => card.contains(table))) continue;
      if (!best || table.rows.length > best.rows.length) best = table;
    }
    return best;
  }

  function ensure() {
    if (!/^\/usage\/?$/.test(location.pathname)) return;

    const rows = chartRows();
    if (!rows || !rows.length) return;

    const chartCards = CHART_TITLES.map(findChartCard).filter(Boolean);
    const table = recordsTable(chartCards);
    const tableCard = table && table.closest('.card');
    if (!tableCard || !tableCard.parentElement) return;

    const root = tableCard.parentElement;

    // The table block ends with its pagination bar; put the charts after it.
    // Row nodes we already moved are skipped so we do not lock onto ourselves.
    const siblings = [...root.children];
    let anchor = tableCard;
    for (let i = siblings.indexOf(tableCard) + 1; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (rows.includes(sibling)) continue;
      if (PAGINATION_TEXT.test(textOf(sibling))) anchor = sibling;
    }

    const ordered = rows
      .slice()
      .sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );

    const placed = ordered.every(
      (row, index) =>
        row.parentElement === root &&
        row.previousElementSibling === (index === 0 ? anchor : ordered[index - 1])
    );
    if (placed) return;

    let ref = anchor;
    for (const row of ordered) {
      if (row.parentElement === root && row.previousElementSibling === ref) {
        ref = row;
        continue;
      }
      ref.after(row);
      ref = row;
    }
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
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  setInterval(ensure, 1000);
  ensure();
})();