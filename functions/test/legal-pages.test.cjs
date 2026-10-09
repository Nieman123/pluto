const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const nunjucks = require('nunjucks');
const { join } = require('node:path');
const { readFileSync } = require('node:fs');
const { legalRouter, legalPages } = require('../lib/legal-pages.js');

test('legal pages render without an account, database or client scripts', async (t) => {
  const app = express();
  nunjucks.configure(join(__dirname, '../lib/templates'), { autoescape: true }).express(app);
  app.set('view engine', 'njk');
  app.use(legalRouter(path => ({ path, meta: { canonical: 'https://pluto-staging-92eb7.web.app/' },
    googleAnalyticsId: 'G-DO-NOT-TRACK', firebaseConfigJson: '{}' })));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, page] of Object.entries(legalPages)) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<title>${page.title} | Pluto Events</title>`));
    assert.ok(html.includes(`href="https://pluto-staging-92eb7.web.app${path}"`));
    assert.match(html, /Pluto Events LLC/);
    assert.match(html, /mailto:contact@pluto\.events/);
    assert.doesNotMatch(html, /G-DO-NOT-TRACK|plutopresentsavl@gmail/);
    assert.match(html, /<h1>/);
    assert.match(html, /href="\/delete-account"/);
    if (path === '/privacy') assert.match(html, /Stripe[\s\S]*Resend[\s\S]*Retention and deletion/);
    if (path === '/delete-account') {
      assert.match(html, /without signing in or reinstalling/);
      assert.match(html, /Request account deletion/);
      assert.match(html, /What gets deleted/);
      assert.match(html, /What may need to be retained/);
    }
  }
});

test('Firebase Hosting exposes every public legal route', () => {
  const hosting = JSON.parse(readFileSync(join(__dirname, '../../firebase.json'))).hosting;
  for (const path of Object.keys(legalPages)) {
    const rewrite = hosting.rewrites.find(route => route.source === path);
    assert.equal(rewrite?.function?.functionId, 'publicSite');
  }
});
