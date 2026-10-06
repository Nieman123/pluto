import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { ticketingSecrets } from './config';
import { Operations } from './operations';
import { deploymentConfig } from '../deployment-config';
import { campaignNeedsWork } from './campaign-policy';
import { getFirestore } from 'firebase-admin/firestore';
import { financialBackfillNeedsWork, financialBackfillPage, syncFinancialOrder } from './financial-projection';

export const ticketingFinancialWorker = onDocumentWritten({ document: 'ticketingOrders/{orderId}', region: 'us-central1', retry: true, timeoutSeconds: 120, maxInstances: 3, concurrency: 1 }, async event => {
  await syncFinancialOrder(getFirestore(), event.params.orderId);
});
export const ticketingFinancialBackfillWorker = onDocumentWritten({ document: 'ticketingFinancialBackfills/{eventId}', region: 'us-central1', retry: true, timeoutSeconds: 120, maxInstances: 2, concurrency: 1 }, async event => {
  if (financialBackfillNeedsWork(event.data?.before.data(), event.data?.after.data())) await financialBackfillPage(getFirestore(), event.params.eventId);
});

export const ticketingWebhookWorker = onDocumentCreated({ document: 'ticketingWebhookInbox/{inboxId}', region: 'us-central1', secrets: ticketingSecrets, retry: true }, async event => {
  deploymentConfig();
  await new Operations().processWebhook(event.params.inboxId);
});
export const ticketingEmailWorker = onDocumentCreated({ document: 'ticketingEmailJobs/{jobId}', region: 'us-central1', secrets: ticketingSecrets, retry: true, maxInstances: 2, concurrency: 1, timeoutSeconds: 540 }, async event => {
  deploymentConfig();
  await new Operations().emailJob(event.params.jobId);
});
export const ticketingCampaignWorker = onDocumentWritten({ document: 'ticketingCampaigns/{campaignId}', region: 'us-central1', secrets: ticketingSecrets, retry: true, timeoutSeconds: 120, maxInstances: 3, concurrency: 1 }, async event => {
  if (!campaignNeedsWork(event.data?.before.data(), event.data?.after.data())) return;
  deploymentConfig();
  await new Operations().campaignPage(event.params.campaignId);
});
export const ticketingRecoveryWorker = onDocumentWritten({ document: 'ticketingHealth/{healthId}', region: 'us-central1', secrets: ticketingSecrets, retry: true, timeoutSeconds: 540, maxInstances: 3, concurrency: 1 }, async event => {
  const lanes = { maintenance: 'payments', 'maintenance-communications': 'communications', 'maintenance-emails': 'emails' } as const;
  const lane = lanes[event.params.healthId as keyof typeof lanes];
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!lane || !after?.requestId || before?.requestId === after.requestId) return;
  deploymentConfig();
  await new Operations().maintenance(lane);
});
const recoveryOptions = { region: 'us-central1', secrets: ticketingSecrets, timeoutSeconds: 540, maxInstances: 1, concurrency: 1 };
export const ticketingMaintenance = onSchedule({ ...recoveryOptions, schedule: 'every 5 minutes' }, async () => {
  deploymentConfig();
  console.info('Ticketing payment recovery', await new Operations().maintenance('payments'));
});
export const ticketingCommunicationMaintenance = onSchedule({ ...recoveryOptions, schedule: 'every 1 minutes' }, async () => {
  deploymentConfig();
  console.info('Ticketing communication recovery', await new Operations().maintenance('communications'));
});
export const ticketingEmailMaintenance = onSchedule({ ...recoveryOptions, schedule: 'every 1 minutes' }, async () => {
  deploymentConfig();
  console.info('Ticketing email recovery', await new Operations().maintenance('emails'));
});
