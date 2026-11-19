const fs = require('fs');
const path = require('path');
const { matchesHost, isCodexUsagePage } = require('../hosts');

const USAGE_PATH = /^\/usage\/?$/;

module.exports = {
  id: 'usage-charts-bottom',
  matches(url) {
    const onUsagePage = USAGE_PATH.test(url.pathname) && matchesHost(url.hostname);
    return onUsagePage || isCodexUsagePage(url);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};