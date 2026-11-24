// Injected into the usage pages (New API dashboards and TigerClaw).
// On every entry into the usage page, switch the time range picker from its
// default to "今天" (Today) and apply it, so the page shows today's usage right
// away. Entries include a full page load and in-app navigation from another
// page of the same site. The picker is Vue-rendered, so wait for it to appear
// and retry briefly. Once the user touches the picker themselves, stop
// interfering until the next entry. Host matching lives in index.js; this file
// only handles the page DOM.
(() => {
  if (window.__aimonUsageTimeRangeTodayInstalled) return;
  window.__aimonUsageTimeRangeTodayInstalled = true;

  const TODAY_LABELS = ['今天', 'Today'];
  const DEADLINE_MS = 15000;
  const ROUTE_POLL_MS = 500;

  let runToken = 0;
  let userCancelled = false;
  let lastPath = location.pathname;

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function isUsagePage() {
    return /^\/usage\/?$/.test(location.pathname);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function timeRangeTrigger() {
    for (const trigger of document.querySelectorAll('.date-picker-trigger')) {
      const card = trigger.closest('.card');
      if (card && textOf(card).includes('时间范围')) return trigger;
    }
    return null;
  }

  function isToday(trigger) {
    const value = trigger.querySelector('.date-picker-value');
    return !!value && TODAY_LABELS.includes(textOf(value));
  }

  // Only cancel when the interaction is with the time range picker itself;
  // clicks elsewhere on the page must not abort the initial selection.
  function onUserIntent(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('.date-picker-trigger, .date-picker-dropdown')) {
      userCancelled = true;
    }
  }

  async function selectToday(token) {
    const deadline = Date.now() + DEADLINE_MS;

    while (Date.now() < deadline) {
      if (token !== runToken || !isUsagePage() || userCancelled) return;

      const trigger = timeRangeTrigger();
      if (trigger) {
        if (isToday(trigger)) return;

        if (!trigger.classList.contains('date-picker-trigger-open')) trigger.click();

        // The dropdown is rendered after the click; wait for the preset.
        let preset = null;
        for (let i = 0; i < 10 && !preset; i++) {
          if (token !== runToken || userCancelled) return;
          preset = [...trigger.parentElement.querySelectorAll('.date-picker-preset')].find(
            (button) => TODAY_LABELS.includes(textOf(button))
          );
          if (!preset) await delay(50);
        }

        if (preset && token === runToken && !userCancelled) {
          preset.click();
          await delay(50);
          if (token !== runToken || userCancelled) return;
          // Presets only stage the selection; "应用" commits and refreshes.
          const apply = trigger.parentElement.querySelector('.date-picker-apply');
          if (apply) apply.click();
          await delay(600);

          const current = timeRangeTrigger();
          if (current && isToday(current)) return;
        }
      }

      await delay(250);
    }

    // Leave the picker closed if we could not apply the selection.
    if (token !== runToken) return;
    const trigger = timeRangeTrigger();
    if (trigger && trigger.classList.contains('date-picker-trigger-open')) trigger.click();
  }

  function enterUsagePage() {
    runToken += 1;
    userCancelled = false;
    selectToday(runToken);
  }

  // Vue Router changes the URL with history.pushState/replaceState, which does
  // not fire popstate, so poll the pathname as well.
  function checkRoute() {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;

    if (isUsagePage()) {
      enterUsagePage();
    } else {
      // Cancel an in-flight selection when leaving the page.
      runToken += 1;
    }
  }

  document.addEventListener('pointerdown', onUserIntent, true);
  document.addEventListener('keydown', onUserIntent, true);
  window.addEventListener('popstate', checkRoute);
  window.addEventListener('hashchange', checkRoute);
  setInterval(checkRoute, ROUTE_POLL_MS);

  if (isUsagePage()) enterUsagePage();
})();
