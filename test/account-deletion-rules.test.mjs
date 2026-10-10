import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
let env;
const uid = `deletion-rules-${randomUUID()}`;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Local emulator required.');
  env = await initializeTestEnvironment({ projectId: 'demo-pluto-ticketing', firestore: { host: '127.0.0.1', port: 8185, rules: await readFile('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'userProfiles', uid), { displayName: 'Member' });
    await setDoc(doc(c.firestore(), 'adminUsers', uid), { role: 'admin' });
  });
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async c => { for (const name of ['userProfiles', 'adminUsers', 'accountDeletionRequests']) await deleteDoc(doc(c.firestore(), name, uid)); });
  await env.cleanup();
});
test('committed deletion blocks old ID tokens, including admin writes and profile recreation', async () => {
  const db = env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(db, 'userProfiles', uid)));
  await assertFails(setDoc(doc(db, 'accountDeletionRequests', uid), { status: 'completed' }));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'accountDeletionRequests', uid), { status: 'pending' }));
  await assertFails(getDoc(doc(db, 'userProfiles', uid)));
  await assertFails(updateDoc(doc(db, 'userProfiles', uid), { displayName: 'Recreate', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'accountDeletionRequests', uid)));
  await assertFails(setDoc(doc(db, 'currentEvents', uid), { title: 'Old admin token' }));
  await assertFails(getDoc(doc(db, 'accountDeletionRequests', uid)));
});
