import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { warn } from 'firebase-functions/logger';

// Stop starting work at the soft deadline. Await every operation already in
// flight; abandoning provider mutations with Promise.race is not safe.
export class WorkBudget {
  private readonly deadline: number;
  constructor(milliseconds = 60000, private readonly clock = () => Date.now()) { this.deadline = clock() + milliseconds; }
  get available() { return this.clock() < this.deadline; }
}

export async function processBatch(db: Firestore, collection: string, statuses: string[], size: number,
  visit: (doc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>, budget = new WorkBudget()) {
  if (!budget.available) return { processed: 0, deferred: true };
  const cursor = db.collection('ticketingWorkerCursors').doc(`${collection}_${[...statuses].sort().join('_')}`), state = (await cursor.get()).data();
  const query = db.collection(collection).where('status', statuses.length === 1 ? '==' : 'in', statuses.length === 1 ? statuses[0] : statuses).orderBy(FieldPath.documentId()).limit(size);
  let batch = await (state?.after ? query.startAfter(state.after) : query).get();
  if (batch.empty && state?.after) batch = await query.get();
  let processed = 0, failures = 0;
  for (const doc of batch.docs) {
    if (!budget.available) break;
    try { await visit(doc); }
    catch (error) {
      failures++;
      warn('Recovery record failed; continuing the page', { event: 'ticketing-worker-failed', collection, recordId: doc.id, error: error instanceof Error ? error.name : 'Unavailable' });
    }
    processed++;
    // Checkpoint only completed records, including handled failures. A crash
    // may repeat one record; existing provider/ledger idempotency makes it safe.
    await cursor.set({ after: doc.id, updatedAt: Date.now() });
  }
  if (processed === batch.size && batch.size < size) await cursor.set({ after: '', updatedAt: Date.now() });
  if (failures) throw new Error(`${failures} ${collection} records need another recovery pass.`);
  return { processed, deferred: processed < batch.size || batch.size === size };
}

export async function rotatingBatch(db: Firestore, collection: string, statuses: string[], size: number) {
  const cursor = db.collection('ticketingWorkerCursors').doc(`${collection}_${[...statuses].sort().join('_')}`), state = (await cursor.get()).data();
  const query = db.collection(collection).where('status', statuses.length === 1 ? '==' : 'in', statuses.length === 1 ? statuses[0] : statuses).orderBy(FieldPath.documentId()).limit(size);
  let batch = await (state?.after ? query.startAfter(state.after) : query).get(); if (batch.empty && state?.after) batch = await query.get();
  await cursor.set({ after: batch.size === size ? batch.docs[batch.docs.length - 1].id : '', updatedAt: Date.now() });
  return batch;
}
