import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { ref, getBytes, uploadBytes, deleteObject } from 'firebase/storage';
let env;
const privateCollections = ['ticketingEvents', 'ticketingOrders', 'ticketingTickets', 'ticketingTransfers', 'ticketingHolderAccess', 'ticketingRecovery', 'ticketingAccess', 'ticketingRefunds', 'ticketingStaff', 'ticketingEmailJobs', 'ticketingWebhookInbox', 'ticketingScannerPins', 'ticketingScannerPinLookup', 'ticketingScannerSessions', 'ticketingOfflineLeases', 'ticketingRateLimits', 'ticketingWalletDownloads', 'ticketingHealth', 'ticketingHealthAudit', 'ticketingEmailDelivery', 'ticketingRsvpVerification', 'ticketingRsvpUpgradeAccess', 'ticketingCampaigns', 'ticketingWaitlist', 'ticketingWaitlistTokens', 'ticketingWorkerCursors'];
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Local emulators required');
  env = await initializeTestEnvironment({ projectId: 'demo-pluto-ticketing', firestore: { host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').pop()), rules: await readFile('firestore.rules', 'utf8') }, storage: { host: '127.0.0.1', port: Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':').pop()), rules: await readFile('storage.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'adminUsers', 'ticketing-rules-admin'), { role: 'admin' });
    await setDoc(doc(c.firestore(), 'publishedEvents', 'test-event'), { title: 'Public event', city: 'Asheville' });
    await setDoc(doc(c.firestore(), 'ticketingEvents/test-event/guests/private-guest'), { name: 'Private guest' });
    await setDoc(doc(c.firestore(), 'ticketingEvents/test-event/guestBatches/private-batch'), { private: true });
    await setDoc(doc(c.firestore(), 'ticketingEvents/test-event/rsvpContacts/private-contact', 'ticketingEvents/test-event/doorStates/private-state', 'ticketingEvents/test-event/door/walkups', 'ticketingEvents/test-event/doorActions/private-audit'), { orderId: 'private' });
    for (const name of privateCollections) await setDoc(doc(c.firestore(), name, 'private'), { private: true });
    await uploadBytes(ref(c.storage(), 'private/ticketing/test-event/artwork.webp'), new Uint8Array([1, 2]), { contentType: 'image/webp' });
  });
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async c => {
    await deleteDoc(doc(c.firestore(), 'adminUsers', 'ticketing-rules-admin'));
    await deleteDoc(doc(c.firestore(), 'publishedEvents', 'test-event'));
    await deleteDoc(doc(c.firestore(), 'ticketingEvents/test-event/guests/private-guest'));
    await deleteDoc(doc(c.firestore(), 'ticketingEvents/test-event/guestBatches/private-batch'));
    await deleteDoc(doc(c.firestore(), 'ticketingEvents/test-event/rsvpContacts/private-contact', 'ticketingEvents/test-event/doorStates/private-state', 'ticketingEvents/test-event/door/walkups', 'ticketingEvents/test-event/doorActions/private-audit'));
    for (const name of privateCollections) await deleteDoc(doc(c.firestore(), name, 'private'));
    await deleteObject(ref(c.storage(), 'private/ticketing/test-event/artwork.webp'));
  });
  await env.cleanup();
});
for (const role of ['anonymous', 'buyer', 'ticketing-rules-admin']) test(`${role}: projection is readable, private ticketing records and draft media are API-only`, async () => {
  const c = role === 'anonymous' ? env.unauthenticatedContext() : env.authenticatedContext(role);
  await assertSucceeds(getDoc(doc(c.firestore(), 'publishedEvents', 'test-event')));
  await assertFails(setDoc(doc(c.firestore(), 'publishedEvents', 'test-event'), { title: 'Forged event' }));
  for (const path of ['ticketingEvents/test-event/guests/private-guest', 'ticketingEvents/test-event/guestBatches/private-batch', 'ticketingEvents/test-event/rsvpContacts/private-contact', 'ticketingEvents/test-event/doorStates/private-state', 'ticketingEvents/test-event/door/walkups', 'ticketingEvents/test-event/doorActions/private-audit']) {
    await assertFails(getDoc(doc(c.firestore(), path))); await assertFails(setDoc(doc(c.firestore(), path), { name: 'Forged guest' }));
  }
  await assertFails(getDocs(collection(c.firestore(), 'ticketingEvents/test-event/guests')));
  for (const name of privateCollections) {
    await assertFails(getDoc(doc(c.firestore(), name, 'private'))); await assertFails(getDocs(collection(c.firestore(), name))); await assertFails(setDoc(doc(c.firestore(), name, 'private'), { private: false }));
  }
  await assertFails(getBytes(ref(c.storage(), 'private/ticketing/test-event/artwork.webp')));
  await assertFails(uploadBytes(ref(c.storage(), 'private/ticketing/test-event/artwork.webp'), new Uint8Array([3]), { contentType: 'image/webp' }));
});
