import { fail, type EventDraft, type Unit } from './domain';

// Paid upgrades are bound to one approved, named RSVP credential. Reopening an
// RSVP issues a new version and never revives an older upgrade automatically.
export function approvedRsvpParent(parent: any, ticket: any, upgrade: any): boolean {
  return !!parent && !!ticket && parent.method === 'rsvp' && parent.status === 'paid' && parent.rsvpStatus === 'approved' && !parent.financialBlocked &&
    parent.eventId === upgrade.eventId && parent.email === upgrade.email && ticket.orderId === upgrade.rsvpOrderId && ticket.eventId === upgrade.eventId &&
    ticket.rsvp === true && ticket.kind === 'admission' && ticket.status === 'valid' && ticket.holderEmail === upgrade.email && ticket.version === upgrade.rsvpTicketVersion;
}

export function assertRsvpPayment(draft: EventDraft, units: Unit[], method: string) {
  if (!['rsvp', 'rsvp-approval'].includes(draft.registrationMode)) return;
  const kind = draft.registrationMode === 'rsvp-approval' ? 'upgrade' : 'admission';
  if (units.length !== 1 || units[0].originalAmount <= 0 || units[0].kind !== kind || draft.registrationMode === 'rsvp-approval' && method !== 'stripe')
    fail('Choose one paid VIP option, or use the RSVP form for free admission. RSVP approval cannot be bypassed with a ticket checkout.', 409);
}
