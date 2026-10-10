import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { fail, hash, id } from './ticketing/domain';

const cooldownMs = 30000, dailyLimit = 10;
function count(value: unknown, label: string, fallback = 0): number {
  const n = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(n) || (n as number) < 0) fail(`Invalid ${label}. Contact Pluto support.`, 409, 'invalid-rewards-state');
  return n as number;
}
function add(a: number, b: number): number { return count(a + b, 'points total'); }
function attempt(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) fail('A valid retry key is required.', 400, 'invalid-attempt');
  return hash(raw);
}
function code(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 500) fail('Check the event QR code.', 400, 'invalid-code');
  return raw.trim().toUpperCase();
}
function timestamp(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!(value instanceof Timestamp)) fail('Invalid event QR dates. Contact Pluto support.', 409, 'invalid-rewards-state');
  return value.toMillis();
}

// Actor identity comes from verified Firebase auth, never from request body fields.
export class Rewards {
  constructor(private db: Firestore, private now: () => number = Date.now, private reviewUid?: string) {}
  private collection(name: string) {
    return this.reviewUid ? this.db.collection('appReviewAccounts').doc(this.reviewUid).collection(name) : this.db.collection(name);
  }
  private async reviewGuard(tx: FirebaseFirestore.Transaction) {
    if (this.reviewUid && (await tx.get(this.db.collection('appReviewAccounts').doc(this.reviewUid))).data()?.enabled !== true)
      fail('Demo access is disabled.', 403, 'demo-disabled');
  }
  private profile(actor: DecodedIdToken, raw: any) {
    if (raw.uid !== undefined && raw.uid !== actor.uid) fail('This reward request belongs to another account.', 403, 'account-mismatch');
    if (this.reviewUid && actor.uid !== this.reviewUid) fail('This demo belongs to another account.', 403, 'account-mismatch');
    return this.collection('userProfiles').doc(actor.uid);
  }
  async redeem(raw: any, actor: DecodedIdToken) {
    const profile = this.profile(actor, raw), rewardId = id(raw.rewardItemId), key = attempt(raw.attempt);
    const reward = this.collection('rewardItems').doc(rewardId), request = profile.collection('redemptionRequests').doc(`reward_${key}`);
    return this.db.runTransaction(async tx => {
      await this.reviewGuard(tx);
      const prior = (await tx.get(request)).data();
      if (prior) {
        if (prior.rewardItemId !== rewardId) fail('This retry key was used for another reward.', 409, 'attempt-conflict');
        return { requestId: request.id, rewardName: prior.rewardName, pointsCost: prior.pointsCost, newPointsBalance: prior.balanceAfter };
      }
      const profileData = (await tx.get(profile)).data(), item = (await tx.get(reward)).data();
      if (!profileData) fail('User profile was not found.', 409, 'profile-missing');
      if (!item) fail('Reward item no longer exists.', 404, 'reward-missing');
      const pointsCost = count(item.pointsCost, 'reward cost'), inventory = item.inventory == null ? null : count(item.inventory, 'reward inventory');
      if (item.isActive !== true || pointsCost <= 0 || pointsCost > 1000000) fail('This reward is not available right now.', 409, 'reward-unavailable');
      if (inventory === 0) fail('This reward is out of stock.', 409, 'out-of-stock');
      const balance = count(profileData.pointsBalance, 'points balance');
      if (balance < pointsCost) fail('Not enough Pluto Points for this reward.', 409, 'insufficient-points');
      const rewardName = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 200) : 'Pluto reward', balanceAfter = balance - pointsCost;
      tx.update(profile, { pointsBalance: balanceAfter, updatedAt: FieldValue.serverTimestamp(), lastRedemptionAt: FieldValue.serverTimestamp() });
      if (inventory !== null) tx.update(reward, { inventory: inventory - 1, updatedAt: FieldValue.serverTimestamp() });
      tx.create(profile.collection('pointsTransactions').doc(request.id), { type: 'redeem', reason: `Redeemed ${rewardName}`, pointsDelta: -pointsCost,
        rewardItemId: rewardId, requestId: request.id, balanceAfter, createdAt: FieldValue.serverTimestamp() });
      tx.create(request, { rewardItemId: rewardId, rewardName, pointsCost, balanceAfter, status: 'requested', createdAt: FieldValue.serverTimestamp() });
      return { requestId: request.id, rewardName, pointsCost, newPointsBalance: balanceAfter };
    });
  }
  async claim(raw: any, actor: DecodedIdToken) {
    const profile = this.profile(actor, raw), normalized = code(raw.code), key = attempt(raw.attempt);
    const receipt = profile.collection('rewardAttempts').doc(`claim_${key}`), rate = profile.collection('claimRateLimits').doc('eventQr');
    return this.db.runTransaction(async tx => {
      await this.reviewGuard(tx);
      const prior = (await tx.get(receipt)).data();
      if (prior) {
        if (prior.codeHash !== hash(normalized)) fail('This retry key was used for another event QR.', 409, 'attempt-conflict');
        return prior.result;
      }
      const matching = await tx.get(this.collection('eventQrCodes').where('code', '==', normalized).limit(2));
      if (matching.empty) fail('This QR code was not found.', 404, 'qr-not-found');
      if (matching.size !== 1) fail('This QR code needs organizer review.', 409, 'qr-ambiguous');
      const qr = matching.docs[0], data = qr.data(), claim = qr.ref.collection(this.reviewUid ? 'demoClaims' : 'claims').doc(actor.uid);
      if ((await tx.get(claim)).exists) fail('You already claimed Pluto Points for this event.', 409, 'already-claimed');
      const profileData = (await tx.get(profile)).data(), rateData = (await tx.get(rate)).data() || {}, now = this.now(), dayKey = new Date(now).toISOString().slice(0, 10);
      if (data.isActive !== true) fail('This event QR code is not active.', 409, 'qr-inactive');
      const award = count(data.pointsAwarded, 'event points'), totalClaims = count(data.totalClaims, 'event claims');
      if (award <= 0 || award > 1000000) fail('This event QR code has invalid Pluto Points configuration.', 409, 'invalid-points');
      const expires = timestamp(data.expiresAt), starts = timestamp(data.startsAt);
      if (expires !== null && now >= expires) fail('This event QR code has expired.', 409, 'qr-expired');
      if (starts !== null && now < starts) fail('This event QR code is not open yet.', 409, 'qr-not-open');
      if (data.maxClaims != null && totalClaims >= count(data.maxClaims, 'claim capacity')) fail('This event QR code has reached its claim limit.', 409, 'qr-full');
      const claimsToday = rateData.dayKey === dayKey ? count(rateData.claimsToday, 'daily claims') : 0;
      if (claimsToday >= dailyLimit) fail('You reached the daily event QR claim limit. Please try again tomorrow.', 429, 'daily-claim-limit');
      const lastClaim = timestamp(rateData.lastClaimAt);
      if (lastClaim !== null && now - lastClaim < cooldownMs) fail(`Please wait ${Math.ceil((cooldownMs - now + lastClaim) / 1000)} seconds before claiming another event QR code.`, 429, 'claim-cooldown');
      const balance = add(count(profileData?.pointsBalance, 'points balance'), award), lifetime = add(count(profileData?.lifetimePoints, 'lifetime points'), award), attendance = add(count(profileData?.eventsAttended, 'attendance'), 1);
      const eventName = typeof data.eventName === 'string' && data.eventName.trim() ? data.eventName.trim().slice(0, 200) : 'Event Check-In';
      const displayName = String(actor.name || actor.email?.split('@')[0] || 'Pluto Member').slice(0, 200);
      const result = { eventQrCodeId: qr.id, eventName, pointsAwarded: award, newPointsBalance: balance };
      tx.set(profile, { ...(!profileData ? { displayName, homeCity: '', favoriteGenre: '', bio: '', profileImageDataUrl: '', createdAt: FieldValue.serverTimestamp() } : {}),
        pointsBalance: balance, lifetimePoints: lifetime, eventsAttended: attendance, updatedAt: FieldValue.serverTimestamp(), lastAttendanceAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(claim, { uid: actor.uid, eventQrCodeId: qr.id, eventName, pointsAwarded: award, code: normalized,
        claimedByDisplayName: displayName, claimedByEmail: actor.email || '', createdAt: FieldValue.serverTimestamp() });
      tx.set(rate, { dayKey, claimsToday: claimsToday + 1, lastClaimAt: Timestamp.fromMillis(now), cooldownSeconds: cooldownMs / 1000, dailyClaimLimit: dailyLimit,
        ...(!rateData.createdAt ? { createdAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(qr.ref, { totalClaims: add(totalClaims, 1), updatedAt: FieldValue.serverTimestamp() });
      tx.create(profile.collection('pointsTransactions').doc(`attendance_${qr.id}`), { type: 'attendance', reason: `Event check-in: ${eventName}`, pointsDelta: award, referenceId: qr.id, balanceAfter: balance, createdAt: FieldValue.serverTimestamp() });
      tx.create(receipt, { codeHash: hash(normalized), result, createdAt: FieldValue.serverTimestamp() });
      return result;
    });
  }
}
