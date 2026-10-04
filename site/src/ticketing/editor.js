import { accessKey, action, api, bind, dialog, download, esc, message, money, user } from './api.js';
import { scannerPins } from './scanner-pins.js';
import { adminGuestList } from './guestlist.js';
import { adminRsvps } from './rsvps.js';
import { financialSummary } from './financial-summary.js';
import { revenueChart } from './revenue-chart.js';
import { allOrders, eventOrders } from './orders.js';
import { updateEventSchedule } from './event-schedule.js';
import { healthDashboard } from './health.js';

let record, events = [], dirty = false, pendingUploads = 0, studio = false, globalAdmin = false, saving, allOrdersMode = false;
async function healthBadge() {
  if (!globalAdmin || !user) return;
  const uid = user.uid;
  try {
    const data = await api('staff/health');
    if (!user || user.uid !== uid) return;
    const button = document.querySelector('#system-health');
    button.textContent = `System health${data.issues.length ? ` · ${data.issues.length} alerts` : ''}`;
    button.classList.toggle('health-alert', data.counts.critical > 0);
  } catch { /* Keep event editing usable while health services are unavailable. */ }
}
const get = (path, object = record?.draft) => path.split('.').reduce((o, key) => o?.[key], object);
async function loadCardFlyers(cards) {
  const uid = user?.uid, images = [...cards.querySelectorAll('[data-card-flyer]')];
  // Loading every authenticated flyer at once contends with editor requests
  // on the same rate-limit counter. Stop if the list is replaced or hidden.
  async function next() {
    while (images.length && user?.uid === uid && !document.querySelector('#events-index').hidden) {
      const image = images.shift(); if (!image.isConnected) return;
      try { const blob = await api('staff/card-flyer', { eventId: image.dataset.cardFlyer }, true), url = URL.createObjectURL(blob); image.onload = image.onerror = () => URL.revokeObjectURL(url); image.src = url; }
      catch { image.remove(); }
    }
  }
  await Promise.all([next(), next()]);
}
function set(path, value) {
  if (!updateEventSchedule(record.draft, path, value)) {
    const keys = path.split('.'), last = keys.pop(); let target = record.draft; for (const key of keys) target = target[key] ??= {}; target[last] = value;
  }
  dirty = true; syncSaveState();
}
function syncSaveState() {
  document.querySelectorAll('[data-save-state]').forEach(el => { el.textContent = pendingUploads ? 'Image upload in progress…' : dirty ? 'Unsaved changes' : `Saved · Revision ${record?.revision || 0}`; el.classList.toggle('unsaved', dirty); });
}
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
  if (type === 'date' && value) value = localDate(value, record.draft.timezone);
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
  return `<div class="media-editor"><h3>${esc(label)}</h3><label class="upload-zone">${m?.assetId ? 'Replace image' : '+ Choose an image'}<span>JPEG, PNG or WebP · up to 20 MB · resized automatically</span><input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${esc(path)}"></label><p class="upload-status" data-upload-status="${esc(path)}" role="status">${m?.assetId ? 'Image ready. Save your draft to keep this artwork.' : ''}</p>${m?.assetId ? `<img class="media-thumb ${path === 'flyer' ? 'flyer-thumb' : ''}" data-media-thumb="${esc(m.assetId)}" alt="${esc(m.alt || label)}"><div class="form-grid">${field(`${path}.alt`, 'Image description')}${field(`${path}.caption`, 'Caption')}${field(`${path}.focalX`, 'Focal point across (%)', 'number')}${field(`${path}.focalY`, 'Focal point down (%)', 'number')}</div><button class="button button-quiet" type="button" data-clear-media="${esc(path)}">Remove image</button>` : ''}</div>`;
}
async function imagePayload(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This file could not be opened. Export your flyer as JPEG, PNG or WebP.'); }
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', .88).split(',')[1];
  } finally { bitmap.close(); }
}
function defaultDraft() {
  const startAt = new Date(Date.now() + 7 * 86400000).toISOString(), endAt = new Date(Date.now() + 7 * 86400000 + 8 * 3600000).toISOString(), salesStart = new Date(Date.now() - 60000).toISOString();
  return { registrationMode: 'tickets', title: 'New Pluto event', slug: `new-event-${crypto.randomUUID().slice(0, 8)}`, subtitle: '', descriptionHtml: '<p>Tell your guests what makes this event special.</p>', startAt, endAt, admissionStartsAt: startAt,
    timezone: 'America/New_York', city: 'Asheville', region: 'NC', venueName: '', address: '', directions: '', venueVisibility: 'holders', venueRevealScheduled: false, venueRevealAt: null, hero: null, flyer: null, gallery: [], lineup: [],
    sections: [{ id: 'faq', type: 'faq', title: 'Good to know', bodyHtml: '<p>Bring your ticket and a valid photo ID.</p>', visible: true }], theme: { preset: 'pluto', accent: '#c4a2ff', font: 'Montserrat' },
    pools: [{ id: 'admission', name: 'General admission', capacity: 200 }], offers: [{ id: 'general', name: 'General admission', description: '', kind: 'admission', unitAmount: 4000, maxPerOrder: 10, salesStart, salesEnd: endAt, validFrom: startAt, validUntil: endAt, active: true, pools: { admission: 1 }, requiresOfferIds: [], taxCode: '', stripeProductId: '', stripeTaxRateIds: [] }], promos: [], tax: { mode: 'sandbox', confirmed: false, performanceLocationId: '' } };
}
export async function loadEvents() {
  const result = await api('staff/events', { revenue: true }); events = result.events; globalAdmin = result.admin;
  document.querySelector('#orders-all').hidden = !globalAdmin || allOrdersMode;
  document.querySelector('#system-health').hidden = !globalAdmin;
  healthBadge();
  const selector = document.querySelector('#staff-event'), current = selector.value;
  selector.innerHTML = '<option value="">Select an event</option>' + events.map(e => `<option value="${esc(e.id)}">${esc(e.title)} · ${esc(e.status)}</option>`).join('');
  if (events.some(e => e.id === current)) selector.value = current;
  document.querySelector('#staff-controls').hidden = false;
  const newButton = document.querySelector('#event-new'); if (newButton) newButton.hidden = !result.admin;
  const roleButton = document.querySelector('#event-roles'); if (roleButton) roleButton.hidden = !result.admin;
  const cards = document.querySelector('#event-list');
  if (cards) {
    cards.innerHTML = events.length ? events.map(e => `<button class="admin-event-card ${e.flyer ? 'has-flyer' : ''}" data-open-event="${esc(e.id)}">${e.flyer ? `<img class="admin-card-flyer" data-card-flyer="${esc(e.id)}" alt="Flyer for ${esc(e.title)}">` : ''}<span class="status-pill status-${esc(e.status)}">${esc(e.status)}</span><span class="event-card-date">${esc(new Date(e.startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: e.timezone }))}</span><strong>${esc(e.title)}</strong><span>${esc(e.city || 'Location to be announced')}${e.region ? `, ${esc(e.region)}` : ''}</span>${e.revenue ? `<span class="card-revenue"><span>This week <b>${money(e.revenue.thisWeek)}</b></span><span>Total gross <b>${money(e.revenue.gross)}</b></span></span>` : ''}<span class="card-action">View dashboard <span aria-hidden="true">↗</span></span></button>`).join('') : '<div class="empty-state"><h3>Your next event starts here.</h3><p>Create an event, add the artwork and ticket types, then publish when you’re ready.</p></div>';
    const weekly = document.querySelector('#weekly-revenue'), financial = events.filter(e => e.revenue);
    weekly.hidden = !financial.length;
    weekly.innerHTML = `<div class="ticket-stat-grid weekly-stat-grid">${[['This week', 'thisWeek'], ['Last week', 'lastWeek'], ['Total gross revenue', 'gross']].map(([label, key]) => `<div class="ticket-stat"><span>${label}</span><strong>${money(financial.reduce((n, e) => n + e.revenue[key], 0))}</strong></div>`).join('')}</div><p class="revenue-note">Paid gross sales · Monday–Sunday in each event’s timezone · before refunds, tax and fees</p>`;
    cards.querySelectorAll('[data-open-event]').forEach(button => button.onclick = () => action(button, () => selectEvent(button.dataset.openEvent)));
    const requested = new URLSearchParams(location.search).get('event');
    if (!record && requested && events.some(e => e.id === requested) && document.querySelector('#event-workspace')?.hidden) await selectEvent(requested, new URLSearchParams(location.search).get('view') === 'studio');
    else if (!record && globalAdmin && new URLSearchParams(location.search).get('view') === 'orders') await showAllOrders();
    else if (!record && globalAdmin && new URLSearchParams(location.search).get('view') === 'health') await showHealth();
    if (!document.querySelector('#events-index').hidden) loadCardFlyers(cards);
  }
  message(allOrdersMode ? 'Orders across all events are ready.' : result.admin ? 'Choose an event to open its dashboard.' : 'Your assigned events are ready.');
  return result;
}
async function selectEvent(eventId, edit = false) {
  if (!eventId) return;
  if (pendingUploads) throw new Error('Wait for the image upload to finish before switching views.');
  if (dirty) await save();
  const scope = events.find(e => e.id === eventId);
  allOrdersMode = false; document.querySelector('#all-orders-view').hidden = true; document.querySelector('#all-orders-view').replaceChildren(); document.querySelector('#orders-all').hidden = !globalAdmin;
  studio = edit; document.querySelector('#staff-event').value = eventId;
  document.querySelector('#events-index').hidden = true; document.querySelector('#event-workspace').hidden = false;
  document.querySelector('#events-back').hidden = false;
  document.querySelector('#workspace-title').textContent = scope?.title || 'Your event'; document.querySelector('#workspace-status').textContent = scope?.status || 'draft';
  document.querySelector('#event-studio').hidden = edit || !scope?.roles.includes('manager');
  const publicPage = document.querySelector('#event-public-page');
  publicPage.hidden = edit || !scope?.publishedSlug;
  publicPage.href = scope?.publishedSlug ? `/events/${encodeURIComponent(scope.publishedSlug)}` : '#';
  document.querySelector('#event-roles').hidden = !globalAdmin || edit;
  document.querySelector('#event-scanner-pins').hidden = !scope?.roles.includes('manager');
  document.querySelector('#event-promoter-stats').hidden = edit || !scope?.roles.includes('promoter');
  document.querySelector('#event-orders').hidden = !edit;
  document.querySelector('#event-cash').hidden = edit || !scope?.roles.includes('cash');
  document.querySelector('#event-editor').hidden = !edit; document.querySelector('#event-dashboard').hidden = edit;
  if (!edit) document.querySelector('#event-editor').replaceChildren();
  history.replaceState(null, '', `/tickets/admin?event=${encodeURIComponent(eventId)}${edit ? '&view=studio' : ''}`);
  if (scope?.roles.includes('manager')) record = await api('staff/get', { eventId }); else record = null;
  if (scope?.registrationMode && scope.registrationMode !== 'tickets') document.querySelector('#event-cash').hidden = true;
  dirty = false;
  if (edit && record) render();
  else if (scope?.roles.some(r => ['manager', 'cash', 'refund'].includes(r))) await dashboard();
  else { document.querySelector('#event-dashboard').innerHTML = '<div class="empty-state"><h3>You’re on the team.</h3><p>Use your assigned operations tools above, or open Admission to check tickets at the door.</p></div>'; }
}
async function showAllOrders() {
  if (!globalAdmin) throw new Error('Administrator access is required.');
  if (pendingUploads) throw new Error('Wait for the image upload to finish before switching views.');
  if (dirty) await save();
  record = null; allOrdersMode = true; document.querySelector('#staff-event').value = '';
  document.querySelector('#events-index').hidden = true; document.querySelector('#event-workspace').hidden = true;
  document.querySelector('#event-editor').replaceChildren(); document.querySelector('#event-dashboard').replaceChildren();
  document.querySelector('#events-back').hidden = false; document.querySelector('#orders-all').hidden = true;
  const root = document.querySelector('#all-orders-view'); root.hidden = false;
  history.replaceState(null, '', '/tickets/admin?view=orders'); await allOrders(root, events, selectEvent);
}
async function showHealth() {
  if (!globalAdmin) throw new Error('Administrator access is required.');
  if (pendingUploads) throw new Error('Wait for the image upload to finish before switching views.');
  if (dirty) await save();
  record = null; allOrdersMode = true;
  document.querySelector('#staff-event').value = '';
  document.querySelector('#events-index').hidden = true;
  document.querySelector('#event-workspace').hidden = true;
  document.querySelector('#events-back').hidden = false;
  document.querySelector('#orders-all').hidden = false;
  const root = document.querySelector('#all-orders-view'); root.hidden = false;
  history.replaceState(null, '', '/tickets/admin?view=health');
  await healthDashboard(root, selectEvent);
}
async function save() {
  if (pendingUploads) throw new Error('Wait for the image upload to finish before saving.');
  if (saving) return saving;
  record.draft.gallery = record.draft.gallery.filter(m => m?.assetId);
  const snapshot = JSON.stringify(record.draft), savedRecord = record;
  saving = (async () => {
    const result = await api('staff/save', { eventId: savedRecord.id, draft: JSON.parse(snapshot), revision: savedRecord.revision });
    savedRecord.revision = result.revision;
    if (record === savedRecord) { dirty = JSON.stringify(record.draft) !== snapshot; syncSaveState(); }
    message(studio ? 'Draft saved. Publish when the page is ready.' : savedRecord.draft.registrationMode === 'free' ? 'Event settings saved. Publish to update the public page.' : 'Ticketing settings saved. Publish to update ticket sales.'); return result;
  })();
  try { return await saving; } finally { saving = null; }
}
function studioFields(d) {
  return `<fieldset><legend>The essentials</legend><div class="form-grid">${field('title', 'Event title', 'text', { required: true })}${field('slug', 'Event URL /events/…', 'text', { required: true })}${field('subtitle', 'Short introduction')}${field('timezone', 'Timezone', 'select', { choices: [['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'], ['America/Los_Angeles', 'Pacific'], ['UTC', 'UTC']] })}${field('startAt', 'Event starts (event timezone)', 'date')}${field('endAt', 'Event ends (event timezone)', 'date')}${d.registrationMode !== 'free' ? field('admissionStartsAt', 'First admission / transfer cutoff', 'date') : ''}</div>${rich('descriptionHtml', 'Event description')}</fieldset>
  <fieldset><legend>Venue & directions</legend><div class="form-grid">${field('city', 'Public city')}${field('region', 'Public state')}${field('venueVisibility', 'Exact venue visibility', 'select', { choices: d.registrationMode === 'free' ? [['public', 'Public']] : [['holders', 'Ticket holders only'], ['public', 'Public']] })}${field('venueName', 'Venue name')}${field('address', 'Street address')}</div>${field('directions', 'Directions, parking and access notes', 'textarea')}<div data-private-location ${d.venueVisibility !== 'holders' ? 'hidden' : ''}>${field('venueRevealScheduled', 'Schedule location reveal', 'check')}<p>The public page always shows only the city/state. Without a schedule, confirmed ticket holders can see the exact venue immediately.</p><div data-location-reveal ${!d.venueRevealScheduled ? 'hidden' : ''}>${field('venueRevealAt', 'Reveal exact venue & directions at', 'date', { required: d.venueVisibility === 'holders' && d.venueRevealScheduled === true })}<p>Time shown in ${esc(d.timezone)}. Confirmed holders see the location in their app at this time. Save and publish to apply it.</p></div></div></fieldset>
  <fieldset><legend>Artwork & gallery</legend>${media('hero', 'Hero artwork')}${media('flyer', 'Event flyer')}${d.gallery.map((_, i) => media(`gallery.${i}`, `Gallery photo ${i + 1}`)).join('')}<button type="button" class="button button-quiet" data-add="gallery">Add gallery photo</button></fieldset>
  <fieldset><legend>Page theme</legend><div class="form-grid">${field('theme.preset', 'Theme', 'select', { choices: [['pluto', 'Pluto Default'], ['artwork-dark', 'Artwork Dark'], ['light', 'Light']] })}${field('theme.accent', 'Accent color', 'color')}${field('theme.font', 'Font', 'select', { choices: [['Montserrat', 'Montserrat'], ['SourceCodePro', 'Source Code Pro']] })}</div></fieldset>
  <fieldset><legend>Lineup & set times</legend>${d.lineup.map((a, i) => `<details><summary>${esc(a.name || `Artist ${i + 1}`)}</summary><div class="form-grid">${field(`lineup.${i}.name`, 'Artist name')}${field(`lineup.${i}.genre`, 'Genre')}${field(`lineup.${i}.time`, 'Set time')}</div>${media(`lineup.${i}.image`, 'Artist photo')}<button type="button" data-remove="lineup" data-index="${i}">Remove artist</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="lineup">Add artist</button></fieldset>
  <fieldset><legend>Page sections</legend><p>Add schedule, FAQ, camping, parking, accessibility and other information. Use the arrows to change their order.</p>${d.sections.map((s, i) => `<details open><summary>${esc(s.title)}</summary>${field(`sections.${i}.title`, 'Section title')}${field(`sections.${i}.type`, 'Section kind', 'select', { choices: ['custom', 'schedule', 'faq', 'camping', 'parking', 'accessibility'].map(v => [v, v]) })}${field(`sections.${i}.visible`, 'Show on page', 'check')}${rich(`sections.${i}.bodyHtml`, 'Section content')}<div class="ticket-toolbar"><button type="button" data-move="${i}" data-direction="-1">Move up</button><button type="button" data-move="${i}" data-direction="1">Move down</button><button type="button" data-remove="sections" data-index="${i}">Remove section</button></div></details>`).join('')}<button type="button" class="button button-quiet" data-add="sections">Add section</button></fieldset>`;
}
function ticketingFields(d) {
  return `<fieldset><legend>Capacity pools</legend><p>Day and weekend passes can consume shared daily pools. Camping and vehicle passes can use separate pools.</p>${d.pools.map((p, i) => `<details open><summary>${esc(p.name)}</summary><div class="form-grid">${field(`pools.${i}.id`, 'Pool ID')}${field(`pools.${i}.name`, 'Pool name')}${field(`pools.${i}.capacity`, 'Capacity', 'number')}</div><button type="button" data-remove="pools" data-index="${i}">Remove pool</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="pools">Add pool</button></fieldset>
  <fieldset><legend>Ticket types & passes</legend><p>Every pass can be purchased on its own. Save your changes here, then publish when you want the new ticket options to go live.</p><div class="ticket-toolbar"><button type="button" class="button button-primary" data-save-ticket-types>Save ticket types</button><span data-save-state role="status"></span></div>${d.offers.map((o, i) => `<details><summary>${esc(o.name)} · ${money(o.unitAmount)}</summary><div class="form-grid">${field(`offers.${i}.id`, 'Ticket ID')}${field(`offers.${i}.name`, 'Ticket name')}${field(`offers.${i}.description`, 'Description')}${field(`offers.${i}.kind`, 'Ticket kind', 'select', { choices: [['admission', 'Admission'], ['camping', 'Camping'], ['vehicle', 'Vehicle']] })}${field(`offers.${i}.unitAmount`, 'Price in USD (tax included)', 'money')}${field(`offers.${i}.maxPerOrder`, 'Maximum per order', 'number')}${field(`offers.${i}.salesStart`, 'Sales start', 'date')}${field(`offers.${i}.salesEnd`, 'Sales end', 'date')}${field(`offers.${i}.validFrom`, 'Admission valid from', 'date')}${field(`offers.${i}.validUntil`, 'Admission valid until', 'date')}${field(`offers.${i}.active`, 'Available for sale', 'check')}${d.pools.map(p => field(`offers.${i}.pools.${p.id}`, `Units from ${p.name} (0 = unused)`, 'number')).join('')}</div><details><summary>Tax configuration</summary>${field(`offers.${i}.taxCode`, 'Stripe tax code')}${field(`offers.${i}.stripeProductId`, 'Stripe product with venue tax location')}${field(`offers.${i}.stripeTaxRateIds`, 'Inclusive manual tax rate IDs (comma separated)')}</details><div class="ticket-toolbar"><button type="button" class="button button-primary" data-save-ticket-types>Save ticket types</button><button type="button" class="button button-quiet" data-remove="offers" data-index="${i}">Remove ticket type</button></div></details>`).join('')}<button type="button" class="button button-quiet" data-add="offers">Add ticket type</button></fieldset>
  <fieldset><legend>Promotions</legend>${d.promos.map((p, i) => `<details><summary>${esc(p.code)}</summary><div class="form-grid">${field(`promos.${i}.code`, 'Promo code')}${field(`promos.${i}.type`, 'Discount kind', 'select', { choices: [['percent', 'Percent'], ['fixed', 'Fixed amount in cents']] })}${field(`promos.${i}.value`, 'Discount value', 'number')}${field(`promos.${i}.limit`, 'Global redemption limit', 'number')}${field(`promos.${i}.startsAt`, 'Starts', 'date')}${field(`promos.${i}.endsAt`, 'Ends', 'date')}${field(`promos.${i}.offerIds`, 'Eligible ticket types (empty = all)', 'multi', { choices: d.offers.map(o => [o.id, o.name]) })}</div><button type="button" data-remove="promos" data-index="${i}">Remove promotion</button></details>`).join('')}<button type="button" class="button button-quiet" data-add="promos">Add promotion</button></fieldset>
  <fieldset><legend>Event tax setup</legend><p>Sandbox mode supports development without a live tax setup. Before live sales, confirm classifications, venue registrations and inclusive rates.</p>${field('tax.mode', 'Tax mode', 'select', { choices: [['sandbox', 'Sandbox testing'], ['manual', 'Confirmed inclusive manual rates'], ['automatic', 'Stripe Tax with event venue']] })}${field('tax.performanceLocationId', 'Stripe performance location')}${field('tax.confirmed', 'Venue tax treatment and registrations have been reviewed', 'check')}</fieldset>`;
}
function render() {
  const root = document.querySelector(studio ? '#event-editor' : '#event-ticket-settings'), d = record.draft, eid = record.id, free = d.registrationMode === 'free';
  const groups = [...root.querySelectorAll('.ticket-settings-group')], expanded = new Set(groups.filter(g => g.open).map(g => g.dataset.section));
  if (studio) document.querySelector('#event-dashboard').replaceChildren();
  const studioHeader = `<nav class="studio-navigation" aria-label="Event editor sections"><a href="#event-details">Details</a><a href="#event-venue">Venue</a><a href="#event-artwork">Artwork</a><a href="#event-theme">Theme</a><a href="#event-lineup">Lineup</a><a href="#event-sections">Page sections</a></nav><form id="event-editor-form"><h2>${esc(d.title)}</h2><p>Revision ${record.revision} · ${esc(record.status || 'draft')}</p><div class="ticket-toolbar"><button type="submit" class="button button-primary">Save draft</button><button type="button" class="button button-quiet" data-event-action="preview">Preview</button><button type="button" class="button button-primary" data-event-action="publish">Publish</button><button type="button" class="button button-quiet" data-event-action="unpublish">Unpublish</button><button type="button" class="button button-quiet" data-event-action="archive">Archive</button><button type="button" class="button button-quiet" data-event-action="cancel">Mark cancelled</button><button type="button" class="button button-quiet" data-event-action="duplicate">Duplicate</button><button type="button" class="button button-quiet" data-event-action="history">Version history</button><a class="button button-quiet" href="/events/${esc(d.slug)}" target="_blank" rel="noopener">Public page</a></div>`;
  const ticketingHeader = `<h2>${free ? 'Event setup' : 'Ticketing setup'}</h2>${free ? '<p>Manage your event type here and build the public page in Event Studio.</p>' : '<p>Manage capacity, passes, promotions and event taxes. Save settings to your draft, then publish to apply them to ticket sales.</p><nav class="studio-navigation" aria-label="Ticketing settings sections"><a href="#event-capacity">Capacity pools</a><a href="#event-tickets">Ticket types & passes</a><a href="#event-promotions">Promotions</a><a href="#event-tax">Event tax setup</a></nav>'}<form id="event-ticket-settings-form"><div class="ticket-toolbar"><button type="submit" class="button button-primary">${free ? 'Save event settings' : 'Save ticketing settings'}</button><button type="button" class="button button-quiet" data-event-action="publish">${free ? 'Publish event changes' : 'Publish ticketing changes'}</button><span data-save-state role="status"></span></div>`;
  root.innerHTML = `${studio ? studioHeader : ticketingHeader}${studio ? studioFields(d) : free ? '' : ticketingFields(d)}<div class="studio-save-bar"><span data-save-state role="status"></span><button type="submit" class="button button-primary">${studio ? 'Save draft' : free ? 'Save event settings' : 'Save ticketing settings'}</button></div></form>`;
  {
    const rsvp = ['rsvp', 'rsvp-approval'].includes(d.registrationMode);
    root.querySelector('form').insertAdjacentHTML('afterbegin', `<div class="registration-settings">${field('registrationMode', 'Event registration', 'select', { choices: [['tickets', 'Ticketed event'], ['rsvp', 'Open RSVP · No approval needed'], ['rsvp-approval', 'RSVP · Organizer approval required'], ['free', 'Free event · Just show up']] })}<p>${free ? 'Free entry with no tickets, RSVP or admission QR required. Venue and directions are public. Ticket types are deactivated in this draft; existing orders stay valid.' : d.registrationMode === 'rsvp-approval' ? 'RSVPs are free, one pass per named person. Attendees receive no QR until you approve their request. Pending requests hold no capacity.' : d.registrationMode === 'rsvp' ? 'RSVPs are free, one pass per named person. Attendees receive their in-app QR immediately, within available capacity.' : 'Use tickets for paid or free ticket sales. Choose Free event for gatherings people can simply show up to.'}</p>${rsvp ? '<button class="button button-quiet" type="button" id="setup-rsvp-pass">Set up free RSVP pass</button><p>This deactivates existing ticket options and adds one free RSVP pass using the first admission option’s capacity pools. Existing orders stay valid. Edit the pass in the event dashboard before saving and publishing. Promotions do not apply to RSVPs.</p>' : ''}</div>`);
    root.querySelector('#setup-rsvp-pass')?.addEventListener('click', () => {
      const source = d.offers.find(o => o.kind === 'admission') || defaultDraft().offers[0];
      const pools = d.offers.some(o => o.kind === 'admission') ? { ...source.pools } : d.pools.length ? { [d.pools[0].id]: 1 } : {};
      d.offers.forEach(o => { o.active = false; });
      d.offers.push({ ...source, id: `rsvp-${crypto.randomUUID().slice(0, 8)}`, name: 'RSVP admission', description: 'One pass per named attendee.', kind: 'admission', unitAmount: 0, maxPerOrder: 1, active: true, salesStart: new Date().toISOString(), salesEnd: d.endAt, validFrom: d.admissionStartsAt, validUntil: d.endAt, pools, stripeProductId: '', stripeTaxRateIds: [], taxCode: '' });
      dirty = true; render(); message('Free RSVP pass added to the draft. Save and publish to open RSVPs.');
    });
  }
  root.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => {
    try {
      let value = input.value, kind = input.dataset.kind, path = input.dataset.field;
      if (kind === 'number') value = Number(value);
      if (kind === 'money') value = Math.round(Number(value) * 100);
      if (kind === 'check') value = input.checked;
      if (kind === 'multi') value = [...input.selectedOptions].map(o => o.value);
      if (kind === 'date') value = path === 'venueRevealAt' && !value ? null : utcDate(value, record.draft.timezone);
      if (path.endsWith('stripeTaxRateIds')) value = input.value.split(',').map(v => v.trim()).filter(Boolean);
      if (path.includes('.pools.') && Number(value) === 0) { const parts = path.split('.'), key = parts.pop(); delete get(parts.join('.'))[key]; dirty = true; } else set(path, value);
      if (path === 'registrationMode' && value === 'free') {
        d.offers.forEach(offer => { offer.active = false; });
        d.venueVisibility = 'public'; d.venueRevealScheduled = false; d.venueRevealAt = null;
        d.sections.forEach(section => { if (section.id === 'faq' && section.bodyHtml === '<p>Bring your ticket and a valid photo ID.</p>') section.bodyHtml = '<p>Free entry. No ticket or RSVP required.</p>'; });
      }
      if (['startAt', 'endAt', 'admissionStartsAt'].includes(path)) {
        root.querySelectorAll('[data-field][data-kind="date"]').forEach(control => {
          const date = get(control.dataset.field); control.value = date ? localDate(date, record.draft.timezone) : '';
        });
      }
      syncSaveState();
      if (path === 'venueVisibility' || path === 'venueRevealScheduled') {
        root.querySelector('[data-private-location]').hidden = d.venueVisibility !== 'holders';
        root.querySelector('[data-location-reveal]').hidden = !d.venueRevealScheduled;
        root.querySelector('[data-field="venueRevealAt"]').required = d.venueVisibility === 'holders' && d.venueRevealScheduled === true;
      }
      if (path === 'timezone' || path === 'registrationMode') render();
    } catch (error) { message(error.message, true); input.focus(); }
  }));
  root.querySelectorAll('[data-rich]').forEach(content => {
    content.addEventListener('input', () => set(content.dataset.rich, content.innerHTML));
    content.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); set(content.dataset.rich, content.innerHTML); });
  });
  root.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', () => { dirty = true; syncSaveState(); }));
  root.querySelectorAll('[data-format]').forEach(button => button.addEventListener('mousedown', event => { event.preventDefault(); document.execCommand(button.dataset.format, false, button.dataset.value || null); const path = button.closest('[data-rich-target]').dataset.richTarget; set(path, root.querySelector(`[data-rich="${path}"]`).innerHTML); }));
  root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); action(event.submitter, save); });
  root.querySelectorAll('[data-add]').forEach(button => button.onclick = () => {
    const key = button.dataset.add, generated = crypto.randomUUID().slice(0, 8);
    const values = { gallery: { assetId: '', alt: '', caption: '', focalX: 50, focalY: 50 }, lineup: { name: 'New artist', genre: '', time: '', image: null },
      sections: { id: generated, type: 'custom', title: 'New section', bodyHtml: '<p>Add event information.</p>', visible: true }, pools: { id: `pool-${generated}`, name: 'New pool', capacity: 100 },
      offers: { ...defaultDraft().offers[0], ...(['rsvp', 'rsvp-approval'].includes(d.registrationMode) ? { unitAmount: 0, maxPerOrder: 1, name: 'RSVP admission' } : { name: 'New ticket' }), id: `ticket-${generated}`, validFrom: d.admissionStartsAt, validUntil: d.endAt, salesEnd: d.endAt, pools: d.pools.length ? { [d.pools[0].id]: 1 } : {} },
      promos: { code: `PROMO-${generated.toUpperCase()}`, type: 'percent', value: 10, limit: 100, startsAt: new Date().toISOString(), endsAt: d.endAt, offerIds: [] } };
    d[key].push(values[key]); dirty = true; render(); if (key === 'offers') { const details = document.querySelector('#event-tickets').querySelectorAll(':scope > details'); details[details.length - 1].open = true; details[details.length - 1].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
  root.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { d[button.dataset.remove].splice(Number(button.dataset.index), 1); dirty = true; render(); });
  root.querySelectorAll('[data-move]').forEach(button => button.onclick = () => { const index = Number(button.dataset.move), target = index + Number(button.dataset.direction); if (target < 0 || target >= d.sections.length) return; [d.sections[index], d.sections[target]] = [d.sections[target], d.sections[index]]; dirty = true; render(); });
  root.querySelectorAll('[data-clear-media]').forEach(button => button.onclick = () => { const path = button.dataset.clearMedia; if (path.startsWith('gallery.')) d.gallery.splice(Number(path.split('.')[1]), 1); else set(path, null); dirty = true; render(); });
  root.querySelectorAll('[data-upload]').forEach(input => input.onchange = () => action(null, async () => {
    const file = input.files[0]; if (!file) return;
    const status = root.querySelector(`[data-upload-status="${input.dataset.upload}"]`);
    pendingUploads++; root.inert = true; root.setAttribute('aria-busy', 'true'); syncSaveState(); status.textContent = 'Preparing and uploading your image…'; message('Uploading your image…');
    try {
      const asset = await api('staff/media', { eventId: eid, image: await imagePayload(file) }); set(input.dataset.upload, { ...asset, alt: file.name.replace(/\.[^.]+$/, '') }); render(); message('Image uploaded. Save your draft, then publish to show it on the event page.');
    } catch (error) { status.textContent = error.message; status.classList.add('error'); input.value = ''; throw error; }
    finally { pendingUploads--; root.inert = false; root.removeAttribute('aria-busy'); syncSaveState(); }
  }));
  root.querySelectorAll('[data-media-thumb]').forEach(async image => { try { if (!image.dataset.mediaThumb) return; const blob = await api('staff/media/view', { eventId: eid, assetId: image.dataset.mediaThumb }, true), url = URL.createObjectURL(blob); image.src = url; image.onload = () => URL.revokeObjectURL(url); } catch { image.alt = 'Image unavailable'; } });
  root.querySelectorAll('[data-event-action]').forEach(button => button.onclick = () => action(button, async () => {
    const command = button.dataset.eventAction;
    if (command === 'history') {
      const versions = await api('staff/revisions', { eventId: eid }), content = dialog(`<h2>Content history</h2><p>Restoring changes page content and theme. Ticket prices, capacity and financial records keep their current values.</p>${versions.map(v => `<p>Revision ${v.revision} · ${esc(new Date(v.savedAt).toLocaleString())} <button data-restore="${v.revision}">Restore content</button></p>`).join('')}`);
      content.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => action(b, async () => { await api('staff/restore', { eventId: eid, revision: record.revision, restoreRevision: Number(b.dataset.restore) }); document.querySelector('#ticketing-dialog').close(); await selectEvent(eid, true); })); return;
    }
    d.gallery = d.gallery.filter(m => m.assetId);
    if (dirty) await save();
    if (command === 'preview') { const result = await api('staff/preview', { eventId: eid }); const content = dialog('<h2>Private event preview</h2><iframe title="Event landing page preview" sandbox="allow-same-origin"></iframe>'); content.querySelector('iframe').srcdoc = result.html; return; }
    if (command === 'duplicate') { const result = await api('staff/duplicate', { eventId: eid }); await loadEvents(); document.querySelector('#staff-event').value = result.id; await selectEvent(result.id, true); return; }
    const currentView = studio;
    await api('staff/publish', { eventId: eid, revision: record.revision, action: command }); await loadEvents(); document.querySelector('#staff-event').value = eid; await selectEvent(eid, currentView); message(`Event ${command === 'publish' ? 'published' : command === 'unpublish' ? 'unpublished' : command === 'archive' ? 'archived' : 'cancelled'}.`);
  }));
  root.querySelectorAll('[data-save-ticket-types]').forEach(button => button.onclick = () => action(button, async () => {
    if (!root.querySelector('form').reportValidity()) return;
    await save(); message('Ticket types saved. Publish to update the tickets available for purchase.');
  }));
  root.querySelectorAll('fieldset').forEach(section => {
    const name = section.querySelector('legend')?.textContent;
    section.id = { 'The essentials': 'event-details', 'Venue & directions': 'event-venue', 'Artwork & gallery': 'event-artwork', 'Page theme': 'event-theme', 'Lineup & set times': 'event-lineup', 'Page sections': 'event-sections', 'Capacity pools': 'event-capacity', 'Ticket types & passes': 'event-tickets', 'Promotions': 'event-promotions', 'Event tax setup': 'event-tax' }[name] || '';
    if (!studio) {
      const group = document.createElement('details'), summary = document.createElement('summary'); group.className = 'ticket-settings-group'; group.dataset.section = section.id; summary.textContent = name;
      group.open = groups.length ? expanded.has(section.id) : section.id === 'event-tickets';
      section.replaceWith(group); group.append(summary, section);
    }
  });
  root.querySelectorAll('.studio-navigation a').forEach(link => link.addEventListener('click', () => {
    const section = root.querySelector(link.getAttribute('href')); if (section?.parentElement.classList.contains('ticket-settings-group')) section.parentElement.open = true;
  }));
  syncSaveState();
}
async function dashboard() {
  const eventId = document.querySelector('#staff-event').value; if (!eventId) throw new Error('Choose an event first.');
  const data = await api('staff/orders', { eventId }), { paid, gross, tax, refunds, fees, pendingFees, provisional, proceeds, discounts } = financialSummary(data.orders);
  const root = document.querySelector('#event-dashboard');
  if (record?.draft.registrationMode === 'free' && !data.orders.length) {
    root.innerHTML = '<h2>Event overview</h2><p>Free entry — guests can simply show up. No ticket or RSVP is required.</p><nav class="studio-navigation" aria-label="Event dashboard sections"><a href="#event-guestlist">Guest list</a><a href="#event-ticket-settings">Event setup</a></nav><section id="event-guestlist" aria-label="Event guest list"></section><section id="event-ticket-settings" aria-label="Event setup"></section>';
    render(); await adminGuestList(root.querySelector('#event-guestlist'), eventId); return;
  }
  root.innerHTML = `<h2>Orders & event performance</h2>${provisional ? `<p role="status">Proceeds are provisional.${pendingFees ? ` Stripe fees are still pending for ${pendingFees} paid order${pendingFees === 1 ? '' : 's'}.` : ''} Payment reviews and unmapped refunds must be resolved before final reconciliation.</p>` : ''}<div class="ticket-stat-grid">${[['Paid orders', paid.length], ['Tickets issued', paid.reduce((n, o) => n + o.units.length, 0)], ['Gross sales', money(gross)], ['Discounts', money(discounts)], ['Inclusive tax', money(tax)], ['Refunds (including unmapped)', money(refunds)], [pendingFees ? 'Confirmed Stripe payment fees' : 'Stripe payment fees', money(fees)], [provisional ? 'Provisional proceeds before operating costs' : 'Proceeds before operating costs', money(proceeds)], ['Cash sales', money(paid.filter(o => o.method === 'cash').reduce((n, o) => n + o.total, 0))], ['Comps', paid.filter(o => o.method === 'comp').length]].map(([label, value]) => `<div class="ticket-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
  <h3>Inventory</h3>${data.pools.map(p => `<p>${esc(p.name)}: ${p.sold} sold · ${p.held} reserved · ${p.capacity - p.sold - p.held} available</p>`).join('')}
  ${record ? '<nav class="studio-navigation" aria-label="Event dashboard sections"><a href="#event-rsvps">RSVPs</a><a href="#event-guestlist">Guest list</a><a href="#event-order-list">Orders</a><a href="#event-ticket-settings">Ticketing setup</a></nav><section id="event-rsvps" aria-label="Event RSVPs"></section><section id="event-guestlist" aria-label="Event guest list"></section>' : ''}<section id="event-order-list" aria-label="Event orders"></section>${record ? '<section id="event-ticket-settings" aria-label="Event ticketing setup"></section>' : ''}`;
  const graph = document.createElement('section'); graph.className = 'revenue-panel'; graph.setAttribute('aria-label', 'Revenue tracking'); root.querySelector('.ticket-stat-grid').before(graph);
  revenueChart(graph, data.orders, record?.draft.timezone || events.find(e => e.id === eventId)?.timezone || 'America/New_York');
  eventOrders(root.querySelector('#event-order-list'), data.orders, {
    refresh: dashboard, openEvent: selectEvent,
    exportOrders: async () => download(await api('staff/export', { eventId }, true), 'Pluto-orders.csv'),
    retry: globalAdmin ? async () => { const result = await api('staff/retry', { eventId }); await dashboard(); message(`Retry finished: ${result.orders || 0} orders checked.`); } : undefined,
  });
  if (record) render();
  if (record) {
    const showRsvps = ['rsvp', 'rsvp-approval'].includes(record.draft.registrationMode) || data.orders.some(o => o.method === 'rsvp');
    root.querySelector('#event-rsvps').hidden = !showRsvps;
    root.querySelector('a[href="#event-rsvps"]').hidden = !showRsvps;
    adminRsvps(root.querySelector('#event-rsvps'), eventId, data.orders, dashboard);
  }
  if (record) await adminGuestList(root.querySelector('#event-guestlist'), eventId);
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
  bind('#event-new', async () => { const eid = crypto.randomUUID(); await api('staff/save', { eventId: eid, draft: defaultDraft(), revision: 0 }); await loadEvents(); document.querySelector('#staff-event').value = eid; await selectEvent(eid, true); });
  document.querySelector('#staff-event')?.addEventListener('change', event => action(null, async () => { if (dirty) { event.target.value = record.id; message('Save your draft before switching events.', true); return; } await selectEvent(event.target.value); }));
  bind('#event-studio', () => selectEvent(document.querySelector('#staff-event').value, true));
  bind('#event-orders', async () => { if (dirty) await save(); await selectEvent(document.querySelector('#staff-event').value); });
  bind('#orders-all', showAllOrders);
  bind('#system-health', showHealth);
  setInterval(healthBadge, 60000);
  bind('#events-back', async () => { if (dirty) await save(); record = null; allOrdersMode = false; document.querySelector('#all-orders-view').hidden = true; document.querySelector('#all-orders-view').replaceChildren(); document.querySelector('#staff-event').value = ''; document.querySelector('#event-workspace').hidden = true; document.querySelector('#events-index').hidden = false; document.querySelector('#events-back').hidden = true; history.replaceState(null, '', '/tickets/admin'); await loadEvents(); });
  bind('#event-cash', cash); bind('#event-roles', roles);
  bind('#event-scanner-pins', scannerPins);
  bind('#event-promoter-stats', async () => { const data = await api('staff/promoter-stats', { eventId: document.querySelector('#staff-event').value }); document.querySelector('#event-dashboard').innerHTML = `<h2>Your promoter performance</h2><p>${esc(data.promoterId)}</p><div class="ticket-stat-grid">${[['Attributed orders', data.orders], ['Ticket units', data.tickets], ['Gross', money(data.gross)], ['Refunds', money(data.refunds)]].map(([label, value]) => `<div class="ticket-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`; });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}
