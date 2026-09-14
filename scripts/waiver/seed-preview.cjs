// This creates a fictional, local-only staff account. Never use production credentials.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-waiver';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = backend('firebase-admin/app');
const { getAuth } = backend('firebase-admin/auth');
const { getFirestore } = backend('firebase-admin/firestore');
initializeApp({ projectId: 'demo-pluto-waiver' });
(async () => {
  const uid = 'local-waiver-preview-staff';
  try { await getAuth().createUser({ uid, email: 'staff@waiver-preview.invalid', password: 'Local-preview-only-2026!', displayName: 'Local preview staff' }); }
  catch (error) { if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
  await getFirestore().collection('adminUsers').doc(uid).set({ role: 'admin' });
  console.log('Local preview staff account ready. Use “Sign in as preview staff” on /manafest-waiver/staff.');
})().catch(error => { console.error(error); process.exitCode = 1; });
