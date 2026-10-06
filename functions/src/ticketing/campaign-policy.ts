import type { EventDraft } from './domain';

export const campaignPageSize = 100;
export function campaignNeedsWork(before: any, after: any) {
  return after?.status === 'pending' && (!before || before.status !== 'pending' ||
    before.cursor !== after.cursor || before.phase !== after.phase || before.wakeRevision !== after.wakeRevision);
}

// Old jobs lack expiresAt: infer it from the published event too. Notices about
// cancellation/rescheduling and organizer announcements deliberately retain
// their content and are not given an arbitrary post-event cutoff.
export function campaignExpired(campaign: any, draft: EventDraft, now = Date.now()) {
  const boundary = campaign.kind === 'event-reminder' ? Date.parse(draft.startAt) :
    campaign.kind === 'event-location' ? Date.parse(draft.endAt) : Infinity;
  const expiresAt = Math.min(boundary, typeof campaign.expiresAt === 'number' ? campaign.expiresAt : Infinity);
  return !Number.isFinite(boundary) && boundary !== Infinity || now >= expiresAt;
}

export function reminderBody(draft: EventDraft) {
  const when = new Intl.DateTimeFormat('en-US', { timeZone: draft.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(draft.startAt));
  return `Your event starts ${when} (${draft.timezone}). Check Pluto for the current schedule, save your tickets online, and bring a photo ID.`;
}
