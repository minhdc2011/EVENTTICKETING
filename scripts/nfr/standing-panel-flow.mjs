#!/usr/bin/env node
/**
 * Khu vé đứng trên bản đồ (Super Concert, chế độ MOCK): bấm khu đứng thì khung thông tin vé hiện ĐỦ các hạng vé đứng
 * (mỗi hạng một bộ chọn số lượng) và khối "Vé đứng" ở dưới sơ đồ không còn; chọn số lượng cập nhật bảng tóm tắt.
 *   VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199
 *   CHROME_PATH=<chrome.exe> node scripts/nfr/standing-panel-flow.mjs [url sự kiện] [mã khu đứng]
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'standing-panel-shots');
mkdirSync(out, {recursive: true});
const target = process.argv[2] || 'http://localhost:5199/events/super-concert-2026';
const zone = process.argv[3] || 'GA_STAND_1';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
let blocked = 0; page.route(/\.supabase\.co/, (r) => { blocked++; r.abort(); });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + ' ' + x); };
await page.goto(target, {waitUntil: 'networkidle'});
await page.waitForSelector('.et-tm-svg svg', {timeout: 15000});
for (let i = 0; i < 5; i += 1) {
  await page.evaluate((c) => document.querySelector(`.et-tm-svg [data-zone-code="${c}"]`)?.dispatchEvent(new MouseEvent('click', {bubbles: true})), zone);
  if (await page.waitForSelector('.et-tm-map[data-focus-zone]', {timeout: 1500}).catch(() => null)) break;
}
await page.waitForTimeout(1200);
const panel = page.locator('.et-ticket-panel[data-standing=true]');
ok('khung thông tin vé là "Vé đứng tự do"', (await panel.count()) === 1);
const rows = await page.locator('.et-ticket-panel__standing-item').count();
ok('khung hiện đủ các hạng vé đứng (từ 2 hạng trở lên)', rows >= 2, String(rows));
ok('không còn khối "Vé đứng (không chọn ghế)" ở dưới sơ đồ', (await page.locator('[data-od-id=standing-picker]').count()) === 0);
await page.screenshot({path: `${out}/khu-dung-gop.png`});
const plus = page.locator('.et-ticket-panel__standing-item').nth(1).getByRole('button', {name: /Tăng số lượng/});
await plus.click(); await plus.click();
const qty = await page.locator('.et-ticket-panel__standing-item').nth(1).locator('output').innerText();
ok('chọn 2 vé hạng thứ hai trong khung', qty.trim() === '2', qty);
ok('bảng tóm tắt cập nhật số vé', /Giữ chỗ 2 vé/.test(await page.locator('#hold').innerText()), await page.locator('#hold').innerText());
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
ok('không gọi Supabase', blocked === 0, String(blocked));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail ? 1 : 0);
