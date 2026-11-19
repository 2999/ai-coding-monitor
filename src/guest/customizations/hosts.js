// Hosts of the New API dashboards this app applies page customizations to.
const HOSTS = ['ap-sub.top', 'svips.org'];

// The Codex gateways run the same TigerClaw service on two domains; the
// usage-page tweaks below apply to both.
const CODEX_HOSTS = ['codex.aitoken521.com', 'codex.svips.org'];

function matchesHost(hostname) {
  return HOSTS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function isCodexHost(hostname) {
  return CODEX_HOSTS.includes(hostname);
}

module.exports = { HOSTS, CODEX_HOSTS, matchesHost, isCodexHost };
