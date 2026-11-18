// Injected into the New API dashboards (ap-sub.top / svips.org).
// The left sidebar lists "使用记录" first and "渠道状态" further down (either the
// built-in /monitor entry or a custom page such as /custom/status). Move
// "渠道状态" right after "使用记录" so usage numbers and channel status sit
// next to each other. The sidebar is a Vue-rendered list, so the order is
// re-applied whenever the page re-renders.
// Host matching lives in index.js; this file only handles the page DOM.
(() => {
  if (window.__aimonSidebarOrderInstalled) return;
  window.__aimonSidebarOrderInstalled = true;

  const USAGE_LABELS = ['使用记录', 'Usage', 'Usage Records', 'Usage Record'];
  const STATUS_LABELS = ['渠道状态', 'Channel Status'];
  const USAGE_PATH = '/usage';
  const STATUS_PATH = '/monitor';

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function pathOf(link) {
    const href = link.getAttribute('href');
    if (!href) return '';
    try {
      return new URL(href, document.baseURI).pathname.replace(/\/+$/, '') || '/';
    } catch {
      return '';
    }
  }

  function findLink(links, labels, targetPath) {
    const byLabel = links.find((link) => labels.includes(textOf(link)));
    if (byLabel) return byLabel;
    return links.find((link) => targetPath && pathOf(link) === targetPath) || null;
  }

  function ensure() {
    const root = document.querySelector('aside.sidebar') || document.querySelector('nav');
    if (!root) return;

    // Only the plain sidebar links: group headers and buttons are skipped.
    const links = Array.from(root.querySelectorAll('a'));
    if (links.length < 2) return;

    const usage = findLink(links, USAGE_LABELS, USAGE_PATH);
    const status = findLink(links, STATUS_LABELS, STATUS_PATH);
    if (!usage || !status) return;
    if (usage.parentElement !== status.parentElement) return;
    if (usage.nextElementSibling === status) return;

    usage.parentElement.insertBefore(status, usage.nextElementSibling);
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
