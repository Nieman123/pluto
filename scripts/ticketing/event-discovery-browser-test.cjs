const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185') throw Error('Isolated demo emulator required.');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), base = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch(), records = [], now = Date.now();
  try {
    for (const [name, start, end] of [['Past discovery night', -7200000, -3600000], ['Ongoing discovery festival', -3600000, 86400000], ['Upcoming discovery night', 86400000, 172800000]]) {
      const id = randomUUID(), slug = `discovery-${id}`, ref = db.collection('publishedEvents').doc(id);
      await ref.set({ title: name, slug, startAt: new Date(now + start).toISOString(), endAt: new Date(now + end).toISOString(), status: 'published', registrationMode: 'rsvp', timezone: 'America/New_York', city: 'Asheville', region: 'NC', subtitle: 'Music and community with Pluto.', hero: null, flyer: null });
      records.push({ ref, slug });
    }
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 900 } }), page = await context.newPage();
      await page.goto(`${base}/events`);
      assert.equal(await page.locator('.discovery-heading h1').innerText(), 'Upcoming events');
      assert.equal(await page.locator(`h2 a[href="/events/${records[0].slug}"]`).count(), 0);
      for (const record of records.slice(1)) assert.equal(await page.locator(`h2 a[href="/events/${record.slug}"]`).count(), 1);
      await page.getByRole('link', { name: 'View past events' }).click();
      await page.waitForURL('**/past-events');
      assert.equal(await page.locator(`h2 a[href="/events/${records[0].slug}"]`).count(), 1);
      for (const record of records.slice(1)) assert.equal(await page.locator(`h2 a[href="/events/${record.slug}"]`).count(), 0);
      assert.equal(await page.locator('.discover-action').filter({ hasText: /tickets|RSVP/ }).count(), 0);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), []);
      await page.screenshot({ path: `tmp/events-past-${width}.png`, fullPage: true });
      await page.getByRole('link', { name: 'Explore upcoming events' }).click(); await page.waitForURL('**/events');
      await context.close();
    }
    console.log('Event discovery: upcoming/ongoing vs past, desktop/mobile navigation and accessibility passed.');
  } finally { for (const record of records) await record.ref.delete(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
