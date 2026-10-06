const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTicketingEmail, legacyTicketingEmail } = require('../lib/ticketing/email');

function input(kind = 'receipt', overrides = {}) {
  return { kind, orderId: 'a'.repeat(64), baseUrl: 'https://pluto-staging-92eb7.web.app',
    actionUrl: `https://pluto-staging-92eb7.web.app/app/tickets#${kind === 'transfer' ? 'transfer' : 'recovery'}=${'b'.repeat(64)}`,
    order: { eventTitle: 'A Night in Orbit', total: 8500, currency: 'usd', taxAmount: 250,
      units: [{ offerId: 'ga', name: 'General admission', amount: 2500 }, { offerId: 'ga', name: 'General admission', amount: 2500 }, { offerId: 'vip', name: 'VIP', amount: 3500 }] },
    event: { startAt: '2027-10-09T23:00:00.000Z', timezone: 'America/New_York', city: 'Asheville', region: 'NC', venueVisibility: 'holders',
      venueRevealScheduled: true, venueRevealAt: '2027-10-09T20:00:00.000Z', venueName: 'Hidden venue', address: '123 Secret Way', directions: 'Take the hidden trail' },
    amount: 2500, staging: true, ...overrides };
}

test('receipt has grouped purchases, accurate totals, Eastern schedule, app CTA and plain-text alternative', () => {
  const i = input(), mail = renderTicketingEmail(i);
  assert.equal(mail.subject, 'Your A Night in Orbit tickets');
  assert.match(mail.text, /General admission × 2: \$50\.00/);
  assert.match(mail.text, /VIP × 1: \$35\.00/);
  assert.match(mail.text, /Order total: \$85\.00/);
  assert.match(mail.text, /Includes tax: \$2\.50/);
  assert.match(mail.text, /Oct 9, 2027, 7:00 PM EDT/);
  assert.match(mail.html, /Open my tickets/);
  assert.match(mail.html, /STAGING · TEST EMAIL/);
  assert.ok(mail.html.includes(i.actionUrl));
  assert.ok(mail.text.includes(i.actionUrl));
  assert.match(mail.html, /max-width:600px/);
});

test('HTML escapes organizer-controlled text and never exposes exact venue data or QR credentials', () => {
  for (const kind of ['receipt', 'recovery', 'transfer', 'refund', 'checkout-expired', 'rsvp-pending', 'rsvp-confirmed', 'rsvp-declined']) {
    const i = input(kind, { note: '<img src=x onerror="alert(1)"> & stay safe',
      order: { ...input().order, eventTitle: '<script>bad()</script> & Friends', units: [{ offerId: 'ga', name: '<b>VIP</b>', amount: 8500 }], qr: 'PLUTO1.private-credential' } });
    const mail = renderTicketingEmail(i);
    assert.ok(mail.html.includes('&lt;script&gt;bad()&lt;/script&gt; &amp; Friends'));
    assert.ok(!mail.html.includes('<script>') && !mail.html.includes('<img'));
    if (kind === 'rsvp-declined') assert.ok(mail.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; stay safe'));
    for (const forbidden of ['Hidden venue', '123 Secret Way', 'hidden trail', 'PLUTO1.']) assert.ok(!JSON.stringify(mail).includes(forbidden), `${kind}: ${forbidden}`);
    assert.match(mail.text, /Exact location is shared with ticket holders in the app from .*4:00 PM EDT/);
    assert.ok(!('attachments' in mail));
  }
});

test('expired checkout email offers a fresh event checkout without implying payment or admission', () => {
  const i = input('checkout-expired', { actionUrl: `${input().baseUrl}/events/a-night-in-orbit` }), mail = renderTicketingEmail(i);
  assert.equal(mail.subject, 'Your checkout for A Night in Orbit expired');
  assert.match(mail.text, /tickets are no longer held for you/);
  assert.match(mail.text, /current ticket availability and pricing/);
  assert.match(mail.text, /not an admission pass/);
  assert.match(mail.html, /View event &amp; tickets/);
  assert.ok(mail.html.includes(i.actionUrl) && mail.text.includes(i.actionUrl));
  for (const forbidden of ['#recovery=', 'client_secret', 'PLUTO1.', 'Order total:', '$85.00', 'ORDER CONFIRMED']) assert.ok(!JSON.stringify(mail).includes(forbidden));
});

test('transfer invitations omit the original purchaser financial details and order reference', () => {
  const mail = renderTicketingEmail(input('transfer'));
  assert.match(mail.html, /Accept my ticket/);
  assert.match(mail.text, /Sign in with the email address that received this message/);
  assert.match(mail.text, /first admission window opens/);
  for (const value of ['$85.00', 'General admission', 'ORDER ·', 'AAAAAAAAAAAA']) assert.ok(!mail.html.includes(value) && !mail.text.includes(value));
});

test('approval emails distinguish a request from admission and safely show organizer notes', () => {
  const pending = renderTicketingEmail(input('rsvp-pending'));
  assert.match(pending.subject, /RSVP received$/);
  assert.match(pending.text, /approval is required before you can attend or receive an admission QR/);
  assert.match(pending.html, /View RSVP status/);
  assert.ok(!pending.html.includes('Open my RSVP pass'));
  const declined = renderTicketingEmail(input('rsvp-declined', { note: 'Sorry, full capacity.' }));
  assert.match(declined.text, /does not grant admission/);
  assert.match(declined.html, /Sorry, full capacity\./);
  const confirmed = renderTicketingEmail(input('rsvp-confirmed'));
  assert.match(confirmed.text, /Your RSVP is confirmed/);
  assert.match(confirmed.html, /Open my RSVP pass/);
  assert.match(confirmed.text, /cannot be transferred/);
});

test('recovery and refund actions keep their respective deadlines and amounts', () => {
  const recovery = renderTicketingEmail(input('recovery'));
  assert.match(recovery.text, /expires in 30 minutes and can be used once/);
  assert.match(recovery.html, /Recover my order/);
  const refund = renderTicketingEmail(input('refund', { actionUrl: `${input().baseUrl}/app/tickets` }));
  assert.match(refund.subject, /refund confirmation$/);
  assert.match(refund.text, /Refund amount: \$25\.00/);
  assert.ok(!refund.text.includes('Order total: $85.00'));
  assert.match(refund.text, /Refunded tickets are no longer valid/);
  assert.ok(!refund.text.includes('30 days'));
});

test('missing published event data still renders, and production templates have no staging label', () => {
  const mail = renderTicketingEmail(input('receipt', { event: undefined, staging: false, baseUrl: 'https://pluto.events', actionUrl: 'https://pluto.events/app/tickets#recovery=test' }));
  assert.match(mail.text, /A Night in Orbit/);
  assert.ok(!mail.html.includes('STAGING') && !mail.html.includes('EVENT BEGINS') && !mail.html.includes('Exact location'));
  assert.ok(mail.html.includes('https://pluto.events/app/tickets#recovery=test'));
  const badDate = renderTicketingEmail(input('receipt', { event: { startAt: 'not-a-date', timezone: 'invalid' } }));
  assert.ok(!badDate.html.includes('Invalid Date'));
});

test('already attempted legacy receipt keeps the byte-compatible plain-text provider fields', () => {
  const i = input(), mail = legacyTicketingEmail(i);
  assert.deepEqual(mail, { subject: 'Your A Night in Orbit tickets', text: `Thanks for joining us. Your order total is $85.00.\nOpen the Pluto app to view your receipt, tickets and venue details: ${i.actionUrl}\nThis link can be opened once within 30 days. You can request another link from My tickets. Admission tickets are kept in the app; no ticket PDF is attached.` });
});
