import { FieldPath, type Firestore } from 'firebase-admin/firestore';
export async function rotatingBatch(db: Firestore, collection: string, statuses: string[], size: number) {
  const cursor = db.collection('ticketingWorkerCursors').doc(`${collection}_${[...statuses].sort().join('_')}`), state = (await cursor.get()).data();
  const query = db.collection(collection).where('status', statuses.length === 1 ? '==' : 'in', statuses.length === 1 ? statuses[0] : statuses).orderBy(FieldPath.documentId()).limit(size);
  let batch = await (state?.after ? query.startAfter(state.after) : query).get(); if (batch.empty && state?.after) batch = await query.get();
  await cursor.set({ after: batch.size === size ? batch.docs[batch.docs.length - 1].id : '', updatedAt: Date.now() });
  return batch;
}
