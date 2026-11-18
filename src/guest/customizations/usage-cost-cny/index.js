const fs = require('fs');
const path = require('path');

module.exports = {
  id: 'usage-cost-cny',
  matches(url) {
    return url.origin === 'https://codex.aitoken521.com' && /^\/usage\/?$/.test(url.pathname);
  },
  script: fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8'),
};
