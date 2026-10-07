// Decorative icons keep the existing labels, focus targets and button handlers.
const paths = {
  events: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  health: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  scan: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M4 12h16"/>',
  page: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M7 5.5h.01M10 5.5h.01M7 12h10M7 16h6"/>',
  edit: '<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-5-5L3 14l-1 6h2Z"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
  cash: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M17 17l3-3M14 14l3-3"/>',
  chart: '<path d="M4 3v18h17M8 16v-4M13 16V8M18 16V5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M19 17a8 8 0 0 1-13 2l-2-2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>',
  save: '<path d="M3 3h15l3 3v15H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  bold: '<path d="M6 3h7a5 5 0 0 1 0 10H6V3Zm0 10h8a4 4 0 0 1 0 8H6v-8Z"/>',
  italic: '<path d="M10 3h10M4 21h10M15 3 9 21"/>',
  heading: '<path d="M4 4v16M16 4v16M4 12h12M20 16v4"/>',
};
const ids = {
  'events-back': 'events', 'orders-all': 'orders', 'system-health': 'health',
  'event-public-page': 'page', 'event-studio': 'edit', 'event-orders': 'back',
  'event-communications': 'mail', 'event-waitlist': 'list', 'event-attendance': 'people',
  'event-cash': 'cash', 'event-scanner-pins': 'key', 'event-roles': 'people',
  'event-promoter-stats': 'chart', 'performance-refresh': 'refresh', 'summary-refresh': 'refresh',
  'order-export': 'download', 'order-retry': 'refresh', 'all-order-export': 'download',
};
function iconName(control) {
  if (ids[control.id]) return ids[control.id];
  if (control.getAttribute('href') === '/tickets/staff') return 'scan';
  if (control.hasAttribute('data-format')) return { bold: 'bold', italic: 'italic', insertUnorderedList: 'list', formatBlock: 'heading' }[control.dataset.format];
  if (control.hasAttribute('data-move')) return control.dataset.direction === '-1' ? 'up' : 'down';
  if (control.hasAttribute('data-remove')) return 'trash';
  if (control.hasAttribute('data-save-ticket-types')) return 'save';
  const command = control.dataset.eventAction;
  if (command) return { preview: 'page', history: 'list', publish: 'check', duplicate: 'copy', archive: 'orders', unpublish: 'edit', cancel: 'trash' }[command];
  const label = control.textContent.trim();
  if (/^(Save|Apply)/i.test(label)) return 'save';
  if (/^(Refresh|Retry|Sync)/i.test(label)) return 'refresh';
  if (/^(Export|Download)/i.test(label)) return 'download';
  if (/^(Add|Create|\+)/i.test(label)) return 'plus';
  if (/^(Approve|Check in|Mark.*arrived)/i.test(label)) return 'check';
  if (/^(Remove|Delete|Decline|Withdraw)/i.test(label)) return 'trash';
  if (/^(Details|View order)/i.test(label)) return 'orders';
  if (/^(Public page|View public page|Preview)/i.test(label)) return 'page';
  if (/^(Copy)/i.test(label)) return 'copy';
}
function decorate(root) {
  const controls = root.matches?.('.ticket-toolbar button, .ticket-toolbar a') ? [root] : [];
  controls.push(...root.querySelectorAll('.ticket-toolbar button, .ticket-toolbar a'));
  for (const control of controls) {
    if (control.querySelector('.toolbar-icon')) continue;
    const name = iconName(control); if (!name) continue;
    control.insertAdjacentHTML('afterbegin', `<svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`);
    control.classList.add('has-toolbar-icon');
  }
}
export function initToolbarIcons(root) {
  decorate(root);
  // Dashboard/dialog content is rendered later; health updates replace labels.
  const observer = new MutationObserver(records => {
    const roots = new Set();
    for (const record of records) {
      if (record.target.matches?.('.ticket-toolbar button, .ticket-toolbar a')) roots.add(record.target);
      for (const node of record.addedNodes) if (node.nodeType === 1 && !node.matches('.toolbar-icon, .toolbar-icon *')) roots.add(node);
    }
    roots.forEach(decorate);
  });
  observer.observe(root, { childList: true, subtree: true });
}
