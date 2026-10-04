import { hash, type EventDraft } from './domain';
export const noticeVersion = (draft: EventDraft, status: string) => hash(JSON.stringify([status, draft.title, draft.startAt, draft.endAt, draft.timezone, draft.city, draft.region, draft.venueVisibility, draft.venueRevealScheduled, draft.venueRevealAt, draft.venueName, draft.address, draft.directions]));
export function publicationNotice(eventId: string, current: any, draft: EventDraft, status: string, revision: number, uid: string) {
  if (!current.liveDraft) return null;
  const old = current.liveDraft;
  const kind = status === 'cancelled' && current.status !== 'cancelled' ? 'event-cancelled' : status === 'published' && current.status === 'published' && JSON.stringify([old.startAt, old.endAt, old.timezone]) !== JSON.stringify([draft.startAt, draft.endAt, draft.timezone]) ? 'event-rescheduled' : null;
  if (!kind) return null;
  return { key: hash(`${eventId}:${revision}:${kind}:${current.updatedAt || 0}`), eventId, kind, status: 'pending', version: noticeVersion(draft, status), phase: 'tickets', cursor: '', queued: 0, createdAt: Date.now(), createdBy: uid, title: draft.title, body: kind === 'event-cancelled' ? 'This event has been cancelled. Open Pluto for the latest information. Refund exceptions remain at the organizer’s discretion.' : 'The event schedule has changed. Check the updated dates in Pluto and update your calendar.' };
}
