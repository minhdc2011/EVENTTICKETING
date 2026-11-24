#!/usr/bin/env node
/**
 * Giữ chỗ và xác nhận thanh toán trên TẤT CẢ sự kiện mẫu (chế độ MOCK, Chrome thật): với mỗi sự kiện, chọn một vé
 * (ghế trên bản đồ hoặc vé đứng), bấm Giữ chỗ, đăng nhập nhanh nếu được hỏi, bấm Xác nhận thanh toán, nhập OTP mô phỏng nếu được hỏi,
 * rồi kiểm "Thanh toán thành công (mô phỏng)". Mỗi sự kiện dùng một trình duyệt mới (phiên sạch).
 *   VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199
 *   CHROME_PATH=<chrome.exe> node scripts/nfr/all-events-hold-flow.mjs [url gốc]
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const base = (process.argv[2] || 'http://localhost:5199').replace(/\/$/, '');
// Ba sự kiện mẫu đang mở (5 sự kiện Ticketgo đã đóng theo yêu cầu, không còn trang chi tiết).
const SLUGS = ['super-concert-2026', 'creative-tech-summit-2026', 'autumn-arena-festival-2026'];
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const rows = [];
for (const slug of SLUGS) {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await ctx.newPage();
  page.route(/\.supabase\.co/, (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const r = {slug, ui: '-', chonVe: false, giuCho: false, xacNhan: false, otp: false, ghiChu: ''};
  try {
    await page.goto(`${base}/events/${slug}`, {waitUntil: 'networkidle'});
    await page.waitForSelector('#seating-section, #hold', {timeout: 15000});
    // Chọn một vé
    if (await page.locator('.et-tm-svg svg').count()) {
      r.ui = 'sơ đồ SVG';
      const codes = await page.evaluate(() => [...document.querySelectorAll('.et-tm-svg [data-zone-code]')].map((e) => e.getAttribute('data-zone-code')));
      for (const code of [...new Set(codes)]) {
        await page.evaluate((c) => document.querySelector(`.et-tm-svg [data-zone-code="${c}"]`)?.dispatchEvent(new MouseEvent('click', {bubbles: true})), code);
        await page.waitForTimeout(900);
        const dots = page.locator('.et-tm-dot[data-active=true][data-status=available]');
        if (await dots.count()) {
          await dots.first().click({force: true});
          await page.locator('.et-ticket-panel__action').click();
          r.chonVe = true; break;
        }
        const plus = page.locator('.et-ticket-panel__standing-item').first().getByRole('button', {name: /Tăng số lượng/});
        if (await plus.count()) { await plus.click(); r.chonVe = true; r.ui += ' + vé đứng'; break; }
      }
    } else if (await page.locator('.et-standing-btn').count()) {
      r.ui = 'bảng vé đứng (không sơ đồ)';
      await page.locator('.et-standing-row').first().getByRole('button', {name: /Tăng số lượng/}).click();
      r.chonVe = true;
    } else if (await page.locator('.et-seat, .et-seat-rows').count()) {
      r.ui = 'lưới ghế';
    }
    if (!r.chonVe) { r.ghiChu = 'không chọn được vé: ' + (await page.locator('#hold').innerText().catch(() => 'không có nút giữ chỗ')).replace(/\s+/g, ' '); throw new Error('stop'); }
    await page.locator('#hold').scrollIntoViewIfNeeded(); await page.locator('#hold').click();
    await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap], #dialog-title', {timeout: 8000});
    if (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
    await page.waitForSelector('#confirm-payment', {timeout: 8000});
    r.giuCho = /Đã giữ chỗ thành công/.test(await page.locator('#dialog-title').innerText());
    await page.locator('#confirm-payment').click();
    await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan], #close-paid', {timeout: 8000});
    if (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) {
      r.otp = true;
      await page.getByRole('button', {name: /gửi mã/i}).first().click(); await page.waitForTimeout(600);
      await page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first().fill('123456');
      await page.getByRole('button', {name: /^xác minh/i}).first().click();
      await page.waitForFunction(() => /Thanh toán thành công/.test(document.querySelector('#dialog-title')?.textContent || ''), null, {timeout: 8000});
    }
    r.xacNhan = /Thanh toán thành công/.test(await page.locator('#dialog-title').innerText().catch(() => ''));
  } catch (e) {
    if (!r.ghiChu) r.ghiChu = String(e.message).split('\n')[0].slice(0, 120);
  }
  if (errs.length) r.ghiChu += ' | lỗi JS: ' + errs.join(' ; ').slice(0, 120);
  rows.push(r);
  await ctx.close();
}
await browser.close();
let fail = 0;
for (const r of rows) {
  const ok = r.chonVe && r.giuCho && r.xacNhan;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.slug} | ${r.ui} | chọn vé=${r.chonVe} giữ chỗ=${r.giuCho} OTP=${r.otp} thanh toán=${r.xacNhan} ${r.ghiChu}`);
}
console.log(fail ? `CÓ ${fail} SỰ KIỆN LỖI` : 'TẤT CẢ SỰ KIỆN ĐẠT');
process.exit(fail ? 1 : 0);
