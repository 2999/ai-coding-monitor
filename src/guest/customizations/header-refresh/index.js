const fs = require('fs');
const path = require('path');
const { matchesHost, isCodexUsagePage } = require('../hosts');

module.exports = {
  id: 'header-refresh',
  matches(url) {
    return matchesHost(url.hostname) || isCodexUsagePage(url);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
