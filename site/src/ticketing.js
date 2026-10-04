import { action, api, message, scannerSession, setUser } from './ticketing/api.js';
import { initCheckout } from './ticketing/customer.js';
import { initEditor, loadEvents } from './ticketing/editor.js';
import { initAdmission, initScanner, restoreManifest, cacheStaffEvents, restoreOfflineAdmission, lockOfflineAdmission } from './ticketing/admission.js';
initCheckout();
const mode = document.querySelector('[data-ticketing-console]')?.dataset.ticketingConsole;
if (mode === 'admin') initEditor();
if (mode === 'staff') initAdmission();
const scannerReady = mode === 'staff' ? initScanner() : Promise.resolve(false);
if (mode === 'staff' && !navigator.onLine) scannerReady.then(active => { if (!active) action(null, restoreOfflineAdmission); });
let signedIn = false;
document.querySelector('#ticketing-dialog-close')?.addEventListener('click', () => document.querySelector('#ticketing-dialog').close());
document.querySelector('#ticketing-dialog')?.addEventListener('close', () => document.querySelector('#ticketing-dialog-content').replaceChildren());
window.addEventListener('pluto-auth', async event => {
  const previewSignIn = document.querySelector('#preview-staff-sign-in'); if (previewSignIn) previewSignIn.disabled = false;
  setUser(event.detail);
  if (!mode) return;
  await scannerReady;
  if (mode === 'staff' && scannerSession) return;
  if (mode === 'staff' && event.detail && !navigator.onLine) { signedIn = true; action(null, restoreOfflineAdmission); return; }
  if (!event.detail) {
    if (mode === 'admin') { document.querySelector('#orders-all').hidden = true; document.querySelector('#events-back').hidden = true; document.querySelector('#system-health').hidden = true; document.querySelector('#all-orders-view').replaceChildren(); document.querySelector('#all-orders-view').hidden = true; }
    if (signedIn && mode === 'staff') action(null, lockOfflineAdmission);
    signedIn = false;
    if (!navigator.onLine && mode === 'staff') { action(null, restoreOfflineAdmission); return; }
    document.querySelector('#staff-controls').hidden = true; message(mode === 'staff' ? 'Enter your scanner PIN, or sign in with your event staff account.' : 'Sign in with your event staff account.'); return;
  }
  signedIn = true;
  action(null, async () => {
    if (mode === 'staff') {
      const result = await api('staff/events'); if (scannerSession) return;
      await cacheStaffEvents(result, event.detail.uid); document.querySelector('#staff-controls').hidden = false; await restoreManifest(); message('Your assigned events are ready.');
    } else await loadEvents();
  });
});
window.addEventListener('pluto-auth-error', async () => { await scannerReady; if (mode === 'staff' && scannerSession) return; if (mode === 'staff' && !navigator.onLine) action(null, restoreOfflineAdmission); else message(mode === 'staff' ? 'Account sign-in could not load. You can still enter a scanner PIN.' : 'Sign-in services could not load. Check your connection and retry.', true); });
if (['localhost', '127.0.0.1'].includes(location.hostname) && JSON.parse(document.querySelector('#firebase-config')?.textContent || '{}').authEmulatorUrl && mode) {
  const button = document.createElement('button'); button.id = 'preview-staff-sign-in'; button.disabled = true; button.type = 'button'; button.className = 'button button-quiet'; button.textContent = 'Local preview staff sign-in';
  button.onclick = () => action(button, async () => { const { getAuth, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'); const auth = getAuth(); if (!auth.emulatorConfig) throw new Error('Local auth emulator required.'); await signInWithEmailAndPassword(auth, 'staff@ticketing-preview.invalid', 'Local-ticketing-preview-2026!'); });
  document.querySelector('.ticket-toolbar').append(button);
}
