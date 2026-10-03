import { action, message, setUser } from './ticketing/api.js';
import { initCheckout } from './ticketing/customer.js';
import { initEditor, loadEvents } from './ticketing/editor.js';
import { initAdmission, restoreManifest, cacheStaffEvents, restoreOfflineAdmission, lockOfflineAdmission } from './ticketing/admission.js';
initCheckout();
const mode = document.querySelector('[data-ticketing-console]')?.dataset.ticketingConsole;
if (mode === 'admin') initEditor();
if (mode === 'staff') { initAdmission(); if (!navigator.onLine) action(null, restoreOfflineAdmission); }
let signedIn = false;
document.querySelector('#ticketing-dialog-close')?.addEventListener('click', () => document.querySelector('#ticketing-dialog').close());
window.addEventListener('pluto-auth', event => {
  const previewSignIn = document.querySelector('#preview-staff-sign-in'); if (previewSignIn) previewSignIn.disabled = false;
  setUser(event.detail);
  if (!mode) return;
  if (!event.detail) {
    if (signedIn && mode === 'staff') action(null, lockOfflineAdmission);
    signedIn = false;
    if (!navigator.onLine && mode === 'staff') { action(null, restoreOfflineAdmission); return; }
    document.querySelector('#staff-controls').hidden = true; message('Sign in with your event staff account.'); return;
  }
  signedIn = true;
  action(null, async () => { const result = await loadEvents(); if (mode === 'staff') { await cacheStaffEvents(result, event.detail.uid); await restoreManifest(); } });
});
window.addEventListener('pluto-auth-error', () => { if (mode === 'staff' && !navigator.onLine) action(null, restoreOfflineAdmission); else message('Sign-in services could not load. Check your connection and retry.', true); });
if (['localhost', '127.0.0.1'].includes(location.hostname) && JSON.parse(document.querySelector('#firebase-config')?.textContent || '{}').authEmulatorUrl && mode) {
  const button = document.createElement('button'); button.id = 'preview-staff-sign-in'; button.disabled = true; button.type = 'button'; button.className = 'button button-quiet'; button.textContent = 'Local preview staff sign-in';
  button.onclick = () => action(button, async () => { const { getAuth, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'); const auth = getAuth(); if (!auth.emulatorConfig) throw new Error('Local auth emulator required.'); await signInWithEmailAndPassword(auth, 'staff@ticketing-preview.invalid', 'Local-ticketing-preview-2026!'); });
  document.querySelector('.ticket-toolbar').append(button);
}
