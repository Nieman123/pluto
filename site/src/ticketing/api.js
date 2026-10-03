export let user = null;
export let scannerSession = null;
export function setScannerSession(value) { scannerSession = value; }
const scannerPaths = new Set(['staff/scan', 'staff/manifest', 'staff/scan-review', 'scanner/session', 'scanner/logout']);
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const accessKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
export function setUser(value) { user = value; }
export function message(value, error = false) {
  const el = document.querySelector('#ticketing-message') || document.querySelector('#ticket-checkout-message');
  if (el) { el.textContent = value; el.classList.toggle('error', error); }
}
export async function api(path, body = {}, binary = false) {
  const scannerToken = scannerPaths.has(path) ? scannerSession?.token : '', token = !scannerToken && user ? await user.getIdToken() : '';
  const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(scannerToken ? { 'X-Pluto-Scanner': scannerToken } : {}) },
    body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000) });
  if (!response.ok) { const detail = await response.json().catch(() => ({})); const error = new Error(detail.error || 'The request could not be confirmed. Please retry.'); error.status = response.status;
    if (scannerToken && [401, 403].includes(response.status)) window.dispatchEvent(new Event('pluto-scanner-denied'));
    throw error; }
  return binary ? response.blob() : response.json();
}
export async function action(button, fn) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { await fn(); } catch (error) { message(error.message, true); } finally { if (button) button.disabled = false; }
}
export function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function dialog(html) {
  const node = document.querySelector('#ticketing-dialog-content'); node.innerHTML = html;
  const modal = document.querySelector('#ticketing-dialog'); if (!modal.open) modal.showModal(); return node;
}
export function bind(selector, fn) { document.querySelector(selector)?.addEventListener('click', event => action(event.currentTarget, () => fn(event))); }
