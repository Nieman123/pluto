const matches = (left, right) => Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right);

// Follow event defaults while preserving independently configured ticket windows.
export function updateEventSchedule(draft, path, value) {
  if (!['startAt', 'endAt', 'admissionStartsAt'].includes(path)) return false;
  const before = { startAt: draft.startAt, endAt: draft.endAt, admissionStartsAt: draft.admissionStartsAt };
  draft[path] = value;
  if (path === 'startAt' && matches(before.admissionStartsAt, before.startAt)) draft.admissionStartsAt = value;
  for (const offer of draft.offers) {
    if (draft.admissionStartsAt !== before.admissionStartsAt && matches(offer.validFrom, before.admissionStartsAt)) offer.validFrom = draft.admissionStartsAt;
    if (path === 'endAt') {
      if (matches(offer.validUntil, before.endAt)) offer.validUntil = value;
      if (matches(offer.salesEnd, before.endAt)) offer.salesEnd = value;
    }
  }
  return true;
}
