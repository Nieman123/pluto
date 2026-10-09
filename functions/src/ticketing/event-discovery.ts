export function discoveryEvents(events: Record<string, any>[], past: boolean, now = Date.now()) {
  return events.filter(event => {
    const end = Date.parse(event.endAt), start = Date.parse(event.startAt);
    return ['published', 'cancelled', 'archived'].includes(event.status) && Number.isFinite(start) && Number.isFinite(end) &&
      (event.status === 'archived' || end <= now) === past;
  }).sort((a, b) => past ? Date.parse(b.endAt) - Date.parse(a.endAt) : Date.parse(a.startAt) - Date.parse(b.startAt));
}

// An explicit public card projection keeps private ticketing fields out of app discovery.
export function activeAppEventCards(published: Record<string, any>[], legacy: Record<string, any>[], origin: string, now = Date.now()) {
  const current = discoveryEvents(published, false, now).filter(e => e.status === 'published').map(e => ({
    id: `native-${e.id}`, title: e.title, details: `${e.subtitle || ''}\n${e.city}, ${e.region}`,
    ticketUrl: `${origin}/events/${e.slug}`, registrationMode: e.registrationMode || 'tickets',
    flyerImageUrl: e.flyer || e.hero ? `${origin}/events/${e.slug}/media/${(e.flyer || e.hero).assetId}` : '',
    isActive: true, startAt: e.startAt, endAt: e.endAt, sortOrder: 0,
  }));
  const old = legacy.filter(e => !e.id?.startsWith('native-') && e.isActive !== false &&
    (!e.endAt || Number.isFinite(Date.parse(e.endAt)) && Date.parse(e.endAt) > now)).map(e => ({
    id: e.id, title: e.title || '', details: e.details || '', ticketUrl: e.ticketUrl || '',
    flyerDataUrl: e.flyerDataUrl || '', flyerImageUrl: e.flyerImageUrl || '', flyerStoragePath: e.flyerStoragePath || '',
    registrationMode: e.registrationMode || 'tickets', isActive: true, sortOrder: e.sortOrder || 0,
    startAt: e.startAt || null, endAt: e.endAt || null,
  }));
  return [...current, ...old];
}
