import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { ref, getBytes, uploadBytes } from 'firebase/storage';
let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Local Firebase emulators required');
  env = await initializeTestEnvironment({ projectId: 'demo-pluto-waiver', firestore: { rules: await readFile('firestore.rules', 'utf8') }, storage: { rules: await readFile('storage.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'adminUsers', 'rules-staff'), { role: 'admin' });
    await setDoc(doc(c.firestore(), 'manafestWaivers', 'private-test'), { fullName: 'Private Test', status: 'completed' });
    await uploadBytes(ref(c.storage(), 'private/waivers/private-test.pdf'), new Uint8Array([1, 2]), { contentType: 'application/pdf' });
  });
});
after(async () => env?.cleanup());
for (const role of ['anonymous', 'attendee', 'rules-staff']) test(`${role} cannot directly read, list, or write private waiver data`, async () => {
  const c = role === 'anonymous' ? env.unauthenticatedContext() : env.authenticatedContext(role);
  for (const name of ['manafestWaivers', 'waiverRateLimits', 'waiverAccessLog']) {
    await assertFails(getDoc(doc(c.firestore(), name, 'private-test')));
    await assertFails(getDocs(collection(c.firestore(), name)));
    await assertFails(setDoc(doc(c.firestore(), name, 'private-test'), { status: 'completed' }));
  }
  await assertFails(getBytes(ref(c.storage(), 'private/waivers/private-test.pdf')));
  await assertFails(uploadBytes(ref(c.storage(), 'private/waivers/forged.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }));
});
