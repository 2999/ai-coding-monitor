const fs = require('fs');
const path = require('path');
const { matchesHost } = require('../hosts');

module.exports = {
  id: 'header-refresh',
  matches(url) {
    return matchesHost(url.hostname) ||
      (url.hostname === 'codex.aitoken521.com' && /^\/usage\/?$/.test(url.pathname));
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
