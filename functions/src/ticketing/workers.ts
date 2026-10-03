import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { ticketingSecrets } from './config';
import { Operations } from './operations';

export const ticketingWebhookWorker = onDocumentCreated({ document: 'ticketingWebhookInbox/{inboxId}', region: 'us-central1', secrets: ticketingSecrets, retry: true }, async event => {
  await new Operations().processWebhook(event.params.inboxId);
});
export const ticketingEmailWorker = onDocumentCreated({ document: 'ticketingEmailJobs/{jobId}', region: 'us-central1', secrets: ticketingSecrets, retry: true }, async event => {
  await new Operations().emailJob(event.params.jobId);
});
export const ticketingMaintenance = onSchedule({ schedule: 'every 5 minutes', region: 'us-central1', secrets: ticketingSecrets, timeoutSeconds: 540, maxInstances: 1 }, async () => {
  console.info('Ticketing maintenance', await new Operations().maintenance());
});
