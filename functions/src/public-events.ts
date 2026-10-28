import type { Firestore } from 'firebase-admin/firestore';
import { normalizeEvent, sortEvents, type PublicEvent } from './public-data';
import { activeAppEventCards } from './ticketing/event-discovery';

export async function loadHomepageEvents(db: Firestore, origin: string, now = Date.now()): Promise<PublicEvent[]> {
  const [published, legacy] = await Promise.all([
    db.collection('publishedEvents').where('endAt', '>', new Date(now).toISOString()).get(),
    db.collection('currentEvents').get(),
  ]);
  // Native cards can outlive their events and lack schedules. Use the published
  // schedule instead, so stale cards cannot revive ended or unpublished events.
  const native = activeAppEventCards(published.docs.map(doc => ({ ...doc.data(), id: doc.id })), [], origin, now);
  const events = [
    ...native.map(event => normalizeEvent(event.id, event, now)),
    ...legacy.docs.filter(doc => !doc.id.startsWith('native-'))
      .map(doc => normalizeEvent(doc.id, doc.data(), now)),
  ].filter((event): event is PublicEvent => event !== null);
  return sortEvents(events);
}
