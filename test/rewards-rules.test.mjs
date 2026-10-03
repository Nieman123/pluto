import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
let env;
const uid = `rewards-rules-${randomUUID()}`, admin = `${uid}-admin`, qrId = `${uid}-qr`, rewardId = `${uid}-reward`;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Local rules emulator required');
  env = await initializeTestEnvironment({ projectId: 'demo-pluto-ticketing', firestore: { host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').pop()), rules: await readFile('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore(); await setDoc(doc(db, 'adminUsers', admin), { role: 'admin' });
    await setDoc(doc(db, 'eventQrCodes', qrId), { code: 'SECRET-REWARDS-CODE', isActive: true, pointsAwarded: 100, totalClaims: 1 });
    await setDoc(doc(db, 'rewardItems', rewardId), { name: 'Shirt', isActive: true, pointsCost: 100, inventory: 2 });
    await setDoc(doc(db, 'userProfiles', uid), { displayName: 'Member', pointsBalance: 100, lifetimePoints: 100, eventsAttended: 1 });
    await setDoc(doc(db, `userProfiles/${uid}/claimRateLimits/eventQr`), { claimsToday: 1 });
    await setDoc(doc(db, `userProfiles/${uid}/redemptionRequests/legitimate`), { rewardItemId: rewardId, pointsCost: 100, balanceAfter: 0, status: 'requested' });
  });
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async c => { const db = c.firestore(); for (const path of [`adminUsers/${admin}`, `eventQrCodes/${qrId}`, `rewardItems/${rewardId}`, `userProfiles/${uid}`, `userProfiles/${uid}-new`, `userProfiles/${uid}-forged`, `userProfiles/${uid}/claimRateLimits/eventQr`, `userProfiles/${uid}/redemptionRequests/legitimate`, `eventQrCodes/${qrId}-new`]) await deleteDoc(doc(db, path)); });
  await env.cleanup();
});
test('A6 rules: users can create only zero-balance profiles and edit personal fields', async () => {
  const db = env.authenticatedContext(uid).firestore();
  await assertSucceeds(updateDoc(doc(db, 'userProfiles', uid), { displayName: 'Updated Member', bio: 'Music', updatedAt: serverTimestamp() }));
  for (const payload of [{ pointsBalance: 1000000 }, { lifetimePoints: 1000000 }, { eventsAttended: 1000 }, { lastAttendanceAt: serverTimestamp() }, { createdAt: serverTimestamp() }]) await assertFails(updateDoc(doc(db, 'userProfiles', uid), { ...payload, updatedAt: serverTimestamp() }));
  const fresh = env.authenticatedContext(`${uid}-new`).firestore(), zero = { displayName: 'New Member', pointsBalance: 0, lifetimePoints: 0, eventsAttended: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(fresh, 'userProfiles', `${uid}-new`), zero));
  const forged = env.authenticatedContext(`${uid}-forged`).firestore();
  await assertFails(setDoc(doc(forged, 'userProfiles', `${uid}-forged`), { ...zero, pointsBalance: 1000000 }));
  await assertFails(setDoc(doc(forged, 'userProfiles', `${uid}-forged`), { ...zero, lastRedemptionAt: serverTimestamp() }));
});
test('A6 rules: direct rewards ledgers, counter resets, inventory and claim forgeries are denied', async () => {
  const db = env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(db, 'userProfiles', uid))); await assertSucceeds(getDoc(doc(db, 'rewardItems', rewardId)));
  await assertFails(getDoc(doc(db, 'eventQrCodes', qrId))); await assertFails(getDocs(collection(db, 'eventQrCodes')));
  for (const path of [`userProfiles/${uid}/pointsTransactions/forged`, `userProfiles/${uid}/redemptionRequests/forged`, `userProfiles/${uid}/rewardAttempts/forged`, `eventQrCodes/${qrId}/claims/${uid}`]) await assertFails(setDoc(doc(db, path), { uid, pointsDelta: 1000000, pointsAwarded: 100, eventQrCodeId: qrId }));
  await assertFails(updateDoc(doc(db, `userProfiles/${uid}/claimRateLimits/eventQr`), { claimsToday: 0 }));
  await assertFails(deleteDoc(doc(db, `userProfiles/${uid}/claimRateLimits/eventQr`)));
  await assertFails(updateDoc(doc(db, 'rewardItems', rewardId), { inventory: 1 }));
  await assertFails(updateDoc(doc(db, 'eventQrCodes', qrId), { totalClaims: 2 }));
  const batch = writeBatch(db); batch.update(doc(db, 'userProfiles', uid), { pointsBalance: 0, updatedAt: serverTimestamp() }); batch.update(doc(db, 'rewardItems', rewardId), { inventory: 1, updatedAt: serverTimestamp() }); await assertFails(batch.commit());
});
test('A6 rules: admins manage reward configuration and fulfillment without forging balances or settled ledgers', async () => {
  const db = env.authenticatedContext(admin).firestore();
  await assertSucceeds(getDocs(collection(db, 'eventQrCodes')));
  await assertSucceeds(updateDoc(doc(db, 'eventQrCodes', qrId), { isActive: false }));
  await assertSucceeds(setDoc(doc(db, 'eventQrCodes', `${qrId}-new`), { code: 'NEW', totalClaims: 0 }));
  await assertSucceeds(updateDoc(doc(db, 'rewardItems', rewardId), { inventory: 10 }));
  await assertSucceeds(updateDoc(doc(db, `userProfiles/${uid}/redemptionRequests/legitimate`), { status: 'fulfilled', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, `userProfiles/${uid}/redemptionRequests/legitimate`), { pointsCost: 0, balanceAfter: 1000000, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'eventQrCodes', qrId), { totalClaims: 0 }));
  await assertFails(updateDoc(doc(db, 'userProfiles', uid), { pointsBalance: 1000000, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, `userProfiles/${uid}/pointsTransactions/forged`), { pointsDelta: 1000000 }));
});
