import type { EventDraft } from './domain';
import type { Order } from './orders';

export type EmailKind = 'receipt' | 'recovery' | 'transfer' | 'refund' | 'rsvp-pending' | 'rsvp-declined' | 'rsvp-confirmed' | 'rsvp-verification';
export interface TicketingEmailInput {
  kind: EmailKind;
  order: Pick<Order, 'eventTitle' | 'total' | 'currency' | 'units' | 'taxAmount'>;
  orderId: string;
  actionUrl: string;
  baseUrl: string;
  // Only published schedule / city fields are used. Exact locations stay in the app.
  event?: Pick<EventDraft, 'startAt' | 'timezone' | 'city' | 'region' | 'venueVisibility' | 'venueRevealScheduled' | 'venueRevealAt'>;
  amount?: number;
  note?: string;
  staging?: boolean;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
function eventTime(value?: string | null, timezone?: string) {
  if (!value || !timezone) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
  } catch { return ''; }
}

function content(input: TicketingEmailInput) {
  const { kind, order, amount, note } = input;
  const title = order.eventTitle;
  const linkHelp = 'Keep this link private. It can be opened once within 30 days. You can request another link from My tickets.';
  switch (kind) {
    case 'rsvp-verification': return {
      subject: `${title} RSVP email code`, label: 'VERIFY YOUR EMAIL', heading: 'One more step to RSVP.',
      preview: 'Confirm your email address to submit your RSVP.',
      paragraphs: [`Your verification code is ${note}. Enter it on the event page within 15 minutes.`, 'This code verifies your email only. Organizer approval is still required when applicable.'],
      button: 'Open event page', help: 'If you did not request this code, ignore this email.', notice: 'This email does not grant admission or reserve capacity.',
    };
    case 'receipt': return {
      subject: `Your ${title} tickets`, label: 'ORDER CONFIRMED', heading: 'See you on the dance floor.',
      preview: `Your ${title} order is confirmed. Open your tickets in the Pluto app.`,
      paragraphs: ['Thanks for joining us. Your receipt and tickets are ready in the Pluto app.'],
      button: 'Open my tickets', help: linkHelp,
      notice: 'Keep this email for your records. Open the app at the door to show your admission QR. QR codes stay in the app; no ticket PDF is attached.',
    };
    case 'recovery': return {
      subject: `Your ${title} tickets`, label: 'SECURE ORDER ACCESS', heading: 'Back to your tickets.',
      preview: `Use this secure link to recover your ${title} order.`,
      paragraphs: ['Use the button below to recover your order in the Pluto app.'],
      button: 'Recover my order', help: 'This link expires in 30 minutes and can be used once.',
      notice: 'If you did not request this email, you can ignore it. Keep this link private: it gives access to your order.',
    };
    case 'transfer': return {
      subject: `A ${title} ticket was sent to you`, label: 'TICKET TRANSFER', heading: 'A ticket is waiting for you.',
      preview: `Accept your ${title} ticket in the Pluto app.`,
      paragraphs: ['Someone sent you a ticket. Accept it in the Pluto app to make it yours.', 'Sign in with the email address that received this message.'],
      button: 'Accept my ticket', help: "Transfers close when the event's first admission window opens.",
      notice: 'This email is an invitation to accept a ticket. After accepting, open the app at the door to show your admission QR. QR codes stay in the app; no ticket PDF is attached.',
    };
    case 'refund': return {
      subject: `${title} refund confirmation`, label: 'REFUND PROCESSED', heading: 'Your refund is confirmed.',
      preview: `Your ${money(amount || 0, order.currency)} refund for ${title} was processed.`,
      paragraphs: ['Your refund was approved and processed by the event organizer.'],
      button: 'View my order', help: '',
      notice: 'Refunded tickets are no longer valid for admission. Check your order in the Pluto app for the current status of each ticket.',
    };
    case 'rsvp-pending': return {
      subject: `${title} RSVP received`, label: 'AWAITING APPROVAL', heading: 'Your RSVP is with us.',
      preview: `Your ${title} RSVP request is awaiting organizer approval.`,
      paragraphs: ['Your RSVP request was received. Organizer approval is required before you can attend or receive an admission QR.', 'We will email you when the organizer makes a decision.'],
      button: 'View RSVP status', help: linkHelp,
      notice: 'This request does not grant admission. QR codes stay in the app and become available only after approval; no ticket PDF is attached.',
    };
    case 'rsvp-declined': return {
      subject: `${title} RSVP declined`, label: 'RSVP UPDATE', heading: 'An update on your RSVP.',
      preview: `The organizer has declined your RSVP for ${title}.`,
      paragraphs: ['Your RSVP was declined by the event organizer. This does not grant admission.'],
      button: 'View my RSVP', help: linkHelp, note,
      notice: 'No admission pass has been issued for this RSVP. QR codes stay in the app; no ticket PDF is attached.',
    };
    case 'rsvp-confirmed': return {
      subject: `${title} RSVP confirmed`, label: 'RSVP CONFIRMED', heading: "You're on the list.",
      preview: `Your ${title} RSVP is confirmed. Your admission pass is in the Pluto app.`,
      paragraphs: ['Your RSVP is confirmed. Open your admission QR in the Pluto app.'],
      button: 'Open my RSVP pass', help: linkHelp,
      notice: 'This pass is for the named attendee and cannot be transferred. QR codes stay in the app; no ticket PDF is attached.',
    };
  }
}

/** Pure rendering: no remote requests, tracking pixels, admission credentials or attachments. */
export function renderTicketingEmail(input: TicketingEmailInput) {
  const c = content(input), { order, event, kind } = input;
  const begins = eventTime(event?.startAt, event?.timezone);
  const city = [event?.city, event?.region].filter(Boolean).join(', ');
  const reveal = event?.venueVisibility === 'holders' && event.venueRevealScheduled ? eventTime(event.venueRevealAt, event.timezone) : '';
  const location = event?.venueVisibility === 'holders' ? reveal ? `Exact location is shared with ticket holders in the app from ${reveal}.` : 'Exact location is shared with ticket holders in the app.' : '';
  const lines = new Map<string, { name: string; quantity: number; amount: number }>();
  if (kind === 'receipt') for (const unit of order.units) {
    const key = JSON.stringify([unit.offerId, unit.name, unit.amount]);
    const line = lines.get(key) || { name: unit.name, quantity: 0, amount: 0 };
    line.quantity++; line.amount += unit.amount; lines.set(key, line);
  }
  const totalLabel = kind === 'refund' ? 'Refund amount' : 'Order total';
  const total = kind === 'refund' ? input.amount || 0 : order.total;
  const showTotal = kind === 'receipt' || kind === 'refund';
  const showReference = kind !== 'transfer';
  const reference = input.orderId.slice(0, 12).toUpperCase();
  const paragraph = (value: string, style = '') => `<p style="margin:0 0 16px;color:#ddd5e6;font-size:16px;line-height:1.65;${style}">${escape(value)}</p>`;
  const meta = (label: string, value: string) => `<tr><td style="padding:0 0 18px"><p style="margin:0 0 5px;color:#b7a5c5;font-size:11px;font-weight:700;letter-spacing:1.5px">${label}</p><p style="margin:0;color:#f7f3fc;font-size:15px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">${escape(value)}</p></td></tr>`;
  const summary = [...lines.values()].map(line => `<tr><td style="padding:8px 12px 8px 0;color:#ddd5e6;font-size:14px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word">${escape(line.name)} &times; ${line.quantity}</td><td align="right" style="padding:8px 0;color:#f7f3fc;font-size:14px;white-space:nowrap">${escape(money(line.amount, order.currency))}</td></tr>`).join('');
  const text = [
    ['PLUTO', input.staging ? 'STAGING · TEST EMAIL' : '', c.label].filter(Boolean).join('\n'), c.heading, ...c.paragraphs,
    [order.eventTitle, begins ? `Event begins: ${begins}` : '', city, location, showReference ? `Order reference: ${reference}` : ''].filter(Boolean).join('\n'),
    [...[...lines.values()].map(line => `${line.name} × ${line.quantity}: ${money(line.amount, order.currency)}`),
      showTotal ? `${totalLabel}: ${money(total, order.currency)}` : '',
      kind === 'receipt' && order.taxAmount ? `Includes tax: ${money(order.taxAmount, order.currency)}` : ''].filter(Boolean).join('\n'),
    c.note ? `Organizer note: ${c.note}` : '', `${c.button}: ${input.actionUrl}`, c.help, c.notice,
    `My tickets: ${input.baseUrl}/app/tickets\nPluto · Events for dance music enthusiasts`,
  ].filter(Boolean).join('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>${escape(c.subject)}</title>
<style>@media only screen and (max-width:600px){.email-wrap{padding:16px 10px!important}.email-content{padding:28px 22px!important}.email-heading{font-size:29px!important}.email-brand{font-size:30px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#100e15;color:#f7f3fc;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;color:#100e15;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(c.preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#100e15"><tr><td class="email-wrap" align="center" style="padding:36px 16px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
<tr><td style="padding:0 8px 25px"><a class="email-brand" href="${escape(input.baseUrl)}" style="color:#f7f3fc;font-size:34px;font-weight:800;letter-spacing:8px;text-decoration:none">PLUTO<span style="color:#ffae45">.</span></a>${input.staging ? '<p style="margin:12px 0 0;color:#ffcc8b;font-size:11px;font-weight:700;letter-spacing:1.5px">STAGING · TEST EMAIL</p>' : ''}</td></tr>
<tr><td style="background-color:#1b1523;border:1px solid #3e304c;border-radius:20px;overflow:hidden">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:5px;line-height:5px;font-size:1px;background-color:#c4a2ff;border-radius:20px 20px 0 0">&nbsp;</td></tr>
<tr><td class="email-content" style="padding:38px 38px 34px">
<p style="margin:0 0 16px;color:#ffcc8b;font-size:11px;font-weight:700;letter-spacing:2px">${c.label}</p>
<h1 class="email-heading" style="margin:0 0 20px;color:#f7f3fc;font-size:36px;line-height:1.18;letter-spacing:-1px;font-weight:800">${escape(c.heading)}</h1>
${c.paragraphs.map(value => paragraph(value)).join('')}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0;background-color:#251c30;border:1px solid #493855;border-radius:12px"><tr><td style="padding:24px">
<p style="margin:0 0 8px;color:#c4a2ff;font-size:11px;font-weight:700;letter-spacing:1.5px">THE EVENT</p>
<h2 style="margin:0 0 22px;color:#f7f3fc;font-size:23px;line-height:1.35;overflow-wrap:anywhere">${escape(order.eventTitle)}</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${begins ? meta('EVENT BEGINS', begins) : ''}${city ? meta('CITY', city) : ''}</table>
${location ? paragraph(location, 'font-size:13px;line-height:1.6;') : ''}
${showReference ? `<p style="margin:0;color:#b7a5c5;font-size:11px;letter-spacing:1px">ORDER · ${escape(reference)}</p>` : ''}
${summary || showTotal ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;border-top:1px solid #493855">${summary}${showTotal ? `<tr><td style="padding-top:18px;color:#f7f3fc;font-size:15px;font-weight:700">${totalLabel}</td><td align="right" style="padding-top:18px;color:#f7f3fc;font-size:23px;font-weight:700;white-space:nowrap">${escape(money(total, order.currency))}</td></tr>` : ''}</table>` : ''}
${kind === 'receipt' && order.taxAmount ? `<p style="margin:8px 0 0;color:#b7a5c5;font-size:12px;text-align:right">Includes tax ${escape(money(order.taxAmount, order.currency))}</p>` : ''}
</td></tr></table>
${c.note ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;border-left:3px solid #ffae45"><tr><td style="padding:4px 0 4px 16px"><p style="margin:0 0 8px;color:#ffcc8b;font-size:11px;font-weight:700;letter-spacing:1px">ORGANIZER NOTE</p><p style="margin:0;color:#ddd5e6;font-size:15px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere">${escape(c.note)}</p></td></tr></table>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#c4a2ff" style="border-radius:10px;mso-padding-alt:17px 24px"><a href="${escape(input.actionUrl)}" style="display:block;padding:17px 24px;border:1px solid #c4a2ff;border-radius:10px;color:#20122c;font-size:16px;line-height:1.3;font-weight:700;text-align:center;text-decoration:none">${escape(c.button)} &rarr;</a></td></tr></table>
${c.help ? `<p style="margin:14px 0 0;color:#b7a5c5;font-size:12px;line-height:1.6;text-align:center">${escape(c.help)}</p>` : ''}
<p style="margin:28px 0 0;padding-top:24px;border-top:1px solid #3e304c;color:#b7a5c5;font-size:13px;line-height:1.7">${escape(c.notice)}</p>
<p style="margin:16px 0 0;color:#b7a5c5;font-size:12px;line-height:1.7">Button not opening? <a href="${escape(input.actionUrl)}" style="color:#d5baff;text-decoration:underline">Use this direct link</a>.</p>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:24px 20px 0"><p style="margin:0 0 12px;color:#b7a5c5;font-size:12px;line-height:1.6">Events for dance music enthusiasts.</p><p style="margin:0;color:#b7a5c5;font-size:12px;line-height:1.6"><a href="${escape(input.baseUrl)}/app/tickets" style="color:#d5baff;text-decoration:underline">My tickets</a><span style="padding:0 12px">·</span><a href="${escape(input.baseUrl)}/events" style="color:#d5baff;text-decoration:underline">Explore Pluto</a></p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { subject: c.subject, text, html };
}

// An in-flight job sent by the previous release must retain its original provider
// payload. Resend rejects a different payload under the same idempotency key.
export function legacyTicketingEmail(input: TicketingEmailInput) {
  const { kind, order, actionUrl, note } = input;
  let subject = `Your ${order.eventTitle} tickets`, text = '';
  if (kind === 'recovery') text = `Recover your order in the Pluto app: ${actionUrl}\nThis link expires in 30 minutes and can be used once.`;
  else if (kind === 'transfer') { subject = `A ${order.eventTitle} ticket was sent to you`; text = `Accept your ticket in the Pluto app: ${actionUrl}\nTransfers close when the event's first admission window opens.`; }
  else if (kind === 'refund') { subject = `${order.eventTitle} refund confirmation`; text = `Your refund of $${((input.amount || 0) / 100).toFixed(2)} was approved and processed. Refunded tickets are no longer valid.`; }
  else if (kind.startsWith('rsvp-')) {
    subject = `${order.eventTitle} RSVP ${kind === 'rsvp-pending' ? 'received' : kind === 'rsvp-declined' ? 'declined' : 'confirmed'}`;
    text = kind === 'rsvp-pending' ? 'Your RSVP request was received. Organizer approval is required before you can attend or receive an admission QR. Check the current status in the Pluto app.' : kind === 'rsvp-declined' ? `Your RSVP was declined. This does not grant admission.${note ? `\nOrganizer note: ${note}` : ''}` : 'Your RSVP is confirmed. Open your admission QR in the Pluto app. This pass is for the named attendee and cannot be transferred.';
    text += `\nView your RSVP: ${actionUrl}\nThis link can be opened once within 30 days. QR codes stay in the app; no ticket PDF is attached.`;
  } else text = `Thanks for joining us. Your order total is $${(order.total / 100).toFixed(2)}.\nOpen the Pluto app to view your receipt, tickets and venue details: ${actionUrl}\nThis link can be opened once within 30 days. You can request another link from My tickets. Admission tickets are kept in the app; no ticket PDF is attached.`;
  return { subject, text };
}
