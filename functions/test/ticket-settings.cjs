const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { harness } = require('./ticketing-harness.cjs');

test('dashboard saves update sales atomically without publishing Studio edits or changing existing orders', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.offers = [d.offers[0]]; });
    const oldOrder = await h.service.checkout(h.request(eid), null); await h.pay(oldOrder.orderId);
    const old = await h.service.get(eid, h.staff);
    const studio = { ...old.draft, title: 'Unfinished Studio title', slug: `${old.draft.slug}-unfinished`, address: '456 Unpublished Street' };
    await h.service.save(eid, studio, 1, h.staff);
    const raw = { ...studio, title: 'Injected title', city: 'Injected city', offers: studio.offers.map(o => ({ ...o, unitAmount: 8500 })), pools: studio.pools.map(p => ({ ...p, capacity: 60 })) };
    const saved = await h.service.save(eid, raw, 2, h.staff, true);
    assert.equal(saved.appliedToPublicPage, true); assert.equal(saved.hasUnpublishedChanges, true);
    const current = await h.service.get(eid, h.staff), page = (await h.db.collection('publishedEvents').doc(eid).get()).data();
    assert.equal(current.draft.title, 'Unfinished Studio title'); assert.equal(current.liveDraft.title, old.liveDraft.title);
    assert.equal(current.liveDraft.address, old.liveDraft.address); assert.equal(current.liveDraft.slug, old.liveDraft.slug);
    assert.equal(current.liveDraft.offers[0].unitAmount, 8500); assert.equal(page.offers[0].unitAmount, 8500);
    assert.equal(current.publishedRevision, 3); assert.equal(page.revision, 3);
    assert.equal((await h.service.order(oldOrder.orderId).get()).data().total, 10000);
    const pool = (await h.service.event(eid).collection('pools').doc('friday').get()).data();
    assert.equal(pool.capacity, 60); assert.equal(pool.sold, 1);
    const fresh = await h.service.checkout(h.request(eid), null); assert.equal(fresh.total, 8500);
    await assert.rejects(() => h.service.save(eid, raw, 2, h.staff, true), /Another editor/);
    await assert.rejects(() => h.service.save(eid, { ...current.draft, pools: current.draft.pools.map(p => ({ ...p, capacity: 0 })) }, 3, h.staff, true), /Capacity cannot/);
    assert.equal((await h.service.get(eid, h.staff)).revision, 3, 'failed save is atomic');
    await assert.rejects(() => h.service.save(eid, current.draft, 3, 'unprivileged', true), /does not have access/);
    await h.service.publish(eid, 'publish', 3, h.staff);
    assert.equal((await h.service.get(eid, h.staff)).hasUnpublishedChanges, false);
  } finally { await h.cleanup(); }
});

test('ticket settings do not publish draft, cancelled or archived events', async () => {
  const h = harness();
  try {
    for (const status of ['unpublish', 'cancel', 'archive']) {
      const eid = await h.event(); await h.service.publish(eid, status, 1, h.staff);
      const e = await h.service.get(eid, h.staff), saved = await h.service.save(eid, e.draft, 1, h.staff, true);
      assert.equal(saved.appliedToPublicPage, false); assert.equal((await h.service.get(eid, h.staff)).status, e.status);
    }
  } finally { await h.cleanup(); }
});

function taxProvider(h) {
  const locations = new Map(), products = new Map(), calls = { locations: 0, products: 0 };
  let registrationState = 'NC';
  h.fake.taxCodes = { retrieve: async code => ({ id: code, requirements: { performance_location: code === 'unsupported' ? 'not_allowed' : 'required' } }) };
  h.fake.tax = {
    settings: { retrieve: async () => ({ status: 'active', livemode: false }) },
    registrations: { list: async () => ({ has_more: false, data: [{ id: 'taxreg_test', status: 'active', livemode: false, country: 'US', active_from: 1, expires_at: null, country_options: { us: { state: registrationState, type: 'state_sales_tax' } } }] }) },
    locations: {
      create: async input => { calls.locations++; const location = { ...input, id: `taxloc_${randomUUID()}`, livemode: false }; locations.set(location.id, location); return location; },
      retrieve: async key => { assert.ok(locations.has(key)); return locations.get(key); },
    },
  };
  h.fake.products = {
    create: async input => { calls.products++; const product = { ...input, active: true, livemode: false }; products.set(product.id, product); return product; },
    retrieve: async key => { if (!products.has(key)) throw Object.assign(new Error('Missing product'), { code: 'resource_missing' }); return products.get(key); },
  };
  return { locations, products, calls, registration: state => { registrationState = state; } };
}

test('automatic tax uses the published venue, reuses immutable products and locations, and checks state registration', async () => {
  const h = harness(), provider = taxProvider(h);
  try {
    const eid = await h.event(d => { d.offers = [d.offers[0], { ...d.offers[0], id: 'free-entry', name: 'Free admission', unitAmount: 0 }]; d.postalCode = '28801'; });
    const old = await h.service.get(eid, h.staff);
    await h.service.save(eid, { ...old.draft, address: '456 Unpublished Street', postalCode: '28806' }, 1, h.staff);
    const current = await h.service.get(eid, h.staff);
    const raw = { ...current.draft, tax: { mode: 'automatic', autoConfigure: true, confirmed: true, performanceLocationId: '' } };
    await h.service.save(eid, raw, 2, h.staff, true);
    const saved = await h.service.get(eid, h.staff), location = provider.locations.get(saved.liveDraft.tax.performanceLocationId);
    assert.equal(location.address.line1, old.liveDraft.address); assert.equal(location.address.postal_code, '28801');
    assert.equal(saved.draft.address, '456 Unpublished Street'); assert.equal(provider.calls.locations, 1); assert.equal(provider.calls.products, 1);
    const oldProduct = saved.liveDraft.offers[0].stripeProductId;
    await h.service.save(eid, saved.draft, 3, h.staff, true);
    assert.equal(provider.calls.locations, 1); assert.equal(provider.calls.products, 1);
    const configured = await h.service.get(eid, h.staff), order = await h.service.checkout(h.request(eid, { items: [{ offerId: 'weekend', quantity: 1 }, { offerId: 'free-entry', quantity: 1 }] }), null);
    assert.equal((await h.service.order(order.orderId).get()).data().units.length, 2, 'free passes can share a checkout with automatically taxed paid passes');
    assert.equal((await h.service.order(order.orderId).get()).data().units[0].stripeProductId, oldProduct);
    provider.registration('SC');
    await assert.rejects(() => h.service.save(eid, configured.draft, 4, h.staff, true), /active NC sales-tax registration/);
    await assert.rejects(() => h.service.checkout(h.request(eid), null), /active NC sales-tax registration/);
    assert.equal((await h.service.get(eid, h.staff)).revision, 4);
    provider.registration('NC');
    await h.service.publish(eid, 'publish', 4, h.staff);
    const published = await h.service.get(eid, h.staff);
    assert.equal(provider.calls.locations, 2); assert.notEqual(published.liveDraft.offers[0].stripeProductId, oldProduct);
    assert.equal(provider.products.get(oldProduct).tax_details.performance_location, location.id, 'old product is unchanged for reserved orders');
    const publicText = JSON.stringify((await h.db.collection('publishedEvents').doc(eid).get()).data());
    assert.ok(!publicText.includes('28806')); assert.ok(!publicText.includes(published.liveDraft.tax.performanceLocationId));
  } finally { await h.cleanup(); }
});

test('incomplete venue and unclassified non-admission products cannot silently enable automatic tax', async () => {
  const h = harness(), provider = taxProvider(h);
  try {
    const eid = await h.event(); const current = await h.service.get(eid, h.staff);
    const raw = { ...current.draft, tax: { mode: 'automatic', autoConfigure: true, confirmed: true, performanceLocationId: '' } };
    await assert.rejects(() => h.service.save(eid, raw, 1, h.staff, true), /ZIP code/);
    await h.service.save(eid, { ...current.draft, postalCode: '28801' }, 1, h.staff); await h.service.publish(eid, 'publish', 2, h.staff);
    const latest = await h.service.get(eid, h.staff);
    await assert.rejects(() => h.service.save(eid, { ...latest.draft, tax: raw.tax }, 2, h.staff, true), /Camping and vehicle/);
    assert.equal(provider.calls.locations, 0); assert.equal(provider.calls.products, 0);
    assert.equal((await h.service.get(eid, h.staff)).revision, 2);
  } finally { await h.cleanup(); }
});
