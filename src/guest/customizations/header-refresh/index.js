const fs = require('fs');
const path = require('path');
const { matchesHost } = require('../hosts');

module.exports = {
  id: 'header-refresh',
  matches(url) {
    return matchesHost(url.hostname);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
