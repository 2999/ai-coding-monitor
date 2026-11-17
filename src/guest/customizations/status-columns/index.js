const fs = require('fs');
const path = require('path');
const { matchesHost } = require('../hosts');

// The "中转站渠道状态" table lives on /status/ and is embedded by
// /custom/status inside a same-origin iframe.
const STATUS_PATHS = /^\/(?:custom\/status|status)(?:\/|$)/;

module.exports = {
  id: 'status-columns',
  matches(url) {
    return matchesHost(url.hostname) && STATUS_PATHS.test(url.pathname);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
