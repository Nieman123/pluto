export function initCalendarPicker() {
  const triggers = [...document.querySelectorAll('[data-calendar-picker]')];
  if (!triggers.length) return;
  const modal = document.createElement('dialog');
  modal.className = 'calendar-picker';
  modal.setAttribute('aria-labelledby', 'calendar-picker-title');
  modal.setAttribute('aria-describedby', 'calendar-picker-description');
  modal.innerHTML = `<div class="calendar-picker-heading"><h2 id="calendar-picker-title">Add to Calendar</h2><button class="calendar-picker-close" type="button" aria-label="Close calendar picker">✕</button></div>
    <p id="calendar-picker-description">Choose your calendar, then confirm there.</p>
    <div class="calendar-picker-options">
      <a class="calendar-provider" data-calendar-provider="google" target="_blank" rel="noopener"><span class="calendar-provider-icon" aria-hidden="true">G</span><span><strong>Google Calendar</strong><small>Review and save this event</small></span><span aria-hidden="true">↗</span></a>
      <a class="calendar-provider" data-calendar-provider="apple"><svg class="calendar-provider-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-13 5h2m4 0h2"/></svg><span><strong>Apple Calendar</strong><small>Subscribe to this event and its updates</small></span><span aria-hidden="true">↗</span></a>
    </div>`;
  document.body.append(modal);
  let opener;
  const open = trigger => {
    opener = trigger;
    modal.querySelector('[data-calendar-provider="google"]').href = trigger.dataset.calendarGoogle;
    modal.querySelector('[data-calendar-provider="apple"]').href = trigger.dataset.calendarApple;
    if (!modal.open) modal.showModal();
  };
  for (const trigger of triggers) trigger.addEventListener('click', () => open(trigger));
  modal.querySelector('.calendar-picker-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-calendar-provider]')) modal.close();
    if (event.target === modal) {
      const box = modal.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) modal.close();
    }
  });
  modal.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  // Email links and older cached app tickets open this same provider picker.
  const url = new URL(location.href);
  if (url.searchParams.get('calendar') === '1') {
    open(triggers[0]);
    url.searchParams.delete('calendar');
    history.replaceState(history.state, '', url);
  }
}
