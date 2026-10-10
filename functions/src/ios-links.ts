import config from './ios-links-config.json';

type LinkConfig = typeof config;

// The prefix is public. Leave it empty until Apple's App ID prefix is confirmed.
export function iosLinkAssociation(environment: string, settings: LinkConfig = config) {
  if (environment !== 'staging' && environment !== 'production') return { applinks: { details: [] } };
  const app = settings[environment];
  const expected = environment === 'staging' ? 'events.pluto.app.staging' : 'events.pluto.app';
  if (app.bundleId !== expected || (app.appIdentifierPrefix && !/^[A-Z0-9]{10}$/.test(app.appIdentifierPrefix))) {
    throw new Error('Invalid iOS Universal Links configuration.');
  }
  if (!app.appIdentifierPrefix) return { applinks: { details: [] } };
  return { applinks: { details: [{
    appIDs: [`${app.appIdentifierPrefix}.${app.bundleId}`],
    components: ['/app', '/app/', '/app/tickets', '/app/profile'].map(path => ({ '/': path })),
  }] } };
}
