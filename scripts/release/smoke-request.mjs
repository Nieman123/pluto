import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

// Hosting can briefly return a missing route while a new version propagates.
// Retry transport failures only; callers still validate identity and content.
export async function smokeRequest(baseUrl, path, revision, {
  fetcher = fetch, sleep = setTimeout, delays = [1000, 2000, 4000, 8000, 15000],
  log = console.warn,
} = {}) {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const url = new URL(path, baseUrl);
    url.searchParams.set('release', revision);
    url.searchParams.set('probe', `${Date.now()}-${attempt}`);
    let response, body;
    try {
      response = await fetcher(url, { redirect: 'manual',
        headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
      body = await response.text();
    } catch (error) {
      if (attempt === delays.length) throw new Error(`${path} could not be fetched after ${attempt + 1} attempts.`, { cause: error });
      log(`${path}: network failure; retrying in ${delays[attempt]}ms.`);
      await sleep(delays[attempt]);
      continue;
    }
    const transient = response.status === 404 || response.status === 429 || response.status >= 500;
    if (transient && attempt < delays.length) {
      log(`${path}: HTTP ${response.status}; retrying in ${delays[attempt]}ms.`);
      await sleep(delays[attempt]);
      continue;
    }
    assert.equal(response.status, 200, `${path} must be available (attempt ${attempt + 1})`);
    return { response, body, attempts: attempt + 1 };
  }
}
