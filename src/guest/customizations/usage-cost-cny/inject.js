(() => {
  if (window.__aimonUsageCostCnyInstalled) return;
  window.__aimonUsageCostCnyInstalled = true;

  const format = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let row;
  let amountText;

  function ensure() {
    if (/^\/usage\/?$/.test(location.pathname)) {
      for (const title of document.querySelectorAll('.card p')) {
        if (!/^(总消费|Total Cost)$/i.test(title.textContent.trim())) continue;

        // The actual total is between the card title and the standard-cost row.
        const total = title.nextElementSibling;
        const standard = total?.nextElementSibling;
        if (!standard || !/^(标准|Standard)(?=\s|[:：]|$)/i.test(standard.textContent.trim())) continue;

        const match = total.textContent.trim().match(/^[$¥￥]\s*(-?[\d,]+(?:\.\d+)?)$/);
        const amount = match ? Number(match[1].replace(/,/g, '')) : NaN;
        if (!Number.isFinite(amount)) continue;

        if (!row) {
          row = document.createElement('p');
          row.setAttribute('data-aimon-usage-cost-cny', '');
          row.style.overflowWrap = 'anywhere';
          amountText = document.createElement('span');
          amountText.style.color = '#dc2626';
          row.append('换算 ', amountText, ' =$total/2.5');
        }
        if (row.className !== standard.className) row.className = standard.className;
        const text = `￥${format.format(amount / 2.5)}`;
        if (amountText.textContent !== text) amountText.textContent = text;
        if (standard.nextElementSibling !== row) standard.after(row);
        return;
      }
    }
    row?.remove();
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
    characterData: true,
    subtree: true,
  });
  window.addEventListener('popstate', schedule);
  ensure();
})();
