const packages = Object.freeze({
  'pluto-staging-92eb7.web.app': 'events.pluto.app.staging',
  'pluto.events': 'events.pluto.app',
});

// Chrome's user-tapped intent link opens the native app, or the same web app
// when it is not installed. Other browsers keep the regular HTTPS App Link.
export function appLaunchLink(href, { origin, userAgent }) {
  if (!/Android/i.test(userAgent) || !/Chrome\/\d+/i.test(userAgent)) return href;
  let url;
  try { url = new URL(href, origin); } catch { return href; }
  const packageName = packages[url.hostname];
  if (!packageName || url.origin !== origin || url.protocol !== 'https:' || url.port ||
      url.username || url.password || url.search || url.hash ||
      !['/app', '/app/'].includes(url.pathname)) return href;
  return `intent://${url.host}${url.pathname}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}

export function initAppLinks() {
  document.querySelectorAll('[data-open-app]').forEach(link => {
    link.href = appLaunchLink(link.getAttribute('href'), {
      origin: location.origin, userAgent: navigator.userAgent,
    });
  });
}
