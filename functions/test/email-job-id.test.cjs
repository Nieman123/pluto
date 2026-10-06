const test = require('node:test'), assert = require('node:assert/strict');
const { emailJobId, hash, id } = require('../lib/ticketing/domain');

test('email job identifiers accept existing campaign IDs without widening event identifiers', () => {
  const job = `campaign_${hash('campaign')}_${hash('recipient@example.test')}`;
  assert.equal(job.length, 138);
  assert.equal(emailJobId(job), job);
  assert.equal(emailJobId(`receipt_${hash('order')}`), `receipt_${hash('order')}`);
  assert.throws(() => id(job), /Check identifier/);
  for (const invalid of ['', null, 'a'.repeat(201), '../jobs', 'jobs/child', 'a.b', 'a\nb'])
    assert.throws(() => emailJobId(invalid), /email job identifier/);
});
