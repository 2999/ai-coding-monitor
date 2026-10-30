// Injected into every page of the New API dashboards (ap-sub.top / svips.org).
// Adds a header refresh button left of the announcement icon. Clicking it
// triggers the page's own refresh button (the one left of "重置").
(() => {
  if (window.__aimonHeaderRefreshInstalled) return;
  window.__aimonHeaderRefreshInstalled = true;

  const DOMAINS = ['ap-sub.top', 'svips.org'];
  const MARK = 'data-aimon-header-refresh';
  const BTN_CLASS =
    'aimon-header-refresh flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700 shrink-0';

  function isTargetHost(hostname) {
    return DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    );
  }

  function onTargetPage() {
    return isTargetHost(location.hostname);
  }

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function findPageRefresh() {
    const buttons = [...document.querySelectorAll('button')].filter(
      (el) => !el.hasAttribute(MARK)
    );
    const resets = buttons.filter((el) => {
      const t = textOf(el);
      return t === '重置' || t === 'Reset';
    });

    // The page renders: [刷新] [重置] ... so the first sibling is the target.
    for (const reset of resets) {
      const prev = reset.previousElementSibling;
      if (!prev || prev.tagName !== 'BUTTON' || prev.hasAttribute(MARK)) continue;
      const t = textOf(prev);
      if (t === '刷新' || t === 'Refresh') return prev;
    }

    // Fallback for a different wrapper around the two buttons.
    for (const reset of resets) {
      const parent = reset.parentElement;
      if (!parent) continue;
      const found = [...parent.querySelectorAll('button')].find((el) => {
        if (el.hasAttribute(MARK)) return false;
        const t = textOf(el);
        return t === '刷新' || t === 'Refresh';
      });
      if (found) return found;
    }

    return null;
  }

  function makeButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.setAttribute(MARK, '1');
    btn.setAttribute('aria-label', '刷新');
    btn.title = '刷新';
    btn.innerHTML =
      '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12a7.5 7.5 0 0112.86-5.25L20.25 9.75M20.25 4.5v5.25H15M19.5 12a7.5 7.5 0 01-12.86 5.25L3.75 14.25M3.75 19.5v-5.25H9" />' +
      '</svg><span class="hidden sm:inline">刷新</span>';

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const icon = btn.querySelector('svg');
      if (icon && icon.animate) {
        icon.animate(
          [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
          { duration: 600, easing: 'ease-in-out' }
        );
      }

      // Prefer the dashboard's own refresh so its in-page state is kept;
      // otherwise reload the current route (URL, query and hash included).
      const target = findPageRefresh();
      if (target) target.click();
      else location.reload();
    });

    return btn;
  }

  function ensure() {
    const existing = document.querySelector(`[${MARK}]`);

    if (!onTargetPage()) {
      if (existing) existing.remove();
      return;
    }

    const ann = document.querySelector('button[aria-label="公告"]');
    if (!ann) return;

    const wrapper = ann.parentElement;
    const group = wrapper && wrapper.parentElement;
    if (!group) return;

    if (existing && existing.parentElement === group) return;
    if (existing) existing.remove();

    group.insertBefore(makeButton(), wrapper);
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
