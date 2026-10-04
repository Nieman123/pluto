const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { validateDraft, publicEvent, cart, assertCapacity, csv, html } = require('../lib/ticketing/domain');
const { signTicket, readTicket } = require('../lib/ticketing/config');
const { fixture } = require('./ticketing-fixture.cjs');

test('public event projection omits private venue, promotions, capacity and Stripe tax internals', () => {
  const draft = validateDraft(fixture());
  const publicData = JSON.stringify(publicEvent('event', draft, 'published', 1));
  for (const value of ['Private secret venue', '123 Hidden Lane', 'Private directions', 'performanceLocationId', 'stripeTaxRateIds', 'promos', 'capacity']) assert.ok(!publicData.includes(value), value);
});
test('rich content drops executable markup and unsafe links', () => {
  const safe = html('<p>Good <strong>music</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">Bad</a><iframe src="evil"></iframe>');
  assert.match(safe, /<strong>music/); assert.doesNotMatch(safe, /script|onerror|iframe|javascript/);
});

test('legacy events stay ticketed and RSVP modes only allow free named admission passes', () => {
  assert.equal(validateDraft(fixture()).registrationMode, 'tickets');
  const draft = fixture(); draft.registrationMode = 'rsvp-approval';
  assert.throws(() => validateDraft(draft), /Active RSVP passes/);
  draft.offers = [{ ...draft.offers[0], unitAmount: 0, maxPerOrder: 1 }];
  assert.equal(validateDraft(draft).registrationMode, 'rsvp-approval');
  draft.registrationMode = 'rsvp'; assert.equal(validateDraft(draft).registrationMode, 'rsvp');
  draft.offers[0].kind = 'vehicle'; assert.throws(() => validateDraft(draft), /Active RSVP passes/);
  draft.registrationMode = 'forged'; assert.throws(() => validateDraft(draft), /valid registration type/);
});
test('day and weekend tickets share pools while vehicle passes can be purchased separately', () => {
  const d = validateDraft(fixture()); const result = cart(d, [{ offerId: 'weekend', quantity: 2 }, { offerId: 'vehicle', quantity: 1 }], '', Date.now());
  assert.deepEqual(result.consumption, { friday: 2, saturday: 2, vehicles: 1 }); assert.equal(result.total, 21000);
  assert.equal(cart(d, [{ offerId: 'vehicle', quantity: 1 }], '', Date.now()).total, 1000);
  d.offers[2].requiresOfferIds = ['weekend'];
  assert.deepEqual(cart(d, [{ offerId: 'vehicle', quantity: 1 }], '', Date.now()).consumption, { vehicles: 1 }, 'legacy offer prerequisites cannot block a standalone purchase');
  assert.throws(() => assertCapacity(result.consumption, { friday: { capacity: 2, sold: 1, held: 0 }, saturday: { capacity: 2, sold: 0, held: 0 }, vehicles: { capacity: 2, sold: 0, held: 0 } }), /not enough/);
});
test('fixed discounts allocate exact cents without making a small ticket negative', () => {
  const d = validateDraft(fixture()); d.offers[0].unitAmount = 1; d.promos[0].type = 'fixed'; d.promos[0].value = 2;
  const result = cart(d, [{ offerId: 'weekend', quantity: 3 }], 'SAVE', Date.now());
  assert.equal(result.total, 1); assert.equal(result.discount, 2); assert.ok(result.units.every(u => u.amount >= 0));
});
test('expired promotions and client price overrides do not change server prices', () => {
  const d = validateDraft(fixture()); assert.equal(cart(d, [{ offerId: 'weekend', quantity: 1, price: 1 }], '', Date.now()).total, 10000);
  d.promos[0].endsAt = new Date(Date.now() - 1).toISOString(); assert.throws(() => cart(d, [{ offerId: 'weekend', quantity: 1 }], 'SAVE'), /not available/);
});
test('signed QR payloads are tamper-resistant and expose no buyer information', () => {
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const qr = signTicket({ id: 'ticket', eventId: 'event', version: 1, validFrom: 'start', validUntil: 'end' }, key);
  assert.equal(readTicket(qr, key).id, 'ticket'); assert.throws(() => readTicket(qr.slice(0, -3) + 'xxx', key), /Invalid ticket/);
});
test('CSV protects formula-like buyer input and preserves quotes', () => { const output = csv([['=IMPORTXML("evil")', '"quoted"', 42]]); assert.match(output, /^"'=IMPORTXML/); assert.match(output, /""quoted""/); });
