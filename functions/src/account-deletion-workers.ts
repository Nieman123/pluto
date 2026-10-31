import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { AccountDeletion, deletionCollection } from './account-deletion';
import { workerPolicy } from './ticketing/cost-policy';

const options = { ...workerPolicy().serial, timeoutSeconds: 540, maxInstances: 1 };
export const accountDeletionWorker = onDocumentCreated({ ...options, document: `${deletionCollection}/{uid}`, retry: true },
  async event => { await new AccountDeletion().process(event.params.uid); });
export const accountDeletionMaintenance = onSchedule({ ...options, schedule: 'every 5 minutes' },
  async () => { await new AccountDeletion().recover(); });
