const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog } = require('../lib/ticketing/catalog');
const { fixture } = require('./ticketing-fixture.cjs');

function catalog(draft) {
  const transaction = new Error('Reached publication transaction');
  const service = new Catalog({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ draft, revision: 1 }) }) }) }),
    runTransaction: async () => { throw transaction; } });
  service.role = async () => {};
  return { service, transaction };
}

test('publishing identifies an earlier ticket window and formats both dates in the event timezone', async () => {
  const d = fixture();
  d.startAt = '2027-09-17T13:00:00.000Z'; d.endAt = '2027-09-19T20:56:00.000Z'; d.admissionStartsAt = '2027-09-17T11:56:00.000Z';
  d.offers = [{ ...d.offers[0], name: 'General admission', validFrom: '2026-10-11T12:56:00.392Z', validUntil: '2026-10-11T20:56:00.392Z' }];
  const { service } = catalog(d);
  await assert.rejects(service.publish('event', 'publish', 1, 'admin'), error => {
    assert.equal(error.status, 400);
    for (const value of ['General admission', 'Oct 11, 2026', '8:56 AM', 'Sep 17, 2027', '7:56 AM', 'America/New_York', 'Ticket types & passes', 'Admission valid from']) assert.ok(error.message.includes(value), value);
    return true;
  });
});

test('first admission before event start is valid when ticket windows are no earlier', async () => {
  const d = fixture();
  d.admissionStartsAt = new Date(Date.parse(d.startAt) - 3600000).toISOString();
  const { service, transaction } = catalog(d);
  await assert.rejects(service.publish('event', 'publish', 1, 'admin'), error => error === transaction);
});
