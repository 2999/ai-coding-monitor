const fs = require('fs');
const path = require('path');
const { isCodexHost } = require('../hosts');

module.exports = {
  id: 'usage-cost-cny',
  matches(url) {
    return isCodexHost(url.hostname) && /^\/usage\/?$/.test(url.pathname);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
