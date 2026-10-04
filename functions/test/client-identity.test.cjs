const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { configureTrustedProxy } = require('../lib/ticketing/client-identity');

async function address(trust, forwarded) {
  const app = express(); configureTrustedProxy(app, trust);
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { return (await (await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { 'X-Forwarded-For': forwarded } })).json()).ip; }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('proxy identity ignores spoofed prefixes and stops at the nearest untrusted peer', async () => {
  assert.equal(await address('', '203.0.113.66'), '127.0.0.1');
  assert.equal(await address('loopback,10.0.0.5/32', '203.0.113.66,198.51.100.20,10.0.0.5'), '198.51.100.20');
  assert.equal(await address('loopback,10.0.0.5/32', '203.0.113.66,198.51.100.21,10.0.0.5'), '198.51.100.21');
  assert.equal(await address('loopback,10.0.0.5/32', '203.0.113.66,10.0.0.8'), '10.0.0.8');
  for (const value of ['true', '2', '0.0.0.0/0', '::/0', 'invalid']) assert.throws(() => configureTrustedProxy(express(), value), /explicit proxy/);
});
