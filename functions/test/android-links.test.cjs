const test = require('node:test');
const assert = require('node:assert/strict');
const { androidLinkStatements } = require('../lib/android-links.js');
test('App Links keeps staging and production signing certificates isolated', () => {
  const stage = androidLinkStatements('staging');
  assert.equal(stage[0].target.package_name, 'events.pluto.app.staging');
  assert.ok(stage[0].target.sha256_cert_fingerprints.includes('85:54:E0:5A:9F:FB:A3:ED:29:42:67:1D:DC:6E:84:C8:A2:7A:F5:1C:B9:1F:3C:32:B9:F4:B3:28:D3:AF:72:9E'));
  assert.ok(stage[0].target.sha256_cert_fingerprints.includes('9F:B8:1F:84:FE:7C:F7:28:4F:82:D4:2C:6D:65:BA:F5:DF:E1:A8:00:08:6A:E2:E9:4D:AC:DC:13:96:5A:24:00'));
  const production = androidLinkStatements('production');
  assert.equal(production[0].target.package_name, 'events.pluto.app');
  assert.deepEqual(production[0].target.sha256_cert_fingerprints, ['E3:37:C2:CB:E0:77:CC:78:32:4F:B7:C1:01:BF:F4:B2:AF:B2:70:BE:8B:0E:3E:CA:2C:9D:1A:39:E4:72:94:99']);
  assert.ok(!production[0].target.sha256_cert_fingerprints.some(value => stage[0].target.sha256_cert_fingerprints.includes(value)));
  assert.deepEqual(androidLinkStatements('emulator'), []);
  assert.deepEqual(androidLinkStatements('unknown'), []);
});
