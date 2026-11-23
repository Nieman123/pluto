// Firebase App Check for the website. reCAPTCHA Enterprise runs invisibly;
// there is no checkbox widget. Tokens prove requests come from this site.
const sdk = 'https://www.gstatic.com/firebasejs/12.1.0';
let appCheck;

// Customer actions the API protects (functions/src/ticketing/app-check.ts).
export const appCheckPaths = new Set(['checkout', 'rsvp', 'rsvp/verification', 'rsvp/upgrade/verification',
  'waitlist/verification', 'waitlist/join', 'recover', 'native-checkout/create', 'rewards/claim', 'rewards/redeem']);

function firebaseConfig() {
  try { return JSON.parse(document.querySelector('#firebase-config')?.textContent || '{}'); } catch { return {}; }
}

// One Firebase app per page, shared by the site and ticketing bundles.
export async function firebaseApp(config = firebaseConfig()) {
  const { getApp, getApps, initializeApp } = await import(`${sdk}/firebase-app.js`);
  return getApps().length ? getApp() : initializeApp(config);
}

function debugToken() {
  // Local development: register the token printed in the console under
  // App Check > Apps > Manage debug tokens, or store a registered token here.
  let saved = '';
  try { saved = localStorage.getItem('pluto-app-check-debug-token') || ''; } catch { /* storage can be blocked */ }
  if (saved) return saved;
  return ['localhost', '127.0.0.1'].includes(location.hostname) ? true : null;
}

export function initAppCheck() {
  if (appCheck) return appCheck;
  appCheck = (async () => {
    const config = firebaseConfig();
    if (!config.appCheckSiteKey) return null;
    const debug = debugToken();
    if (debug) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debug;
    const [app, sdkModule] = await Promise.all([firebaseApp(config), import(`${sdk}/firebase-app-check.js`)]);
    // Tokens are fetched on demand so each page view does not cost a reCAPTCHA assessment.
    return { sdk: sdkModule, instance: sdkModule.initializeAppCheck(app, { provider: new sdkModule.ReCaptchaEnterpriseProvider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: false }) };
  })().catch(error => { console.warn('App Check unavailable', error); return null; });
  return appCheck;
}

// Never blocks the request: the server decides whether a missing token matters.
export async function appCheckHeaders(path) {
  if (!appCheckPaths.has(path)) return {};
  try {
    const ready = await initAppCheck();
    if (!ready) return {};
    const { token } = await ready.sdk.getToken(ready.instance, false);
    return token ? { 'X-Firebase-AppCheck': token } : {};
  } catch (error) {
    console.warn('App Check token unavailable', error);
    return {};
  }
}
