// Injected into the usage pages (New API dashboards and TigerClaw).
// The filter card whose first field is "API 密钥" sits between the charts and
// the usage records table, pushing the records further down. Move that card
// below the table (and its pagination bar) so the records stay near the top.
// The card is Vue-rendered, so the placement is re-applied whenever the page
// re-renders. Host matching lives in index.js; this file only handles the DOM.
(() => {
  if (window.__aimonUsageFilterBottomInstalled) return;
  window.__aimonUsageFilterBottomInstalled = true;

  const MARK = 'data-aimon-usage-filter-bottom';
  const CHART_TITLES = ['模型分布', '分组使用分布', '端点分布', 'Token 使用趋势'];
  const API_KEY_LABEL = /^(API\s*密钥|API\s*Keys?)$/i;
  const PAGINATION_TEXT = /共\s*[\d,]+\s*条结果|上一页|下一页/;

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  // The filter card is the one holding the "API 密钥" form field. The sidebar
  // entry and the table column use the same text but are not labels inside a
  // card, so matching on the label keeps them out.
  function filterCard() {
    for (const label of document.querySelectorAll('main label')) {
      if (!API_KEY_LABEL.test(textOf(label))) continue;
      const card = label.closest('.card');
      if (card) return card;
    }
    return null;
  }

  function chartCards() {
    const cards = [];
    const headings = document.querySelectorAll(
      'main h1, main h2, main h3, main h4, main h5'
    );
    for (const heading of headings) {
      if (!CHART_TITLES.includes(textOf(heading))) continue;
      const card = heading.closest('.card');
      if (card) cards.push(card);
    }
    return cards;
  }

  function recordsTable() {
    const charts = chartCards();
    const tables = document.querySelectorAll('main table');
    let best = null;
    for (const table of tables) {
      if (charts.some((card) => card.contains(table))) continue;
      if (!best || table.rows.length > best.rows.length) best = table;
    }
    return best;
  }

  // The table block ends with its pagination bar, which is rendered as a
  // sibling after the table card. Charts already moved below the table are
  // ignored so this never anchors onto them.
  function tableBlockEnd(tableCard, charts) {
    let anchor = tableCard;
    let sibling = tableCard.nextElementSibling;
    while (sibling) {
      if (charts.some((card) => card === sibling || sibling.contains(card))) break;
      if (!PAGINATION_TEXT.test(textOf(sibling))) break;
      anchor = sibling;
      sibling = sibling.nextElementSibling;
    }
    return anchor;
  }

  function ensure() {
    if (!/^\/usage\/?$/.test(location.pathname)) return;

    const filter = filterCard();
    if (!filter) return;

    const table = recordsTable();
    const tableCard = table && table.closest('.card');
    if (!tableCard || !tableCard.parentElement) return;

    const root = tableCard.parentElement;
    if (filter.parentElement !== root) return;

    const anchor = tableBlockEnd(tableCard, chartCards());
    filter.setAttribute(MARK, '');
    if (filter.previousElementSibling !== anchor) anchor.after(filter);
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
