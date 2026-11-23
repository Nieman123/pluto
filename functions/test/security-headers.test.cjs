const test = require('node:test'), assert = require('node:assert/strict');
const { join } = require('node:path');
const express = require('express'), nunjucks = require('nunjucks');
const { contentSecurityPolicy, securityHeaders } = require('../lib/security-headers');
const { ticketingRouter } = require('../lib/ticketing/routes');

function directives(policy) {
  return Object.fromEntries(policy.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
}

test('the site policy blocks inline scripts, plugins and framing', () => {
  const policy = directives(contentSecurityPolicy);
  assert.ok(policy['script-src'].includes("'self'"));
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'data:']) assert.ok(!policy['script-src'].includes(unsafe), unsafe);
  assert.deepEqual(policy['script-src-attr'], ["'none'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
  assert.deepEqual(policy['base-uri'], ["'self'"]);
  // Every script origin the site loads must stay allowed.
  for (const source of ['https://www.gstatic.com/firebasejs/', 'https://js.stripe.com', 'https://*.googletagmanager.com', 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/', 'https://apis.google.com'])
    assert.ok(policy['script-src'].includes(source), source);
});

test('public site responses carry the policy and anti-framing headers', async () => {
  const app = express();
  app.use(securityHeaders);
  app.get('/rentals', (_req, res) => res.send('ok'));
  app.use(ticketingRouter(() => ({}), { db: { collection() { return {}; } } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(done => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/rentals', '/tickets/api/staff/events']) {
      const response = await fetch(base + path);
      assert.equal(response.headers.get('content-security-policy'), contentSecurityPolicy, path);
      assert.equal(response.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    }
  } finally { await new Promise(done => server.close(done)); }
});

test('server-rendered pages contain no inline executable scripts', () => {
  const env = nunjucks.configure(join(__dirname, '../lib/templates'), { autoescape: true });
  const html = env.render('404.njk', { path: '/404', meta: {}, googleAnalyticsId: 'G-TEST', firebaseConfigJson: '{}', jsonLd: '{"@type":"Thing"}', assetVersion: 'test' });
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  for (const [, attributes, body] of scripts) {
    const dataBlock = /type="application\/(?:ld\+)?json"/.test(attributes);
    assert.ok(dataBlock || (/\bsrc="/.test(attributes) && !body.trim()), `inline script: ${attributes}`);
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler');
});
