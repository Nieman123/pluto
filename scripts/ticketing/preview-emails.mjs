import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { renderTicketingEmail } = require('../../functions/lib/ticketing/email.js');
const directory = resolve(import.meta.dirname, '../../tmp/ticketing-emails');
await mkdir(directory, { recursive: true });
// Synthetic data only. Rendering never initializes Firebase or sends email.
const baseUrl = 'https://preview.pluto.test';
const fixture = {
  baseUrl, orderId: '8fc03609d3ab'.repeat(5),
  order: { eventTitle: 'A Night in Orbit', total: 8500, currency: 'usd', taxAmount: 250,
    units: [{ offerId: 'ga', name: 'General admission', amount: 2500 }, { offerId: 'ga', name: 'General admission', amount: 2500 }, { offerId: 'vip', name: 'VIP upgrade', amount: 3500 }] },
  event: { startAt: '2027-10-09T23:00:00.000Z', timezone: 'America/New_York', city: 'Asheville', region: 'NC', venueVisibility: 'holders',
    venueRevealScheduled: true, venueRevealAt: '2027-10-09T20:00:00.000Z' },
};
const kinds = ['receipt', 'transfer', 'recovery', 'refund', 'checkout-expired', 'rsvp-confirmed', 'rsvp-pending', 'rsvp-declined'];
for (const kind of kinds) {
  const actionUrl = kind === 'checkout-expired' ? `${baseUrl}/events/a-night-in-orbit` : `${baseUrl}/app/tickets${kind === 'refund' ? '' : `#${kind === 'transfer' ? 'transfer' : 'recovery'}=${'0'.repeat(64)}`}`;
  const email = renderTicketingEmail({ ...fixture, kind, actionUrl, amount: 2500, note: kind === 'rsvp-declined' ? 'We have reached capacity for this event. Thank you for your interest — we hope to see you at the next one.' : undefined });
  await writeFile(resolve(directory, `${kind}.html`), email.html);
  await writeFile(resolve(directory, `${kind}.txt`), email.text);
}
const index = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pluto email previews</title><style>body{margin:40px auto;padding:0 20px;max-width:760px;background:#100e15;color:#f7f3fc;font:16px/1.6 Arial,sans-serif}h1{font-size:32px}a{color:#c4a2ff}li{padding:10px 0}p{color:#b7a5c5}</style><h1>Pluto ticketing emails</h1><p>Local previews with synthetic event and order data. Links are placeholders.</p><ul>${kinds.map(kind => `<li><a href="${kind}.html">${kind.replaceAll('-', ' ')}</a> · <a href="${kind}.txt">plain text</a></li>`).join('')}</ul></html>`;
await writeFile(resolve(directory, 'index.html'), index);
console.log(`Email previews saved to ${resolve(directory, 'index.html')}`);
