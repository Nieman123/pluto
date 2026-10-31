import { Timestamp } from 'firebase-admin/firestore';

// Keep numeric authorization deadlines unchanged. TTL is asynchronous cleanup,
// never an access check; the grace period supports delayed work and diagnostics.
export function expiringGrant(expiresAt: number) {
  return { expiresAt, deleteAfter: Timestamp.fromMillis(expiresAt + 7 * 86400000) };
}
