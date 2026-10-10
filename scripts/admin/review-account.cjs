// Never accepts or prints passwords. Authenticate with gcloud ADC or an
// explicitly supplied, ignored GOOGLE_APPLICATION_CREDENTIALS file.
const functionsRequire = require('node:module').createRequire(require.resolve('../../functions/package.json'));
const { initializeApp, applicationDefault } = functionsRequire('firebase-admin/app');
const { getAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore } = functionsRequire('firebase-admin/firestore');
const { seedAppReview } = require('../../functions/lib/app-review');
const projects = require('../../functions/src/deployment-projects.json');

async function main() {
  const args = process.argv.slice(2);
  const value = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const projectId = value('project'), uid = value('uid'), email = value('email'), action = value('action');
  if (!projectId || !uid || uid.includes('/') || !email || !['enroll', 'enable', 'disable'].includes(action))
    throw new Error('Use --project=ID --uid=UID --email=EMAIL --action=enroll|enable|disable');
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator) {
    if (projectId !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9095')
      throw new Error('Use both isolated localhost demo emulators.');
  } else if (![projects.production, projects.staging].includes(projectId)) throw new Error('Unknown Pluto deployment project.');
  if (!emulator) process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  let credential = !emulator ? applicationDefault() : undefined, cloudDb;
  if (!emulator && args.includes('--gcloud')) {
    // Reuse the operator's existing Cloud SDK login in memory. Tokens never
    // enter command arguments, files, logs or console output.
    const { execSync } = require('node:child_process');
    const accessToken = execSync('gcloud auth print-access-token', { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!accessToken) throw new Error('Sign in to gcloud first.');
    credential = { getAccessToken: async () => ({ access_token: accessToken, expires_in: 3600 }) };
    // Use gax's auth-library version; mixing header representations across
    // versions can silently omit the Authorization header on REST transport.
    const firestoreRequire = require('node:module').createRequire(functionsRequire.resolve('@google-cloud/firestore'));
    const gaxRequire = require('node:module').createRequire(firestoreRequire.resolve('google-gax'));
    const { GoogleAuth, OAuth2Client } = gaxRequire('google-auth-library');
    const { Firestore } = functionsRequire('@google-cloud/firestore');
    const client = new OAuth2Client();
    client.quotaProjectId = projectId;
    client.setCredentials({ access_token: accessToken, expiry_date: Date.now() + 3600000 });
    cloudDb = new Firestore({ projectId, auth: new GoogleAuth({ projectId, authClient: client }), preferRest: true });
  }
  initializeApp({ projectId, ...(credential ? { credential } : {}) });
  const auth = getAuth(), db = cloudDb || getFirestore(), user = await auth.getUser(uid);
  if (user.email !== email || user.disabled || user.providerData.every(p => p.providerId !== 'password'))
    throw new Error('The UID must match an enabled Email/Password account with that exact email.');
  if ((await db.collection('adminUsers').doc(uid).get()).exists ||
      !(await db.collection('ticketingStaff').where('uid', '==', uid).limit(1).get()).empty ||
      Object.keys(user.customClaims || {}).length)
    throw new Error('Use a dedicated normal member account with no admin/staff roles or custom claims.');
  const registry = db.collection('appReviewAccounts').doc(uid);
  if (action === 'enroll') await seedAppReview(db, uid, email);
  else {
    const enrollment = await registry.get();
    if (enrollment.data()?.email !== email) throw new Error('The account is not enrolled with that email.');
    await registry.update({ enabled: action === 'enable' });
  }
  if (action !== 'disable') await auth.updateUser(uid, { emailVerified: true, displayName: user.displayName || 'Pluto demo guest' });
  console.log(`Demo account ${action} completed in ${projectId} for UID ${uid}. No live events, tickets, payments or inventory were changed.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
