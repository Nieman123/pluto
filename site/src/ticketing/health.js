import { action, api, esc } from './api.js';
import { openOrder } from './orders.js';
const date = value => value ? new Date(value).toLocaleString() : 'No successful run yet';
export async function healthDashboard(root, openEvent) {
  root.innerHTML = '<h2>System health</h2><p>Checking ticketing operations…</p>';
  async function draw(refresh = false) {
    const data = await api('staff/health', { refresh });
    if (!root.isConnected || root.hidden || new URL(location.href).searchParams.get('view') !== 'health') return;
    root.innerHTML = `<h2>System health</h2><p>Check delivery, payment reconciliation and ticket issuance before opening the doors.</p><div class="ticket-toolbar"><button class="button button-primary" data-health-refresh>Run health check</button></div><p role="status">Checked ${esc(date(data.checkedAt))} · Last successful maintenance ${esc(date(data.maintenance.completedAt))}</p><div class="ticket-stat-grid">${[['Critical alerts', data.counts.critical], ['Warnings', data.counts.warning], ['Pending payment events', data.counts.pendingWebhooks], ['Unresolved refunds', data.counts.pendingRefunds], ['Emails waiting', data.counts.pendingEmails]].map(([label, value]) => `<div class="ticket-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div><p>${data.checkedPaidOrders} confirmed orders checked for ticket issuance.${data.truncated ? ' Coverage is limited; continue review in All Orders.' : ''}</p><div class="health-issues">${data.issues.length ? data.issues.map(i => `<article class="order-activity health-issue ${i.severity}" data-health-issue="${esc(i.id)}"><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p><p>Since ${esc(date(i.at))}</p><div class="ticket-toolbar">${i.orderId ? `<button class="button button-quiet" data-health-order="${esc(i.orderId)}">Open order</button>` : ''}${i.jobId && ['email', 'webhook', 'refund'].includes(i.kind) ? `<button class="button button-quiet" data-health-retry="${esc(i.jobId)}" data-kind="${esc(i.kind)}">Retry safely</button>` : ''}</div></article>`).join('') : '<div class="empty-state"><h3>No active alerts found.</h3><p>The checked queues and ticket allocations are healthy.</p></div>'}</div><p class="revenue-note">Email “sent” means accepted by the provider. Delivery tracking appears after the Resend webhook is enabled. Offline door devices still need to synchronize.</p>`;
    const button = document.querySelector('#system-health');
    if (button) button.textContent = `System health${data.issues.length ? ` · ${data.issues.length}` : ''}`;
    root.querySelector('[data-health-refresh]').onclick = e => action(e.currentTarget, () => draw(true));
    root.querySelectorAll('[data-health-order]').forEach(b => b.onclick = () => action(b, () => openOrder(b.dataset.healthOrder, { openEvent, refresh: () => draw(true) })));
    root.querySelectorAll('[data-health-retry]').forEach(b => b.onclick = () => action(b, async () => { await api('staff/health/retry', { kind: b.dataset.kind, jobId: b.dataset.healthRetry }); await draw(true); }));
  }
  await draw();
}
