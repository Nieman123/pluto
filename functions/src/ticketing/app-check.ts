import type { NextFunction, Request, Response } from 'express';
import { getAppCheck } from 'firebase-admin/app-check';
import { warn } from 'firebase-functions/logger';
import { TicketingError } from './domain';

// Firebase App Check proves a request came from the real Pluto website or app,
// not from a script. HTTP functions have no built-in enforcement, so the API
// verifies the X-Firebase-AppCheck header itself.
//
//   off      no verification (local emulators, or an emergency switch)
//   monitor  verify and log failures, never block (default for deployments)
//   enforce  reject protected requests without a valid token
export type AppCheckMode = 'off' | 'monitor' | 'enforce';
const modes: AppCheckMode[] = ['off', 'monitor', 'enforce'];

export function appCheckMode(env: NodeJS.ProcessEnv = process.env): AppCheckMode {
  const emulator = !!(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
  const value = (env.TICKETING_APP_CHECK || (emulator ? 'off' : 'monitor')).trim() as AppCheckMode;
  if (!modes.includes(value)) throw new Error('TICKETING_APP_CHECK must be off, monitor or enforce.');
  return value;
}

// Abuse-prone customer actions: buying, RSVPs, contact verification emails,
// order recovery emails and Pluto Points. Staff, scanner, webhook and order
// viewing routes are deliberately excluded so door scanning and email links
// keep working on older clients.
export const appCheckProtectedPaths = new Set([
  '/checkout', '/rsvp', '/rsvp/verification', '/rsvp/upgrade/verification',
  '/waitlist/verification', '/waitlist/join', '/recover',
  '/native-checkout/create', '/rewards/claim', '/rewards/redeem',
]);

type Verify = (token: string) => Promise<unknown>;

export function appCheckGuard(options: { mode?: () => AppCheckMode; verify?: Verify; paths?: Set<string> } = {}) {
  const mode = options.mode || (() => appCheckMode());
  const verify: Verify = options.verify || (token => getAppCheck().verifyToken(token));
  const paths = options.paths || appCheckProtectedPaths;
  return async (req: Request, res: Response, next: NextFunction) => {
    const current = mode();
    if (current === 'off' || !paths.has(req.path)) return next();
    const token = req.get('x-firebase-appcheck') || '';
    let failure = '';
    if (!token) failure = 'missing';
    else if (token.length > 4096) failure = 'invalid';
    else {
      try { await verify(token); } catch { failure = 'invalid'; }
    }
    res.locals.appCheck = failure ? 'unverified' : 'verified';
    if (!failure) return next();
    // Structured so Cloud Logging can count failures per route before enforcing.
    warn('App Check token rejected', { appCheck: failure, appCheckMode: current, path: req.path, native: !req.get('origin') });
    if (current === 'enforce') return next(new TicketingError(401, 'We could not verify this app or browser. Refresh the page or update the Pluto app, then try again.', 'app-check-failed'));
    next();
  };
}
