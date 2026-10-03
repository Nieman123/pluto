import { BrowserQRCodeReader } from '@zxing/browser';
import { action, api, bind, esc, message, user } from './api.js';
let manifest, verificationKey, cameraControls, scanning = false;
const eventId = () => document.querySelector('#staff-event').value;
function store() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pluto-admission', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('queue', { keyPath: 'scanId' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function dbOperation(name, mode, operation) {
  const db = await store();
  return new Promise((resolve, reject) => { const transaction = db.transaction(name, mode), request = operation(transaction.objectStore(name)); transaction.oncomplete = () => { resolve(request?.result); db.close(); }; transaction.onerror = () => { reject(transaction.error); db.close(); }; });
}
export async function cacheStaffEvents(result, uid) {
  const events = result.events.filter(e => e.roles.includes('admission')).map(({ id, title }) => ({ id, title }));
  const previous = await dbOperation('state', 'readonly', s => s.get('session'));
  await dbOperation('state', 'readwrite', s => s.put({ uid, events, expiresAt: Date.now() + 24 * 3600000, selected: previous?.uid === uid ? previous.selected : '' }, 'session'));
  const selector = document.querySelector('#staff-event');
  selector.innerHTML = '<option value="">Select an event</option>' + events.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');
  if (events.some(e => e.id === previous?.selected) && previous.uid === uid) selector.value = previous.selected;
}
export async function lockOfflineAdmission() {
  cameraControls?.stop(); cameraControls = null; manifest = null; verificationKey = null;
  await dbOperation('state', 'readwrite', s => s.delete('session'));
  document.querySelector('#staff-controls').hidden = true;
}
export async function restoreOfflineAdmission() {
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  if (!session || session.expiresAt <= Date.now()) throw new Error('Prepare offline admission while signed in online. Offline access lasts 24 hours.');
  const selector = document.querySelector('#staff-event');
  selector.innerHTML = session.events.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');
  if (session.events.some(e => e.id === session.selected)) selector.value = session.selected;
  document.querySelector('#staff-controls').hidden = false;
  await restoreManifest(); message('Prepared offline admission. Reconnect and sign in to sync scans; use one offline lane.');
}
async function cacheStatus() {
  const queue = (await dbOperation('queue', 'readonly', s => s.getAll())).filter(s => s.eventId === eventId());
  const age = manifest ? Math.floor((Date.now() - manifest.generatedAt) / 60000) : null;
  document.querySelector('#admission-cache-status').textContent = manifest ? `Manifest age: ${age} minutes · ${queue.length} queued scans · ${navigator.onLine ? 'Online' : 'Offline'}${age > 15 ? ' · Stale snapshot: transfers, refunds and new sales may be missing.' : ''}. Use one offline admission lane; wristbands handle festival re-entry.` : 'Prepare an event manifest while online before using offline admission.';
}
export async function restoreManifest(selected = eventId()) {
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  manifest = await dbOperation('state', 'readonly', s => s.get(`manifest-${selected}`));
  if (manifest?.staffUid !== session?.uid) manifest = null;
  verificationKey = manifest ? await crypto.subtle.importKey('jwk', manifest.verificationKey, { name: 'Ed25519' }, false, ['verify']) : null;
  if (session) await dbOperation('state', 'readwrite', s => s.put({ ...session, selected }, 'session'));
  await showConflicts();
  await cacheStatus();
}
async function showConflicts() {
  let root = document.querySelector('#admission-conflicts');
  if (!root) { root = Object.assign(document.createElement('div'), { id: 'admission-conflicts' }); document.querySelector('#admission-results').after(root); }
  const records = (await dbOperation('state', 'readonly', s => s.getAll())).filter(s => s.scanId && s.eventId === eventId() && s.result);
  root.innerHTML = records.length ? `<h2>Offline conflicts</h2>${records.map(s => `<article class="ticket-card"><p>${esc(s.ticketId)} · ${esc(s.result.result)} · ${s.reviewed ? 'Reviewed' : 'Needs review'}</p>${s.reviewed ? `<p>${esc(s.note)}</p>` : `<label>Review note<input data-conflict-note="${esc(s.scanId)}" maxlength="500"></label><button type="button" data-review-conflict="${esc(s.scanId)}">Record review</button>`}</article>`).join('')}` : '';
  root.querySelectorAll('[data-review-conflict]').forEach(button => button.onclick = () => action(button, async () => {
    const note = root.querySelector(`[data-conflict-note="${button.dataset.reviewConflict}"]`).value.trim(); if (!note) throw new Error('Add a review note first.');
    await api('staff/scan-review', { eventId: eventId(), scanId: button.dataset.reviewConflict, note });
    const record = records.find(s => s.scanId === button.dataset.reviewConflict);
    await dbOperation('state', 'readwrite', s => s.put({ ...record, reviewed: true, note }, `conflict-${record.scanId}`)); await showConflicts();
  }));
}
function bytes(encoded) { return Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
async function offlineScan(qr, scanId) {
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  if (!session || session.expiresAt <= Date.now() || session.uid !== manifest?.staffUid) throw new Error('Offline admission access has expired. Prepare again online.');
  if (!manifest || manifest.eventId !== eventId() || !verificationKey) throw new Error('This event has no prepared offline manifest.');
  const [prefix, data, signature, extra] = qr.split('.');
  if (prefix !== 'PLUTO1' || extra || !await crypto.subtle.verify('Ed25519', verificationKey, bytes(signature), new TextEncoder().encode(data))) throw new Error('Invalid ticket signature.');
  const token = JSON.parse(new TextDecoder().decode(bytes(data))), ticket = manifest.tickets.find(t => t.id === token.id);
  if (token.eventId !== eventId() || !ticket || ticket.version !== token.version || ticket.status !== 'valid') throw new Error('Ticket is not valid in the prepared manifest. Refresh it online if the ticket is new or transferred.');
  if (Date.now() < Date.parse(ticket.validFrom) || Date.now() > Date.parse(ticket.validUntil)) throw new Error('Ticket is outside its admission window.');
  if (ticket.admitted) return { result: 'duplicate', name: ticket.name };
  const db = await store();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['state', 'queue'], 'readwrite'), state = transaction.objectStore('state'), queued = transaction.objectStore('queue');
    const request = state.get(`manifest-${eventId()}`);
    request.onsuccess = () => { const current = request.result, unit = current.tickets.find(t => t.id === token.id); if (unit.admitted) { transaction.abort(); return; } unit.admitted = true; state.put(current, `manifest-${eventId()}`); queued.add({ scanId, eventId: eventId(), qr, ticketId: ticket.id, deviceTime: Date.now(), staffUid: session.uid }); };
    transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onabort = () => { db.close(); reject(new Error('This ticket was already admitted locally.')); }; transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
  ticket.admitted = true; return { result: 'accepted', name: ticket.name, offline: true };
}
async function scan(qr) {
  if (scanning) return; scanning = true;
  try {
    if (!eventId()) throw new Error('Choose an event first.');
    const scanId = crypto.randomUUID(); let result;
    if (!navigator.onLine) result = await offlineScan(qr, scanId);
    else {
      try {
        result = await api('staff/scan', { eventId: eventId(), qr, scanId });
        if (result.result === 'accepted' || result.result === 'duplicate') {
          const ticket = manifest?.tickets.find(t => t.id === result.ticketId);
          if (ticket) { ticket.admitted = true; await dbOperation('state', 'readwrite', s => s.put(manifest, `manifest-${eventId()}`)); }
        }
      }
      catch (error) {
        // Permission or validation failures never downgrade to offline admission.
        if (error.status) throw error;
        result = await offlineScan(qr, scanId);
      }
    }
    const root = document.querySelector('#admission-results'), card = document.createElement('article'); card.className = `ticket-card admission-${result.result}`;
    card.innerHTML = `<strong>${esc(result.result.toUpperCase())}</strong><p>${esc(result.name)}${result.offline ? ' · Offline: queued for server confirmation' : ''}</p>`; root.prepend(card);
    if (root.children.length > 30) root.lastElementChild.remove(); await cacheStatus();
  } finally { setTimeout(() => { scanning = false; }, 1800); }
}
async function replay() {
  if (!navigator.onLine) throw new Error('Connect to the internet to replay queued scans.');
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  if (!user || session?.uid !== user.uid) throw new Error('Sign in with the staff account that prepared these scans.');
  const queue = await dbOperation('queue', 'readonly', s => s.getAll()); let conflicts = 0, accepted = 0;
  for (const item of queue.filter(i => i.eventId === eventId())) {
    if (item.staffUid !== user.uid) throw new Error('This queue belongs to another staff account. Sign in with that account to sync it.');
    const result = await api('staff/scan', { ...item, offline: true });
    if (result.result !== 'accepted') {
      conflicts++; const root = document.querySelector('#admission-results'), row = document.createElement('p'); row.textContent = `Review offline conflict ${item.ticketId}: ${result.result}`; root.prepend(row);
      await dbOperation('state', 'readwrite', s => s.put({ ...item, result, reviewed: false }, `conflict-${item.scanId}`));
    } else accepted++;
    await dbOperation('queue', 'readwrite', s => s.delete(item.scanId));
  }
  message(`Synced ${accepted} admissions. ${conflicts} conflicts require staff review.`); await showConflicts(); await cacheStatus();
}
export function initAdmission() {
  if (!document.querySelector('#admission-form')) return;
  bind('#admission-sync', async () => {
    if (!eventId()) throw new Error('Choose an event first.');
    await replay(); const latest = await api('staff/manifest', { eventId: eventId() }); await dbOperation('state', 'readwrite', s => s.put({ ...latest, staffUid: user.uid }, `manifest-${eventId()}`)); await restoreManifest();
    await navigator.serviceWorker.register('/tickets/admission-sw.js', { scope: '/tickets/' }); message('Admission is prepared for offline use. Keep this device signed in and use one offline lane.');
  });
  bind('#admission-replay', replay);
  document.querySelector('#admission-form').onsubmit = event => { event.preventDefault(); action(event.submitter, () => scan(new FormData(event.target).get('qr'))); };
  document.querySelector('#staff-event').addEventListener('change', () => action(null, () => restoreManifest()));
  bind('#admission-camera', async () => {
    const video = document.querySelector('#admission-video');
    if (cameraControls) { cameraControls.stop(); cameraControls = null; video.hidden = true; return; }
    video.hidden = false; const reader = new BrowserQRCodeReader(); cameraControls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, result => { if (result) scan(result.getText()).catch(error => message(error.message, true)); });
  });
  window.addEventListener('online', () => cacheStatus().catch(() => {})); window.addEventListener('offline', () => cacheStatus().catch(() => {}));
}
