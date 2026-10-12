// No production code paths, payment credentials or email providers are changed.
const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { execSync } = require('node:child_process');
const { randomBytes, randomUUID, generateKeyPairSync, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { phase, stagingGuard, fixtureGuard } = require('./metrics.cjs');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
const root = resolve(__dirname, '../..'), project = 'pluto-staging-92eb7', base = 'https://pluto-staging-92eb7.web.app';
const hash = v => createHash('sha256').update(v).digest('hex'), key = () => randomBytes(32).toString('hex');
const args = process.argv.slice(2), value = n => args.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const wait = ms => new Promise(done => setTimeout(done, ms));

async function credentials() {
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = project;
  const { initializeApp, applicationDefault } = backend('firebase-admin/app');
  const { getFirestore, Firestore } = backend('firebase-admin/firestore');
  let credential = applicationDefault(), db;
  if (args.includes('--gcloud')) {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    credential = { getAccessToken: async () => ({ access_token: token, expires_in: 3600 }) };
    const firestoreRequire = createRequire(backend.resolve('@google-cloud/firestore'));
    const gaxRequire = createRequire(firestoreRequire.resolve('google-gax'));
    const { GoogleAuth, OAuth2Client } = gaxRequire('google-auth-library');
    const client = new OAuth2Client(); client.quotaProjectId = project;
    client.setCredentials({ access_token: token, expiry_date: Date.now() + 3600000 });
    db = new Firestore({ projectId: project, auth: new GoogleAuth({ projectId: project, authClient: client }), preferRest: true });
  }
  initializeApp({ projectId: project, credential });
  return { db: db || getFirestore(), auth: backend('firebase-admin/auth').getAuth() };
}

async function main() {
  if (args.includes('--help')) { console.log('Build functions, then: node scripts/load-test/staging.cjs --gcloud [--sizes=250,1000,3000] [--concurrency=1,5,10,25] [--samples=60]\nCleanup: node scripts/load-test/staging.cjs --gcloud --cleanup=PATH/run.json\nReport: node scripts/load-test/report.cjs PATH/run.json\nOnly Pluto staging is supported. See docs/staging-load-test.md for scope and limits.'); return; }
  if (Object.keys(process.env).some(n => /EMULATOR_HOST$/.test(n) && process.env[n])) throw new Error('Remove emulator environment variables for measured staging runs.');
  if (value('project') && value('project') !== project || value('base') && value('base') !== base) throw new Error('Production and arbitrary targets are forbidden.');
  const identity = await (await fetch(`${base}/__deployment`, { signal: AbortSignal.timeout(15000) })).json();
  stagingGuard(project, base, identity);
  if (!/^[a-f0-9]{40}$/.test(identity.revision || '')) throw new Error('Deployment must advertise a valid source revision.');
  if (!value('cleanup')) {
    const drift = execSync(`git -c safe.directory=D:/git/pluto diff --name-only ${identity.revision} -- functions/src functions/test/ticketing-fixture.cjs`, { cwd: root, encoding: 'utf8' }).trim();
    if (drift) throw new Error('Local backend/fixture source differs from deployed staging. Update the source and rebuild functions before benchmarking.');
  }
  const { db, auth } = await credentials();
  const sizes = (value('sizes') || '250,1000,3000').split(',').map(Number);
  const levels = (value('concurrency') || '1,5,10,25').split(',').map(Number);
  const samples = Number(value('samples') || 60);
  if (sizes.some(n => !Number.isInteger(n) || n < 100 || n > 5000) || levels.some(n => !Number.isInteger(n) || n < 1 || n > 50) || !Number.isInteger(samples) || samples < 10 || samples > 200 || sizes.length > 4 || levels.length > 6)
    throw new Error('Bounds: 100–5000 attendees, concurrency 1–50, samples 10–200, at most 4 sizes and 6 levels.');
  if (value('cleanup')) {
    const file = value('cleanup'), report = JSON.parse(readFileSync(file, 'utf8'));
    await cleanup(report, db, auth); report.cleanupComplete = true; delete report.cleanupError;
    writeFileSync(file, JSON.stringify(report, null, 2)); require('./report.cjs').render(report, require('node:path').dirname(file));
    await db.terminate(); return;
  }
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const output = resolve(root, value('output') || `output/load-tests/${new Date().toISOString().replaceAll(':', '-')}-${runId}`);
  mkdirSync(output, { recursive: true });
  const manifestPath = join(output, 'run.json');
  const report = { schema: 1, runId, project, base, startedAt: new Date().toISOString(), deployment: identity,
    sourceRevision: execSync('git -c safe.directory=D:/git/pluto rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, driver: 'local Windows client; Firestore REST transport over WAN', workload: { sizes, levels, samples, scannerSessions: args.includes('--shared-scanner') ? 'shared session' : 'one session per concurrent scanner' },
    limits: ['Closed-loop bounded concurrency, not an open-loop saturation test.', 'Inventory diagnostic uses real checkout code/Firestore but intercepts the provisional order status to prevent background payments and emails; it excludes deployed HTTP/auth/Stripe latency.',
      'Scanner and order-page timings include the deployed staging HTTPS API, auth, network and database.', 'Seeded admission tickets are synthetic comps with zero points; paid fulfillment/refunds and email delivery are not load-tested.',
      'Short runs establish tested envelopes, not a guaranteed maximum attendee count.'], events: [], phases: [], integrity: [], cleanupComplete: false };
  const save = () => writeFileSync(manifestPath, JSON.stringify(report, null, 2)); save();
  let token, scannerToken, halted = false;
  const deadline = Date.now() + 18 * 60000;
  process.on('SIGINT', () => { halted = true; });
  const stopped = () => halted || Date.now() > deadline;
  const post = async (path, body, scanner = false) => {
    const r = await fetch(`${base}/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-Pluto-Client': hash(`load-driver-${runId}`), ...(scanner ? { 'X-Pluto-Scanner': typeof scanner === 'string' ? scanner : scannerToken } : token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const payload = await r.text(), result = JSON.parse(payload);
    if (!r.ok) { const error = new Error('Staging API request failed'); error.status = r.status; error.code = result.code || `http-${r.status}`; throw error; }
    result._loadResponseBytes = Buffer.byteLength(payload); return result;
  };
  const measured = async options => {
    if (stopped()) throw new Error('Run stopped or exceeded its 18-minute budget.');
    const current = await (await fetch(`${base}/__deployment`, { signal: AbortSignal.timeout(15000) })).json();
    stagingGuard(project, base, current);
    if (current.revision !== identity.revision) throw new Error('Staging deployment changed during the run; rerun against one revision.');
    const result = await phase({ ...options, stop: stopped }); report.phases.push(result); save();
    console.log(`${result.name}: c=${result.concurrency}, ${result.successes}/${result.completed}, ${result.successfulRps.toFixed(2)}/s, p95=${Math.round(result.p95Ms)}ms`);
    if (result.completed !== result.requested || result.failures / result.completed > .1) throw new Error('Stop threshold: incomplete phase or >10% unexpected failures.');
    return result;
  };
  const event = async (name, capacity) => {
    const eventId = `load_${runId}_${name}`, { fixture } = require('../../functions/test/ticketing-fixture.cjs');
    const draft = fixture(true); draft.title = `[LOAD TEST] ${name} ${runId}`; draft.slug = `load-${runId}-${name}`;
    draft.registrationMode = 'tickets'; draft.remindersEnabled = false; draft.waitlistEnabled = false;
    draft.endAt = new Date(Date.now() + 25 * 60000).toISOString();
    draft.pools = [{ id: 'admission', name: 'Synthetic admission', capacity }]; draft.promos = [];
    draft.offers = [{ ...draft.offers[0], id: 'admission', name: 'Synthetic pass', pools: { admission: 1 }, unitAmount: 100,
      checkInPoints: 0, salesEnd: draft.endAt, validUntil: draft.endAt }];
    report.events.push(eventId); save();
    const batch = db.batch();
    batch.create(db.collection('ticketingEvents').doc(eventId), { loadTestRun: runId, draft, liveDraft: draft,
      status: 'published', revision: 1, publishedRevision: 1, publishedSlug: draft.slug, createdAt: Date.now() });
    batch.create(db.collection('ticketingEvents').doc(eventId).collection('pools').doc('admission'), { capacity, held: 0, sold: 0 });
    // Deliberately do not create publishedEvents, currentEvents or eventSlugs:
    // these synthetic events never appear on public discovery pages.
    await batch.commit(); return { eventId, draft };
  };
  try {
    const html = await (await fetch(base)).text();
    const config = JSON.parse(html.match(/<script[^>]*id="firebase-config"[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.equal(config.projectId, project);
    Object.assign(process.env, { GCLOUD_PROJECT: project, PLUTO_ENVIRONMENT: 'staging', PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify(config),
      TICKETING_MODE: 'test', TICKETING_LIVE_READY: 'false', TICKETING_WALLETS_ENABLED: 'false', TICKETING_BASE_URL: base });
    const uid = `load-${runId}`, email = `${uid}@loadtest.invalid`, password = `${key()}aA!9`;
    report.uid = uid; save();
    await auth.createUser({ uid, email, password, emailVerified: true, displayName: 'Synthetic load driver' });
    const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(20000) });
    const loggedIn = await login.json(); if (!login.ok || !loggedIn.idToken) throw new Error('Could not authenticate the synthetic staging driver.'); token = loggedIn.idToken;
    const { Orders } = require('../../functions/lib/ticketing/orders');
    const signing = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    // Only the benchmark-created order's status is intercepted. The real
    // checkout validation and inventory transaction run unmodified. The
    // durable marker excludes synthetic orders from payment recovery even
    // if the local process is interrupted. Stripe methods fail closed.
    const { inventoryFacade, noStripe } = require('./inventory.cjs');
    const service = new Orders(inventoryFacade(db, runId), { stripe: noStripe(), signingKey: signing });
    const reserve = eid => service.checkout({ eventId: eid, email: `${key()}@loadtest.invalid`, name: 'Synthetic buyer',
      accessKey: key(), items: [{ offerId: 'admission', quantity: 1 }], promoCode: '' }, null);
    if (!args.includes('--skip-inventory')) {
    const inventory = await event('inventory', 10000);
    for (const concurrency of levels) await measured({ name: 'inventory-core', count: samples, concurrency, operation: () => reserve(inventory.eventId), expected: r => r.status === 'load-test-reserved' });
    const pool = (await db.collection('ticketingEvents').doc(inventory.eventId).collection('pools').doc('admission').get()).data();
    const orderCount = (await db.collection('ticketingOrders').where('eventId', '==', inventory.eventId).count().get()).data().count;
    assert.equal(pool.held, orderCount); report.integrity.push({ name: 'reservation accounting', held: pool.held, orders: orderCount, pass: true });
    const scarce = await event('sellout', 10);
    const sold = await phase({ name: 'inventory-sellout', count: 30, concurrency: 25, operation: async () => {
      try { await reserve(scarce.eventId); return { result: 'reserved' }; } catch (e) { if (e.status === 409) return { result: 'sold-out' }; throw e; }
    }, expected: r => ['reserved', 'sold-out'].includes(r.result) });
    assert.equal(sold.outcomes.reserved, 10); assert.equal(sold.outcomes['sold-out'], 20);
    assert.equal((await db.collection('ticketingEvents').doc(scarce.eventId).collection('pools').doc('admission').get()).data().held, 10);
    report.phases.push(sold); report.integrity.push({ name: 'near-sellout', reserved: 10, rejected: 20, pass: true }); save();
    }
    for (const size of sizes) {
      const seeded = await event(`attendees-${size}`, size);
      await db.collection('ticketingStaff').doc(`${seeded.eventId}_${uid}`).create({ eventId: seeded.eventId, uid, roles: ['manager', 'admission'] });
      const tickets = [], orders = [], unit = { offerId: 'admission', name: 'Synthetic pass', kind: 'admission', amount: 0, originalAmount: 0,
        discount: 0, validFrom: seeded.draft.startAt, validUntil: seeded.draft.endAt, checkInPoints: 0, taxCode: '', stripeProductId: '', stripeTaxRateIds: [] };
      let batch = db.batch(), writes = 0;
      const flush = async () => { if (writes) { await batch.commit(); batch = db.batch(); writes = 0; } };
      for (let i = 0; i < size; i += 4) {
        const oid = hash(`${runId}:${size}:${i}`), units = Array.from({ length: Math.min(4, size - i) }, () => unit); orders.push(oid);
        batch.create(db.collection('ticketingOrders').doc(oid), { loadTestRun: runId, eventId: seeded.eventId, eventTitle: seeded.draft.title, eventSlug: seeded.draft.slug,
          ownerUid: uid, email, name: 'Synthetic attendee', accessHash: key(), inputHash: key(), status: 'paid', method: 'comp', units,
          consumption: { admission: units.length }, promoCode: '', total: 0, discount: 0, tax: seeded.draft.tax, currency: 'usd', livemode: false,
          createdAt: Date.now(), paidAt: Date.now(), expiresAt: Date.now() + 35 * 60000, promoterId: '', refundedAmount: 0, stripeFee: 0, stripeFeeStatus: 'confirmed' }); writes++;
        for (let j = 0; j < units.length; j++) {
          const tid = hash(`${oid}:${j}`); tickets.push({ id: tid, orderId: oid });
          batch.create(db.collection('ticketingTickets').doc(tid), { ...unit, loadTestRun: runId, orderId: oid, eventId: seeded.eventId, eventTitle: seeded.draft.title,
            ownerUid: uid, holderEmail: email, holderName: 'Synthetic attendee', version: 1, status: 'valid', admission: null, refunded: false, index: j }); writes++;
        }
        if (writes >= 200) await flush();
      }
      await flush(); await db.collection('ticketingEvents').doc(seeded.eventId).collection('pools').doc('admission').update({ sold: size });
      const summaryStarted = Date.now(); let summaryReady = false;
      while (Date.now() - summaryStarted < 30000 && !stopped()) {
        const summary = (await db.collection('ticketingFinancialSummaries').doc(seeded.eventId).get()).data();
        if (summary?.ready && summary.totals?.tickets === size) { summaryReady = true; break; }
        await wait(1000);
      }
      report.integrity.push({ name: 'financial summary convergence before scans', attendees: size, pass: summaryReady,
        observation: true, lagMs: Date.now() - summaryStarted, note: summaryReady ? 'Ready before measured scans' : 'Not ready within 30 seconds; background work may influence timings' }); save();
      const pin = await post('staff/scanner-pins/create', { eventId: seeded.eventId, label: `Load test ${runId}`, expiresAt: Date.now() + 30 * 60000 });
      const session = await post('scanner/login', { pin: pin.pin }); scannerToken = session.token;
      if (!scannerToken) throw new Error('Scanner login returned no session token.');
      const scannerSessions = [scannerToken];
      if (!args.includes('--shared-scanner')) {
        const total = Math.max(...levels); console.log(`Preparing ${total} independent scanner sessions for ${size} attendees.`);
        let nextPin = pin.pin;
        for (let lane = 1; lane < total; lane++) {
          if (lane % 10 === 0) nextPin = (await post('staff/scanner-pins/create', { eventId: seeded.eventId,
            label: `Load test ${runId} lanes ${lane}`, expiresAt: Date.now() + 30 * 60000 })).pin;
          // Preserve the application's existing 40 logins/minute/IP limit.
          await wait(1600); scannerSessions.push((await post('scanner/login', { pin: nextPin })).token);
        }
      }
      await measured({ name: 'manifest', attendees: size, count: 3, concurrency: 1, operation: () => post('staff/manifest', { eventId: seeded.eventId }, true) });
      report.phases.slice(-1)[0].attendees = size;
      const available = Math.min(tickets.length - 1, samples * levels.length), qr = new Map();
      // Obtain credentials from the deployed signer; no signing secrets are read.
      for (const oid of [...new Set(tickets.slice(0, available + 1).map(t => t.orderId))]) {
        const details = await post('order', { orderId: oid });
        for (const t of details.tickets || []) if (t.qr) qr.set(t.id, t.qr);
      }
      if (qr.size < available + 1) throw new Error('Deployed signer did not return enough usable synthetic ticket credentials.');
      let offset = 0;
      for (const concurrency of levels) {
        const count = Math.min(samples, Math.floor((size - 1) / levels.length));
        const result = await measured({ name: 'admission', count, concurrency, operation: (i, lane) => post('staff/scan', {
          eventId: seeded.eventId, qr: qr.get(tickets[offset + i].id), scanId: randomUUID() }, scannerSessions[lane % scannerSessions.length]), expected: r => r.result === 'accepted' });
        result.attendees = size; offset += count; save();
      }
      const raceTicket = tickets[offset];
      const race = await phase({ name: 'duplicate-scan-race', count: 10, concurrency: 10, operation: () => post('staff/scan', {
        eventId: seeded.eventId, qr: qr.get(raceTicket.id), scanId: randomUUID() }, true) });
      assert.equal(race.outcomes.accepted, 1); assert.equal(race.outcomes.duplicate, 9);
      report.integrity.push({ name: 'duplicate admission', attendees: size, accepted: 1, duplicates: 9, pass: true });
      const admitted = (await db.collection('ticketingTickets').where('eventId', '==', seeded.eventId).get()).docs.filter(d => d.data().admission).length;
      assert.equal(admitted, offset + 1); report.integrity.push({ name: 'admission accounting', attendees: size, admitted, expected: offset + 1, pass: true });
      const pages = await measured({ name: 'order-page', count: 10, concurrency: 5, operation: () => post('staff/orders', { eventId: seeded.eventId }) }); pages.attendees = size; save();
      const finalSummary = (await db.collection('ticketingFinancialSummaries').doc(seeded.eventId).get()).data();
      report.integrity.push({ name: 'financial summary after scans', attendees: size, observation: true,
        pass: !!finalSummary?.ready && finalSummary.totals?.tickets === size, tickets: finalSummary?.totals?.tickets || 0,
        elapsedMs: Date.now() - summaryStarted, note: 'Asynchronous projection observed; this is not admission accounting.' }); save();
      for (const session of scannerSessions) await post('scanner/logout', {}, session); scannerToken = null;
    }
    const emails = await db.collection('ticketingEmailJobs').where('to', '==', `${report.uid}@loadtest.invalid`).get();
    assert.equal(emails.size, 0); report.integrity.push({ name: 'no seeded receipt emails', pass: true, jobs: 0 });
  } catch (error) { report.error = { message: error.message.slice(0, 500), code: error.code || '', status: error.status || 0 }; console.error('Load test stopped:', report.error); }
  finally {
    report.finishedAt = new Date().toISOString(); save();
    try { await cleanup(report, db, auth); report.cleanupComplete = true; } catch (error) { report.cleanupError = error.message; console.error('Cleanup incomplete; rerun --cleanup with run.json.'); }
    save(); require('./report.cjs').render(report, output);
    console.log(`Measured results: ${output}`); await db.terminate();
  }
  if (report.error || !report.cleanupComplete) process.exitCode = 1;
}

async function cleanup(report, db, auth) {
  stagingGuard(report.project, report.base, { projectId: report.project, environment: 'staging', paymentMode: 'test' });
  if (!/^[a-f0-9]{16}$/.test(report.runId)) throw new Error('Invalid load-test run ID.');
  if (!Array.isArray(report.events) || report.events.some(eid => typeof eid !== 'string' || !/^load_[a-f0-9]{16}_[a-z0-9-]+$/.test(eid) || !eid.startsWith(`load_${report.runId}_`))) throw new Error('Cleanup scope mismatch.');
  if (report.uid && report.uid !== `load-${report.runId}`) throw new Error('Cleanup user mismatch.');
  for (const eid of report.events) {
    if (!eid.startsWith(`load_${report.runId}_`)) throw new Error('Cleanup scope mismatch.');
    const eventRef = db.collection('ticketingEvents').doc(eid), event = (await eventRef.get()).data();
    if (event) fixtureGuard(event, report.runId);
    const orders = await db.collection('ticketingOrders').where('eventId', '==', eid).get();
    if (orders.docs.some(d => d.data().loadTestRun !== report.runId || d.data().sessionId || d.data().paymentIntentId || d.data().livemode)) throw new Error('Unrelated order or payment identifiers found; refusing blind cleanup.');
    const tickets = await db.collection('ticketingTickets').where('eventId', '==', eid).get();
    if (tickets.docs.some(d => d.data().loadTestRun !== report.runId)) throw new Error('Unrelated ticket found; refusing blind cleanup.');
    if (event) await eventRef.update({ status: 'archived' });
    const pins = await db.collection('ticketingScannerPins').where('eventId', '==', eid).get();
    for (const pin of pins.docs) {
      const lookups = await db.collection('ticketingScannerPinLookup').where('pinId', '==', pin.id).get();
      await Promise.all(lookups.docs.map(d => d.ref.delete()));
    }
    for (const collection of ['ticketingTickets', 'ticketingOrders', 'ticketingOrderSummaries', 'ticketingScannerPins', 'ticketingScannerSessions', 'ticketingOfflineLeases', 'ticketingStaff']) {
      const docs = await db.collection(collection).where('eventId', '==', eid).get();
      for (let i = 0; i < docs.docs.length; i += 200) { const batch = db.batch(); docs.docs.slice(i, i + 200).forEach(d => batch.delete(d.ref)); await batch.commit(); }
    }
    await db.recursiveDelete(eventRef);
    for (const collection of ['ticketingFinancialSummaries', 'ticketingFinancialBackfills']) await db.collection(collection).doc(eid).delete();
  }
  if (report.uid) {
    if (report.uid !== `load-${report.runId}`) throw new Error('Cleanup user mismatch.');
    await auth.deleteUser(report.uid).catch(e => { if (e.code !== 'auth/user-not-found') throw e; });
    await db.collection('userProfiles').doc(report.uid).delete();
  }
  const residuals = [];
  for (const eid of report.events) {
    if ((await db.collection('ticketingEvents').doc(eid).get()).exists) residuals.push(`ticketingEvents/${eid}`);
    for (const collection of ['ticketingTickets', 'ticketingOrders', 'ticketingOrderSummaries', 'ticketingScannerPins', 'ticketingScannerSessions', 'ticketingOfflineLeases', 'ticketingStaff'])
      if (!(await db.collection(collection).where('eventId', '==', eid).limit(1).get()).empty) residuals.push(`${collection}/${eid}`);
    for (const collection of ['ticketingFinancialSummaries', 'ticketingFinancialBackfills'])
      if ((await db.collection(collection).doc(eid).get()).exists) residuals.push(`${collection}/${eid}`);
  }
  assert.equal(residuals.length, 0, `Synthetic records remain: ${residuals.join(', ')}`);
  report.cleanupVerification = { checkedAt: new Date().toISOString(), events: report.events.length, residualRecords: 0 };
  console.log(`Cleaned synthetic run ${report.runId}.`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { cleanup };
