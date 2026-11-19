// Hosts of the New API dashboards this app applies page customizations to.
const HOSTS = ['ap-sub.top', 'svips.org'];

// The Codex gateways run the same TigerClaw service on two domains; the
// usage-page tweaks below apply to both.
const CODEX_HOSTS = ['codex.aitoken521.com', 'codex.svips.org'];

function matchesHost(hostname) {
  // The Codex gateways answer on *.svips.org too, but they are a different
  // service (TigerClaw): its pages never need the New API dashboard tweaks.
  if (isCodexHost(hostname)) return false;
  return HOSTS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function isCodexHost(hostname) {
  return CODEX_HOSTS.includes(hostname);
}

function isCodexUsagePage(url) {
  return isCodexHost(url.hostname) && /^\/usage\/?$/.test(url.pathname);
}

module.exports = {
  HOSTS,
  CODEX_HOSTS,
  matchesHost,
  isCodexHost,
  isCodexUsagePage,
};
