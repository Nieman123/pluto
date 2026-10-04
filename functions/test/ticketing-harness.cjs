const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { fixture } = require('./ticketing-fixture.cjs');
if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:') || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) throw new Error('Isolated demo emulators required.');
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

function harness() {
  const db = getFirestore(), prefix = `hardening_${randomUUID()}`, staff = `${prefix}_admin`, events = new Set(), orders = new Set();
  const sessions = new Map(), intents = new Map(), charges = new Map(), refunds = new Map(), disputes = new Map(), idempotency = new Map(), hooks = {};
  const fake = {
    checkout: { sessions: {
      create: async (p, opts) => {
        if (hooks.checkoutBefore) await hooks.checkoutBefore(p);
        let s = sessions.get(idempotency.get(opts.idempotencyKey));
        if (!s) {
          s = { id: `cs_test_${randomUUID()}`, client_secret: 'test-secret', metadata: p.metadata, client_reference_id: p.client_reference_id,
            currency: 'usd', amount_total: p.line_items.reduce((n, l) => n + l.price_data.unit_amount, 0), livemode: false,
            status: 'open', payment_status: 'unpaid', expires_at: p.expires_at,
            line_items: p.line_items.map((l, i) => ({ id: `li_${i}`, metadata: l.metadata, quantity: 1, amount_total: l.price_data.unit_amount, amount_tax: 0, currency: 'usd' })) };
          sessions.set(s.id, s); idempotency.set(opts.idempotencyKey, s.id);
        }
        if (hooks.checkoutAfter) await hooks.checkoutAfter(s);
        return s;
      },
      retrieve: async sid => { assert.ok(sessions.has(sid)); return sessions.get(sid); },
      listLineItems: async sid => ({ data: sessions.get(sid).line_items, has_more: false }),
      list: () => ({ autoPagingEach: async callback => { for (const s of sessions.values()) if (await callback(s) === false) break; } }),
      expire: async sid => { const s = sessions.get(sid); if (s.payment_status === 'paid') throw new Error('Already paid'); s.status = 'expired'; return s; },
    } },
    paymentIntents: { retrieve: async pi => { assert.ok(intents.has(pi), `Unknown PaymentIntent ${pi}`); return intents.get(pi); } },
    charges: { retrieve: async ch => { assert.ok(charges.has(ch)); return charges.get(ch); } },
    disputes: { retrieve: async dp => disputes.get(dp), list: async p => ({ data: [...disputes.values()].filter(d => d.payment_intent === p.payment_intent), has_more: false }) },
    refunds: {
      list: async p => ({ data: [...refunds.values()].filter(r => r.payment_intent === p.payment_intent), has_more: false }),
      retrieve: async rid => { assert.ok(refunds.has(rid)); return refunds.get(rid); },
      create: async (p, opts) => {
        let r = refunds.get(idempotency.get(opts.idempotencyKey));
        if (!r) { r = { id: `re_${randomUUID()}`, ...p, status: 'succeeded', currency: 'usd' }; refunds.set(r.id, r); idempotency.set(opts.idempotencyKey, r.id); }
        if (hooks.refund) await hooks.refund(r);
        return r;
      },
    },
    taxRates: { retrieve: async rate => { if (hooks.taxRate) return hooks.taxRate(rate); return { active: true, inclusive: true, livemode: false, percentage: 10 }; } },
  };
  const signingKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const { Operations } = require('../lib/ticketing/operations');
  const service = new Operations(db, { stripe: fake, signingKey });
  const newKey = () => randomBytes(32).toString('hex');
  async function event(modify = () => {}) {
    await db.collection('adminUsers').doc(staff).set({ role: 'admin' });
    const eid = randomUUID(), draft = fixture(true); events.add(eid); draft.slug += `-${eid}`; modify(draft);
    await service.save(eid, draft, 0, staff); await service.publish(eid, 'publish', 1, staff); return eid;
  }
  function request(eid, overrides = {}) {
    const raw = { eventId: eid, accessKey: newKey(), name: 'Test Guest', email: `${prefix}@example.test`, items: [{ offerId: 'weekend', quantity: 1 }], ...overrides };
    orders.add(require('../lib/ticketing/domain').hash(raw.accessKey)); return raw;
  }
  async function paidSession(oid, fee = 320) {
    const o = (await service.order(oid).get()).data(), s = sessions.get(o.sessionId), pi = `pi_${oid}`, ch = `ch_${oid}`;
    const charge = { id: ch, metadata: s.metadata, payment_intent: pi, livemode: false, currency: 'usd', amount: o.total, amount_refunded: 0, refunded: false, disputed: false,
      receipt_url: 'https://pay.stripe.com/test', balance_transaction: fee === null ? null : { id: `txn_${oid}`, fee, currency: 'usd', net: o.total - fee } };
    const intent = { id: pi, metadata: s.metadata, livemode: false, currency: 'usd', amount: o.total, amount_received: o.total, status: 'succeeded', latest_charge: charge };
    intents.set(pi, intent); charges.set(ch, charge); s.status = 'complete'; s.payment_status = 'paid'; s.payment_intent = intent; s.total_details = { amount_tax: 0 }; return s;
  }
  async function pay(oid, fee = 320) { await paidSession(oid, fee); await service.verifySession(oid); }
  async function cleanup() {
    for (const oid of orders) {
      for (const name of ['ticketingTickets', 'ticketingEmailJobs', 'ticketingRefunds', 'ticketingRecovery', 'ticketingAccess', 'ticketingWebhookInbox']) {
        for (const doc of (await db.collection(name).where('orderId', '==', oid).get()).docs) await db.recursiveDelete(doc.ref);
      }
      await service.order(oid).delete();
    }
    for (const eid of events) {
      const e = (await service.event(eid).get()).data();
      for (const name of ['ticketingRsvpVerification', 'ticketingEmailJobs']) for (const doc of (await db.collection(name).where('eventId', '==', eid).get()).docs) await doc.ref.delete();
      for (const name of ['ticketingScannerPins', 'ticketingScannerSessions', 'ticketingOfflineLeases']) for (const doc of (await db.collection(name).where('eventId', '==', eid).get()).docs) await doc.ref.delete();
      await db.recursiveDelete(service.event(eid)); await db.collection('publishedEvents').doc(eid).delete(); await db.collection('currentEvents').doc(`native-${eid}`).delete();
      if (e) await db.collection('eventSlugs').doc(e.draft.slug).delete();
    }
    await db.collection('adminUsers').doc(staff).delete();
  }
  return { db, service, staff, prefix, fake, hooks, sessions, intents, charges, refunds, disputes, event, request, pay, paidSession, newKey, cleanup, signingKey };
}
module.exports = { harness };
