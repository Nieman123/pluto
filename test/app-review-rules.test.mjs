import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
let env;
const uid = `review-rules-${randomUUID()}`, other = `${uid}-other`, root = `appReviewAccounts/${uid}`, profile = `${root}/userProfiles/${uid}`;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Local rules emulator required');
  env = await initializeTestEnvironment({ projectId: 'demo-pluto-ticketing', firestore: { host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').pop()), rules: await readFile('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, root), { enabled: true });
    await setDoc(doc(db, profile), { displayName: 'Demo guest', pointsBalance: 500, lifetimePoints: 500, eventsAttended: 2 });
    await setDoc(doc(db, `${root}/rewardItems/sticker`), { pointsCost: 100, inventory: null });
    await setDoc(doc(db, `${profile}/pointsTransactions/welcome`), { pointsDelta: 500 });
  });
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async c => {
    for (const path of [root, profile, `${root}/rewardItems/sticker`, `${profile}/pointsTransactions/welcome`]) await deleteDoc(doc(c.firestore(), path));
  });
  await env.cleanup();
});
test('only the owner reads demo fixtures; clients cannot enroll or forge balances or inventory', async () => {
  const own = env.authenticatedContext(uid).firestore(), stranger = env.authenticatedContext(other).firestore();
  await assertSucceeds(getDoc(doc(own, root)));
  await assertSucceeds(getDoc(doc(stranger, `appReviewAccounts/${other}`))); // missing self enrollment is a normal member
  await assertFails(setDoc(doc(stranger, `appReviewAccounts/${other}`), { enabled: true }));
  await assertFails(updateDoc(doc(own, root), { enabled: false }));
  await assertFails(getDoc(doc(stranger, profile)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), root)));
  await assertFails(getDocs(collection(own, 'appReviewAccounts')));
  await assertSucceeds(getDoc(doc(own, profile)));
  await assertSucceeds(getDocs(collection(own, `${root}/rewardItems`)));
  await assertSucceeds(getDocs(collection(own, `${profile}/pointsTransactions`)));
  await assertSucceeds(updateDoc(doc(own, profile), { bio: 'Music fan', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(own, profile), { pointsBalance: 10000, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(own, `${root}/rewardItems/sticker`), { pointsCost: 0 }));
  await assertFails(setDoc(doc(own, `${profile}/pointsTransactions/forged`), { pointsDelta: 10000 }));
  await assertFails(setDoc(doc(own, `${profile}/redemptionRequests/forged`), { status: 'requested' }));
});
test('disabled enrollment revokes access instead of becoming an ordinary account', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), root), { enabled: false }));
  const own = env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(own, root)));
  await assertFails(getDoc(doc(own, profile)));
  await assertFails(getDocs(collection(own, `${root}/rewardItems`)));
  await assertFails(updateDoc(doc(own, profile), { bio: 'change', updatedAt: serverTimestamp() }));
});
