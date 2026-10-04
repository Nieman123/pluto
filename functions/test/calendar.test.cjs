const test = require('node:test'), assert = require('node:assert/strict');
const { eventCalendar, calendarLinks } = require('../lib/ticketing/calendar');
const event = { id: 'festival', slug: 'festival', title: 'Pluto, music; together 🎶', startAt: '2027-03-14T05:00:00Z', endAt: '2027-03-15T05:00:00Z', timezone: 'America/New_York', city: 'Asheville', region: 'NC', venueName: 'Secret house', address: '123 Hidden Lane', venueVisibility: 'holders', revision: 4 };
test('calendar preserves absolute multi-day DST times and excludes private addresses from both formats', () => {
  const ics = eventCalendar(event, 'https://pluto.events', '2026-10-04T20:00:00Z'), google = new URL(calendarLinks(event, 'https://pluto.events').google);
  assert.match(ics, /DTSTART:20270314T050000Z\r\nDTEND:20270315T050000Z/);
  assert.equal(google.searchParams.get('dates'), '20270314T050000Z/20270315T050000Z'); assert.equal(google.searchParams.get('ctz'), event.timezone);
  for (const value of [event.venueName, event.address]) { assert.ok(!ics.includes(value)); assert.ok(!decodeURIComponent(google.toString()).includes(value)); }
  assert.match(ics, /UID:festival@pluto.events/); assert.match(ics, /SEQUENCE:4/); assert.match(ics, /SUMMARY:Pluto\\, music\\; together/);
  assert.match(eventCalendar({ ...event, status: 'cancelled', venueVisibility: 'public' }, 'https://pluto.events'), /STATUS:CANCELLED/);
});
test('calendar text cannot inject properties and Unicode lines fold within RFC octet limits', () => {
  const ics = eventCalendar({ ...event, title: `${'🎶'.repeat(80)}\r\nBEGIN:VALARM\nACTION:DISPLAY` }, 'https://pluto.events');
  assert.ok(!ics.includes('\r\nBEGIN:VALARM')); assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  const unfolded = ics.replace(/\r\n /g, ''); assert.ok(unfolded.includes('🎶'.repeat(80))); assert.ok(!unfolded.includes('�'));
});
