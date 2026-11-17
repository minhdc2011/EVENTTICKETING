#!/usr/bin/env node
/**
 * NFR-03 measurement: time until the seat map is usable, on an emulated 4G connection.
 *
 *   node scripts/nfr/measure-map-load.mjs --url http://localhost:4199/EVENTTICKETING/events/autumn-arena-festival-2026 --runs 20
 *
 * Requires: a running build (e.g. `vite build && vite preview --port 4199`) and playwright-core
 * (installed under .multiagent/). CHROME_PATH may point at a Chrome/Chromium executable.
 *
 * "Map ready" = the overview or official map is visible AND the seat search input is interactive.
 * Each run uses a fresh browser context (cold cache). Output: raw samples + P50/P95/min/max as JSON.
 *
 * Limits: measures the front end against whatever backend the build points at. With mock data
 * (default) there is no network round-trip to Supabase, so this is NOT an end-to-end number for
 * production. Realtime latency (DB change -> UI) needs a Supabase project and is not measured here.
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, token, i, all) => {
    if (token.startsWith('--')) acc.push([token.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const url = args.url;
const runs = Number(args.runs || 20);
if (!url) {
  console.error('Missing --url');
  process.exit(2);
}

// Chrome DevTools "Fast 4G"-like profile (same family of numbers Lighthouse uses for mobile).
const NETWORK = {offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8};

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const samples = [];
const failures = [];
for (let i = 0; i < runs; i += 1) {
  const context = await browser.newContext({viewport: {width: 412, height: 915}, deviceScaleFactor: 2, isMobile: true});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  try {
    const started = Date.now();
    await page.goto(url, {waitUntil: 'commit'});
    await page.waitForFunction(
      () => {
        const map = document.querySelector('#map .et-stadium-svg, #map .et-official-map-interactive, #map .et-official-map img');
        const search = document.querySelector('#search');
        const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
        return visible(map) && visible(search);
      },
      undefined,
      {timeout: 30_000},
    );
    samples.push(Date.now() - started);
  } catch (error) {
    failures.push(String(error.message || error));
  } finally {
    await context.close();
  }
}
await browser.close();

const sorted = [...samples].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      metric: 'map-ready-ms',
      url,
      network: '4G emulation (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up), CPU x4 slowdown, cold cache each run',
      runs,
      ok: samples.length,
      failed: failures.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      min: sorted[0] ?? null,
      max: sorted.at(-1) ?? null,
      samples,
      failures: failures.slice(0, 3),
      measuredAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
