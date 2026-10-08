import config from './android-links-config.json';

// These are public app-signing certificate fingerprints, never signing keys.
// Production stays unassociated until its Google Play App Signing cert exists.
export function androidLinkStatements(environment: string) {
  if (environment !== 'staging' && environment !== 'production') return [];
  const app = config[environment];
  const expected = environment === 'staging' ? 'events.pluto.app.staging' : 'events.pluto.app';
  if (app.packageName !== expected || app.sha256.length > 16 ||
      app.sha256.some(value => !/^([A-F\d]{2}:){31}[A-F\d]{2}$/.test(value))) {
    throw new Error('Invalid Android App Links configuration.');
  }
  if (!app.sha256.length) return [];
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: {
    namespace: 'android_app', package_name: app.packageName, sha256_cert_fingerprints: app.sha256,
  } }];
}
