import express, { type Request, type Response } from 'express';
import { legalView, consents, consentVersion, documentHash, electronicDisclosure, sourcePdf, version } from './document';
import { receiptKey, textField, validateSubmission, WaiverError } from './validation';
import { WaiverService } from './service';
import { allowedSiteOrigins, deploymentConfig } from '../deployment-config';

export function waiverRouter(context: (path: string) => Record<string, unknown>, service = new WaiverService()) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" });
    next();
  });
  router.get(['/', '/staff'], (req, res) => {
    const staff = req.path === '/staff';
    res.render(staff ? 'waiver-staff' : 'waiver', {
      ...context('/manafest-waiver'), googleAnalyticsId: '', staff,
      meta: { title: `${staff ? 'Waiver check-in' : 'ManaFest 2026 attendee waiver'} | Pluto Events`, description: 'Read and sign the ManaFest 2026 attendee waiver.', canonical: `${deploymentConfig().baseUrl}/manafest-waiver${staff ? '/staff' : ''}` },
      legalView, consents, consentVersion, documentHash, electronicDisclosure, version,
      waiverPreview: Boolean(process.env.FIRESTORE_EMULATOR_HOST),
    });
  });
  router.get('/original.pdf', (_req, res) => res.type('pdf').set('Content-Disposition', 'attachment; filename="ManaFest_2026_Attendee_Waiver.pdf"').send(sourcePdf));
  router.use('/api', (req, _res, next) => {
    if (req.method !== 'POST') return next(new WaiverError(405, 'Use POST for waiver requests.'));
    const allowed = allowedSiteOrigins();
    if (!allowed.has(req.get('origin') || '') || req.get('sec-fetch-site') === 'cross-site') return next(new WaiverError(403, 'Open the waiver on Pluto Events to continue.'));
    if (!req.is('application/json')) return next(new WaiverError(415, 'Send a JSON request.'));
    // Functions may parse the body before Express. Check rawBody as well as the parser limit.
    if ((req as Request & { rawBody?: Buffer }).rawBody?.length! > 180000) return next(new WaiverError(413, 'Submission is too large. Clear the signature and try again.'));
    next();
  }, express.json({ limit: '180kb' }));
  router.post('/api/submit', async (req, res) => {
    await service.rateLimit(req.ip || 'unknown', 'submit', 120);
    const key = receiptKey(req.body?.receiptKey);
    const input = validateSubmission(req.body);
    res.json(await service.submit(key, input));
  });
  function sendPdf(res: Response, result: { pdf: Buffer; confirmationId: string }) {
    res.type('pdf').set('Content-Disposition', `attachment; filename="${result.confirmationId}.pdf"`).send(result.pdf);
  }
  router.post('/api/download', async (req, res) => {
    await service.rateLimit(req.ip || 'unknown', 'download', 180);
    sendPdf(res, await service.download(receiptKey(req.body?.receiptKey)));
  });
  router.use('/api/staff', async (req, res, next) => {
    await service.rateLimit(req.ip || 'unknown', 'staff-auth', 600);
    res.locals.staffUid = await service.requireStaff((req.get('authorization') || '').replace(/^Bearer /, ''));
    next();
  });
  router.post('/api/staff/access', (_req, res) => res.json({ authorized: true }));
  router.post('/api/staff/search', async (req, res) => {
    res.json(await service.search(textField(req.body?.query, 'search', 2, 254), res.locals.staffUid));
  });
  router.post('/api/staff/download', async (req, res) => {
    const id = textField(req.body?.confirmationId, 'confirmation number', 41, 41);
    if (!/^MF26-[A-F0-9-]{36}$/.test(id)) throw new WaiverError(400, 'Invalid confirmation number.');
    sendPdf(res, await service.staffDownload(id, res.locals.staffUid));
  });
  router.use((_req, res) => { res.status(404).json({ error: 'Waiver route not found.' }); });
  router.use((error: any, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = error instanceof WaiverError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 503) console.error('Waiver request failed', { code: error.code || 'unavailable' });
    if (status === 429) res.set('Retry-After', '3600');
    res.status(status).json({ error: error instanceof WaiverError ? error.message : status === 400 ? 'Invalid request.' : status === 413 ? 'Submission is too large. Clear the signature and try again.' : 'Saving or retrieving your waiver could not be confirmed. Keep this page open and retry. Your original signing attempt will be reused.' });
  });
  return router;
}
