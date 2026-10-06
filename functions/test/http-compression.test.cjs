const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), zlib = require('node:zlib');
const express = require('express'), compression = require('compression');

test('compressed responses still decode correctly and an aborted response destroys its zlib stream', { timeout: 15000 }, async () => {
  const descriptor = Object.getOwnPropertyDescriptor(zlib, 'createGzip'), streams = [];
  Object.defineProperty(zlib, 'createGzip', { ...descriptor, value: function (...args) {
    const stream = descriptor.value.apply(this, args); streams.push(stream); return stream;
  } });
  const app = express(), body = 'Pluto event details. '.repeat(2000); let producer;
  let closed; const responseClosed = new Promise(resolve => { closed = resolve; });
  app.use(compression());
  app.get('/complete', (_req, res) => res.type('text/plain').send(body));
  app.get('/interrupted', (_req, res) => {
    res.type('text/plain');
    res.once('close', () => { clearInterval(producer); closed(); });
    res.write(body); res.flush();
    producer = setInterval(() => { res.write(body); res.flush(); }, 25);
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const complete = await fetch(`${origin}/complete`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(complete.headers.get('content-encoding'), 'gzip'); assert.equal(await complete.text(), body);
    await new Promise((resolve, reject) => {
      let aborted = false;
      const request = http.get(`${origin}/interrupted`, { headers: { 'Accept-Encoding': 'gzip' } }, response => {
        try { assert.equal(response.headers['content-encoding'], 'gzip'); } catch (error) { request.destroy(); reject(error); return; }
        response.once('data', () => { aborted = true; response.destroy(); request.destroy(); resolve(); });
        response.on('error', error => { if (!aborted) reject(error); });
      });
      request.on('error', error => { if (!aborted) reject(error); });
    });
    await responseClosed;
    assert.equal(streams.length, 2, 'both requests actually allocated a gzip stream');
    assert.equal(streams[1].destroyed, true, 'disconnect must release native zlib memory before the response finishes');
  } finally {
    clearInterval(producer); streams.forEach(stream => stream.destroy());
    Object.defineProperty(zlib, 'createGzip', descriptor);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
