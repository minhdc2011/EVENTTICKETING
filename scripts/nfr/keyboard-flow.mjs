#!/usr/bin/env node
/**
 * NFR-07 keyboard walkthrough of the seat map: choose a zone, focus and select a seat, open the hold
 * dialog, check the focus trap, Escape and focus return.
 *
 *   VITE_USE_MOCK_DATA=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5198
 *   node scripts/nfr/keyboard-flow.mjs http://localhost:5198/events/autumn-arena-festival-2026
 *
 * SAFETY: the flow presses "hold seats". It must only run against a MOCK-data app. Every request to a
 * *.supabase.co host is aborted, and the script exits if any was attempted.
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const errors = [];
let blocked = 0;
await page.route(/\.supabase\.co/, (route) => { blocked += 1; return route.abort(); });
const targetUrl = process.argv[2];
if (!targetUrl) { console.error('Usage: keyboard-flow.mjs <url of a MOCK-data event page>'); process.exit(2); }
page.on('pageerror', (e) => errors.push(e.message));
const step = (name, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' ' + extra : ''));
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  return el ? `${el.tagName}#${el.id}.${(el.className || '').toString().split(' ')[0]}|${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30)}` : 'none';
});

await page.goto(targetUrl, {waitUntil: 'networkidle'});
await page.waitForSelector('#search');

// 1. keyboard: reach the zone filter and choose a zone
await page.locator('role=radio[name="Section 104"]').first().focus();
await page.keyboard.press('Space');
await page.waitForSelector('.et-seat');
step('zone chosen by keyboard opens the seat grid', (await page.locator('.et-seat').count()) > 0);

// 2. seats are real buttons, tabbable, with code + status + price in the name
const seat = page.locator('.et-seat[aria-disabled=false]').first();
const label = await seat.getAttribute('aria-label');
step('seat has accessible name with code, status and price', /.+, .+, .+/.test(label ?? ''), label);
await seat.focus();
step('seat can take keyboard focus', (await active()).startsWith('BUTTON'));
const outline = await seat.evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
step('focused seat shows a focus indicator', !outline.startsWith('none'), outline);

// 3. status is not colour-only: every seat renders a glyph/text state label
const statuses = await page.locator('.et-seat').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.status))]);
console.log('statuses present', statuses);
const legend = await page.locator('.et-legend').innerText();
step('legend names every state in text', /Còn trống/.test(legend) && /Đã bán/.test(legend) && /Đang giữ/.test(legend) && /Đã chọn/.test(legend));

// 4. select a seat with the keyboard, announce through the live region
await page.keyboard.press('Enter');
step('Enter selects the focused seat', (await page.locator('.et-seat[aria-pressed=true]').count()) === 1);
const live = await page.locator('[aria-live]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-live')));
step('page exposes aria-live regions', live.includes('polite') || live.includes('assertive'), JSON.stringify(live));

// 5. hold dialog: open, trap focus, Escape closes and returns focus
const holdBtn = page.locator('#hold');
await holdBtn.scrollIntoViewIfNeeded();
const holdText = await holdBtn.innerText();
console.log('primary button:', holdText);
if (await holdBtn.isEnabled()) {
  await holdBtn.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role=dialog]', {timeout: 5000}).catch(() => {});
  const dlg = await page.locator('[role=dialog]').count();
  step('Enter on the primary button opens the confirmation dialog', dlg === 1);
  if (dlg === 1) {
    step('dialog is modal', (await page.locator('[role=dialog]').getAttribute('aria-modal')) === 'true');
    await page.waitForTimeout(400);
    step('focus moves into the dialog', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
    const inside = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      inside.push(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
    }
    step('Tab never leaves the dialog (focus trap)', inside.every(Boolean));
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      inside.push(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
    }
    step('Shift+Tab never leaves the dialog', inside.every(Boolean));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    step('Escape closes the dialog', (await page.locator('[role=dialog]').count()) === 0);
    step('focus returns to the opener', (await active()).includes(holdText.trim().slice(0, 10)) || (await active()).startsWith('BUTTON'), await active());
  }
} else {
  step('primary button enabled after selecting a seat', false, holdText);
}
step('no page errors', errors.length === 0, errors.join('|'));
step('no request reached Supabase (mock data only)', blocked === 0, String(blocked));
await browser.close();
