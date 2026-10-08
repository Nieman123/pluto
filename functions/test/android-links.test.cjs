const test = require('node:test');
const assert = require('node:assert/strict');
const { androidLinkStatements } = require('../lib/android-links.js');
test('App Links publishes only the staging debug app certificate; production waits for Play signing', () => {
  const stage = androidLinkStatements('staging');
  assert.equal(stage[0].target.package_name, 'events.pluto.app.staging');
  assert.ok(stage[0].target.sha256_cert_fingerprints.length);
  assert.deepEqual(androidLinkStatements('production'), []);
  assert.deepEqual(androidLinkStatements('emulator'), []);
  assert.deepEqual(androidLinkStatements('unknown'), []);
});
