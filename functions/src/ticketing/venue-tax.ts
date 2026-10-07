import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { fail, hash, type EventDraft } from './domain';

// Verified category in Stripe's location-sales guide. Organizers confirm the
// category in the editor; camping/vehicle passes require their own tax code.
export const admissionTaxCode = 'txcd_50010001';
const states = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export function venueTaxAddress(draft: EventDraft) {
  const state = draft.region.trim().toUpperCase(), postal_code = (draft.postalCode || '').trim();
  if (!draft.address.trim() || !draft.city.trim() || !states.has(state) || !/^\d{5}(-\d{4})?$/.test(postal_code)) {
    fail('Automatic tax needs the venue street address, city, two-letter US state and ZIP code. Add them in Event Studio and publish the venue changes first.');
  }
  return { country: 'US', state, postal_code, city: draft.city.trim(), line1: draft.address.trim() };
}
export async function assertVenueRegistration(stripe: Stripe, state: string, livemode: boolean) {
  const settings = await stripe.tax.settings.retrieve();
  if (settings.status !== 'active' || settings.livemode !== livemode) fail('Enable Stripe Tax in this payment environment before using automatic venue tax.', 409);
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const registrations = await stripe.tax.registrations.list({ status: 'active', limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    const now = Math.floor(Date.now() / 1000);
    if (registrations.data.some(r => r.livemode === livemode && r.country === 'US' && r.status === 'active' && r.country_options.us?.state === state && r.country_options.us?.type === 'state_sales_tax' && r.active_from <= now && (!r.expires_at || r.expires_at > now))) return;
    if (!registrations.has_more || !registrations.data.length) break;
    cursor = registrations.data.at(-1)!.id;
  }
  fail(`Stripe needs an active ${state} sales-tax registration in this payment environment. Add your registration in Stripe Tax, then save again.`, 409);
}
export async function prepareVenueTax(db: Firestore, stripe: Stripe, eventId: string, draft: EventDraft, livemode: boolean): Promise<EventDraft> {
  if (draft.tax.mode !== 'automatic' || !draft.tax.autoConfigure || draft.registrationMode === 'free') return draft;
  const paid = draft.offers.filter(o => o.active && o.unitAmount > 0);
  if (!paid.length) return draft;
  if (!draft.tax.confirmed) fail('Confirm the venue address and ticket tax categories before saving automatic tax.');
  const address = venueTaxAddress(draft);
  const classified = await Promise.all(paid.map(async offer => {
    const code = offer.taxCode || (['admission', 'upgrade'].includes(offer.kind) ? admissionTaxCode : '');
    if (!code) fail(`Choose a Stripe tax category for "${offer.name}" in its advanced tax settings. Camping and vehicle passes are not automatically classified as admission.`);
    const category = await stripe.taxCodes.retrieve(code);
    if (!['required', 'optional'].includes(category.requirements?.performance_location || '')) fail(`The tax category for "${offer.name}" does not support venue-based tax.`);
    return { offer, code };
  }));
  await assertVenueRegistration(stripe, address.state, livemode);
  const locationKey = hash(JSON.stringify([livemode, address.country, address.state, address.postal_code, address.city.toLowerCase(), address.line1.toLowerCase()]));
  const locationRef = db.collection('ticketingTaxLocations').doc(locationKey);
  const cached = await db.runTransaction(async tx => {
    const existing = (await tx.get(locationRef)).data();
    if (existing) return existing;
    const pending = { status: 'pending', address, livemode, createdAt: Date.now(), locationId: '' };
    tx.create(locationRef, pending); return pending;
  });
  let location: Stripe.Tax.Location;
  if (cached.status === 'ready') location = await stripe.tax.locations.retrieve(cached.locationId);
  else {
    if (Date.now() - cached.createdAt > 23 * 3600000) fail('An interrupted venue-tax setup needs administrator review before retrying.', 409);
    // Freeze the first request's address spelling for idempotent retries.
    location = await stripe.tax.locations.create({ type: 'performance', address: cached.address, description: 'Pluto event venue' }, { idempotencyKey: `pluto-tax-location-${locationKey}` });
    if (location.type !== 'performance' || location.livemode !== livemode) fail('Stripe returned a tax location from the wrong payment environment.', 409);
    await locationRef.set({ ...cached, status: 'ready', locationId: location.id });
  }
  if (location.type !== 'performance' || location.livemode !== livemode || location.address.country !== 'US' || location.address.state !== address.state || location.address.postal_code !== address.postal_code) fail('The saved Stripe tax location does not match this venue or payment environment.', 409);
  const products = new Map<string, { productId: string; code: string }>();
  for (const { offer, code } of classified) {
    const name = `${draft.title} — ${offer.name}`;
    const signature = hash(JSON.stringify([livemode, eventId, offer.id, name, code, location.id]));
    const productId = `pluto_tax_${signature}`, ref = db.collection('ticketingTaxProducts').doc(signature);
    let product: Stripe.Product | Stripe.DeletedProduct;
    try { product = await stripe.products.retrieve(productId); }
    catch (error: any) {
      if (error.code !== 'resource_missing') throw error;
      try { product = await stripe.products.create({ id: productId, name, tax_code: code, tax_details: { performance_location: location.id }, metadata: { pluto_event_id: eventId, pluto_offer_id: offer.id } }, { idempotencyKey: `pluto-tax-product-${signature}` }); }
      catch (createError: any) {
        if (createError.code !== 'resource_already_exists') throw createError;
        product = await stripe.products.retrieve(productId);
      }
    }
    if (product.deleted || !product.active || product.livemode !== livemode || product.tax_details?.performance_location !== location.id || (typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id) !== code || product.metadata.pluto_event_id !== eventId || product.metadata.pluto_offer_id !== offer.id) fail('The saved Stripe ticket product does not match this event tax setup.', 409);
    await ref.set({ eventId, offerId: offer.id, productId, locationId: location.id, code, livemode });
    products.set(offer.id, { productId, code });
  }
  return { ...draft, tax: { ...draft.tax, performanceLocationId: location.id }, offers: draft.offers.map(offer => {
    const product = products.get(offer.id);
    return product ? { ...offer, taxCode: product.code, stripeProductId: product.productId } : offer;
  }) };
}
