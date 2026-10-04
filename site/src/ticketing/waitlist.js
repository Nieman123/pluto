import { accessKey, action, api, dialog, esc, message, user } from './api.js';

export function initWaitlist(config, claim) {
  if (config.preview || config.status !== 'published') return;
  const key = `pluto-waitlist-${config.eventId}`, tokenKey = `${key}-offer`, root = document.querySelector('#event-waitlist-status');
  if (!root) return;
  let entry;
  try { entry = JSON.parse(localStorage.getItem(key) || 'null'); } catch { localStorage.removeItem(key); }
  let token = localStorage.getItem(tokenKey);
  function invitation() {
    const fragment = new URLSearchParams(location.hash.slice(1)).get('waitlist');
    if (!fragment || !/^[a-f0-9]{64}$/.test(fragment)) return false;
    token = fragment; localStorage.setItem(tokenKey, token); history.replaceState(null, '', `${location.pathname}${location.search}`); return true;
  }
  invitation();
  async function status() {
    const proof = token ? { token } : entry;
    if (!proof) return;
    const data = await api('waitlist/view', proof);
    if (data.eventId !== config.eventId) throw new Error('Open the event linked in your waitlist email.');
    root.innerHTML = `<article class="order-activity"><h3>${esc(data.offerName)} waitlist</h3><p>${esc(data.name)} · ${esc(data.status)}${data.offerExpiresAt ? ` · Claim by ${esc(new Date(data.offerExpiresAt).toLocaleString())}` : ''}</p><p>${data.status === 'waiting' ? config.registrationMode === 'rsvp-approval' ? 'Your request needs organizer approval before a spot can be offered.' : 'We will email you when a spot becomes available.' : data.status === 'offered' ? 'An offer reserves one pass. Complete registration before the deadline; this offer is not an admission ticket.' : data.status === 'claimed' ? 'Your registration has been created. Resume your saved checkout below if payment is still pending.' : 'This offer is closed. You can join again if the pass is still sold out.'}</p><div class="ticket-toolbar">${data.canClaim ? '<button type="button" class="button button-primary" data-waitlist-claim>Claim reserved spot</button>' : ''}<button type="button" class="button button-quiet" data-waitlist-refresh>Refresh waitlist status</button>${['waiting', 'approved', 'offered'].includes(data.status) ? '<button type="button" class="button button-quiet" data-waitlist-withdraw>Leave waitlist</button>' : ''}</div><p data-waitlist-error role="status"></p></article>`;
    const run = (button, task) => action(button, async () => { try { await task(); } catch (error) { root.querySelector('[data-waitlist-error]').textContent = error.message; throw error; } });
    root.querySelector('[data-waitlist-refresh]').onclick = e => run(e.currentTarget, status);
    root.querySelector('[data-waitlist-withdraw]')?.addEventListener('click', e => run(e.currentTarget, async () => { await api('waitlist/withdraw', proof); await status(); }));
    root.querySelector('[data-waitlist-claim]')?.addEventListener('click', e => run(e.currentTarget, () => claim({ eventId: config.eventId, accessKey: accessKey(), name: data.name, email: data.email, items: [{ offerId: data.offerId, quantity: 1 }], promoCode: '', waitlistToken: token })));
  }
  document.querySelectorAll('[data-waitlist-offer]').forEach(button => button.onclick = () => action(button, async () => {
    const offerId = button.dataset.waitlistOffer;
    const content = dialog(`<h2>Join the waitlist</h2><p>One admission pass per person. No payment is collected now. A spot is only reserved when you receive an offer email.</p><form data-waitlist-join><label>Name<input name="name" maxlength="150" autocomplete="name" required value="${esc(user?.displayName || '')}"></label><label>Email<input name="email" type="email" autocomplete="email" required value="${esc(user?.email || '')}"></label><div data-waitlist-code hidden><label>Email verification code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label><p>Check your email for a six-digit code. It expires in 15 minutes.</p></div><button class="button button-primary">Continue</button><p data-waitlist-error role="status"></p></form>`);
    const form = content.querySelector('form'), joinKey = accessKey(); let verification, contact;
    form.onsubmit = e => { e.preventDefault(); action(e.submitter, async () => {
      try {
        const email = form.elements.email.value.trim().toLowerCase();
        if (!verification || contact !== email) {
          verification = await api('waitlist/verification', { eventId: config.eventId, email }); contact = email;
          if (!verification.verified) { content.querySelector('[data-waitlist-code]').hidden = false; form.elements.code.required = true; e.submitter.textContent = 'Verify & join waitlist'; form.elements.code.focus(); return; }
        }
        const result = await api('waitlist/join', { eventId: config.eventId, offerId, name: form.elements.name.value, email, accessKey: joinKey, ...(verification.verified ? {} : { verificationToken: verification.verificationToken, verificationCode: form.elements.code.value }) });
        entry = { entryId: result.entryId, accessKey: joinKey }; localStorage.setItem(key, JSON.stringify(entry)); localStorage.removeItem(tokenKey);
        document.querySelector('#ticketing-dialog').close(); message('You are on the waitlist. Watch your email for an available spot.');
        // Refresh from the verified entry after replacing any older invitation.
        location.reload();
      } catch (error) { content.querySelector('[data-waitlist-error]').textContent = error.message; throw error; }
    }); };
  }));
  const refresh = () => status().catch(error => { root.textContent = error.message; });
  window.addEventListener('hashchange', () => { if (invitation()) refresh(); });
  if (token || entry) refresh();
}
