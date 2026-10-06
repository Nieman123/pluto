export const isUnavailableKey = error => error.status === 409 && ['ticket-key-unavailable', 'offline-key-unavailable'].includes(error.code);
export function holdUnresolvedScans(manifest, queue) {
  const held = queue.filter(scan => scan.eventId === manifest.eventId && scan.keyRotationBlocked);
  const tickets = new Set(held.filter(s => s.kind !== 'guest').map(s => s.ticketId));
  for (const ticket of manifest.tickets) if (tickets.has(ticket.id) && ticket.rsvpTicketId) tickets.add(ticket.rsvpTicketId);
  const guests = new Set(held.filter(s => s.kind === 'guest').map(s => s.guestId));
  return { ...manifest, tickets: manifest.tickets.map(t => ({ ...t, reviewPending: tickets.has(t.id) || !!t.rsvpTicketId && tickets.has(t.rsvpTicketId) })),
    guests: (manifest.guests || []).map(g => ({ ...g, reviewPending: guests.has(g.id) })) };
}
