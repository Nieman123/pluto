import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldPath, FieldValue, getFirestore, type Firestore, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { fail, hash, receipt } from './ticketing/domain';
import { deploymentConfig } from './deployment-config';

export const deletionCollection = 'accountDeletionRequests';
const pageSize = 100;
const retentionText = 'Limited purchase, payment, refund, tax, dispute, admission-security and signed-waiver records may remain for accounting, legal and security purposes. Account deletion does not issue refunds.';

export function requireDeletionConfirmation(actor: DecodedIdToken, raw: any, now = Date.now()) {
  if (!Number.isFinite(actor.auth_time) || now / 1000 - actor.auth_time > 300 || actor.auth_time > now / 1000 + 30)
    fail('Confirm your identity again before deleting your account.', 401, 'recent-login-required');
  if (raw?.confirmation !== 'DELETE') fail('Confirm permanent account deletion.', 400, 'deletion-confirmation-required');
  return receipt(raw.receipt);
}

// Every destructive target comes from the verified token, never a supplied UID/email.
// A durable, leased job completes deletion after a closed browser or lost response.
export class AccountDeletion {
  constructor(public db: Firestore = getFirestore(), private authOverride?: Auth) {}
  get auth() { return this.authOverride || getAuth(); }
  async request(actor: DecodedIdToken, raw: any, idToken = '') {
    const key = requireDeletionConfirmation(actor, raw), ref = this.db.collection(deletionCollection).doc(actor.uid);
    const user = await this.auth.getUser(actor.uid);
    if (user.providerData.some(p => p.providerId === 'apple.com')) {
      if (actor.firebase?.sign_in_provider !== 'apple.com') fail('Confirm with Apple before deleting this account.', 400, 'apple-revocation-required');
      if (typeof raw.appleAccessToken === 'string' && raw.appleAccessToken.length > 0 && raw.appleAccessToken.length < 10000) {
        // Web/Android obtain an access token; iOS uses Firebase's native
        // authorization-code revocation API before submitting this request.
        const response = await fetch(`https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(deploymentConfig().web.apiKey)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ providerId: 'apple.com', tokenType: 'ACCESS_TOKEN', token: raw.appleAccessToken, idToken }) });
        if (!response.ok) fail('Apple access could not be revoked. Confirm with Apple and try again.', 503, 'apple-revocation-failed');
      } else if (raw.appleTokensRevoked !== true) fail('Revoke Apple access before deleting this account.', 400, 'apple-revocation-required');
    }
    await this.db.runTransaction(async tx => {
      const prior = (await tx.get(ref)).data();
      if (prior) {
        if (prior.receiptHash !== hash(key)) fail('Account deletion is already in progress. Use your saved confirmation.', 409, 'deletion-in-progress');
        return;
      }
      tx.create(ref, { uid: actor.uid, email: user.emailVerified ? (user.email || '').toLowerCase() : '',
        receiptHash: hash(key), status: 'pending', phase: 0, cursor: '', createdAt: Date.now(), leaseUntil: 0 });
    });
    return { status: 'pending', retention: retentionText };
  }
  async status(raw: any) {
    const key = receipt(raw?.receipt);
    const row = (await this.db.collection(deletionCollection).where('receiptHash', '==', hash(key)).limit(1).get()).docs[0];
    if (!row) fail('Deletion confirmation not found.', 404);
    const job = row.data();
    return { status: job.status === 'completed' ? 'completed' : 'pending', completedAt: job.completedAt || null, retention: retentionText };
  }
  async process(uid: string, maxPages = 30) {
    const ref = this.db.collection(deletionCollection).doc(uid), leaseId = randomUUID();
    const acquired = await this.db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (!job || job.status === 'completed' || job.leaseUntil > Date.now()) return false;
      tx.update(ref, { leaseId, leaseUntil: Date.now() + 570000, status: 'processing' }); return true;
    });
    if (!acquired) return;
    try {
      // Disable refresh/sign-in first. Firestore rules also block existing ID tokens
      // as soon as the request is committed, before Auth propagation completes.
      try { await this.auth.updateUser(uid, { disabled: true }); await this.auth.revokeRefreshTokens(uid); }
      catch (error: any) { if (error.code !== 'auth/user-not-found') throw error; }
      for (let n = 0; n < maxPages; n++) {
        const job = (await ref.get()).data()!;
        if (job.leaseId !== leaseId || job.status === 'completed') return;
        if (job.phase === 0) {
          await this.db.recursiveDelete(this.db.collection('userProfiles').doc(uid));
          await this.db.recursiveDelete(this.db.collection('appReviewAccounts').doc(uid));
          await this.db.collection('adminUsers').doc(uid).delete();
          await ref.update({ phase: 1, cursor: '' }); continue;
        }
        if (job.phase === 11) {
          // Repeat profile removal after ticket cleanup in case a previously
          // running server transaction overlapped the initial disable.
          await this.db.recursiveDelete(this.db.collection('userProfiles').doc(uid));
          try { await this.auth.deleteUser(uid); } catch (error: any) { if (error.code !== 'auth/user-not-found') throw error; }
          await ref.update({ status: 'completed', completedAt: Date.now(), uid: FieldValue.delete(), email: FieldValue.delete(),
            cursor: FieldValue.delete(), leaseUntil: 0, leaseId: FieldValue.delete(), lastErrorAt: FieldValue.delete() });
          return;
        }
        const query = this.query(job.phase, uid, job.email);
        if (!query) { await ref.update({ phase: job.phase + 1, cursor: '' }); continue; }
        let page = query.orderBy(FieldPath.documentId()).limit(pageSize);
        if (job.cursor) page = page.startAfter(job.cursor);
        const rows = await page.get();
        for (const row of rows.docs) await this.clean(job.phase, row, uid);
        await ref.update({ phase: rows.size < pageSize ? job.phase + 1 : job.phase,
          cursor: rows.size < pageSize ? '' : rows.docs[rows.size - 1].id });
      }
      await ref.update({ status: 'pending', leaseUntil: 0 });
    } catch (error) {
      await ref.update({ status: 'pending', leaseUntil: 0, lastErrorAt: Date.now() });
      throw error;
    }
  }
  private query(phase: number, uid: string, email: string): Query | null {
    const owned = (name: string, field = 'ownerUid') => this.db.collection(name).where(field, '==', uid);
    switch (phase) {
      case 1: return owned('ticketingStaff', 'uid');
      case 2: return owned('ticketingOfflineLeases', 'uid');
      case 3: return owned('ticketingOrders');
      case 4: return owned('ticketingTickets');
      case 5: return owned('ticketingRsvpUpgradeAccess');
      case 6: return owned('ticketingWaitlist');
      case 7: return email ? this.db.collection('ticketingWaitlist').where('email', '==', email) : null;
      case 8: return email ? this.db.collection('ticketingRsvpVerification').where('email', '==', email) : null;
      case 9: return email ? this.db.collection('ticketingEmailJobs').where('to', '==', email) : null;
      case 10: return this.db.collection('eventQrCodes');
      default: throw new Error('Unknown account deletion phase.');
    }
  }
  private async clean(phase: number, row: QueryDocumentSnapshot, uid: string) {
    if (phase === 10) { await this.db.recursiveDelete(row.ref.collection('claims').doc(uid)); return; }
    if ([1, 2, 5, 8].includes(phase)) { await this.db.recursiveDelete(row.ref); return; }
    if (phase === 9) {
      // Remove recipient, rendered payload, codes and secure links from sent and
      // queued jobs. Provider message IDs remain for delivery/security accounting.
      await row.ref.set({ status: 'cancelled', to: '', token: null, code: null, emailPayload: null, accountDeletedAt: Date.now(), leaseUntil: 0 }, { merge: true }); return;
    }
    if (phase === 3) {
      let cursor = '';
      for (;;) {
        let query = this.db.collection('ticketingEmailJobs').where('orderId', '==', row.id).orderBy(FieldPath.documentId()).limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const jobs = await query.get(), batch = this.db.batch();
        jobs.docs.filter(job => job.data().type !== 'transfer').forEach(job => batch.set(job.ref,
          { status: 'cancelled', to: '', token: null, code: null, emailPayload: null, accountDeletedAt: Date.now(), leaseUntil: 0 }, { merge: true }));
        await batch.commit();
        if (jobs.size < pageSize) break;
        cursor = jobs.docs[jobs.size - 1].id;
      }
    }
    if (phase === 4) await this.db.recursiveDelete(row.ref.collection('rewards'));
    if ([6, 7].includes(phase)) {
      await this.db.runTransaction(async tx => {
        const entry = (await tx.get(row.ref)).data(); if (!entry) return;
        const pools = entry.status === 'offered' ? await Promise.all(Object.keys(entry.consumption || {}).map(key =>
          tx.get(this.db.collection('ticketingEvents').doc(entry.eventId).collection('pools').doc(key)))) : [];
        for (const pool of pools) {
          const count = entry.consumption[pool.id];
          if (!pool.exists || pool.data()!.held < count) throw new Error('Waitlist inventory requires review.');
          tx.update(pool.ref, { held: pool.data()!.held - count });
        }
        tx.delete(row.ref);
      });
      return;
    }
    await this.db.runTransaction(async tx => {
      const data = (await tx.get(row.ref)).data(); if (!data || data.ownerUid !== uid) return;
      // Keep transaction amounts, provider references and admission state intact.
      // A non-empty tombstone prevents a new account from reclaiming deleted data.
      const ownerUid = `deleted_${hash(uid)}`;
      if (phase === 3) tx.update(row.ref, { ownerUid, accountDeletedAt: Date.now(),
        accessHash: hash(randomUUID()), accessRevision: (data.accessRevision || 0) + 1,
        ...(!(data.paidAt || data.status === 'paid' || data.refundedAmount > 0) ? { name: 'Deleted account', email: '' } : {}) });
      if (phase === 4) tx.update(row.ref, { ownerUid, holderName: 'Deleted account', holderEmail: '', accountDeletedAt: Date.now() });
    });

  }
  async recover() {
    const jobs = await this.db.collection(deletionCollection).where('status', 'in', ['pending', 'processing']).limit(20).get();
    for (const job of jobs.docs) {
      try { await this.process(job.id); }
      catch { console.error('Account deletion needs retry', { job: hash(job.id) }); }
    }
  }
}
