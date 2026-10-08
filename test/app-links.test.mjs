import assert from 'node:assert/strict';
import test from 'node:test';
import { appLaunchLink } from '../site/src/app-links.mjs';

const userAgent = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/154.0.0.0 Mobile Safari/537.36';
for (const [origin, packageName] of [
  ['https://pluto-staging-92eb7.web.app', 'events.pluto.app.staging'],
  ['https://pluto.events', 'events.pluto.app'],
]) {
  test(`Open App selects the matching Android package at ${origin}`, () => {
    const href = appLaunchLink('/app/', { origin, userAgent });
    assert.ok(href.startsWith(`intent://${new URL(origin).host}/app/#Intent;scheme=https;package=${packageName};`));
    assert.ok(href.endsWith(`S.browser_fallback_url=${encodeURIComponent(`${origin}/app/`)};end`));
  });
}

test('desktop, Apple and non-Chromium browsers retain the web/App Link', () => {
  for (const browser of ['Desktop Chrome/154.0', 'iPhone Safari/605.1', 'Android Firefox/148.0']) {
    assert.equal(appLaunchLink('/app/', { origin: 'https://pluto.events', userAgent: browser }), '/app/');
  }
});

test('preview and unrelated/capability links are never converted to intents', () => {
  for (const [origin, href] of [
    ['http://127.0.0.1:4173', '/app/'],
    ['https://preview.example', '/app/'],
    ['https://pluto.events:444', '/app/'],
    ['https://pluto.events', 'https://pluto-staging-92eb7.web.app/app/'],
    ['https://pluto.events', '/app/admin'],
    ['https://pluto.events', '/app/tickets#recovery=secret'],
    ['https://pluto.events', '/app/?order=123'],
    ['https://pluto.events', '/app/#recovery=secret'],
    ['https://pluto.events', 'https://user@pluto.events/app/'],
  ]) {
    assert.equal(appLaunchLink(href, { origin, userAgent }), href);
  }
});
