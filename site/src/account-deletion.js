const receiptKey = 'pluto-deletion-receipt';
const randomKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
function clearTicketAccess() {
  for (const key of Object.keys(localStorage)) {
    if (/^pluto-(ticket-cache-v1:|order-|holder-|account-|checkout-|rsvp-upgrade-)/.test(key)) localStorage.removeItem(key);
  }
}
export function initAccountDeletion(auth, sdk) {
  const root = document.querySelector('[data-account-deletion]');
  if (!root) return;
  const login = root.querySelector('[data-deletion-login]'), confirmation = root.querySelector('[data-deletion-confirmation]');
  const status = root.querySelector('[data-deletion-status]'), identity = root.querySelector('[data-deletion-identity]');
  let busy = false, pending = false, completed = false, timer, receipt = '', deletionUid = '', localCleared = false, checking = false;
  try { const saved = JSON.parse(localStorage.getItem(receiptKey) || 'null'); receipt = saved?.receipt || ''; deletionUid = saved?.uid || ''; } catch { /* Request remains usable in memory. */ }
  const message = text => { status.textContent = text; };
  const provider = user => {
    const ids = new Set(user.providerData.map(p => p.providerId));
    return ids.has('apple.com') ? 'apple.com' : ids.has('password') ? 'password' : ids.has('google.com') ? 'google.com' : '';
  };
  function render() {
    login.hidden = !!auth.currentUser || pending || completed;
    confirmation.hidden = !auth.currentUser || pending || completed;
    identity.textContent = auth.currentUser ? `Account: ${auth.currentUser.email || auth.currentUser.displayName || 'Pluto member'}` : '';
    confirmation.querySelector('[data-deletion-password]').hidden = provider(auth.currentUser || { providerData: [] }) !== 'password';
    root.querySelectorAll('button, input').forEach(el => el.disabled = busy);
    const button = confirmation.querySelector('button[type=submit]'), method = provider(auth.currentUser || { providerData: [] });
    button.disabled = busy || !confirmation.elements.accepted.checked || !method;
    button.textContent = busy ? 'Confirming…' : method === 'apple.com' ? 'Confirm with Apple & delete account' : method === 'google.com' ? 'Confirm with Google & delete account' : 'Permanently delete account';
  }
  async function api(path, body, authorized = false) {
    const token = authorized ? await auth.currentUser.getIdToken(true) : null;
    const response = await fetch(`/tickets/api/account/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000) });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || 'Could not confirm your request. Please try again.'); error.status = response.status; throw error; }
    return result;
  }
  async function checkStatus() {
    if (!receipt || checking) return false;
    checking = true;
    try {
      const result = await api('deletion-status', { receipt });
      completed = result.status === 'completed'; pending = !completed;
      message(completed ? 'Your account has been deleted. Limited purchase and security records may remain as described below.' : 'Deletion is in progress. You have been signed out. You can close this page and return on this device to check completion.');
      render();
      if (!localCleared && (!auth.currentUser || auth.currentUser.uid === deletionUid)) {
        localCleared = true; await sdk.signOut(auth); clearTicketAccess();
      }
      clearTimeout(timer);
      if (pending) timer = setTimeout(checkStatus, 5000);
      return true;
    } catch (error) {
      if (error.status === 404) { localStorage.removeItem(receiptKey); receipt = ''; return false; }
      message('Could not check completion. Your confirmation is saved; refresh this page to try again.');
      if (pending) timer = setTimeout(checkStatus, 10000);
      return false;
    } finally { checking = false; }
  }
  async function run(action) {
    if (busy) return;
    busy = true; render(); message('Confirming your identity…');
    try { await action(); }
    catch (error) {
      if (!receipt || !await checkStatus()) message(error.code ? 'Sign-in or identity confirmation did not finish. Check your credentials and try again.' : error.message);
    } finally { busy = false; render(); }
  }
  login.onsubmit = event => {
    event.preventDefault();
    const email = login.elements.email.value, password = login.elements.password.value;
    run(async () => { await sdk.signInWithEmailAndPassword(auth, email, password); login.elements.password.value = ''; message('Review the details below before continuing.'); });
  };
  root.querySelector('[data-deletion-google]').onclick = () => run(async () => { await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider()); message('Review the details below before continuing.'); });
  root.querySelector('[data-deletion-apple]').onclick = () => run(async () => { await sdk.signInWithPopup(auth, new sdk.OAuthProvider('apple.com')); message('Review the details below before continuing.'); });
  confirmation.elements.accepted.onchange = render;
  confirmation.onsubmit = event => {
    event.preventDefault();
    if (!confirmation.elements.accepted.checked) return;
    const user = auth.currentUser, method = provider(user), password = confirmation.elements.password.value;
    run(async () => {
      let appleAccessToken;
      if (method === 'password') await sdk.reauthenticateWithCredential(user, sdk.EmailAuthProvider.credential(user.email, password));
      else {
        const result = await sdk.reauthenticateWithPopup(user, method === 'apple.com' ? new sdk.OAuthProvider('apple.com') : new sdk.GoogleAuthProvider());
        if (method === 'apple.com') {
          appleAccessToken = sdk.OAuthProvider.credentialFromResult(result)?.accessToken;
          if (!appleAccessToken) throw new Error('Apple authorization was not returned. Please try again.');
        }
      }
      confirmation.elements.password.value = '';
      receipt ||= randomKey(); deletionUid = user.uid;
      localStorage.setItem(receiptKey, JSON.stringify({ receipt, uid: deletionUid }));
      await api('delete', { confirmation: 'DELETE', receipt, ...(appleAccessToken ? { appleAccessToken } : {}) }, true);
      pending = true; render();
      await checkStatus();
    });
  };
  let restored = false;
  sdk.onAuthStateChanged(auth, () => {
    render();
    if (!restored) { restored = true;
      if (receipt && (!auth.currentUser || auth.currentUser.uid === deletionUid)) checkStatus();
      else receipt = '';
    }
  });
  root.hidden = false;
  message('Sign in to the account you want to delete.'); render();

}
