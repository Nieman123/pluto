export function discoveryEvents(events: Record<string, any>[], past: boolean, now = Date.now()) {
  return events.filter(event => {
    const end = Date.parse(event.endAt), start = Date.parse(event.startAt);
    return ['published', 'cancelled', 'archived'].includes(event.status) && Number.isFinite(start) && Number.isFinite(end) &&
      (event.status === 'archived' || end <= now) === past;
  }).sort((a, b) => past ? Date.parse(b.endAt) - Date.parse(a.endAt) : Date.parse(a.startAt) - Date.parse(b.startAt));
}
