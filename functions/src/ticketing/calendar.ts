import type { EventDraft } from './domain';
type CalendarEvent = Pick<EventDraft, 'title' | 'slug' | 'startAt' | 'endAt' | 'timezone' | 'city' | 'region' | 'venueVisibility'> &
  Partial<Pick<EventDraft, 'venueName' | 'address'>> & { id: string; revision?: number; status?: string };
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escaped = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
// RFC 5545: fold by UTF-8 octets without splitting a multibyte character.
function fold(line: string) {
  const parts: string[] = []; let current = '', size = 0;
  for (const character of line) { const bytes = Buffer.byteLength(character); if (size + bytes > 75) { parts.push(current); current = ' '; size = 1; } current += character; size += bytes; }
  return [...parts, current].join('\r\n');
}
export function calendarLinks(event: CalendarEvent, base: string) {
  const url = `${base}/events/${encodeURIComponent(event.slug)}`;
  const location = event.venueVisibility === 'public' ? [event.venueName, event.address, event.city, event.region].filter(Boolean).join(', ') : [event.city, event.region].filter(Boolean).join(', ');
  const details = `Event details and updates: ${url}${event.venueVisibility === 'holders' ? '\nExact venue and directions are available to confirmed attendees in the Pluto app.' : ''}`;
  const query = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${stamp(event.startAt)}/${stamp(event.endAt)}`, ctz: event.timezone, details, location });
  return { ics: `${url}/calendar.ics`, google: `https://calendar.google.com/calendar/render?${query}`, url, location, details };
}
export function eventCalendar(event: CalendarEvent, base: string, now = new Date().toISOString()) {
  const links = calendarLinks(event, base);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pluto Events//Event Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${event.id}@pluto.events`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(event.startAt)}`, `DTEND:${stamp(event.endAt)}`,
    `SEQUENCE:${event.revision || 0}`, `SUMMARY:${escaped(event.title)}`, `DESCRIPTION:${escaped(links.details)}`, `LOCATION:${escaped(links.location)}`,
    `URL:${links.url}`, `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR', ''].map(fold).join('\r\n');
}
