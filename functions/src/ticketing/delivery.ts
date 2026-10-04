import type { Firestore } from 'firebase-admin/firestore';
import { fail, hash } from './domain';

const statuses = new Set(['sent', 'delivered', 'delivery_delayed', 'bounced', 'failed', 'complained', 'suppressed']);
const terminal = new Set(['bounced', 'failed', 'complained', 'suppressed']);
export async function applyDelivery(db: Firestore, jobId: string, messageId: string) {
  const events = await db.collection('ticketingEmailDelivery').where('providerMessageId', '==', messageId).get();
  const updates = events.docs.map(d => d.data()).sort((a, b) => a.at - b.at);
  const ref = db.collection('ticketingEmailJobs').doc(jobId);
  await db.runTransaction(async tx => {
    const job = (await tx.get(ref)).data();
    if (!job || job.providerMessageId !== messageId) return;
    let status = job.deliveryStatus || 'sent', at = job.deliveryAt || 0;
    for (const update of updates) {
      if (terminal.has(status) && !terminal.has(update.status)) continue;
      if (update.at < at && !terminal.has(update.status)) continue;
      status = update.status; at = Math.max(at, update.at);
    }
    tx.update(ref, { deliveryStatus: status, deliveryAt: at });
  });
}
export async function recordDelivery(db: Firestore, eventId: string, event: any) {
  const status = String(event.type || '').replace(/^email\./, '');
  if (!statuses.has(status)) return { ignored: true };
  const messageId = event.data?.email_id, at = Date.parse(event.created_at);
  if (typeof messageId !== 'string' || messageId.length > 200 || !Number.isFinite(at)) fail('Invalid delivery event.');
  // Persist before correlation: a webhook can arrive before the send response.
  const ref = db.collection('ticketingEmailDelivery').doc(hash(eventId));
  await db.runTransaction(async tx => {
    if (!(await tx.get(ref)).exists) tx.create(ref, { providerMessageId: messageId, status, at, receivedAt: Date.now() });
  });
  const jobs = await db.collection('ticketingEmailJobs').where('providerMessageId', '==', messageId).limit(5).get();
  for (const job of jobs.docs) await applyDelivery(db, job.id, messageId);
  return { received: true };
}
