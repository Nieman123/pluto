import { accessKey, action, api, bind, dialog, esc, message, money } from './api.js';
import { initWaitlist } from './waitlist.js';

export function initCheckout() {
  const form = document.querySelector('#native-checkout-form'); if (!form) return;
  const config = JSON.parse(document.querySelector('#native-checkout-config').textContent), storageKey = `pluto-checkout-${config.eventId}`;
  const rsvp = ['rsvp', 'rsvp-approval'].includes(config.registrationMode);
  const initiallyClosed = form.querySelector('[type=submit]').disabled;
  let checkout, result, frozen, countdown, checkingSaved = false;
  let account = null, profileName = '';
  const contacts = { buyerName: form.elements.buyerName, email: form.elements.email };
  const filledFromAccount = new Map();
  const selectedItems = () => [...form.querySelectorAll('[data-ticket-quantity]')].filter(s => Number(s.value) > 0).map(s => ({ offerId: s.name, quantity: Number(s.value) }));
  const freeRsvp = request => request.checkoutKind ? request.checkoutKind === 'rsvp' : rsvp && !request.items.some(item => config.offers.find(o => o.id === item.offerId)?.unitAmount > 0);
  function cartSummary() {
    const items = selectedItems(), paid = !!items.some(item => config.offers.find(o => o.id === item.offerId)?.unitAmount > 0);
    const total = items.reduce((n, item) => n + item.quantity * (config.offers.find(o => o.id === item.offerId)?.unitAmount || 0), 0);
    document.querySelector('#ticket-total').textContent = rsvp && !paid ? 'Free RSVP · One pass per named person' : `${money(total)} before any promotion${config.registrationMode === 'rsvp-approval' && paid ? ' · Approved RSVP required' : ''}`;
    form.querySelector('[data-payment-only]')?.toggleAttribute('hidden', rsvp && !paid);
    form.querySelector('[type=submit]').textContent = checkingSaved ? 'Checking previous checkout…' : frozen ? freeRsvp(frozen) ? 'Resume RSVP request' : 'Resume reserved checkout' : !rsvp || paid ? 'Continue to payment' : config.registrationMode === 'rsvp-approval' ? 'Request RSVP' : 'Confirm RSVP';
  }
  async function verifyContact(request, upgrade = false) {
    const verification = await api(upgrade ? 'rsvp/upgrade/verification' : 'rsvp/verification', { eventId: config.eventId, email: request.email });
    if (verification.verified) return;
    const content = dialog(`<h2>${upgrade ? 'Verify your approved RSVP' : 'Verify your RSVP email'}</h2><p>We sent a six-digit code to ${esc(request.email)}. It expires in 15 minutes.</p><form id="rsvp-email-code"><label>Email verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p>${upgrade ? 'Use the email from your approved RSVP. VIP is for the same named attendee.' : 'Verifying your email does not grant admission. Organizer approval still applies.'}</p><button class="button button-primary">${upgrade ? 'Verify & continue to VIP' : 'Verify & submit RSVP'}</button></form>`);
    const code = await new Promise(resolve => {
      const modal = document.querySelector('#ticketing-dialog');
      const close = () => { modal.removeEventListener('close', close); resolve(null); };
      modal.addEventListener('close', close);
      content.querySelector('form').onsubmit = e => { e.preventDefault(); modal.removeEventListener('close', close); resolve(new FormData(e.target).get('code')); modal.close(); };
    });
    if (!code) throw new Error('Nothing was submitted. Verify your RSVP email to continue.');
    request.verificationToken = verification.verificationToken; request.verificationCode = code;
  }
  function syncContact() {
    const stored = { buyerName: profileName || account?.displayName || '', email: account?.email || '' };
    for (const [name, input] of Object.entries(contacts)) {
      const value = typeof stored[name] === 'string' ? stored[name].trim() : '';
      const known = !!account && !!value && value.length <= input.maxLength && (name !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
      if (!frozen) {
        if (known) { input.value = value; filledFromAccount.set(name, value); }
        else {
          if (input.value === filledFromAccount.get(name)) input.value = '';
          filledFromAccount.delete(name);
        }
      }
      // A reserved checkout keeps its original contact, even after account changes.
      input.closest('label').hidden = known && input.value === value;
    }
  }
  window.addEventListener('pluto-auth', event => {
    account = event.detail; profileName = ''; syncContact();
  });
  window.addEventListener('pluto-profile', event => {
    if (account?.uid !== event.detail.uid) return;
    profileName = event.detail.displayName; syncContact();
  });
  function lockCart() {
    form.querySelectorAll('input,select').forEach(input => { input.disabled = !!frozen; });
    if (frozen) {
      for (const [name, value] of Object.entries({ buyerName: frozen.name, email: frozen.email, promoCode: frozen.promoCode })) if (form.elements[name]) form.elements[name].value = value || '';
      form.querySelectorAll('[data-ticket-quantity]').forEach(select => { select.value = '0'; });
      for (const item of frozen.items) { const select = form.elements[item.offerId]; if (select) select.value = String(item.quantity); }
    }
    syncContact();
    form.querySelector('[type=submit]').disabled = checkingSaved || (frozen ? false : initiallyClosed);
    cartSummary();
  }
  const promoter = new URLSearchParams(location.search).get('ref');
  if (promoter && /^[a-zA-Z0-9_-]{1,80}$/.test(promoter)) localStorage.setItem(`pluto-promoter-${config.eventId}`, JSON.stringify({ promoterId: promoter, promoterClickedAt: Date.now() }));
  form.addEventListener('input', event => {
    if (rsvp && event.target.matches('[data-ticket-quantity]') && Number(event.target.value) > 0) form.querySelectorAll('[data-ticket-quantity]').forEach(select => { if (select !== event.target) select.value = '0'; });
    cartSummary();
  });
  async function mount(request) {
    request.checkoutKind ||= freeRsvp(request) ? 'rsvp' : 'payment';
    frozen = request; localStorage.setItem(storageKey, JSON.stringify(frozen));
    lockCart();
    try { result = await api(freeRsvp(frozen) ? 'rsvp' : 'checkout', frozen); }
    catch (error) {
      if ([400, 403, 409].includes(error.status)) {
        const attempt = await api('checkout-attempt', { accessKey: request.accessKey }).catch(() => null);
        if (frozen === request && attempt?.exists === false) { localStorage.removeItem(storageKey); frozen = null; lockCart(); }
      }
      throw error;
    }
    // A tab-return check may have already closed this attempt while the
    // original checkout request was in flight.
    if (frozen !== request) return;
    localStorage.setItem(`pluto-order-${result.orderId}`, frozen.accessKey);
    if (freeRsvp(frozen) || result.status === 'paid') { localStorage.removeItem(storageKey); location.href = `/app/tickets?order=${result.orderId}`; return; }
    if (['expired', 'cancelled'].includes(result.status)) { localStorage.removeItem(storageKey); frozen = null; lockCart(); throw new Error('The previous reservation has closed. Choose your tickets again.'); }
    document.querySelector('#checkout-cancel').hidden = false;
    if (!result.clientSecret || !result.publishableKey) throw new Error('Payment setup is incomplete. Your cart is saved; retry once checkout is configured.');
    if (!window.Stripe) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://js.stripe.com/endive/stripe.js'; script.onload = resolve; script.onerror = () => reject(new Error('The payment form could not load. Check your connection and retry.')); document.head.append(script); });
    checkout = await window.Stripe(result.publishableKey).createEmbeddedCheckoutPage({ fetchClientSecret: async () => result.clientSecret,
      onComplete: () => { clearSavedCart(); location.href = `/app/tickets?order=${result.orderId}`; } });
    checkout.mount('#stripe-checkout'); form.hidden = true; document.querySelector('#checkout-cancel').hidden = false;
    document.querySelector('.native-event').classList.add('checkout-active'); document.querySelector('.native-layout').classList.add('checkout-active');
    document.querySelector('#tickets').scrollIntoView({ block: 'start' }); message('Complete your payment below. Your tickets will appear in the Pluto app.');
    countdown = setInterval(() => { const remaining = Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000)); document.querySelector('#checkout-countdown').textContent = remaining ? `Ticket reservation: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Reservation expired. Refresh to choose tickets again.'; }, 1000);
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); if (config.preview || config.status !== 'published') return;
    action(event.submitter, async () => {
      if (!frozen) {
        const data = new FormData(form), attribution = JSON.parse(localStorage.getItem(`pluto-promoter-${config.eventId}`) || '{}');
        const items = selectedItems();
        if (rsvp ? items.length !== 1 || items[0].quantity !== 1 : !items.length) throw new Error(rsvp ? 'Choose one free RSVP or paid VIP option. Each person registers separately.' : 'Choose at least one ticket.');
        const request = { eventId: config.eventId, accessKey: accessKey(), items, promoCode: data.get('promoCode'), name: data.get('buyerName'), email: data.get('email'), ...attribution };
        request.checkoutKind = freeRsvp(request) ? 'rsvp' : 'payment';
        if (freeRsvp(request)) { request.promoCode = ''; await verifyContact(request); }
        else if (config.registrationMode === 'rsvp-approval') {
          await verifyContact(request, true);
          const access = await api('rsvp/upgrade-access', request);
          request.name = access.name; request.email = access.email; request.rsvpUpgradeToken = access.rsvpUpgradeToken;
        }
        frozen = request;
      }
      lockCart(); message(freeRsvp(frozen) ? 'Submitting your RSVP…' : 'Preparing your reserved checkout…'); await mount(frozen);
    });
  });
  bind('#checkout-cancel', async () => {
    const closed = await api('cancel', { orderId: result.orderId, accessKey: frozen.accessKey });
    if (closed.status === 'paid') { localStorage.removeItem(storageKey); location.href = `/app/tickets?order=${result.orderId}`; return; }
    checkout?.destroy(); clearInterval(countdown); localStorage.removeItem(storageKey); frozen = null; result = null; lockCart(); form.hidden = false; document.querySelector('#checkout-cancel').hidden = true; document.querySelector('#checkout-countdown').textContent = ''; document.querySelector('.native-event').classList.remove('checkout-active'); document.querySelector('.native-layout').classList.remove('checkout-active'); message('Your reservation is closed. You can choose another cart.');
  });
  function clearSavedCart() {
    checkout?.destroy(); checkout = null; clearInterval(countdown);
    localStorage.removeItem(storageKey); frozen = null; checkingSaved = false;
    form.querySelectorAll('[data-ticket-quantity]').forEach(select => { select.value = '0'; });
    if (form.elements.promoCode) form.elements.promoCode.value = '';
    form.hidden = false;
    document.querySelector('#checkout-cancel').hidden = true;
    document.querySelector('#checkout-countdown').textContent = '';
    document.querySelector('.native-event').classList.remove('checkout-active');
    document.querySelector('.native-layout').classList.remove('checkout-active');
    lockCart();
  }
  async function reconcileSavedCart() {
    if (!frozen || checkingSaved) return;
    const previous = frozen;
    checkingSaved = true; lockCart();
    try {
      const attempt = await api('checkout-attempt', { accessKey: previous.accessKey });
      if (frozen !== previous) return;
      if (attempt.eventId && attempt.eventId !== config.eventId) return;
      if (['paid', 'refunded', 'partially-refunded', 'pending-approval', 'declined', 'withdrawn', 'expired', 'cancelled'].includes(attempt.status)) {
        if (attempt.orderId) localStorage.setItem(`pluto-order-${attempt.orderId}`, previous.accessKey);
        clearSavedCart();
        message(['expired', 'cancelled'].includes(attempt.status) ? 'Your previous reservation closed. Choose tickets for a new checkout.' : 'Your previous checkout is complete. Your tickets and order are in the Pluto app.');
      } else message('Your previous cart is saved. Continue to resume the same payment attempt.');
    } catch { message('Your saved checkout could not be checked. Resume the same attempt to avoid a duplicate purchase.'); }
    finally { checkingSaved = false; lockCart(); }
  }
  const saved = localStorage.getItem(storageKey);
  if (saved && !config.preview) { try {
    const parsed = JSON.parse(saved);
    if (parsed.eventId !== config.eventId || !/^[a-f0-9]{64}$/.test(parsed.accessKey) || !Array.isArray(parsed.items)) throw new Error('Invalid saved checkout');
    frozen = parsed; lockCart(); reconcileSavedCart();
  } catch { clearSavedCart(); } }
  // Browser Back may restore this page from bfcache without rerunning init.
  window.addEventListener('pageshow', event => { if (event.persisted) reconcileSavedCart(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcileSavedCart(); });
  window.addEventListener('storage', event => {
    if (event.key === storageKey && event.newValue === null && frozen && !checkout) clearSavedCart();
  });
  initWaitlist(config, request => { if (frozen) throw new Error('Resume or close your saved checkout before claiming another offer.'); return mount(request); });
}
