const assert = require('node:assert/strict');
const test = require('node:test');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const nunjucks = require('nunjucks');
const {normalizeRental, groupRentals, rentalContactEmail} = require('../lib/rentals-data');
const initial = JSON.parse(readFileSync(join(__dirname, '../lib/content/initial-inventory.json'), 'utf8'));
const base = initial[0];
function render(rentals, extras = {}) {
  return nunjucks.configure(join(__dirname, '../lib/templates'), {autoescape: true}).render('rentals.njk', {
    path:'/rentals', meta: {title:'Equipment Rentals | Pluto Events', canonical:'https://pluto.events/rentals'},
    rentalGroups: groupRentals(rentals), rentalContactEmail, ...extras,
  });
}
test('initial catalog contains all six requested items and quantities with quote pricing', () => {
  assert.equal(initial.length,6);
  assert.deepEqual(initial.map(item=>[item.id,item.quantity]), [['bassboss-zv28',4],['bassboss-vs21',2],['bassboss-at312',2],['elite-10-pro-fb4-ip65',2],['festival-string-lights',1],['duromax-xp16000iht',1]]);
  for (const item of initial) {
    const normalized = normalizeRental(item.id,item);
    assert.equal(normalized.priceLabel,'Contact For Quote');
    assert.equal(normalized.priceCents,null);
  }
});
test('rental normalization hides inactive and invalid inventory and blocks unsafe links', () => {
  assert.equal(normalizeRental('hidden',{...base,isActive:false}),null);
  assert.equal(normalizeRental('unset',{...base,isActive:undefined}),null);
  assert.equal(normalizeRental('zero',{...base,quantity:0}),null);
  assert.equal(normalizeRental('fraction',{...base,quantity:1.5}),null);
  const item=normalizeRental('safe',{...base, productUrl:'javascript:alert(1)',imageUrl:'data:image/svg+xml,bad'});
  assert.equal(item.productUrl,''); assert.equal(item.imageUrl,'');
});
test('rental prices support cents, zero, and an optional rate label; invalid prices fall back to quote', () => {
  const priced=normalizeRental('priced',{...base,priceMode:'price',priceCents:2550,priceUnit:'per day'});
  assert.equal(priced.priceLabel,'$25.50'); assert.equal(priced.priceUnit,'per day');
  assert.equal(normalizeRental('free',{...base,priceMode:'price',priceCents:0}).priceLabel,'$0.00');
  for (const priceCents of [-1,1.5,Infinity,'100',null,100000000]) {
    const item=normalizeRental('invalid',{...base,priceMode:'price',priceCents});
    assert.equal(item.priceLabel,'Contact For Quote'); assert.equal(item.priceUnit,'');
  }
});
test('rentals render without JavaScript with email inquiries, inventory quantities, and both pricing modes', () => {
  const rentals=initial.map(item=>normalizeRental(item.id,item));
  rentals[4]=normalizeRental('festival-string-lights',{...initial[4],priceMode:'price',priceCents:5000,priceUnit:'per setup'});
  const html=render(rentals);
  assert.equal((html.match(/<article class="rental-card"/g)||[]).length,6);
  assert.match(html,/4 units in inventory/);
  assert.match(html,/\$50\.00/); assert.match(html,/per setup/);
  assert.match(html,/Contact For Quote/);
  assert.match(html,/href="mailto:plutopresentsavl@gmail\.com\?subject=Rental%20inquiry%3A%20BASSBOSS%20ZV-28"/);
  assert.match(html,/href="\/rentals" aria-current="page"/);
  assert.match(html,/rel="canonical" href="https:\/\/pluto.events\/rentals"/);
  assert.match(html,/https:\/\/bassboss.com\/zv28/);
});
test('rental rendering escapes administrator content and handles empty and unavailable inventories', () => {
  const item=normalizeRental('escape',{...base,title:'<script>bad()</script>',description:'<img src=x onerror=bad()>'});
  const html=render([item]);
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.doesNotMatch(html,/<script>bad/);
  assert.match(render([]),/Rental listings are being updated/);
  assert.match(render([], {rentalsUnavailable:true}),/temporarily unavailable/);
});
test('public rentals route uses the starter inventory only in explicit local preview', async () => {
  process.env.PUBLIC_SITE_PREVIEW='true';
  const {app}=require('../lib/index');
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/rentals`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Equipment Rentals/);
    assert.equal((html.match(/<article class="rental-card"/g)||[]).length,6);
    assert.match(html,/CollectionPage/);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
