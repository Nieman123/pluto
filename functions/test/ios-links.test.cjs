const test = require('node:test');
const assert = require('node:assert/strict');
const { iosLinkAssociation } = require('../lib/ios-links.js');

test('Universal Links are unassociated until the real Apple prefix is configured', () => {
  const config = {
    staging: { bundleId: 'events.pluto.app.staging', appIdentifierPrefix: '' },
    production: { bundleId: 'events.pluto.app', appIdentifierPrefix: '' },
  };
  for (const environment of ['staging', 'production', 'unknown']) {
    assert.deepEqual(iosLinkAssociation(environment, config), { applinks: { details: [] } });
  }
});

test('configured Apple prefix associates only the matching staging or production app', () => {
  assert.deepEqual(iosLinkAssociation('staging').applinks.details[0].appIDs,
    ['W9Z7U26894.events.pluto.app.staging']);
  assert.deepEqual(iosLinkAssociation('production').applinks.details[0].appIDs,
    ['W9Z7U26894.events.pluto.app']);
  assert.deepEqual(iosLinkAssociation('unknown'), { applinks: { details: [] } });
});

test('Universal Links isolate environments and limit routing to member screens', () => {
  const config = {
    staging: { bundleId: 'events.pluto.app.staging', appIdentifierPrefix: 'A1B2C3D4E5' },
    production: { bundleId: 'events.pluto.app', appIdentifierPrefix: 'A1B2C3D4E5' },
  };
  for (const environment of ['staging', 'production']) {
    const detail = iosLinkAssociation(environment, config).applinks.details[0];
    assert.deepEqual(detail.appIDs, [`A1B2C3D4E5.${config[environment].bundleId}`]);
    assert.deepEqual(detail.components.map(component => component['/']), ['/app', '/app/', '/app/tickets', '/app/profile']);
  }
  assert.throws(() => iosLinkAssociation('staging', { ...config, staging: config.production }), /Invalid/);
  assert.throws(() => iosLinkAssociation('production', { ...config, production: { ...config.production, appIdentifierPrefix: 'placeholder' } }), /Invalid/);
});
