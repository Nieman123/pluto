import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getFirestore } = require('firebase-admin/firestore');
const { syncFinancialOrder, financialBackfillPage, financialBackfillNeedsWork, financialRecovery } = require('../lib/ticketing/financial-projection');

// The lightweight preview does not run the Functions emulator. Exercise the
// SAME projection handlers against the demo ledger, without cloud credentials.
export function previewFinancialWorkers() {
  if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Financial preview workers require isolated demo emulators.');
  const db = getFirestore(), jobs = new Map(), queue = [];
  let active = 0;
  const dispatch = run => {
    queue.push(run);
    const pump = () => {
      while (active < 3 && queue.length) {
        active++;
        Promise.resolve().then(queue.shift()).catch(error => console.error('Financial preview worker:', error.message)).finally(() => { active--; pump(); });
      }
    };
    pump();
  };
  const stopOrders = db.collection('ticketingOrders').onSnapshot(snapshot => {
    for (const change of snapshot.docChanges()) dispatch(() => syncFinancialOrder(db, change.doc.id));
  });
  const stopJobs = db.collection('ticketingFinancialBackfills').onSnapshot(snapshot => {
    for (const change of snapshot.docChanges()) {
      const before = jobs.get(change.doc.id), after = change.type === 'removed' ? null : change.doc.data();
      if (financialBackfillNeedsWork(before, after)) dispatch(() => financialBackfillPage(db, change.doc.id));
      if (after) jobs.set(change.doc.id, after); else jobs.delete(change.doc.id);
    }
  });
  const recovery = setInterval(() => dispatch(() => financialRecovery(db)), 10000);
  return () => { stopOrders(); stopJobs(); clearInterval(recovery); };
}
