import { createHash, randomBytes } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';

export class TicketingError extends Error {
  constructor(public status: number, message: string, public code = '') { super(message); }
}
export function fail(message: string, status = 400, code = ''): never { throw new TicketingError(status, message, code); }
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export function text(value: unknown, label: string, max = 500, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) return fail(`Check ${label}.`);
  return value.trim();
}
export function id(value: unknown): string {
  const result = text(value, 'identifier', 80, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) return fail('Invalid identifier.');
  return result;
}
export function emailJobId(value: unknown): string {
  // Campaign jobs combine two SHA-256 hashes. Keep their existing IDs so
  // queued jobs and retries retain the same provider idempotency key.
  // The 200-character cap also leaves room for the Resend "pluto-" prefix.
  const result = text(value, 'email job identifier', 200, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) return fail('Invalid email job identifier.');
  return result;
}
export function receipt(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return fail('Invalid order access key.');
  return value;
}
export function email(value: unknown): string {
  const result = text(value, 'email address', 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) return fail('Enter a valid email address.');
  return result;
}
export function integer(value: unknown, label: string, min = 0, max = 1000000): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) return fail(`Check ${label}.`);
  return value as number;
}
export function date(value: unknown, label: string): string {
  const result = text(value, label, 40, true);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) return fail(`Check ${label}.`);
  return new Date(result).toISOString();
}
function list(value: unknown, label: string, max: number): any[] {
  if (!Array.isArray(value) || value.length > max) return fail(`Check ${label}.`);
  return value;
}
function unique(values: string[], label: string) { if (new Set(values).size !== values.length) fail(`Duplicate ${label}.`); }
export function html(value: unknown): string {
  return sanitizeHtml(text(value, 'content', 30000), {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'],
    allowedAttributes: { a: ['href'] }, allowedSchemes: ['https', 'mailto'], allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  });
}
export interface Media { assetId: string; alt: string; caption: string; focalX: number; focalY: number }
function media(value: any): Media | null {
  if (!value) return null;
  return { assetId: id(value.assetId), alt: text(value.alt || '', 'image alt text', 300), caption: text(value.caption || '', 'caption', 500),
    focalX: integer(value.focalX ?? 50, 'image focal point', 0, 100), focalY: integer(value.focalY ?? 50, 'image focal point', 0, 100) };
}
export interface Offer {
  id: string; name: string; description: string; kind: string; unitAmount: number; maxPerOrder: number;
  checkInPoints?: number;
  salesStart: string; salesEnd: string; validFrom: string; validUntil: string; active: boolean;
  pools: Record<string, number>; requiresOfferIds: string[]; taxCode: string; stripeProductId: string; stripeTaxRateIds: string[];
}
export interface Promotion { code: string; type: 'percent' | 'fixed'; value: number; limit: number; startsAt: string; endsAt: string; offerIds: string[] }
export interface EventDraft {
  registrationMode: 'tickets' | 'rsvp' | 'rsvp-approval' | 'free';
  remindersEnabled?: boolean; waitlistEnabled?: boolean; waitlistOfferMinutes?: number;
  title: string; slug: string; subtitle: string; descriptionHtml: string; startAt: string; endAt: string; admissionStartsAt: string;
  timezone: string; city: string; region: string; venueName: string; address: string; postalCode?: string; directions: string; venueVisibility: 'public' | 'holders';
  venueRevealScheduled: boolean; venueRevealAt: string | null;
  hero: Media | null; flyer: Media | null; gallery: Media[];
  lineup: { name: string; genre: string; time: string; image: Media | null }[];
  sections: { id: string; type: string; title: string; bodyHtml: string; visible: boolean }[];
  theme: { preset: string; accent: string; font: string };
  offers: Offer[]; pools: { id: string; name: string; capacity: number }[]; promos: Promotion[];
  tax: { mode: 'sandbox' | 'manual' | 'automatic'; confirmed: boolean; performanceLocationId: string; autoConfigure?: boolean };
}
export function validateDraft(raw: any): EventDraft {
  if (!raw || typeof raw !== 'object') return fail('Missing event.');
  const slug = text(raw.slug, 'event URL', 80, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('Use lowercase letters, numbers and hyphens for the event URL.');
  const startAt = date(raw.startAt, 'start time'), endAt = date(raw.endAt, 'end time');
  if (endAt <= startAt) fail('Event end must be after its start.');
  const admissionStartsAt = date(raw.admissionStartsAt || startAt, 'first admission time');
  const timezone = text(raw.timezone, 'timezone', 100, true);
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { fail('Choose a valid IANA timezone.'); }
  const pools = list(raw.pools || [], 'capacity pools', 30).map(p => ({ id: id(p.id), name: text(p.name, 'pool name', 120, true), capacity: integer(p.capacity, 'capacity') }));
  unique(pools.map(p => p.id), 'capacity pools');
  const offers: Offer[] = list(raw.offers || [], 'ticket types', 30).map(o => {
    const poolUse: Record<string, number> = {};
    for (const [key, units] of Object.entries(o.pools || {})) {
      if (!pools.some(p => p.id === key)) fail('Ticket references an unknown capacity pool.');
      poolUse[key] = integer(units, 'pool units', 1, 20);
    }
    if (!Object.keys(poolUse).length) fail('Every ticket type needs a capacity pool.');
    const salesStart = date(o.salesStart, 'sales start'), salesEnd = date(o.salesEnd, 'sales end');
    const validFrom = date(o.validFrom || admissionStartsAt, 'admission start'), validUntil = date(o.validUntil || endAt, 'admission end');
    if (salesEnd <= salesStart || validUntil <= validFrom) fail('Check ticket sales and admission windows.');
    return { id: id(o.id), name: text(o.name, 'ticket name', 150, true), description: text(o.description || '', 'ticket description', 1000),
      kind: ['admission', 'camping', 'vehicle', 'upgrade'].includes(o.kind) ? o.kind : 'admission', unitAmount: integer(o.unitAmount, 'ticket price', 0, 1000000),
      checkInPoints: integer(o.checkInPoints ?? 0, 'check-in Pluto Points', 0, 1000000),
      maxPerOrder: integer(o.maxPerOrder ?? 10, 'order limit', 1, 20), salesStart, salesEnd, validFrom, validUntil, active: o.active !== false,
      pools: poolUse, requiresOfferIds: [],
      taxCode: text(o.taxCode || '', 'tax code', 80), stripeProductId: text(o.stripeProductId || '', 'Stripe product', 80),
      stripeTaxRateIds: list(o.stripeTaxRateIds || [], 'tax rates', 5).map(v => text(v, 'tax rate', 80, true)) };
  });
  unique(offers.map(o => o.id), 'ticket types');
  const promos: Promotion[] = list(raw.promos || [], 'promotions', 40).map(p => {
    const code = text(p.code, 'promo code', 40, true).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) fail('Check promo code.');
    const type = p.type === 'percent' ? 'percent' : 'fixed';
    const startsAt = date(p.startsAt, 'promotion start'), endsAt = date(p.endsAt, 'promotion end');
    if (endsAt <= startsAt) fail('Check promotion dates.');
    const offerIds = list(p.offerIds || [], 'promotion ticket types', 30).map(id);
    if (offerIds.some(key => !offers.some(o => o.id === key))) fail('Promotion references an unknown ticket type.');
    return { code, type, value: integer(p.value, 'discount', 1, type === 'percent' ? 100 : 1000000), limit: integer(p.limit, 'redemption limit', 1), startsAt, endsAt, offerIds };
  });
  unique(promos.map(p => p.code), 'promo codes');
  const sections = list(raw.sections || [], 'sections', 30).map(s => ({ id: id(s.id), type: text(s.type || 'custom', 'section type', 40), title: text(s.title, 'section title', 200, true), bodyHtml: html(s.bodyHtml || ''), visible: s.visible !== false }));
  unique(sections.map(s => s.id), 'sections');
  const accent = text(raw.theme?.accent || '#c4a2ff', 'accent color', 7);
  if (!/^#[a-fA-F0-9]{6}$/.test(accent)) fail('Use a six-digit hex accent color.');
  const taxMode = raw.tax?.mode || 'sandbox';
  if (!['sandbox', 'manual', 'automatic'].includes(taxMode)) fail('Invalid tax mode.');
  const registrationMode = raw.registrationMode || 'tickets';
  if (!['tickets', 'rsvp', 'rsvp-approval', 'free'].includes(registrationMode)) fail('Choose a valid registration type.');
  if (['rsvp', 'rsvp-approval'].includes(registrationMode)) {
    for (const offer of offers.filter(o => o.active)) {
      const kind = offer.unitAmount > 0 && registrationMode === 'rsvp-approval' ? 'upgrade' : 'admission';
      if (offer.kind !== kind || offer.maxPerOrder !== 1) fail(registrationMode === 'rsvp-approval'
        ? 'Use free RSVP admission passes or paid VIP upgrades, each limited to one per order. Paid upgrades require an approved RSVP.'
        : 'Use free RSVP admission or paid admission tickets, each limited to one per order.');
    }
    const admissionPools = new Set(offers.filter(o => o.active && o.unitAmount === 0).flatMap(o => Object.keys(o.pools)));
    if (offers.some(o => o.active && o.kind === 'upgrade' && Object.keys(o.pools).some(pool => admissionPools.has(pool)))) fail('VIP upgrades need a separate capacity pool from RSVP admission. Add a VIP pool so admission capacity is counted once.');
  } else if (offers.some(o => o.active && o.kind === 'upgrade')) fail('VIP upgrade passes require an approval-required RSVP event. Use Admission for a ticket that includes entry.');
  if (registrationMode === 'free' && offers.some(o => o.active)) fail('Free events do not issue tickets. Deactivate ticket types before saving.');
  if (registrationMode === 'free' && raw.venueVisibility !== 'public') fail('Free events need a public venue so guests can find the event without a ticket or RSVP.');
  const venueRevealScheduled = raw.venueVisibility === 'holders' && raw.venueRevealScheduled === true;
  const venueRevealAt = venueRevealScheduled ? date(raw.venueRevealAt, 'location reveal time') : null;
  if (venueRevealAt && venueRevealAt >= endAt) fail('Location reveal must be before the event ends.');
  return { registrationMode, remindersEnabled: raw.remindersEnabled !== false, waitlistEnabled: raw.waitlistEnabled === true && registrationMode !== 'free', waitlistOfferMinutes: integer(raw.waitlistOfferMinutes ?? 30, 'waitlist offer minutes', 15, 120), title: text(raw.title, 'title', 200, true), slug, subtitle: text(raw.subtitle || '', 'subtitle', 400), descriptionHtml: html(raw.descriptionHtml || ''),
    startAt, endAt, admissionStartsAt, timezone, city: text(raw.city || '', 'city', 100), region: text(raw.region || '', 'state', 100),
    venueName: text(raw.venueName || '', 'venue', 200), address: text(raw.address || '', 'address', 500), postalCode: text(raw.postalCode || '', 'venue ZIP code', 10), directions: text(raw.directions || '', 'directions', 3000),
    venueVisibility: raw.venueVisibility === 'holders' ? 'holders' : 'public', venueRevealScheduled, venueRevealAt, hero: media(raw.hero), flyer: media(raw.flyer),
    gallery: list(raw.gallery || [], 'gallery', 30).map(media).filter((v): v is Media => !!v),
    lineup: list(raw.lineup || [], 'lineup', 100).map(a => ({ name: text(a.name, 'artist', 150, true), genre: text(a.genre || '', 'genre', 100), time: text(a.time || '', 'set time', 150), image: media(a.image) })),
    sections, theme: { preset: ['pluto', 'artwork-dark', 'light'].includes(raw.theme?.preset) ? raw.theme.preset : 'pluto', accent,
      font: ['Montserrat', 'SourceCodePro'].includes(raw.theme?.font) ? raw.theme.font : 'Montserrat' }, offers, pools, promos,
    tax: { mode: taxMode, confirmed: raw.tax?.confirmed === true, performanceLocationId: text(raw.tax?.performanceLocationId || '', 'performance location', 100), autoConfigure: raw.tax?.autoConfigure === true } };
}
export function allMedia(draft: EventDraft): Media[] {
  return [draft.hero, draft.flyer, ...draft.gallery, ...draft.lineup.map(a => a.image)].filter((m): m is Media => !!m);
}
export function publicEvent(eventId: string, draft: EventDraft, status: string, revision: number) {
  const { pools, promos, tax, address, postalCode, venueName, directions, ...content } = draft;
  return { ...content, id: eventId, status, revision,
    offers: (draft.registrationMode === 'free' ? [] : draft.offers.filter(o => o.active)).map(({ stripeProductId, stripeTaxRateIds, taxCode, pools, ...offer }) => offer),
    ...(draft.venueVisibility === 'public' ? { venueName, address, postalCode: postalCode || '', directions } : {}),
  };
}
// Location timing is enforced here on the server, never by hiding a sent address.
export function holderVenue(draft: EventDraft | undefined, now = Date.now()) {
  if (!draft) return null;
  const scheduled = draft.venueVisibility === 'holders' && draft.venueRevealScheduled === true;
  const revealAt = scheduled ? draft.venueRevealAt : null;
  const available = !scheduled || !!revealAt && Number.isFinite(Date.parse(revealAt)) && now >= Date.parse(revealAt);
  return { available, revealAt, timezone: draft.timezone, name: available ? draft.venueName : '', address: available ? draft.address : '', directions: available ? draft.directions : '' };
}
export interface Unit { offerId: string; name: string; kind: string; originalAmount: number; amount: number; discount: number; pools: Record<string, number>; validFrom: string; validUntil: string; taxCode: string; stripeProductId: string; stripeTaxRateIds: string[]; taxAmount?: number; stripeLineItemId?: string; stripeTaxLineItemId?: string }
export function cart(draft: EventDraft, items: any, code: unknown, now = Date.now()) {
  const lines = list(items, 'cart', 30), units: Unit[] = [], consumption: Record<string, number> = {};
  unique(lines.map(l => id(l.offerId)), 'cart items');
  if (!lines.length) fail('Choose at least one ticket.');
  for (const line of lines) {
    const offer = draft.offers.find(o => o.id === line.offerId && o.active);
    if (!offer || now < Date.parse(offer.salesStart) || now >= Date.parse(offer.salesEnd)) fail('This ticket is not currently on sale.', 409);
    const quantity = integer(line.quantity, 'quantity', 1, offer.maxPerOrder);
    for (let n = 0; n < quantity; n++) {
      units.push({ offerId: offer.id, name: offer.name, kind: offer.kind, originalAmount: offer.unitAmount, amount: offer.unitAmount, discount: 0,
        pools: offer.pools, validFrom: offer.validFrom, validUntil: offer.validUntil, taxCode: offer.taxCode, stripeProductId: offer.stripeProductId, stripeTaxRateIds: offer.stripeTaxRateIds });
      for (const [key, count] of Object.entries(offer.pools)) consumption[key] = (consumption[key] || 0) + count;
    }
  }
  if (units.length > 20) fail('A maximum of 20 tickets can be purchased per order.');
  const promoCode = text(code || '', 'promo code', 40).toUpperCase();
  const promo = promoCode ? draft.promos.find(p => p.code === promoCode) : undefined;
  if (promoCode && (!promo || now < Date.parse(promo.startsAt) || now >= Date.parse(promo.endsAt))) fail('This promo code is not available.', 409);
  if (promo) {
    const eligible = units.filter(u => !promo.offerIds.length || promo.offerIds.includes(u.offerId));
    const subtotal = eligible.reduce((n, u) => n + u.amount, 0);
    if (!subtotal) fail('This promotion does not apply to the selected tickets.');
    const totalDiscount = Math.min(subtotal, promo.type === 'percent' ? Math.round(subtotal * promo.value / 100) : promo.value);
    eligible.forEach(unit => { unit.discount = Math.floor(totalDiscount * unit.originalAmount / subtotal); });
    let remainder = totalDiscount - eligible.reduce((n, unit) => n + unit.discount, 0);
    const ranked = eligible.map((unit, index) => ({ unit, index, fraction: totalDiscount * unit.originalAmount % subtotal })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const { unit } of ranked) if (remainder > 0 && unit.discount < unit.originalAmount) { unit.discount++; remainder--; }
    eligible.forEach(unit => { unit.amount -= unit.discount; });
  }
  return { units, consumption, promoCode, total: units.reduce((n, u) => n + u.amount, 0), discount: units.reduce((n, u) => n + u.discount, 0) };
}
export function assertCapacity(consumption: Record<string, number>, pools: Record<string, any>) {
  for (const [key, count] of Object.entries(consumption)) {
    const pool = pools[key];
    if (!pool || pool.sold + pool.held + count > pool.capacity) fail('There are not enough tickets remaining for this selection.', 409);
  }
}
export function ticketId(orderId: string, index: number) { return hash(`${orderId}:${index}`).slice(0, 40); }
export function csv(rows: unknown[][]): string {
  return rows.map(row => row.map(value => { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; }).join(',')).join('\r\n');
}
