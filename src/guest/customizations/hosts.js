// Hosts of the New API dashboards this app applies page customizations to.
const HOSTS = ['ap-sub.top', 'svips.org'];

function matchesHost(hostname) {
  return HOSTS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

module.exports = { HOSTS, matchesHost };
