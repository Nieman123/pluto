// Non-secret deployment controls. Production always retains the live cadence.
export function workerPolicy(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.TICKETING_WORKER_MODE || 'quiet';
  if (!['quiet', 'active'].includes(mode)) throw new Error('Invalid ticketing worker mode.');
  const quiet = env.PLUTO_ENVIRONMENT === 'staging' && mode === 'quiet';
  const cpu = env.TICKETING_WORKER_CPU || '1';
  if (!['1', 'gcf_gen1'].includes(cpu)) throw new Error('Invalid ticketing worker CPU.');
  const healthCpu = env.TICKETING_HEALTH_CPU || 'gcf_gen1';
  if (!['1', 'gcf_gen1'].includes(healthCpu)) throw new Error('Invalid health worker CPU.');
  return {
    quiet,
    // The isolated staging audit benchmark covered this worker only.
    healthCpu: healthCpu === 'gcf_gen1' ? 'gcf_gen1' as const : 1,
    recoverySchedule: quiet ? 'every 5 minutes' : 'every 1 minutes',
    // Keep other workers at one CPU until their own workloads are benchmarked.
    serial: { region: 'us-central1', minInstances: 0, memory: '256MiB' as const,
      cpu: cpu === 'gcf_gen1' ? 'gcf_gen1' as const : 1, concurrency: 1 },
  };
}

const minute = 60000, day = 86400000;
export function nextFinancialCheckAt(order: any, now = Date.now()): number {
  if (order.financialBlocked || order.financialReviewReason || order.reviewReason ||
      order.stripeFeeStatus !== 'confirmed' || !Number.isSafeInteger(order.stripeFee)) return now + 5 * minute;
  const paidAt = Number.isFinite(order.paidAt) ? order.paidAt : order.createdAt;
  if (!Number.isFinite(paidAt) || now - paidAt < day) return now + 60 * minute;
  // Keep missed-webhook reconciliation after the event. Older settled orders
  // move to weekly checks; signed financial webhooks always bypass this delay.
  const admissionEnd = Math.max(paidAt, ...(order.units || []).map((unit: any) => Date.parse(unit.validUntil)).filter(Number.isFinite));
  return now + (now - admissionEnd > 180 * day ? 7 * day : day);
}
