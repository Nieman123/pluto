import { accessKey, action, api, bind, dialog, message, money } from './api.js';
import { initWaitlist } from './waitlist.js';

export function initCheckout() {
  const form = document.querySelector('#native-checkout-form'); if (!form) return;
  const config = JSON.parse(document.querySelector('#native-checkout-config').textContent), storageKey = `pluto-checkout-${config.eventId}`;
  const rsvp = ['rsvp', 'rsvp-approval'].includes(config.registrationMode);
  const initiallyClosed = form.querySelector('[type=submit]').disabled;
  let checkout, result, frozen, countdown;
  let account = null, profileName = '';
  const contacts = { buyerName: form.elements.buyerName, email: form.elements.email };
  const filledFromAccount = new Map();
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
      for (const item of frozen.items) { const select = form.elements[item.offerId]; if (select) select.value = String(item.quantity); }
    }
    syncContact();
    form.querySelector('[type=submit]').disabled = frozen ? false : initiallyClosed;
    form.querySelector('[type=submit]').textContent = rsvp ? frozen ? 'Resume RSVP request' : config.registrationMode === 'rsvp-approval' ? 'Request RSVP' : 'Confirm RSVP' : frozen ? 'Resume reserved checkout' : 'Continue to payment';
  }
  const promoter = new URLSearchParams(location.search).get('ref');
  if (promoter && /^[a-zA-Z0-9_-]{1,80}$/.test(promoter)) localStorage.setItem(`pluto-promoter-${config.eventId}`, JSON.stringify({ promoterId: promoter, promoterClickedAt: Date.now() }));
  form.addEventListener('input', () => { const total = [...form.querySelectorAll('[data-ticket-quantity]')].reduce((n, select) => n + Number(select.value) * Number(select.dataset.price), 0); document.querySelector('#ticket-total').textContent = rsvp ? 'Free RSVP · One pass per named person' : `${money(total)} before any promotion`; });
  async function mount(request) {
    frozen = request; localStorage.setItem(storageKey, JSON.stringify(frozen));
    lockCart();
    try { result = await api(rsvp ? 'rsvp' : 'checkout', frozen); }
    catch (error) {
      if ([400, 403, 409].includes(error.status)) {
        const attempt = await api('checkout-attempt', { accessKey: frozen.accessKey }).catch(() => null);
        if (attempt?.exists === false) { localStorage.removeItem(storageKey); frozen = null; lockCart(); }
      }
      throw error;
    }
    localStorage.setItem(`pluto-order-${result.orderId}`, frozen.accessKey);
    if (rsvp || result.status === 'paid') { localStorage.removeItem(storageKey); location.href = `/app/tickets?order=${result.orderId}`; return; }
    if (['expired', 'cancelled'].includes(result.status)) { localStorage.removeItem(storageKey); frozen = null; lockCart(); throw new Error('The previous reservation has closed. Choose your tickets again.'); }
    document.querySelector('#checkout-cancel').hidden = false;
    if (!result.clientSecret || !result.publishableKey) throw new Error('Payment setup is incomplete. Your cart is saved; retry once checkout is configured.');
    if (!window.Stripe) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://js.stripe.com/endive/stripe.js'; script.onload = resolve; script.onerror = () => reject(new Error('The payment form could not load. Check your connection and retry.')); document.head.append(script); });
    checkout = await window.Stripe(result.publishableKey).createEmbeddedCheckoutPage({ fetchClientSecret: async () => result.clientSecret,
      onComplete: () => { localStorage.removeItem(storageKey); location.href = `/app/tickets?order=${result.orderId}`; } });
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
        const items = [...form.querySelectorAll('[data-ticket-quantity]')].filter(s => Number(s.value) > 0).map(s => ({ offerId: s.name, quantity: Number(s.value) }));
        if (rsvp ? items.length !== 1 || items[0].quantity !== 1 : !items.length) throw new Error(rsvp ? 'Choose one RSVP admission pass. Each person needs their own RSVP.' : 'Choose at least one ticket.');
        frozen = { eventId: config.eventId, accessKey: accessKey(), items, promoCode: data.get('promoCode'), name: data.get('buyerName'), email: data.get('email'), ...attribution };
        if (rsvp) {
          let verification;
          try { verification = await api('rsvp/verification', { eventId: config.eventId, email: frozen.email }); }
          catch (error) { frozen = null; lockCart(); throw error; }
          if (!verification.verified) {
            const content = dialog(`<h2>Verify your RSVP email</h2><p>We sent a six-digit code to ${String(frozen.email).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}. It expires in 15 minutes.</p><form id="rsvp-email-code"><label>Email verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p>Verifying your email does not grant admission. Organizer approval still applies.</p><button class="button button-primary">Verify & submit RSVP</button></form>`);
            const code = await new Promise(resolve => {
              const modal = document.querySelector('#ticketing-dialog');
              const close = () => { modal.removeEventListener('close', close); resolve(null); };
              modal.addEventListener('close', close);
              content.querySelector('form').onsubmit = e => { e.preventDefault(); modal.removeEventListener('close', close); resolve(new FormData(e.target).get('code')); modal.close(); };
            });
            if (!code) { frozen = null; lockCart(); throw new Error('RSVP was not submitted. Verify your email to continue.'); }
            frozen.verificationToken = verification.verificationToken; frozen.verificationCode = code;
          }
        }
      }
      lockCart(); message(rsvp ? 'Submitting your RSVP…' : 'Preparing your reserved checkout…'); await mount(frozen);
    });
  });
  bind('#checkout-cancel', async () => {
    const closed = await api('cancel', { orderId: result.orderId, accessKey: frozen.accessKey });
    if (closed.status === 'paid') { localStorage.removeItem(storageKey); location.href = `/app/tickets?order=${result.orderId}`; return; }
    checkout?.destroy(); clearInterval(countdown); localStorage.removeItem(storageKey); frozen = null; result = null; lockCart(); form.hidden = false; document.querySelector('#checkout-cancel').hidden = true; document.querySelector('#checkout-countdown').textContent = ''; document.querySelector('.native-event').classList.remove('checkout-active'); document.querySelector('.native-layout').classList.remove('checkout-active'); message('Your reservation is closed. You can choose another cart.');
  });
  const saved = localStorage.getItem(storageKey);
  if (saved && !config.preview) { try { frozen = JSON.parse(saved); lockCart(); message('Your previous cart is saved. Continue to resume the same payment attempt.'); } catch { frozen = null; localStorage.removeItem(storageKey); } }
  initWaitlist(config, request => { if (frozen) throw new Error('Resume or close your saved checkout before claiming another offer.'); return mount(request); });
}
