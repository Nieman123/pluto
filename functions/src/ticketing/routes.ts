import express, { type Request, type Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Operations } from './operations';
import { allMedia, csv, fail, id, integer, publicEvent, serializeJson, TicketingError, type EventDraft } from './route-utils';
import { baseUrl, isLive, webhookKey } from './config';
import { orderPdf } from './pdf';
import { clientIdentity } from './client-identity';
import { email } from './domain';
import { Rewards } from '../rewards';
import { AppReview } from '../app-review';
import { DigitalWallet } from './digital-wallet';
import { allowedSiteOrigins } from '../deployment-config';
import { Webhook } from 'svix';
import { resendWebhookKey } from './config';
import { recordDelivery } from './delivery';
import { calendarLinks, eventCalendar } from './calendar';
import { discoveryEvents, activeAppEventCards } from './event-discovery';

export function ticketingRouter(context: (path: string) => Record<string, unknown>, service = new Operations()) {
  const router = express.Router();
  const rewards = new Rewards(service.db);
  const review = new AppReview(service.db);
  const digitalWallet = new DigitalWallet();
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
  router.post('/tickets/email-webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (process.env.TICKETING_RESEND_WEBHOOK_ENABLED !== 'true') return res.status(503).json({ error: 'Email delivery tracking is not enabled.' });
    let event: unknown;
    try {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || req.body;
      new Webhook(resendWebhookKey!.value()).verify(rawBody.toString('utf8'), {
        'svix-id': req.get('svix-id') || '', 'svix-timestamp': req.get('svix-timestamp') || '', 'svix-signature': req.get('svix-signature') || '' });
      event = JSON.parse(rawBody.toString('utf8'));
    } catch { return res.status(400).json({ error: 'Invalid webhook signature.' }); }
    try { res.json(await recordDelivery(service.db, req.get('svix-id')!, event)); }
    catch (error) { res.status(error instanceof TicketingError ? 400 : 503).json({ error: 'Delivery event could not be recorded.' }); }
  });
  const page = (req: Request, res: Response) => res.render('ticketing-console', { ...context(req.path), googleAnalyticsId: '',
    meta: { title: `${req.path.includes('admin') ? 'Event studio' : req.path.includes('staff') ? 'Ticket admission' : 'My tickets'} | Pluto Events`, description: 'Manage your Pluto Events tickets.', canonical: `${baseUrl()}${req.path}` },
    mode: req.path.includes('admin') ? 'admin' : req.path.includes('staff') ? 'staff' : 'customer', sandbox: !isLive() });
  router.get(['/tickets', '/tickets/order'], (req, res) => res.redirect(302, `/app/tickets${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));
  router.get(['/tickets/admin', '/tickets/staff'], page);
  router.get('/tickets/admission-sw.js', (_req, res) => res.type('application/javascript').set('Service-Worker-Allowed', '/tickets/').send(readFileSync(join(__dirname, 'admission-sw.js'), 'utf8')));
  router.get('/tickets/api/public/events', async (req, res) => {
    const authorization = req.get('authorization');
    const user = authorization ? await service.actor(authorization.replace(/^Bearer /, ''), true) : null;
    if (user && await review.enrolled(user.uid)) {
      await review.requireEnabled(user.uid);
      return res.json({ demo: true, events: review.events() });
    }
    const now = Date.now();
    const [published, legacy] = await Promise.all([
      service.db.collection('publishedEvents').where('endAt', '>', new Date(now).toISOString()).get(),
      service.db.collection('currentEvents').get(),
    ]);
    res.json({ events: activeAppEventCards(published.docs.map(d => d.data()),
      legacy.docs.map(d => ({ ...d.data(), id: d.id })), baseUrl(), now) });
  });
  router.get(['/events', '/past-events'], async (req, res) => {
    const past = req.path === '/past-events', path = past ? '/past-events' : '/events';
    const events = discoveryEvents((await service.db.collection('publishedEvents').get()).docs.map(d => d.data()), past).map(e => ({ ...e,
      dateLabel: new Intl.DateTimeFormat('en-US', { timeZone: e.timezone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(e.startAt)),
      saleLabel: e.status === 'cancelled' ? 'Cancelled' : past ? 'Past event' : e.registrationMode === 'free' ? 'Free entry · Just show up' : e.registrationMode === 'rsvp-approval' ? 'Request RSVP' : e.registrationMode === 'rsvp' ? 'RSVP now' : 'Explore & get tickets' }));
    res.render('native-events', { ...context(path), meta: { title: `${past ? 'Past' : 'Upcoming'} events | Pluto Events`, description: 'Dance music, community and late nights with Pluto Events.', canonical: `${baseUrl()}${path}` }, events, past });
  });
  router.get('/sitemap.xml', async (_req, res) => {
    const events = (await service.db.collection('publishedEvents').get()).docs.map(d => `/events/${d.data().slug}`);
    const routes = ['/', '/manafest', '/links', '/rentals', '/events', '/past-events', '/privacy', '/terms', '/delete-account', ...events];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(path => `<url><loc>${baseUrl()}${path}</loc></url>`).join('')}</urlset>`);
  });
  async function renderEvent(event: any, req: Request, res: Response, preview = false) {
    const media = (m: any) => m ? { ...m, url: `/events/${event.slug}/media/${m.assetId}` } : null;
    const rsvp = ['rsvp', 'rsvp-approval'].includes(event.registrationMode), free = event.registrationMode === 'free';
    const mapped = { ...event, rsvp, free, calendar: calendarLinks(event, baseUrl()), hero: media(event.hero), flyer: media(event.flyer), gallery: event.gallery.map(media), lineup: event.lineup.map((a: any) => ({ ...a, image: media(a.image) })) };
    const pools = free ? [] : (await service.event(event.id).collection('pools').get()).docs.map(d => d.data());
    const privateEvent = free ? undefined : (await service.event(event.id).get()).data();
    const offerPools = privateEvent?.liveDraft?.offers || privateEvent?.draft.offers || [];
    const now = Date.now();
    if (event.venueVisibility === 'holders' && event.venueRevealScheduled && event.venueRevealAt) mapped.locationRevealLabel = `${new Intl.DateTimeFormat('en-US', { timeZone: event.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(event.venueRevealAt))} (${event.timezone})`;
    mapped.offers = (free ? [] : event.offers).map((o: any) => {
      const remaining = Math.max(0, Math.min(...Object.entries(offerPools.find((p: any) => p.id === o.id)?.pools || {}).map(([key, count]) => { const p = pools.find(p => p.id === key); return p ? Math.floor((p.capacity - p.sold - p.held) / (count as number)) : 0; }), 1000000));
      const availability = Date.parse(o.salesStart) > now ? 'Coming soon' : Date.parse(o.salesEnd) <= now ? 'Sales closed' : remaining <= 0 ? 'Sold out' : 'Available';
      return { ...o, remaining, availability, available: availability === 'Available', waitlistAllowed: !!event.waitlistEnabled && event.status === 'published' && availability === 'Sold out' && o.kind === 'admission' && !o.requiresOfferIds.length, quantityLimit: Math.min(o.maxPerOrder, remaining), priceLabel: (o.unitAmount / 100).toFixed(2) };
    });
    mapped.hasPaidOffers = mapped.offers.some((o: any) => o.unitAmount > 0);
    const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: event.timezone, dateStyle: 'full', timeStyle: 'short' });
    const state = event.status === 'cancelled' ? 'Cancelled' : event.status === 'archived' || Date.parse(event.endAt) <= now ? 'Past event' : free ? 'Free entry' : mapped.offers.some((o: any) => o.available) ? rsvp ? 'RSVPs open' : 'Tickets available' : mapped.offers.some((o: any) => o.availability === 'Coming soon') ? 'Coming soon' : mapped.offers.some((o: any) => o.availability === 'Sold out') ? 'Sold out' : rsvp ? 'RSVPs closed' : 'Sales closed';
    const rgb = event.theme.accent.slice(1).match(/../g).map((c: string) => parseInt(c, 16) / 255).map((c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    const accentText = (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
    const jsonLd = serializeJson({ '@context': 'https://schema.org', '@type': 'MusicEvent', name: event.title, startDate: event.startAt, endDate: event.endAt,
      eventStatus: event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: free || rsvp ? true : undefined, location: { '@type': 'Place', name: event.venueName || `${event.city}, ${event.region}`, ...(event.address ? { address: event.address } : {}) },
      image: event.hero ? `${baseUrl()}/events/${event.slug}/media/${event.hero.assetId}` : undefined,
      offers: free ? undefined : mapped.offers.map((o: any) => ({ '@type': 'Offer', name: o.name, price: (o.unitAmount / 100).toFixed(2), priceCurrency: 'USD', url: `${baseUrl()}/events/${event.slug}#tickets`, availability: o.available ? 'https://schema.org/InStock' : o.availability === 'Coming soon' ? 'https://schema.org/PreSale' : 'https://schema.org/SoldOut' })) });
    const view = { ...context(`/events/${event.slug}`), googleAnalyticsId: '', meta: { title: `${event.title} | Pluto Events`, description: event.subtitle, canonical: `${baseUrl()}/events/${event.slug}`, image: event.hero ? `${baseUrl()}/events/${event.slug}/media/${event.hero.assetId}` : `${baseUrl()}/assets/images/pluto-preview.jpg` },
      event: mapped, accentText, state, preview, sandbox: !isLive(), dateLabel: `${dateLabel.format(new Date(event.startAt))} – ${dateLabel.format(new Date(event.endAt))}`, jsonLd, checkoutJson: serializeJson({ eventId: event.id, registrationMode: event.registrationMode || 'tickets', offers: mapped.offers, preview, status: event.status, endAt: event.endAt }) };
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
  router.get('/events/:slug/calendar.ics', async (req, res) => {
    const slug = (await service.db.collection('eventSlugs').doc(id(req.params.slug)).get()).data();
    const event = slug ? (await service.db.collection('publishedEvents').doc(slug.eventId).get()).data() : null;
    if (!event) fail('Event not found.', 404);
    res.type('text/calendar; charset=utf-8').set('Content-Disposition', 'inline; filename="pluto-event.ics"').send(eventCalendar(event as any, baseUrl()));
  });
  router.get('/events/:slug', async (req, res) => {
    const slug = (await service.db.collection('eventSlugs').doc(id(req.params.slug)).get()).data(); if (!slug) fail('Event not found.', 404);
    if (slug.redirect) return res.redirect(301, `/events/${slug.redirect}`);
    const event = (await service.db.collection('publishedEvents').doc(slug.eventId).get()).data(); if (!event) fail('Event not found.', 404);
    await renderEvent(event, req, res);
  });
  router.use('/tickets/api', (req, _res, next) => {
    if (req.method !== 'POST') return next(new TicketingError(405, 'Use POST for ticketing requests.'));
    const allowed = allowedSiteOrigins();
    const origin = req.get('origin');
    // Native Flutter clients have no browser Origin/Fetch-Metadata headers.
    // Every private operation still requires its bearer token or scoped proof.
    if ((origin && !allowed.has(origin)) || (!origin && req.get('sec-fetch-site')) || req.get('sec-fetch-site') === 'cross-site') return next(new TicketingError(403, 'Open ticketing on Pluto Events to continue.'));
    if (!req.is('application/json')) return next(new TicketingError(415, 'Send JSON.'));
    if (((req as Request & { rawBody?: Buffer }).rawBody?.length || 0) > 7300000) return next(new TicketingError(413, 'The request is too large.'));
    next();
  }, express.json({ limit: '7300kb' }), async (req, res, next) => {
    res.locals.actor = await service.actor((req.get('authorization') || '').replace(/^Bearer /, ''), true);
    // Intercept every private API before any live operation or scanner authority.
    // Even disabled enrolled accounts cannot fall back to real ticketing.
    if (res.locals.actor && await review.enrolled(res.locals.actor.uid)) {
      await service.rateLimit(res.locals.actor.uid, 'demo-api', 120);
      return res.json(await review.handle(req.path, req.body, res.locals.actor));
    }
    const scannerRoutes = ['/staff/scan', '/staff/manifest', '/staff/scan-review', '/staff/guestlist', '/staff/guestlist/arrive', '/staff/attendance', '/staff/attendance/move', '/scanner/session'];
    if (req.get('x-pluto-scanner') && scannerRoutes.includes(req.path)) res.locals.scanner = await service.scannerSession(req.get('x-pluto-scanner')!);
    const upload = req.path === '/staff/media', identity = clientIdentity(req, res.locals.actor?.uid, res.locals.scanner ? req.get('x-pluto-scanner') : undefined);
    res.locals.rateIdentity = identity;
    await service.rateLimit(req.ip || 'unknown', 'network-burst', 6000, 60000, 16);
    await service.rateLimit(identity, upload ? 'upload' : 'api', upload ? 200 : res.locals.actor || res.locals.scanner ? 6000 : 1200);
    next();
  });
  const actor = (res: Response): DecodedIdToken => res.locals.actor || fail('Sign in to continue.', 401);
  const admissionIdentity = (req: Request, res: Response) => req.get('x-pluto-scanner') ? { scannerToken: req.get('x-pluto-scanner')! } : actor(res).uid;
  const bodyId = (req: Request, key = 'eventId') => id(req.body?.[key]);
  router.post('/tickets/api/account/navigation', async (_req, res) => res.json({ admin: (await service.db.collection('adminUsers').doc(actor(res).uid).get()).exists }));
  router.post('/tickets/api/waitlist/verification', async (req, res) => { await service.rateLimit(email(req.body.email), 'waitlist-verification-contact', 5); await service.rateLimit(res.locals.rateIdentity, 'waitlist-verification-client', 20); res.json(await service.requestRsvpVerification(req.body, res.locals.actor, 'waitlist')); });
  router.post('/tickets/api/waitlist/join', async (req, res) => { await service.rateLimit(email(req.body.email), 'waitlist-join-contact', 20); res.json(await service.joinWaitlist(req.body, res.locals.actor)); });
  router.post('/tickets/api/waitlist/view', async (req, res) => res.json(await service.waitlistView(req.body)));
  router.post('/tickets/api/waitlist/withdraw', async (req, res) => res.json(await service.withdrawWaitlist(req.body)));
  router.post('/tickets/api/staff/waitlist', async (req, res) => res.json(await service.staffWaitlist(bodyId(req), actor(res).uid, req.body.cursor)));
  router.post('/tickets/api/staff/waitlist/approve', async (req, res) => res.json(await service.approveWaitlist(bodyId(req), bodyId(req, 'entryId'), actor(res).uid, req.body.note)));
  router.post('/tickets/api/staff/communications', async (req, res) => res.json(await service.communications(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/announcements', async (req, res) => res.json(await service.announce(bodyId(req), req.body, actor(res).uid)));
  router.post('/tickets/api/staff/attendance', async (req, res) => res.json(await service.attendance(bodyId(req), req.body, admissionIdentity(req, res))));
  router.post('/tickets/api/staff/attendance/move', async (req, res) => res.json(await service.doorMovement(bodyId(req), req.body, admissionIdentity(req, res))));
  router.post('/tickets/api/wallet/options', (_req, res) => res.json(digitalWallet.options()));
  router.post('/tickets/api/wallet/apple', async (req, res) => {
    if (!digitalWallet.options().apple) fail('Apple Wallet passes are not available yet.', 503, 'wallet-unavailable');
    await service.rateLimit(res.locals.rateIdentity, 'wallet-export', 30);
    res.json(await service.appleDownload(req.body, res.locals.actor));
  });
  router.post('/tickets/api/wallet/google', async (req, res) => {
    await service.rateLimit(res.locals.rateIdentity, 'wallet-export', 30);
    const ticket = await service.walletTicket(req.body, res.locals.actor), url = await digitalWallet.google(ticket);
    const current = await service.walletTicket(req.body, res.locals.actor);
    if (current.version !== ticket.version) fail('Your ticket changed. Refresh and try again.', 409);
    res.json({ url });
  });
  router.get('/tickets/wallet/apple/:token', async (req, res) => {
    await service.rateLimit(req.ip || 'unknown', 'wallet-download-network', 600, 60000, 8);
    const ticket = await service.walletDownload(req.params.token), pass = await digitalWallet.apple(ticket);
    const current = await service.walletDownload(req.params.token);
    if (current.version !== ticket.version) fail('Your ticket changed. Open the app to try again.', 409);
    res.type('application/vnd.apple.pkpass').set('Content-Disposition', 'attachment; filename="Pluto-ticket.pkpass"').send(pass);
  });
  router.post('/tickets/api/rewards/redeem', async (req, res) => { const user = actor(res); await service.rateLimit(user.uid, 'reward-redeem', 60); res.json(await rewards.redeem(req.body, user)); });
  router.post('/tickets/api/rewards/claim', async (req, res) => { const user = actor(res); await service.rateLimit(user.uid, 'reward-claim', 60); res.json(await rewards.claim(req.body, user)); });
  const purchaseLimit = async (req: Request, res: Response, lane: string) => {
    const eventId = bodyId(req), contact = email(req.body.email);
    await service.rateLimit(req.ip || 'unknown', `${lane}-network-burst`, 512, 60000, 8);
    await service.rateLimit(res.locals.rateIdentity, `${lane}-client:${eventId}`, 30);
    await service.rateLimit(contact, `${lane}-contact:${eventId}`, lane === 'rsvp' ? 6 : 20);
  };
  router.post('/tickets/api/checkout', async (req, res) => { await purchaseLimit(req, res, 'checkout'); res.json(await service.checkout(req.body, res.locals.actor)); });
  router.post('/tickets/api/rsvp', async (req, res) => { await purchaseLimit(req, res, 'rsvp'); res.json(await service.rsvp(req.body, res.locals.actor)); });
  router.post('/tickets/api/rsvp/verification', async (req, res) => { await service.rateLimit(req.ip || 'unknown', 'rsvp-verification-network-burst', 512, 60000, 8); await service.rateLimit(email(req.body.email), 'rsvp-verification-contact', 5); await service.rateLimit(res.locals.rateIdentity, 'rsvp-verification-client', 20); res.json(await service.requestRsvpVerification(req.body, res.locals.actor)); });
  router.post('/tickets/api/rsvp/upgrade/verification', async (req, res) => { await service.rateLimit(req.ip || 'unknown', 'rsvp-upgrade-network-burst', 512, 60000, 8); await service.rateLimit(email(req.body.email), 'rsvp-upgrade-verification-contact', 5); await service.rateLimit(res.locals.rateIdentity, 'rsvp-upgrade-verification-client', 20); res.json(await service.requestRsvpVerification(req.body, res.locals.actor, 'upgrade')); });
  router.post('/tickets/api/rsvp/upgrade-access', async (req, res) => { await service.rateLimit(res.locals.rateIdentity, 'rsvp-upgrade-access-client', 20); res.json(await service.rsvpUpgradeAccess(req.body, res.locals.actor)); });
  router.post('/tickets/api/staff/rsvp/review', async (req, res) => res.json(await service.reviewRsvp(bodyId(req), bodyId(req, 'orderId'), req.body.decision, req.body.note, actor(res).uid)));
  router.post('/tickets/api/staff/rsvp/withdraw', async (req, res) => res.json(await service.withdrawRsvp(bodyId(req), bodyId(req, 'orderId'), actor(res).uid)));
  router.post('/tickets/api/checkout-attempt', async (req, res) => res.json(await service.checkoutAttempt(req.body.accessKey)));
  router.post('/tickets/api/cancel', async (req, res) => res.json(await service.cancel(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor)));
  router.post('/tickets/api/order', async (req, res) => {
    if (req.body.claimPurchases === true && res.locals.actor?.email_verified) await service.claim(res.locals.actor, true);
    res.json(await service.view(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor, true));
  });
  router.post('/tickets/api/download', async (req, res) => res.type('pdf').set('Content-Disposition', 'attachment; filename="Pluto-payment-receipt.pdf"').send(await orderPdf(await service.view(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor))));
  router.post('/tickets/api/mine', async (req, res) => res.json(await service.mine(actor(res), req.body.claimPurchases === true)));
  router.post('/tickets/api/claim', async (_req, res) => res.json(await service.claim(actor(res))));
  router.post('/tickets/api/recover', async (req, res) => { await service.rateLimit(res.locals.rateIdentity, 'recovery-client', 10); await service.rateLimit(email(req.body.email), 'recovery-contact', 3); res.json(await service.recover(req.body.email)); });
  router.post('/tickets/api/recover/accept', async (req, res) => res.json(await service.acceptRecovery(req.body.token)));
  router.post('/tickets/api/resend', async (req, res) => { await service.rateLimit(bodyId(req, 'orderId'), 'resend-order', 20); res.json(await service.resend(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor)); });
  router.post('/tickets/api/staff/network-context', async (req, res) => { await service.admin(actor(res).uid); res.json({ clientIp: req.ip, proxyChain: req.ips, socketIp: req.socket.remoteAddress, trustedProxies: process.env.TICKETING_TRUSTED_PROXIES || '' }); });
  router.post('/tickets/api/transfer', async (req, res) => res.json(await service.transfer(bodyId(req, 'orderId'), req.body.accessKey, res.locals.actor, bodyId(req, 'ticketId'), req.body.email, req.body.holderToken)));
  router.post('/tickets/api/transfer/accept', async (req, res) => res.json(await service.acceptTransfer(req.body.token, res.locals.actor)));
  router.post('/tickets/api/holder', async (req, res) => res.json(await service.holder(req.body.token, res.locals.actor)));
  router.post('/tickets/api/staff/events', async (req, res) => res.json(await service.list(actor(res).uid, req.body.revenue === true)));
  router.post('/tickets/api/staff/card-flyer', async (req, res) => res.type('webp').send(await service.cardFlyer(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/guestlist', async (req, res) => res.json(await service.guestList(bodyId(req), admissionIdentity(req, res))));
  router.post('/tickets/api/staff/guestlist/add', async (req, res) => res.json(await service.addGuests(bodyId(req), req.body.names, req.body.note, req.body.attempt, actor(res).uid)));
  router.post('/tickets/api/staff/guestlist/save', async (req, res) => res.json(await service.saveGuest(bodyId(req), bodyId(req, 'guestId'), req.body.name, req.body.note, req.body.version, actor(res).uid)));
  router.post('/tickets/api/staff/guestlist/remove', async (req, res) => res.json(await service.saveGuest(bodyId(req), bodyId(req, 'guestId'), '', '', req.body.version, actor(res).uid, true)));
  router.post('/tickets/api/staff/guestlist/arrive', async (req, res) => res.json(await service.arriveGuest(bodyId(req), bodyId(req, 'guestId'), req.body.scanId, admissionIdentity(req, res), req.body.offline === true, req.body)));
  router.post('/tickets/api/staff/scanner-pins', async (req, res) => res.json(await service.scannerPins(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/scanner-pins/create', async (req, res) => res.json(await service.createScannerPin(bodyId(req), req.body.label, req.body.expiresAt, actor(res).uid)));
  router.post('/tickets/api/staff/scanner-pins/revoke', async (req, res) => res.json(await service.revokeScannerPin(bodyId(req), bodyId(req, 'pinId'), actor(res).uid)));
  router.post('/tickets/api/scanner/login', async (req, res) => res.json(await service.scannerLogin(req.body.pin, req.ip || 'unknown')));
  router.post('/tickets/api/scanner/session', async (req, res) => res.json(await service.scannerSession(req.get('x-pluto-scanner') || '')));
  router.post('/tickets/api/scanner/logout', async (req, res) => res.json(await service.scannerLogout(req.get('x-pluto-scanner') || '')));
  router.post('/tickets/api/staff/get', async (req, res) => res.json(await service.get(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/save', async (req, res) => res.json(await service.save(bodyId(req), req.body.draft, req.body.revision, actor(res).uid)));
  router.post('/tickets/api/staff/ticket-settings', async (req, res) => res.json(await service.save(bodyId(req), req.body.draft, req.body.revision, actor(res).uid, true)));
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
  router.post('/tickets/api/staff/orders', async (req, res) => res.json(await service.staffOrders(bodyId(req), actor(res).uid, req.body)));
  router.post('/tickets/api/staff/performance', async (req, res) => res.json(await service.staffPerformance(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/all-orders', async (req, res) => res.json(await service.allOrders(req.body, actor(res).uid)));
  router.post('/tickets/api/staff/order', async (req, res) => res.json(await service.staffOrder(bodyId(req, 'orderId'), actor(res).uid)));
  router.post('/tickets/api/staff/order/correct', async (req, res) => res.json(await service.correctOrder(bodyId(req, 'orderId'), req.body, actor(res).uid)));
  router.post('/tickets/api/staff/order/resend', async (req, res) => { await service.rateLimit(bodyId(req, 'orderId'), 'support-resend', 10); res.json(await service.supportResend(bodyId(req, 'orderId'), req.body, actor(res).uid)); });
  router.post('/tickets/api/staff/rsvp/reopen', async (req, res) => res.json(await service.reopenRsvp(bodyId(req), bodyId(req, 'orderId'), req.body, actor(res).uid)));
  router.post('/tickets/api/staff/health', async (req, res) => res.json(await service.health(actor(res).uid, req.body.refresh === true)));
  router.post('/tickets/api/staff/health/retry', async (req, res) => res.json(await service.retryHealth(req.body, actor(res).uid)));
  router.post('/tickets/api/staff/order/check-in', async (req, res) => res.json(await service.checkInOrderTicket(bodyId(req, 'orderId'), bodyId(req, 'ticketId'), req.body.scanId, actor(res).uid)));
  router.post('/tickets/api/staff/export', async (req, res) => {
    const eventId = bodyId(req), uid = actor(res).uid;
    await service.role(uid, eventId, ['manager', 'refund', 'cash']);
    res.type('text/csv').set('Content-Disposition', 'attachment; filename="Pluto-orders.csv"');
    const write = async (chunk: string) => {
      if (res.write(chunk)) return;
      await new Promise<void>((resolve, reject) => {
        // compression forwards drain listeners to its transform stream.
        const cleanup = () => { source.removeListener('drain', drained); res.removeListener('close', closed); res.removeListener('error', failed); };
        const drained = () => { cleanup(); resolve(); }, failed = (error: Error) => { cleanup(); reject(error); };
        const closed = () => failed(new Error('CSV connection closed.'));
        const source = res.on('drain', drained);
        res.once('close', closed); res.once('error', failed);
        if (res.destroyed) closed();
      });
    };
    try {
      await write(csv([['Order', 'Buyer', 'Email', 'Status', 'Method', 'Gross cents', 'Discount cents', 'Tax cents', 'Refund cents', 'Stripe fee cents', 'Promoter']]) + '\r\n');
      let cursor: any = null;
      do {
        const page = await service.staffOrders(eventId, uid, { cursor, limit: 100 });
        if (res.destroyed) return;
        await write(csv(page.orders.map((o: any) => [o.orderId, o.name, o.email, o.status, o.method, o.total, o.discount, o.taxAmount, o.refundedAmount, o.stripeFee, o.promoterId])) + '\r\n');
        cursor = page.cursor;
      } while (cursor);
      res.end();
    } catch (error) { res.destroy(error instanceof Error ? error : undefined); }
  });
  router.post('/tickets/api/staff/cash', async (req, res) => res.json(await service.checkout(req.body, null, req.body.comp === true ? 'comp' : 'cash', actor(res).uid)));
  router.post('/tickets/api/staff/cash-options', async (req, res) => { const eventId = bodyId(req); await service.role(actor(res).uid, eventId, ['cash']); const event = (await service.event(eventId).get()).data(); if (!event) fail('Event not found.', 404); res.json({ offers: (event.liveDraft || event.draft).offers.filter((o: any) => o.active), taxMode: (event.liveDraft || event.draft).tax.mode }); });
  router.post('/tickets/api/staff/retry', async (req, res) => { await service.admin(actor(res).uid); res.json(await service.requestMaintenance()); });
  router.post('/tickets/api/staff/refund', async (req, res) => res.json(await service.refund(bodyId(req, 'orderId'), req.body.ticketIds, req.body.attempt, actor(res).uid)));
  router.post('/tickets/api/staff/refund-external', async (req, res) => res.json(await service.mapExternalRefund(bodyId(req, 'orderId'), req.body.ticketIds, actor(res).uid)));
  router.post('/tickets/api/staff/checkout-resolve', async (req, res) => res.json(await service.resolveCheckout(bodyId(req, 'orderId'), req.body.sessionId, req.body.note, actor(res).uid)));
  router.post('/tickets/api/staff/scan', async (req, res) => res.json(await service.scan(bodyId(req), req.body.qr, req.body.scanId, admissionIdentity(req, res), req.body.offline === true, req.body)));
  router.post('/tickets/api/staff/offline-submit', async (req, res) => res.json(await service.submitOfflineReview(bodyId(req), req.body, actor(res).uid)));
  router.post('/tickets/api/staff/offline-conflicts', async (req, res) => res.json(await service.offlineConflicts(bodyId(req), actor(res).uid)));
  router.post('/tickets/api/staff/offline-resolve', async (req, res) => res.json(await service.resolveOfflineScan(bodyId(req), req.body.scanId, req.body.decision, req.body.note, actor(res).uid)));
  router.post('/tickets/api/staff/manifest', async (req, res) => res.json(await service.manifest(bodyId(req), admissionIdentity(req, res))));
  router.post('/tickets/api/staff/scan-review', async (req, res) => res.json(await service.reviewScan(bodyId(req), req.body.scanId, req.body.note, admissionIdentity(req, res))));
  router.use((error: any, req: Request, res: Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/tickets') && !req.path.startsWith('/events')) return next(error);
    const status = error instanceof TicketingError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 503) console.error('Ticketing request failed', { kind: error.name || 'unavailable', code: error.code || '' });
    if (req.path.includes('/api') || req.path.endsWith('/webhook')) res.status(status).json({ error: error instanceof TicketingError ? error.message : 'This request could not be confirmed. Keep this page open and retry.', ...(error instanceof TicketingError && error.code ? { code: error.code } : {}) });
    else res.status(status).type('html').send(`<h1>${status === 404 ? 'Event not found' : 'Event temporarily unavailable'}</h1><p><a href="/events">Browse events</a></p>`);
  });
  return router;
}
