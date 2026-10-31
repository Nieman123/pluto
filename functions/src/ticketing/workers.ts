import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { paymentWorkerSecrets, emailWorkerSecrets } from './config';
import { Operations } from './operations';
import { deploymentConfig } from '../deployment-config';
import { campaignNeedsWork } from './campaign-policy';
import { getFirestore } from 'firebase-admin/firestore';
import { financialBackfillNeedsWork, financialBackfillPage, financialOrderNeedsWork, syncFinancialOrder } from './financial-projection';
import { workerPolicy } from './cost-policy';
import { refreshHealthSnapshot } from './health';

const policy = workerPolicy(), serial = policy.serial;

export const ticketingFinancialWorker = onDocumentWritten({ ...serial, document: 'ticketingOrders/{orderId}', retry: true, timeoutSeconds: 120, maxInstances: 3 }, async event => {
  if (financialOrderNeedsWork(event.data?.before.data(), event.data?.after.data())) await syncFinancialOrder(getFirestore(), event.params.orderId);
});
export const ticketingFinancialBackfillWorker = onDocumentWritten({ ...serial, document: 'ticketingFinancialBackfills/{eventId}', retry: true, timeoutSeconds: 120, maxInstances: 2 }, async event => {
  if (financialBackfillNeedsWork(event.data?.before.data(), event.data?.after.data())) await financialBackfillPage(getFirestore(), event.params.eventId);
});

export const ticketingWebhookWorker = onDocumentCreated({ document: 'ticketingWebhookInbox/{inboxId}', region: 'us-central1', minInstances: 0,
  memory: '256MiB', cpu: 1, concurrency: 80, maxInstances: 20, secrets: paymentWorkerSecrets, retry: true }, async event => {
  deploymentConfig();
  await new Operations().processWebhook(event.params.inboxId);
});
export const ticketingEmailWorker = onDocumentCreated({ ...serial, document: 'ticketingEmailJobs/{jobId}', secrets: emailWorkerSecrets, retry: true, maxInstances: 2, timeoutSeconds: 540 }, async event => {
  deploymentConfig();
  await new Operations().emailJob(event.params.jobId);
});
export const ticketingCampaignWorker = onDocumentWritten({ ...serial, document: 'ticketingCampaigns/{campaignId}', retry: true, timeoutSeconds: 120, maxInstances: 3 }, async event => {
  if (!campaignNeedsWork(event.data?.before.data(), event.data?.after.data())) return;
  deploymentConfig();
  await new Operations().campaignPage(event.params.campaignId);
});
export const ticketingRecoveryRequestWorker = onDocumentCreated({ ...serial, document: 'ticketingRecoveryRequests/{requestId}',
  secrets: emailWorkerSecrets, retry: true, timeoutSeconds: 540, maxInstances: 3 }, async event => {
  deploymentConfig();
  await new Operations().processRecoveryRequest(event.params.requestId);
});
const recoveryOptions = { ...serial, timeoutSeconds: 540, maxInstances: 1 };
export const ticketingMaintenance = onSchedule({ ...recoveryOptions, secrets: paymentWorkerSecrets, schedule: 'every 5 minutes' }, async () => {
  deploymentConfig();
  console.info('Ticketing payment recovery', await new Operations().maintenance('payments'));
});
export const ticketingCommunicationMaintenance = onSchedule({ ...recoveryOptions, schedule: policy.recoverySchedule }, async () => {
  deploymentConfig();
  console.info('Ticketing communication recovery', await new Operations().maintenance('communications'));
});
export const ticketingEmailMaintenance = onSchedule({ ...recoveryOptions, secrets: emailWorkerSecrets, schedule: policy.recoverySchedule }, async () => {
  deploymentConfig();
  console.info('Ticketing email recovery', await new Operations().maintenance('emails'));
});

// Independent of payment recovery: a stalled payment provider cannot stop the
// audit from reporting stale heartbeats. All refresh callers share its lease.
export const ticketingHealthMaintenance = onSchedule({ ...serial, cpu: policy.healthCpu, timeoutSeconds: 120, maxInstances: 1,
  schedule: 'every 5 minutes', retryCount: 3 }, async () => {
  deploymentConfig();
  await refreshHealthSnapshot(getFirestore());
});
