import express, { type Request, type Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Operations } from './operations';
import { allMedia, csv, fail, id, integer, publicEvent, serializeJson, TicketingError, type EventDraft } from './route-utils';
import { baseUrl, isLive, webhookKey } from './config';
import { orderPdf } from './pdf';

export function ticketingRouter(context: (path: string) => Record<string, unknown>, service = new Operations()) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" });
    if (req.path.startsWith('/tickets')) res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.post('/tickets/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || req.body;
    let event;
    try { event = service.stripe().webhooks.constructEvent(rawBody, req.get('Stripe-Signature') || '', webhookKey.value()); }
    catch { return res.status(400).json({ error: 'Invalid webhook signature.' }); }
    if (event.livemode !== isLive() || (event.account && event.account !== process.env.STRIPE_ACCOUNT_ID)) return res.status(400).json({ error: 'Unexpected payment environment or account.' });
    const supported = new Set(['checkout.session.completed', 'checkout.session.expired', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'refund.created', 'refund.updated', 'refund.failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']);
    if (!supported.has(event.type)) return res.json({ received: true, ignored: true });
    const data = event.data.object as any, ref = service.db.collection('ticketingWebhookInbox').doc(`${event.livemode ? 'live' : 'test'}_${event.id}`);
    await service.db.runTransaction(async tx => { if (!(await tx.get(ref)).exists) tx.create(ref, { type: event.type, objectId: data.id, orderId: data.metadata?.pluto_order_id || '',
      chargeId: data.charge || (event.type === 'charge.refunded' ? data.id : ''), paymentIntentId: typeof data.payment_intent === 'string' ? data.payment_intent : '',
      livemode: event.livemode, status: 'pending', receivedAt: Date.now(), attempts: 0 }); });
    res.json({ received: true });
  });
  const page = (req: Request, res: Response) => res.render('ticketing-console', { ...context(req.path), googleAnalyticsId: '',
    meta: { title: `${req.path.includes('admin') ? 'Event studio' : req.path.includes('staff') ? 'Ticket admission' : 'My tickets'} | Pluto Events`, description: 'Manage your Pluto Events tickets.', canonical: `${baseUrl()}${req.path}` },
    mode: req.path.includes('admin') ? 'admin' : req.path.includes('staff') ? 'staff' : 'customer', sandbox: !isLive() });
  router.get(['/tickets', '/tickets/order'], (req, res) => res.redirect(302, `/app/tickets${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));
  router.get(['/tickets/admin', '/tickets/staff'], page);
  router.get('/tickets/admission-sw.js', (_req, res) => res.type('application/javascript').set('Service-Worker-Allowed', '/tickets/').send(readFileSync(join(__dirname, 'admission-sw.js'), 'utf8')));
  router.get('/events', async (_req, res) => {
    const events = (await service.db.collection('publishedEvents').get()).docs.map(d => d.data()).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).map(e => ({ ...e,
      dateLabel: new Intl.DateTimeFormat('en-US', { timeZone: e.timezone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(e.startAt)),
      saleLabel: e.status === 'cancelled' ? 'Cancelled' : e.status === 'archived' || Date.parse(e.endAt) < Date.now() ? 'Past event' : 'Explore & get tickets' }));
    res.render('native-events', { ...context('/events'), meta: { title: 'Upcoming events | Pluto Events', description: 'Dance music, community and late nights with Pluto Events.', canonical: `${baseUrl()}/events` }, events });
  });
  router.get('/sitemap.xml', async (_req, res) => {
    const events = (await service.db.collection('publishedEvents').get()).docs.map(d => `/events/${d.data().slug}`);
    const routes = ['/', '/manafest', '/links', '/rentals', '/events', ...events];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(path => `<url><loc>${baseUrl()}${path}</loc></url>`).join('')}</urlset>`);
  });
  async function renderEvent(event: any, req: Request, res: Response, preview = false) {
    const media = (m: any) => m ? { ...m, url: `/events/${event.slug}/media/${m.assetId}` } : null;
    const mapped = { ...event, hero: media(event.hero), flyer: media(event.flyer), gallery: event.gallery.map(media), lineup: event.lineup.map((a: any) => ({ ...a, image: media(a.image) })) };
    const pools = (await service.event(event.id).collection('pools').get()).docs.map(d => d.data());
    const privateEvent = (await service.event(event.id).get()).data();
    const offerPools = privateEvent?.liveDraft?.offers || privateEvent?.draft.offers || [];
    const now = Date.now();
    mapped.offers = event.offers.map((o: any) => {
      const remaining = Math.max(0, Math.min(...Object.entries(offerPools.find((p: any) => p.id === o.id)?.pools || {}).map(([key, count]) => { const p = pools.find(p => p.id === key); return p ? Math.floor((p.capacity - p.sold - p.held) / (count as number)) : 0; }), 1000000));
      const availability = Date.parse(o.salesStart) > now ? 'Coming soon' : Date.parse(o.salesEnd) <= now ? 'Sales closed' : remaining <= 0 ? 'Sold out' : 'Available';
      return { ...o, remaining, availability, available: availability === 'Available', quantityLimit: Math.min(o.maxPerOrder, remaining), priceLabel: (o.unitAmount / 100).toFixed(2) };
    });
    const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: event.timezone, dateStyle: 'full', timeStyle: 'short' });
    const state = event.status === 'cancelled' ? 'Cancelled' : event.status === 'archived' || Date.parse(event.endAt) <= now ? 'Past event' : mapped.offers.some((o: any) => o.available) ? 'Tickets available' : mapped.offers.some((o: any) => o.availability === 'Coming soon') ? 'Coming soon' : mapped.offers.some((o: any) => o.availability === 'Sold out') ? 'Sold out' : 'Sales closed';
    const rgb = event.theme.accent.slice(1).match(/../g).map((c: string) => parseInt(c, 16) / 255).map((c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    const accentText = (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
    const jsonLd = serializeJson({ '@context': 'https://schema.org', '@type': 'MusicEvent', name: event.title, startDate: event.startAt, endDate: event.endAt,
      eventStatus: event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: event.venueName || `${event.city}, ${event.region}`, ...(event.address ? { address: event.address } : {}) },
      image: event.hero ? `${baseUrl()}/events/${event.slug}/media/${event.hero.assetId}` : undefined,
      offers: mapped.offers.map((o: any) => ({ '@type': 'Offer', name: o.name, price: (o.unitAmount / 100).toFixed(2), priceCurrency: 'USD', url: `${baseUrl()}/events/${event.slug}#tickets`, availability: o.available ? 'https://schema.org/InStock' : o.availability === 'Coming soon' ? 'https://schema.org/PreSale' : 'https://schema.org/SoldOut' })) });
    const view = { ...context(`/events/${event.slug}`), googleAnalyticsId: '', meta: { title: `${event.title} | Pluto Events`, description: event.subtitle, canonical: `${baseUrl()}/events/${event.slug}`, image: event.hero ? `${baseUrl()}/events/${event.slug}/media/${event.hero.assetId}` : `${baseUrl()}/assets/images/pluto-preview.jpg` },
      event: mapped, accentText, state, preview, sandbox: !isLive(), dateLabel: `${dateLabel.format(new Date(event.startAt))} – ${dateLabel.format(new Date(event.endAt))}`, jsonLd, checkoutJson: serializeJson({ eventId: event.id, offers: mapped.offers, preview, status: event.status, endAt: event.endAt }) };
    if (preview) {
      // Authenticated previews carry sanitized embedded images, never public draft URLs.
      for (const m of [mapped.hero, mapped.flyer, ...mapped.gallery, ...mapped.lineup.map((a: any) => a.image)].filter(Boolean)) m.url = `data:image/webp;base64,${(await service.media(event.id, m.assetId, res.locals.actor.uid)).toString('base64')}`;
      res.json({ html: res.app.get('nunjucksEnv').render('native-event.njk', view) });
    } else res.render('native-event', view);
  }
  router.get('/events/:slug/media/:assetId', async (req, res) => {
    const slug = (await service.db.collection('eventSlugs').doc(id(req.params.slug)).get()).data(); if (!slug) fail('Image not found.', 404);
    res.type('webp').send(await service.media(slug.eventId, id(req.params.assetId)));
  });
  router.get('/events/:slug', async (req, res) => {
    const slug = (await service.db.collection('eventSlugs').doc(id(req.params.slug)).get()).data(); if (!slug) fail('Event not found.', 404);
    if (slug.redirect) return res.redirect(301, `/events/${slug.redirect}`);
    const event = (await service.db.collection('publishedEvents').doc(slug.eventId).get()).data(); if (!event) fail('Event not found.', 404);
    await renderEvent(event, req, res);
  });
  router.use('/tickets/api', (req, _res, next) => {
    if (req.method !== 'POST') return next(new TicketingError(405, 'Use POST for ticketing requests.'));
    const allowed = new Set([baseUrl(), 'https://www.pluto.events', 'https://pluto-9b6ca.web.app', 'https://pluto-9b6ca.firebaseapp.com']);
    if (process.env.FIRESTORE_EMULATOR_HOST) { allowed.add('http://127.0.0.1:4173'); allowed.add('http://localhost:4173'); }
    const origin = req.get('origin');
    // Native Flutter clients have no browser Origin/Fetch-Metadata headers.
    // Every private operation still requires its bearer token or scoped proof.
    if ((origin && !allowed.has(origin)) || (!origin && req.get('sec-fetch-site')) || req.get('sec-fetch-site') === 'cross-site') return next(new TicketingError(403, 'Open ticketing on Pluto Events to continue.'));
    if (!req.is('application/json')) return next(new TicketingError(415, 'Send JSON.'));
    if (((req as Request & { rawBody?: Buffer }).rawBody?.length || 0) > 7300000) return next(new TicketingError(413, 'The request is too large.'));
    next();
  }, express.json({ limit: '7300kb' }), async (req, res, next) => {
    res.locals.actor = await service.actor((req.get('authorization') || '').replace(/^Bearer /, ''), true);
    const upload = req.path === '/staff/media', identity = res.locals.actor?.uid || req.ip || 'unknown';
    await service.rateLimit(identity, upload ? 'upload' : 'api', upload ? 200 : res.locals.actor ? 3000 : 600);
    next();
  });
  const actor = (res: Response): DecodedIdToken => res.locals.actor || fail('Sign in to continue.', 401);
  const bodyId = (req: Request, key = 'eventId') => id(req.body?.[key]);
  router.post('/tickets/api/checkout', async (req, res) => { await service.rateLimit(req.ip || 'unknown', 'checkout', 60); res.json(await service.checkout(req.body, res.locals.actor)); });
  router.post('/tickets/api/checkout-attempt', async (req, res) => res.json(await service.checkoutAttempt(req.body.accessKey)));
  router.post('/tickets/api/cancel', async (req, res) => res.json(await service.cancel(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor)));
  router.post('/tickets/api/order', async (req, res) => res.json(await service.view(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor, true)));
  router.post('/tickets/api/download', async (req, res) => res.type('pdf').set('Content-Disposition', 'attachment; filename="Pluto-payment-receipt.pdf"').send(await orderPdf(await service.view(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor))));
  router.post('/tickets/api/mine', async (_req, res) => res.json(await service.mine(actor(res))));
  router.post('/tickets/api/claim', async (_req, res) => res.json(await service.claim(actor(res))));
  router.post('/tickets/api/recover', async (req, res) => { await service.rateLimit(req.ip || 'unknown', 'recovery', 10); res.json(await service.recover(req.body.email)); });
  router.post('/tickets/api/recover/accept', async (req, res) => res.json(await service.acceptRecovery(req.body.token)));
  router.post('/tickets/api/resend', async (req, res) => { await service.rateLimit(req.ip || 'unknown', 'resend', 20); res.json(await service.resend(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor)); });
  router.post('/tickets/api/transfer', async (req, res) => res.json(await service.transfer(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor, bodyId(req, 'ticketId'), req.body.email, req.body.holderToken)));
  router.post('/tickets/api/transfer/accept', async (req, res) => res.json(await service.acceptTransfer(req.body.token, res.locals.actor)));
  router.post('/tickets/api/holder', async (req, res) => res.json(await service.holder(req.body.token, res.locals.actor)));
  router.post('/tickets/api/staff/events', async (_req, res) => res.json(await service.list(actor(res).uid)));
  router.post('/tickets/api/staff/get', async (req, res) => res.json(await service.get(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/save', async (req, res) => res.json(await service.save(bodyId(req), req.body.draft, req.body.revision, actor(res).uid)));
  router.post('/tickets/api/staff/publish', async (req, res) => res.json(await service.publish(bodyId(req), req.body.action, integer(req.body.revision, 'revision'), actor(res).uid)));
  router.post('/tickets/api/staff/duplicate', async (req, res) => res.json(await service.duplicate(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/revisions', async (req, res) => res.json(await service.revisions(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/restore', async (req, res) => res.json(await service.restore(bodyId(req), req.body.restoreRevision, req.body.revision, actor(res).uid)));
  router.post('/tickets/api/staff/media', async (req, res) => res.json(await service.upload(bodyId(req), req.body.image, actor(res).uid)));
  router.post('/tickets/api/staff/media/view', async (req, res) => res.type('webp').send(await service.media(bodyId(req), bodyId(req, 'assetId'), actor(res).uid)));
  router.post('/tickets/api/staff/preview', async (req, res) => { const event = await service.get(bodyId(req), actor(res).uid) as any; await renderEvent(publicEvent(event.id, event.draft, 'published', event.revision), req, res, true); });
  router.post('/tickets/api/staff/roles', async (req, res) => res.json(await service.setStaff(bodyId(req), bodyId(req, 'uid'), req.body.roles, actor(res).uid, req.body.promoterId || '')));
  router.post('/tickets/api/staff/promoter', async (req, res) => { await service.role(actor(res).uid, bodyId(req)); await service.event(bodyId(req)).collection('promoters').doc(bodyId(req, 'promoterId')).set({ active: req.body.active === true }); res.json({ saved: true }); });
  router.post('/tickets/api/staff/promoter-stats', async (req, res) => res.json(await service.promoterStats(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/orders', async (req, res) => res.json(await service.staffOrders(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/order', async (req, res) => { const orderId = bodyId(req, 'orderId'), order = (await service.order(orderId).get()).data(); if (!order) fail('Order not found.', 404); await service.role(actor(res).uid, order.eventId, ['manager', 'refund', 'cash']); res.json(await service.view(orderId, undefined, { uid: order.ownerUid } as DecodedIdToken, true)); });
  router.post('/tickets/api/staff/export', async (req, res) => { const data = await service.staffOrders(bodyId(req), actor(res).uid); res.type('text/csv').set('Content-Disposition', 'attachment; filename="Pluto-orders.csv"').send(csv([['Order', 'Buyer', 'Email', 'Status', 'Method', 'Gross cents', 'Discount cents', 'Tax cents', 'Refund cents', 'Stripe fee cents', 'Promoter'], ...data.orders.map((o: any) => [o.orderId, o.name, o.email, o.status, o.method, o.total, o.discount, o.taxAmount, o.refundedAmount, o.stripeFee, o.promoterId])])); });
  router.post('/tickets/api/staff/cash', async (req, res) => res.json(await service.checkout(req.body, null, req.body.comp === true ? 'comp' : 'cash', actor(res).uid)));
  router.post('/tickets/api/staff/cash-options', async (req, res) => { const eventId = bodyId(req); await service.role(actor(res).uid, eventId, ['cash']); const event = (await service.event(eventId).get()).data(); if (!event) fail('Event not found.', 404); res.json({ offers: (event.liveDraft || event.draft).offers.filter((o: any) => o.active), taxMode: (event.liveDraft || event.draft).tax.mode }); });
  router.post('/tickets/api/staff/retry', async (req, res) => { await service.admin(actor(res).uid); res.json(await service.maintenance()); });
  router.post('/tickets/api/staff/refund', async (req, res) => res.json(await service.refund(bodyId(req, 'orderId'), req.body.ticketIds, req.body.attempt, actor(res).uid)));
  router.post('/tickets/api/staff/refund-external', async (req, res) => res.json(await service.mapExternalRefund(bodyId(req, 'orderId'), req.body.ticketIds, actor(res).uid)));
  router.post('/tickets/api/staff/scan', async (req, res) => res.json(await service.scan(bodyId(req), req.body.qr, req.body.scanId, actor(res).uid, req.body.offline === true)));
  router.post('/tickets/api/staff/manifest', async (req, res) => res.json(await service.manifest(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/scan-review', async (req, res) => res.json(await service.reviewScan(bodyId(req), req.body.scanId, req.body.note, actor(res).uid)));
  router.use((error: any, req: Request, res: Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/tickets') && !req.path.startsWith('/events')) return next(error);
    const status = error instanceof TicketingError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 503) console.error('Ticketing request failed', { kind: error.name || 'unavailable', code: error.code || '' });
    if (req.path.includes('/api') || req.path.endsWith('/webhook')) res.status(status).json({ error: error instanceof TicketingError ? error.message : 'This request could not be confirmed. Keep this page open and retry.' });
    else res.status(status).type('html').send(`<h1>${status === 404 ? 'Event not found' : 'Event temporarily unavailable'}</h1><p><a href="/events">Browse events</a></p>`);
  });
  return router;
}
