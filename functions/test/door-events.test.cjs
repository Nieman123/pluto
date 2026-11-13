const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDraft, publicEvent, cart } = require('../lib/ticketing/domain');
const { doorPriceLabel } = require('../lib/ticketing/admission');
const { activeAppEventCards } = require('../lib/ticketing/event-discovery');
const { followupEventSelling } = require('../lib/ticketing/checkout-followup');
const { fixture } = require('./ticketing-fixture.cjs');

function doorDraft() {
  return { ...fixture(), registrationMode: 'door', doorPrice: 500, admissionNotes: 'Cash only.\nAdmission handled by the venue.',
    venueVisibility: 'public', offers: [], pools: [], promos: [] };
}

test('door listings validate the price and notes, require public directions, and disable registration', () => {
  const draft = validateDraft({ ...doorDraft(), waitlistEnabled: true, venueRevealScheduled: true });
  assert.equal(draft.doorPrice, 500);
  assert.equal(draft.admissionNotes, doorDraft().admissionNotes);
  assert.equal(draft.waitlistEnabled, false);
  assert.equal(draft.venueRevealScheduled, false);
  assert.equal(publicEvent('door-event', draft, 'published', 1).address, draft.address);
  for (const doorPrice of [undefined, null, '', '500', 0, -1, 5.5, NaN, Infinity, 1000001]) {
    assert.throws(() => validateDraft({ ...doorDraft(), doorPrice }), /door price/);
  }
  assert.throws(() => validateDraft({ ...doorDraft(), admissionNotes: 'x'.repeat(1001) }), /admission notes/);
  assert.throws(() => validateDraft({ ...doorDraft(), venueVisibility: 'holders' }), /public venue/);
  assert.throws(() => validateDraft({ ...fixture(), registrationMode: 'door', doorPrice: 500 }), /Deactivate ticket/);
  // Even stale inventory cannot bypass the event's admission mode.
  assert.throws(() => cart({ ...fixture(true), registrationMode: 'door' }, [{ offerId: 'weekend', quantity: 1 }]), /does not offer online/);
  assert.equal(followupEventSelling({ ...fixture(true), registrationMode: 'door' }, 'published', {}, Date.now()), false);
  const free = validateDraft({ ...doorDraft(), registrationMode: 'free' });
  assert.equal(free.doorPrice, 0); assert.equal(free.admissionNotes, '');
});

test('published app cards carry the door price and notes, with whole and fractional dollar labels', () => {
  const draft = validateDraft(doorDraft()), event = publicEvent('door-event', draft, 'published', 1);
  const [card] = activeAppEventCards([event], [], 'https://pluto.example');
  assert.equal(card.registrationMode, 'door'); assert.equal(card.doorPrice, 500);
  assert.equal(card.admissionNotes, draft.admissionNotes);
  assert.equal(doorPriceLabel(500), '$5'); assert.equal(doorPriceLabel(750), '$7.50');
});
