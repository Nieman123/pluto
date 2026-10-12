const test = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const { NativeCheckout } = require('../lib/ticketing/native-checkout');

test('native checkout claims respect revocation, account changes and event-only access', async () => {
  const now = Math.floor(Date.now() / 1000);
  const actor = { uid: 'native-user', email: 'native@example.com', email_verified: true, auth_time: now - 30, exp: now + 3600 };
  let user = { uid: actor.uid, email: actor.email, emailVerified: true, disabled: false, tokensValidAfterTime: new Date((now - 60) * 1000).toISOString() };
  let deleting = false, otherOrder = false;
  const session = { kind: 'session', eventId: 'event-a', actor, expiresAt: Timestamp.fromMillis(Date.now() + 100000) };
  const service = { db: { collection: name => ({ doc: () => ({ get: async () => ({
    exists: name === 'accountDeletionRequests' && deleting,
    data: () => name === 'ticketingNativeCheckouts' ? session : name === 'ticketingOrders' ? { eventId: otherOrder ? 'event-b' : 'event-a' } : undefined,
  }) }) }) } };
  const checkout = new NativeCheckout(service, () => ({ getUser: async () => user }));
  const token = 'a'.repeat(64), request = { eventId: 'event-a' };
  assert.deepEqual(await checkout.actor(token, '/checkout', request), actor);
  const denied = (path, body, status) => assert.rejects(checkout.actor(token, path, body), error => error.status === status);
  for (const path of ['/staff/events', '/account/delete', '/mine', '/rewards/claim']) await denied(path, request, 403);
  await denied('/checkout', { eventId: 'event-b' }, 403);
  await denied('/rsvp/verification', { eventId: 'event-b' }, 403);
  assert.deepEqual(await checkout.actor(token, '/order', { orderId: 'order-a' }), actor);
  otherOrder = true;
  await denied('/order', { orderId: 'order-b' }, 403);
  await denied('/checkout-attempt', { accessKey: 'b'.repeat(64) }, 403);
  otherOrder = false;
  for (const change of [{ disabled: true }, { email: 'changed@example.com' }, { emailVerified: false },
    { tokensValidAfterTime: new Date(now * 1000).toISOString() }]) {
    const original = user; user = { ...user, ...change }; await denied('/checkout', request, 401); user = original;
  }
  deleting = true; await denied('/checkout', request, 401); deleting = false;
  session.expiresAt = Timestamp.fromMillis(Date.now() - 1000); await denied('/checkout', request, 401);
  session.expiresAt = Timestamp.fromMillis(Date.now() + 100000);
  session.actor = { ...actor, exp: now - 1 }; await denied('/checkout', request, 401);
  session.actor = actor; session.kind = 'handoff'; await denied('/checkout', request, 401);
});
