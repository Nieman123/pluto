import { accessKey, action, api, bind, dialog, download, esc, message, money, user } from './api.js';

let record, events = [], dirty = false, pendingUploads = 0;
const get = (path, object = record?.draft) => path.split('.').reduce((o, key) => o?.[key], object);
function set(path, value) { const keys = path.split('.'), last = keys.pop(); let target = record.draft; for (const key of keys) target = target[key] ??= {}; target[last] = value; dirty = true; }
function localDate(utc, timezone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utc)).map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
function utcDate(local, timezone) {
  const target = Date.parse(`${local}:00Z`); if (!Number.isFinite(target)) throw new Error('Check the event dates.');
  let guess = target;
  for (let i = 0; i < 4; i++) { const represented = Date.parse(`${localDate(new Date(guess).toISOString(), timezone)}:00Z`); guess += target - represented; }
  if (localDate(new Date(guess).toISOString(), timezone) !== local) throw new Error('This local time does not exist because of a daylight-saving change. Choose another time.');
  return new Date(guess).toISOString();
}
function field(path, label, type = 'text', options = {}) {
  let value = get(path) ?? '';
  const inputId = `field-${path.replaceAll('.', '-')}`;
  if (type === 'date') value = localDate(value, record.draft.timezone);
  if (type === 'money') value = Number(value) / 100;
  const attr = `id="${inputId}" data-field="${esc(path)}" data-kind="${type}"`;
  let control;
  if (type === 'select') control = `<select ${attr}>${options.choices.map(([key, name]) => `<option value="${esc(key)}" ${String(value) === key ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`;
  else if (type === 'multi') control = `<select multiple ${attr}>${options.choices.map(([key, name]) => `<option value="${esc(key)}" ${value.includes(key) ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`;
  else if (type === 'textarea') control = `<textarea ${attr}>${esc(value)}</textarea>`;
  else if (type === 'check') control = `<input ${attr} type="checkbox" ${value ? 'checked' : ''}>`;
  else control = `<input ${attr} type="${type === 'date' ? 'datetime-local' : type === 'money' ? 'number' : type}" value="${esc(value)}" ${type === 'money' ? 'step="0.01" min="0"' : ''} ${options.required ? 'required' : ''}>`;
  return `<label for="${inputId}">${esc(label)} ${control}</label>`;
}
function rich(path, label) {
  return `<label>${esc(label)}</label><div class="ticket-toolbar rich-toolbar" data-rich-target="${esc(path)}"><button type="button" data-format="bold">Bold</button><button type="button" data-format="italic">Italic</button><button type="button" data-format="insertUnorderedList">List</button><button type="button" data-format="formatBlock" data-value="h3">Heading</button></div><div contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-rich="${esc(path)}" class="rich-content" style="border:1px solid #655775;padding:16px;min-height:150px;border-radius:8px">${get(path) || ''}</div>`;
}
function media(path, label) {
  const m = get(path);
  return `<div><h3>${esc(label)}</h3><label>Upload image (up to 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${esc(path)}"></label>${m ? `<img class="media-thumb" data-media-thumb="${esc(m.assetId)}" alt="Uploaded image"><div class="form-grid">${field(`${path}.alt`, 'Image description')}${field(`${path}.caption`, 'Caption')}${field(`${path}.focalX`, 'Focal point across (%)', 'number')}${field(`${path}.focalY`, 'Focal point down (%)', 'number')}</div><button class="button button-quiet" type="button" data-clear-media="${esc(path)}">Remove image</button>` : ''}</div>`;
}
function defaultDraft() {
  const startAt = new Date(Date.now() + 7 * 86400000).toISOString(), endAt = new Date(Date.now() + 7 * 86400000 + 8 * 3600000).toISOString(), salesStart = new Date(Date.now() - 60000).toISOString();
  return { title: 'New Pluto event', slug: `new-event-${crypto.randomUUID().slice(0, 8)}`, subtitle: '', descriptionHtml: '<p>Tell your guests what makes this event special.</p>', startAt, endAt, admissionStartsAt: startAt,
    timezone: 'America/New_York', city: 'Asheville', region: 'NC', venueName: '', address: '', directions: '', venueVisibility: 'holders', hero: null, flyer: null, gallery: [], lineup: [],
    sections: [{ id: 'faq', type: 'faq', title: 'Good to know', bodyHtml: '<p>Bring your ticket and a valid photo ID.</p>', visible: true }], theme: { preset: 'pluto', accent: '#c4a2ff', font: 'Montserrat' },
    pools: [{ id: 'admission', name: 'General admission', capacity: 200 }], offers: [{ id: 'general', name: 'General admission', description: '', kind: 'admission', unitAmount: 4000, maxPerOrder: 10, salesStart, salesEnd: endAt, validFrom: startAt, validUntil: endAt, active: true, pools: { admission: 1 }, requiresOfferIds: [], taxCode: '', stripeProductId: '', stripeTaxRateIds: [] }], promos: [], tax: { mode: 'sandbox', confirmed: false, performanceLocationId: '' } };
}
export async function loadEvents() {
  const result = await api('staff/events'); events = result.events;
  const selector = document.querySelector('#staff-event'), current = selector.value;
  selector.innerHTML = '<option value="">Select an event</option>' + events.map(e => `<option value="${esc(e.id)}">${esc(e.title)} · ${esc(e.status)}</option>`).join('');
  if (events.some(e => e.id === current)) selector.value = current;
  document.querySelector('#staff-controls').hidden = false;
  const newButton = document.querySelector('#event-new'); if (newButton) newButton.hidden = !result.admin;
  const roleButton = document.querySelector('#event-roles'); if (roleButton) roleButton.hidden = !result.admin;
  message(result.admin ? 'Create an event or choose one to edit.' : 'Your assigned events are ready.');
  return result;
}
async function selectEvent(eventId) {
  if (!eventId) return;
  const scope = events.find(e => e.id === eventId);
  document.querySelector('#event-promoter-stats').hidden = !scope?.roles.includes('promoter');
  document.querySelector('#event-orders').hidden = !scope?.roles.some(r => ['manager', 'cash', 'refund'].includes(r));
  document.querySelector('#event-cash').hidden = !scope?.roles.includes('cash');
  if (!scope?.roles.includes('manager')) { record = null; document.querySelector('#event-editor').innerHTML = ''; message('This event is available for your assigned operations role.'); return; }
  record = await api('staff/get', { eventId }); dirty = false; render();
}
async function save() {
  if (pendingUploads) throw new Error('Wait for the image upload to finish before saving.');
  record.draft.gallery = record.draft.gallery.filter(m => m?.assetId);
  const result = await api('staff/save', { eventId: record.id, draft: record.draft, revision: record.revision }); record.revision = result.revision; dirty = false; message('Draft saved. Publish when the page is ready.'); return result;
}
function render() {
  const root = document.querySelector('#event-editor'), d = record.draft, eid = record.id;
  document.querySelector('#event-dashboard').innerHTML = '';
  root.innerHTML = `<form id="event-editor-form"><h2>${esc(d.title)}</h2><p>Revision ${record.revision} · ${esc(record.status || 'draft')}</p><div class="ticket-toolbar"><button type="submit" class="button button-primary">Save draft</button><button type="button" class="button button-quiet" data-event-action="preview">Preview</button><button type="button" class="button button-primary" data-event-action="publish">Publish</button><button type="button" class="button button-quiet" data-event-action="unpublish">Unpublish</button><button type="button" class="button button-quiet" data-event-action="archive">Archive</button><button type="button" class="button button-quiet" data-event-action="cancel">Mark cancelled</button><button type="button" class="button button-quiet" data-event-action="duplicate">Duplicate</button><button type="button" class="button button-quiet" data-event-action="history">Version history</button><a class="button button-quiet" href="/events/${esc(d.slug)}" target="_blank" rel="noopener">Public page</a></div>
  <fieldset><legend>The essentials</legend><div class="form-grid">${field('title', 'Event title', 'text', { required: true })}${field('slug', 'Event URL /events/…', 'text', { required: true })}${field('subtitle', 'Short introduction')}${field('timezone', 'Timezone', 'select', { choices: [['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'], ['America/Los_Angeles', 'Pacific'], ['UTC', 'UTC']] })}${field('startAt', 'Event starts (event timezone)', 'date')}${field('endAt', 'Event ends (event timezone)', 'date')}${field('admissionStartsAt', 'First admission / transfer cutoff', 'date')}</div>${rich('descriptionHtml', 'Event description')}</fieldset>
  <fieldset><legend>Venue & directions</legend><div class="form-grid">${field('city', 'Public city')}${field('region', 'Public state')}${field('venueVisibility', 'Exact venue visibility', 'select', { choices: [['holders', 'Ticket holders only'], ['public', 'Public']] })}${field('venueName', 'Venue name')}${field('address', 'Street address')}</div>${field('directions', 'Directions, parking and access notes', 'textarea')}</fieldset>
  <fieldset><legend>Artwork & gallery</legend>${media('hero', 'Hero artwork')}${media('flyer', 'Event flyer')}${d.gallery.map((_, i) => media(`gallery.${i}`, `Gallery photo ${i + 1}`)).join('')}<button type="button" class="button button-quiet" data-add="gallery">Add gallery photo</button></fieldset>
  <fieldset><legend>Page theme</legend><div class="form-grid">${field('theme.preset', 'Theme', 'select', { choices: [['pluto', 'Pluto Default'], ['artwork-dark', 'Artwork Dark'], ['light', 'Light']] })}${field('theme.accent', 'Accent color', 'color')}${field('theme.font', 'Font', 'select', { choices: [['Montserrat', 'Montserrat'], ['SourceCodePro', 'Source Code Pro']] })}</div></fieldset>
  <fieldset><legend>Lineup & set times</legend>${d.lineup.map((a, i) => `<details><summary>${esc(a.name || `Artist ${i + 1}`)}</summary><div class="form-grid">${field(`lineup.${i}.name`, 'Artist name')}${field(`lineup.${i}.genre`, 'Genre')}${field(`lineup.${i}.time`, 'Set time')}</div>${media(`lineup.${i}.image`, 'Artist photo')}<button type="button" data-remove="lineup" data-index="${i}">Remove artist</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="lineup">Add artist</button></fieldset>
  <fieldset><legend>Page sections</legend><p>Add schedule, FAQ, camping, parking, accessibility and other information. Use the arrows to change their order.</p>${d.sections.map((s, i) => `<details open><summary>${esc(s.title)}</summary>${field(`sections.${i}.title`, 'Section title')}${field(`sections.${i}.type`, 'Section kind', 'select', { choices: ['custom', 'schedule', 'faq', 'camping', 'parking', 'accessibility'].map(v => [v, v]) })}${field(`sections.${i}.visible`, 'Show on page', 'check')}${rich(`sections.${i}.bodyHtml`, 'Section content')}<div class="ticket-toolbar"><button type="button" data-move="${i}" data-direction="-1">Move up</button><button type="button" data-move="${i}" data-direction="1">Move down</button><button type="button" data-remove="sections" data-index="${i}">Remove section</button></div></details>`).join('')}<button type="button" class="button button-quiet" data-add="sections">Add section</button></fieldset>
  <fieldset><legend>Capacity pools</legend><p>Day and weekend passes can consume shared daily pools. Camping and vehicle passes can use separate pools.</p>${d.pools.map((p, i) => `<details open><summary>${esc(p.name)}</summary><div class="form-grid">${field(`pools.${i}.id`, 'Pool ID')}${field(`pools.${i}.name`, 'Pool name')}${field(`pools.${i}.capacity`, 'Capacity', 'number')}</div><button type="button" data-remove="pools" data-index="${i}">Remove pool</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="pools">Add pool</button></fieldset>
  <fieldset><legend>Ticket types & add-ons</legend>${d.offers.map((o, i) => `<details><summary>${esc(o.name)} · ${money(o.unitAmount)}</summary><div class="form-grid">${field(`offers.${i}.id`, 'Ticket ID')}${field(`offers.${i}.name`, 'Ticket name')}${field(`offers.${i}.description`, 'Description')}${field(`offers.${i}.kind`, 'Ticket kind', 'select', { choices: [['admission', 'Admission'], ['camping', 'Camping'], ['vehicle', 'Vehicle']] })}${field(`offers.${i}.unitAmount`, 'Price in USD (tax included)', 'money')}${field(`offers.${i}.maxPerOrder`, 'Maximum per order', 'number')}${field(`offers.${i}.salesStart`, 'Sales start', 'date')}${field(`offers.${i}.salesEnd`, 'Sales end', 'date')}${field(`offers.${i}.validFrom`, 'Admission valid from', 'date')}${field(`offers.${i}.validUntil`, 'Admission valid until', 'date')}${field(`offers.${i}.active`, 'Available for sale', 'check')}${field(`offers.${i}.requiresOfferIds`, 'Requires one of these admission passes', 'multi', { choices: d.offers.filter(v => v.id !== o.id).map(v => [v.id, v.name]) })}${d.pools.map(p => field(`offers.${i}.pools.${p.id}`, `Units from ${p.name} (0 = unused)`, 'number')).join('')}</div><details><summary>Tax configuration</summary>${field(`offers.${i}.taxCode`, 'Stripe tax code')}${field(`offers.${i}.stripeProductId`, 'Stripe product with venue tax location')}${field(`offers.${i}.stripeTaxRateIds`, 'Inclusive manual tax rate IDs (comma separated)')}</details><button type="button" data-remove="offers" data-index="${i}">Remove ticket type</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="offers">Add ticket type</button></fieldset>
  <fieldset><legend>Promotions</legend>${d.promos.map((p, i) => `<details><summary>${esc(p.code)}</summary><div class="form-grid">${field(`promos.${i}.code`, 'Promo code')}${field(`promos.${i}.type`, 'Discount kind', 'select', { choices: [['percent', 'Percent'], ['fixed', 'Fixed amount in cents']] })}${field(`promos.${i}.value`, 'Discount value', 'number')}${field(`promos.${i}.limit`, 'Global redemption limit', 'number')}${field(`promos.${i}.startsAt`, 'Starts', 'date')}${field(`promos.${i}.endsAt`, 'Ends', 'date')}${field(`promos.${i}.offerIds`, 'Eligible ticket types (empty = all)', 'multi', { choices: d.offers.map(o => [o.id, o.name]) })}</div><button type="button" data-remove="promos" data-index="${i}">Remove promotion</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="promos">Add promotion</button></fieldset>
  <fieldset><legend>Event tax setup</legend><p>Sandbox mode supports development without a live tax setup. Before live sales, confirm classifications, venue registrations and inclusive rates.</p>${field('tax.mode', 'Tax mode', 'select', { choices: [['sandbox', 'Sandbox testing'], ['manual', 'Confirmed inclusive manual rates'], ['automatic', 'Stripe Tax with event venue']] })}${field('tax.performanceLocationId', 'Stripe performance location')}${field('tax.confirmed', 'Venue tax treatment and registrations have been reviewed', 'check')}</fieldset>
  <button type="submit" class="button button-primary">Save draft</button></form>`;
  root.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => {
    try {
      let value = input.value, kind = input.dataset.kind, path = input.dataset.field;
      if (kind === 'number') value = Number(value);
      if (kind === 'money') value = Math.round(Number(value) * 100);
      if (kind === 'check') value = input.checked;
      if (kind === 'multi') value = [...input.selectedOptions].map(o => o.value);
      if (kind === 'date') value = utcDate(value, record.draft.timezone);
      if (path.endsWith('stripeTaxRateIds')) value = input.value.split(',').map(v => v.trim()).filter(Boolean);
      if (path.includes('.pools.') && Number(value) === 0) { const parts = path.split('.'), key = parts.pop(); delete get(parts.join('.'))[key]; dirty = true; } else set(path, value);
      if (path === 'timezone') render();
    } catch (error) { message(error.message, true); input.focus(); }
  }));
  root.querySelectorAll('[data-rich]').forEach(content => {
    content.addEventListener('input', () => set(content.dataset.rich, content.innerHTML));
    content.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); set(content.dataset.rich, content.innerHTML); });
  });
  root.querySelectorAll('[data-format]').forEach(button => button.addEventListener('mousedown', event => { event.preventDefault(); document.execCommand(button.dataset.format, false, button.dataset.value || null); const path = button.closest('[data-rich-target]').dataset.richTarget; set(path, root.querySelector(`[data-rich="${path}"]`).innerHTML); }));
  root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); action(event.submitter, save); });
  root.querySelectorAll('[data-add]').forEach(button => button.onclick = () => {
    const key = button.dataset.add, generated = crypto.randomUUID().slice(0, 8);
    const values = { gallery: { assetId: '', alt: '', caption: '', focalX: 50, focalY: 50 }, lineup: { name: 'New artist', genre: '', time: '', image: null },
      sections: { id: generated, type: 'custom', title: 'New section', bodyHtml: '<p>Add event information.</p>', visible: true }, pools: { id: `pool-${generated}`, name: 'New pool', capacity: 100 },
      offers: { ...defaultDraft().offers[0], id: `ticket-${generated}`, name: 'New ticket', validFrom: d.admissionStartsAt, validUntil: d.endAt, salesEnd: d.endAt, pools: d.pools.length ? { [d.pools[0].id]: 1 } : {} },
      promos: { code: `PROMO-${generated.toUpperCase()}`, type: 'percent', value: 10, limit: 100, startsAt: new Date().toISOString(), endsAt: d.endAt, offerIds: [] } };
    d[key].push(values[key]); dirty = true; render();
  });
  root.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { d[button.dataset.remove].splice(Number(button.dataset.index), 1); dirty = true; render(); });
  root.querySelectorAll('[data-move]').forEach(button => button.onclick = () => { const index = Number(button.dataset.move), target = index + Number(button.dataset.direction); if (target < 0 || target >= d.sections.length) return; [d.sections[index], d.sections[target]] = [d.sections[target], d.sections[index]]; dirty = true; render(); });
  root.querySelectorAll('[data-clear-media]').forEach(button => button.onclick = () => { const path = button.dataset.clearMedia; if (path.startsWith('gallery.')) d.gallery.splice(Number(path.split('.')[1]), 1); else set(path, null); dirty = true; render(); });
  root.querySelectorAll('[data-upload]').forEach(input => input.onchange = () => action(null, async () => {
    const file = input.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) throw new Error('Images must be smaller than 5 MB.');
    // Empty gallery placeholders are local UI state and are never sent to validation.
    pendingUploads++; root.inert = true; root.setAttribute('aria-busy', 'true'); message('Uploading your image…');
    try {
      const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer); let data = ''; for (const byte of bytes) data += String.fromCharCode(byte);
      const asset = await api('staff/media', { eventId: eid, image: btoa(data) }); set(input.dataset.upload, { ...asset, alt: file.name.replace(/\.[^.]+$/, '') }); render(); message('Image uploaded privately. Save and publish to make it public.');
    } finally { pendingUploads--; root.inert = false; root.removeAttribute('aria-busy'); }
  }));
  root.querySelectorAll('[data-media-thumb]').forEach(async image => { try { if (!image.dataset.mediaThumb) return; const blob = await api('staff/media/view', { eventId: eid, assetId: image.dataset.mediaThumb }, true), url = URL.createObjectURL(blob); image.src = url; image.onload = () => URL.revokeObjectURL(url); } catch { image.alt = 'Image unavailable'; } });
  root.querySelectorAll('[data-event-action]').forEach(button => button.onclick = () => action(button, async () => {
    const command = button.dataset.eventAction;
    if (command === 'history') {
      const versions = await api('staff/revisions', { eventId: eid }), content = dialog(`<h2>Content history</h2><p>Restoring changes page content and theme. Ticket prices, capacity and financial records keep their current values.</p>${versions.map(v => `<p>Revision ${v.revision} · ${esc(new Date(v.savedAt).toLocaleString())} <button data-restore="${v.revision}">Restore content</button></p>`).join('')}`);
      content.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => action(b, async () => { await api('staff/restore', { eventId: eid, revision: record.revision, restoreRevision: Number(b.dataset.restore) }); document.querySelector('#ticketing-dialog').close(); await selectEvent(eid); })); return;
    }
    d.gallery = d.gallery.filter(m => m.assetId);
    if (dirty) await save();
    if (command === 'preview') { const result = await api('staff/preview', { eventId: eid }); const content = dialog('<h2>Private event preview</h2><iframe title="Event landing page preview" sandbox="allow-same-origin"></iframe>'); content.querySelector('iframe').srcdoc = result.html; return; }
    if (command === 'duplicate') { const result = await api('staff/duplicate', { eventId: eid }); await loadEvents(); document.querySelector('#staff-event').value = result.id; await selectEvent(result.id); return; }
    await api('staff/publish', { eventId: eid, revision: record.revision, action: command }); await loadEvents(); document.querySelector('#staff-event').value = eid; await selectEvent(eid); message(`Event ${command === 'publish' ? 'published' : command === 'unpublish' ? 'unpublished' : command === 'archive' ? 'archived' : 'cancelled'}.`);
  }));
}
async function dashboard() {
  const eventId = document.querySelector('#staff-event').value; if (!eventId) throw new Error('Choose an event first.');
  const data = await api('staff/orders', { eventId }), paid = data.orders.filter(o => o.status === 'paid'), sum = key => paid.reduce((n, o) => n + (o[key] || 0), 0), gross = sum('total'), tax = sum('taxAmount') - sum('refundedTaxAmount'), refunds = sum('refundedAmount'), fees = sum('stripeFee');
  const root = document.querySelector('#event-dashboard');
  root.innerHTML = `<h2>Orders & event performance</h2><div class="ticket-stat-grid">${[['Paid orders', paid.length], ['Tickets issued', paid.reduce((n, o) => n + o.units.length, 0)], ['Gross sales', money(gross)], ['Discounts', money(sum('discount'))], ['Inclusive tax', money(tax)], ['Refunds', money(refunds)], ['Stripe fees', money(fees)], ['Proceeds before operating costs', money(gross - refunds - fees - tax)], ['Cash sales', money(paid.filter(o => o.method === 'cash').reduce((n, o) => n + o.total, 0))], ['Comps', paid.filter(o => o.method === 'comp').length]].map(([label, value]) => `<div class="ticket-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
  <h3>Inventory</h3>${data.pools.map(p => `<p>${esc(p.name)}: ${p.sold} sold · ${p.held} reserved · ${p.capacity - p.sold - p.held} available</p>`).join('')}
  <div class="ticket-toolbar"><input id="order-filter" aria-label="Search orders" placeholder="Search buyer, email or order"><button class="button button-quiet" id="order-export">Export CSV</button><button class="button button-quiet" id="order-reconcile">Retry pending jobs</button></div><div class="table-scroll"><table class="ticket-table"><thead><tr><th>Buyer</th><th>Status</th><th>Method</th><th>Total</th><th>Promoter</th><th>Review</th><th></th></tr></thead><tbody id="order-rows"></tbody></table></div>`;
  function rows(query = '') { root.querySelector('#order-rows').innerHTML = data.orders.filter(o => `${o.name} ${o.email} ${o.orderId}`.toLowerCase().includes(query.toLowerCase())).map(o => `<tr><td>${esc(o.name)}<br>${esc(o.email)}</td><td>${esc(o.status)}</td><td>${esc(o.method)}</td><td>${money(o.total)}</td><td>${esc(o.promoterId)}</td><td>${esc(o.reviewReason || '')}</td><td><button class="button button-quiet" data-open-order="${esc(o.orderId)}">Details</button></td></tr>`).join('');
    root.querySelectorAll('[data-open-order]').forEach(button => button.onclick = () => action(button, async () => {
      const order = await api('staff/order', { orderId: button.dataset.openOrder });
      const content = dialog(`<h2>${esc(order.eventTitle)}</h2><p>${esc(order.name)} · ${esc(order.email)} · ${money(order.total)} · ${esc(order.status)}</p><form id="refund-form">${order.tickets.map(t => `<label><input type="checkbox" name="ticket" value="${esc(t.id)}" ${t.status !== 'valid' ? 'disabled' : ''}> ${esc(t.name)} · ${money(t.amount)} · ${esc(t.status)} ${t.admission ? '· already admitted (capacity will not reopen)' : ''}</label>`).join('')}${order.externalRefundAmount ? `<p>An existing Stripe Dashboard refund of ${money(order.externalRefundAmount)} needs ticket mapping.</p><button type="button" class="button button-quiet" id="map-dashboard-refund">Map existing refund to selected tickets</button>` : ''}<button class="button button-primary" ${order.externalRefundAmount ? 'disabled' : ''} ${order.status !== 'paid' ? 'disabled' : ''}>Approve selected ticket refunds</button></form><p>Refunds return to the original payment method. Cash refunds must be returned at the till.</p>`);
      content.querySelector('#map-dashboard-refund')?.addEventListener('click', event => action(event.currentTarget, async () => {
        const ticketIds = new FormData(content.querySelector('form')).getAll('ticket');
        await api('staff/refund-external', { orderId: order.orderId, ticketIds }); document.querySelector('#ticketing-dialog').close(); await dashboard(); message('The existing refund is mapped; no additional money was refunded.');
      }));
      let attempt = accessKey(), selected;
      content.querySelector('form').onsubmit = event => { event.preventDefault(); action(event.submitter, async () => { selected ??= new FormData(event.target).getAll('ticket'); if (!selected.length) throw new Error('Select at least one ticket.'); await api('staff/refund', { orderId: order.orderId, ticketIds: selected, attempt }); document.querySelector('#ticketing-dialog').close(); await dashboard(); message('Refund approved. Pending payment-provider refunds remain blocked from admission.'); }); };
    }));
  }
  rows(); root.querySelector('#order-filter').oninput = event => rows(event.target.value);
  bind('#order-export', async () => download(await api('staff/export', { eventId }, true), 'Pluto-orders.csv'));
  bind('#order-reconcile', async () => { const result = await api('staff/retry', { eventId }); message(`Retry finished: ${result.orders || 0} orders checked.`); await dashboard(); });
}
async function cash() {
  const eventId = document.querySelector('#staff-event').value; if (!eventId) throw new Error('Choose an event first.');
  const event = await api('staff/cash-options', { eventId }), content = dialog(`<h2>Cash sale or guest-list comp</h2><form id="cash-form"><label>Guest name <input name="name" required></label><label>Guest email <input name="email" type="email" required></label>${event.offers.map(o => `<label>${esc(o.name)} · ${money(o.unitAmount)}<input name="offer-${esc(o.id)}" type="number" min="0" max="${o.maxPerOrder}" value="0"></label>`).join('')}<label>Promo code <input name="promoCode"></label><label>Cash received (USD)<input name="cash" type="number" min="0" step="0.01" value="0"></label><label><input name="comp" type="checkbox"> Issue complimentary tickets</label><label>Comp reason <input name="reason"></label>${event.taxMode === 'automatic' ? `<fieldset><legend>US billing details for cash tax</legend><label>Street<input name="taxLine1"></label><label>City<input name="taxCity"></label><label>State code<input name="taxState" maxlength="2"></label><label>ZIP<input name="taxPostalCode" maxlength="10"></label></fieldset>` : ''}<button class="button button-primary">Issue tickets</button></form>`);
  const pendingKey = `pluto-cash-attempt-${eventId}`;
  let frozen = JSON.parse(localStorage.getItem(pendingKey) || 'null');
  if (frozen) {
    content.querySelector('form').querySelectorAll('input').forEach(input => { input.disabled = true; });
    content.querySelector('form button').textContent = 'Resume previous issuance';
    content.querySelector('h2').insertAdjacentHTML('afterend', `<p>Resume the saved issuance for ${esc(frozen.name)} (${esc(frozen.email)}). This reuses the original attempt.</p>`);
  }
  content.querySelector('form').onsubmit = e => { e.preventDefault(); action(e.submitter, async () => {
    const data = new FormData(e.target); frozen ??= { eventId, accessKey: accessKey(), name: data.get('name'), email: data.get('email'), items: event.offers.filter(o => Number(data.get(`offer-${o.id}`)) > 0).map(o => ({ offerId: o.id, quantity: Number(data.get(`offer-${o.id}`)) })), promoCode: data.get('promoCode'), comp: data.has('comp'), reason: data.get('reason'), cashReceived: Math.round(Number(data.get('cash')) * 100), ...Object.fromEntries(['taxLine1', 'taxCity', 'taxState', 'taxPostalCode'].map(k => [k, data.get(k) || ''])) };
    localStorage.setItem(pendingKey, JSON.stringify(frozen));
    let result;
    try { result = await api('staff/cash', frozen); }
    catch (error) {
      if ([400, 409].includes(error.status)) {
        const attempt = await api('checkout-attempt', { accessKey: frozen.accessKey }).catch(() => null);
        if (attempt?.exists === false) { localStorage.removeItem(pendingKey); frozen = null; content.querySelectorAll('input').forEach(input => { input.disabled = false; }); }
      }
      throw error;
    }
    localStorage.removeItem(pendingKey); localStorage.setItem(`pluto-order-${result.orderId}`, frozen.accessKey); content.innerHTML = `<h2>Tickets issued</h2><p>${money(result.total)} · ${esc(result.status)}</p><a class="button button-primary" href="/app/tickets?order=${esc(result.orderId)}" target="_blank" rel="noopener">Open tickets for guest</a>`;
  }); };
}
async function roles() {
  const eventId = document.querySelector('#staff-event').value; if (!eventId) throw new Error('Choose an event first.');
  const content = dialog(`<h2>Staff access & attribution</h2><form id="roles-form"><label>Firebase staff UID <input name="uid" required></label>${['manager', 'cash', 'refund', 'admission', 'promoter'].map(role => `<label><input type="checkbox" name="role" value="${role}"> ${role}</label>`).join('')}<label>Promoter ID (for promoter role) <input name="promoterId"></label><button class="button button-primary">Save event-scoped access</button><p>Clear every role to remove access.</p></form><hr><form id="promoter-form"><label>Promoter ID <input name="promoterId" required></label><label><input name="active" type="checkbox" checked> Active</label><button class="button button-primary">Save promoter link</button></form><p id="promoter-link"></p>`);
  content.querySelector('#roles-form').onsubmit = e => { e.preventDefault(); action(e.submitter, async () => { const data = new FormData(e.target); await api('staff/roles', { eventId, uid: data.get('uid'), roles: data.getAll('role'), promoterId: data.get('promoterId') }); message('Staff access updated.'); }); };
  content.querySelector('#promoter-form').onsubmit = e => { e.preventDefault(); action(e.submitter, async () => { const data = new FormData(e.target), promoterId = data.get('promoterId'); await api('staff/promoter', { eventId, promoterId, active: data.has('active') }); const selected = events.find(event => event.id === eventId); content.querySelector('#promoter-link').textContent = `${location.origin}/events/${selected.slug}?ref=${promoterId}`; }); };
}
export function initEditor() {
  bind('#event-new', async () => { const eid = crypto.randomUUID(); await api('staff/save', { eventId: eid, draft: defaultDraft(), revision: 0 }); await loadEvents(); document.querySelector('#staff-event').value = eid; await selectEvent(eid); });
  document.querySelector('#staff-event')?.addEventListener('change', event => action(null, async () => { if (dirty) { event.target.value = record.id; message('Save your draft before switching events.', true); return; } await selectEvent(event.target.value); }));
  bind('#event-orders', dashboard); bind('#event-cash', cash); bind('#event-roles', roles);
  bind('#event-promoter-stats', async () => { const data = await api('staff/promoter-stats', { eventId: document.querySelector('#staff-event').value }); document.querySelector('#event-dashboard').innerHTML = `<h2>Your promoter performance</h2><p>${esc(data.promoterId)}</p><div class="ticket-stat-grid">${[['Attributed orders', data.orders], ['Ticket units', data.tickets], ['Gross', money(data.gross)], ['Refunds', money(data.refunds)]].map(([label, value]) => `<div class="ticket-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`; });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}
