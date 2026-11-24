// Registry of page customizations injected into guest webviews.
// Each customization owns its matching rules and page script; the main
// process does not need to know about individual sites or pages.
const customizations = [
  require('./header-refresh'),
  require('./status-columns'),
  require('./sidebar-order'),
  require('./usage-cost-cny'),
  require('./usage-filter-bottom'),
  require('./usage-time-range-today'),
  require('./usage-charts-bottom'),
];

function matching(url) {
  return customizations.filter((item) => {
    try {
      return item.matches(url);
    } catch {
      return false;
    }
  });
}

module.exports = { customizations, matching };
