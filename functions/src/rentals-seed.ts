import { FieldValue, type Firestore, type DocumentData } from 'firebase-admin/firestore';

export async function seedRentals(db: Firestore, initial: Array<DocumentData>, write = true) {
  const marker = db.collection('rentalSettings').doc('initialInventory');
  return db.runTransaction(async transaction => {
    if ((await transaction.get(marker)).exists) return { alreadySeeded: true, created: [] as string[] };
    const pending = [];
    for (const {id, ...data} of initial) {
      const ref = db.collection('rentalItems').doc(id);
      if (!(await transaction.get(ref)).exists) pending.push({ ref, data });
    }
    if (write) {
      for (const {ref, data} of pending) {
        transaction.set(ref, {...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      }
      transaction.set(marker, {seededAt: FieldValue.serverTimestamp()});
    }
    return { alreadySeeded: false, created: pending.map(({ref}) => ref.id) };
  });
}
