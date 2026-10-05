let timer, remaining = 0, startedAt = 0;

function dismiss() {
  clearTimeout(timer);
  remaining = 0;
  const toast = document.querySelector('#ticketing-toast');
  if (!toast) return;
  if (toast.hidePopover && toast.matches(':popover-open')) toast.hidePopover();
  toast.hidden = true;
  document.querySelector('#ticketing-message').textContent = '';
}

function pause() {
  clearTimeout(timer);
  if (startedAt) remaining = Math.max(0, remaining - (Date.now() - startedAt));
  startedAt = 0;
}

function resume() {
  const toast = document.querySelector('#ticketing-toast');
  if (!remaining || toast?.hidden || toast?.matches(':hover') || toast?.contains(document.activeElement)) return;
  clearTimeout(timer);
  startedAt = Date.now();
  timer = setTimeout(dismiss, remaining);
}

// A modal makes the rest of the document inert. Keep the notification inside
// the active dialog, and use the popover layer to avoid clipping while scrolling.
export function syncMessageLayer() {
  const toast = document.querySelector('#ticketing-toast');
  if (!toast) return;
  const parent = document.querySelector('#ticketing-dialog[open]') || document.body;
  if (toast.parentElement !== parent) parent.append(toast);
  if (!toast.hidden && toast.showPopover && !toast.matches(':popover-open')) toast.showPopover();
}

export function message(value, error = false) {
  const el = document.querySelector('#ticketing-message') || document.querySelector('#ticket-checkout-message');
  if (!el) return;
  el.textContent = value;
  el.classList.toggle('error', error);
  const toast = document.querySelector('#ticketing-toast');
  // Public checkout keeps its inline, form-specific message.
  if (!toast || el.id !== 'ticketing-message') return;
  clearTimeout(timer);
  startedAt = 0;
  remaining = error ? 0 : 8000;
  if (!value) { dismiss(); return; }
  el.setAttribute('role', error ? 'alert' : 'status');
  el.setAttribute('aria-live', error ? 'assertive' : 'polite');
  toast.classList.toggle('error', error);
  toast.querySelector('[data-toast-icon]').textContent = error ? '!' : 'i';
  toast.hidden = false;
  syncMessageLayer();
  resume();
}

export function initMessages() {
  const toast = document.querySelector('#ticketing-toast');
  if (!toast) return;
  document.querySelector('#ticketing-message-dismiss').addEventListener('click', dismiss);
  toast.addEventListener('pointerenter', pause);
  toast.addEventListener('pointerleave', resume);
  toast.addEventListener('focusin', pause);
  toast.addEventListener('focusout', () => setTimeout(resume, 0));
  document.querySelector('#ticketing-dialog')?.addEventListener('close', syncMessageLayer);
  message(document.querySelector('#ticketing-message').textContent.trim());
}
