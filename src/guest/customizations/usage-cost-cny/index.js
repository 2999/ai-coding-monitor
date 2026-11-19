const fs = require('fs');
const path = require('path');
const { isCodexUsagePage } = require('../hosts');

module.exports = {
  id: 'usage-cost-cny',
  matches(url) {
    return isCodexUsagePage(url);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
