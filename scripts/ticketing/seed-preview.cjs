const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const requireFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9295';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
process.env.TICKETING_STORAGE_BUCKET = 'demo-pluto-ticketing.appspot.com';
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { getAuth } = requireFunctions('firebase-admin/auth');
initializeApp({ projectId: 'demo-pluto-ticketing', storageBucket: 'demo-pluto-ticketing.appspot.com' });
const { Catalog } = require('../../functions/lib/ticketing/catalog');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
async function main() {
  const uid = 'ticketing-preview-admin', auth = getAuth();
  try { await auth.createUser({ uid, email: 'staff@ticketing-preview.invalid', password: 'Local-ticketing-preview-2026!', emailVerified: true, displayName: 'Preview staff' }); }
  catch (error) { if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
  await getFirestore().collection('adminUsers').doc(uid).set({ role: 'admin' });
  const service = new Catalog(), eid = 'ticketing-preview-event', before = (await service.event(eid).get()).data();
  if (!before) {
    const draft = fixture(true); draft.slug = 'pluto-ticketing-preview'; draft.title = 'Into the Orbit'; draft.subtitle = 'A dance music gathering by Pluto. Sound, community, and a night beneath the stars.';
    draft.descriptionHtml = '<p>Follow the sound into a night of deep grooves, bright lights and familiar faces.</p><p>Join us for a weekend built around music and connection.</p>';
    draft.lineup = [{ name: 'Orbit Selectors', genre: 'House & techno', time: 'Friday · 10 PM', image: null }];
    draft.sections = [{ id: 'access', type: 'accessibility', title: 'Everyone belongs here', bodyHtml: '<p>Contact Pluto before the event for access questions and accommodations.</p>', visible: true }, { id: 'camping', type: 'camping', title: 'Stay for the weekend', bodyHtml: '<p>Respect your neighbors. Keep campsites tidy and take everything home with you.</p>', visible: true }];
    await service.save(eid, draft, 0, uid); await service.publish(eid, 'publish', 1, uid);
  }
  console.log('Seeded demo ticketing event and local administrator. Local sign-in: staff@ticketing-preview.invalid / Local-ticketing-preview-2026!');
}
main().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
