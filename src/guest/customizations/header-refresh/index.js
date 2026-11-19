const fs = require('fs');
const path = require('path');
const { matchesHost, isCodexHost } = require('../hosts');

module.exports = {
  id: 'header-refresh',
  matches(url) {
    return matchesHost(url.hostname) ||
      (isCodexHost(url.hostname) && /^\/usage\/?$/.test(url.pathname));
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
