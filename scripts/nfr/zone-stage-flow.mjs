#!/usr/bin/env node
/**
 * Khung gộp khi bấm một khu của sơ đồ BTC: sơ đồ phóng vừa phải làm nền, bảng ghế nổi giữa khung, chuyển khu, Thu nhỏ toàn cảnh.
 * Chrome thật, chế độ MOCK (VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199); mọi yêu cầu tới *.supabase.co bị chặn.
 *   CHROME_PATH=<chrome.exe> OUT=<thư mục ảnh> node scripts/nfr/zone-stage-flow.mjs
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'zone-stage-flow-shots');
mkdirSync(out, {recursive: true});
async function moKhu(page, code) {
  // Chờ SVG và bộ xử lý bấm được gắn xong; thử lại nếu bấm quá sớm.
  await page.waitForSelector('.et-official-map-interactive svg', {timeout: 15000});
  for (let i = 0; i < 5; i += 1) {
    await page.locator(`.et-official-map-interactive [data-zone-code="${code}"]`).first().click({force: true});
    if (await page.waitForSelector('.et-zone-stage', {timeout: 1500}).catch(() => null)) break;
  }
  await page.waitForTimeout(1500);
}
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.route(/\.supabase\.co/, (r) => r.abort());
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x='') => { if(!c) fail++; console.log((c?'PASS':'FAIL')+' - '+n+' '+x); };
await page.goto('http://localhost:5199/events/autumn-arena-festival-2026', {waitUntil:'networkidle'}); await page.waitForSelector('.et-official-map-interactive svg', {timeout: 15000}); await page.waitForTimeout(500);
const vb0 = await page.evaluate(() => document.querySelector('.et-official-map-interactive svg').getAttribute('viewBox'));
await moKhu(page, 'SEC_104');
const vb1 = await page.evaluate(() => document.querySelector('.et-zone-stage svg').getAttribute('viewBox'));
const w = +vb1.split(' ')[2];
ok('camera phóng vừa phải (khung nhìn ~30% toàn cảnh, không cực đoan)', w >= 250 && w <= 450 && vb1 !== vb0, vb1);
ok('chỉ một khung (không còn hai phần), lưới ghế nằm trong khung', (await page.locator('.et-zone-stage .et-seat-rows .et-seat').count()) === 40 && (await page.locator('.et-focus-map').count()) === 0);
ok('khu đang chọn tô viền, khu xung quanh mờ', (await page.locator('.et-zone-stage .is-focused').count()) === 1 && (await page.locator('.et-zone-stage .is-dimmed').count()) > 10);
// bam khu ben canh tren nen
await page.locator('.et-zone-stage').scrollIntoViewIfNeeded();
const pt = await page.evaluate(() => {
  const st = document.querySelector('.et-zone-stage').getBoundingClientRect();
  for (let y = st.top + 20; y < st.bottom - 20; y += 12) for (const x of [st.left + 14, st.right - 14, st.left + 30]) {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-zone-code]');
    if (el && !el.classList.contains('is-focused')) return {x, y, code: el.getAttribute('data-zone-code')};
  }
  return null;
});
console.log('điểm bấm lộ ra ở mép nền:', JSON.stringify(pt));
if (pt) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(1500); }
const act = await page.evaluate(() => document.querySelector('.et-zone-stage .is-focused')?.getAttribute('data-zone-code'));
ok('bấm khu bên cạnh lộ ra ở mép nền thì chuyển khu', pt && act === pt.code, String(act));
await page.locator('.et-seat-rows .et-seat').nth(0).click(); await page.locator('.et-seat-rows .et-seat').nth(1).click();
ok('chọn 2 ghế trong bảng nổi', (await page.locator('.et-seat-rows .et-seat[data-status=selected]').count()) === 2);
await page.getByRole('button', {name: /Thu nhỏ toàn cảnh/}).click(); await page.waitForTimeout(900);
ok('Thu nhỏ toàn cảnh: về sơ đồ đầy đủ, lựa chọn giữ nguyên', (await page.locator('.et-zone-stage').count()) === 0 && (await page.locator('.et-official-map-interactive [data-zone-code]').count()) > 10 && /Thanh toán 2 vé/.test(await page.locator('#hold').innerText()));
ok('không lỗi JavaScript', errs.length === 0, errs.join('|'));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
