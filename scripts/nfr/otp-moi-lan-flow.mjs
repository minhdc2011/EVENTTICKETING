#!/usr/bin/env node
/**
 * Mỗi lần thanh toán cần một OTP mới (chế độ MOCK, Chrome thật): thanh toán lần 1 (nhập OTP), rồi giữ chỗ và thanh toán lần 2
 * ngay sau đó thì hộp thoại OTP PHẢI hiện lại (không dùng lại OTP đã xác minh), nhập OTP mới mới thanh toán được.
 *   VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199
 *   CHROME_PATH=<chrome.exe> node scripts/nfr/otp-moi-lan-flow.mjs [url sự kiện]
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const target = process.argv[2] || 'http://localhost:5199/events/super-concert-2026';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.route(/\.supabase\.co/, (r) => r.abort());
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + ' ' + x); };

async function chonMotVeDung() {
  await page.waitForSelector('.et-tm-svg svg', {timeout: 15000});
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => document.querySelector('.et-tm-svg [data-zone-code="GA_STAND_1"]')?.dispatchEvent(new MouseEvent('click', {bubbles: true})));
    if (await page.waitForSelector('.et-tm-map[data-focus-zone]', {timeout: 1500}).catch(() => null)) break;
  }
  await page.waitForTimeout(900);
  await page.locator('.et-ticket-panel__standing-item').first().getByRole('button', {name: /Tăng số lượng/}).click();
}
async function nhapOtp() {
  await page.getByRole('button', {name: /gửi mã/i}).first().click(); await page.waitForTimeout(600);
  await page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first().fill('123456');
  await page.getByRole('button', {name: /^xác minh/i}).first().click();
  await page.waitForFunction(() => /Thanh toán thành công/.test(document.querySelector('#dialog-title')?.textContent || ''), null, {timeout: 8000});
}
async function giuRoiXacNhan() {
  await page.locator('#hold').scrollIntoViewIfNeeded(); await page.locator('#hold').click();
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap], #confirm-payment', {timeout: 8000});
  if (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
  await page.waitForSelector('#confirm-payment', {timeout: 8000});
  await page.locator('#confirm-payment').click();
  await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan], #close-paid', {timeout: 8000});
  return (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) > 0;
}

await page.goto(target, {waitUntil: 'networkidle'});
await chonMotVeDung();
const otp1 = await giuRoiXacNhan();
ok('lần 1: hộp thoại OTP hiện', otp1);
if (otp1) await nhapOtp();
ok('lần 1: thanh toán thành công', /Thanh toán thành công/.test(await page.locator('#dialog-title').innerText().catch(() => '')));
await page.locator('#close-paid').click().catch(() => {});
await page.waitForTimeout(500);

await chonMotVeDung();
const otp2 = await giuRoiXacNhan();
ok('lần 2 (ngay sau lần 1): hộp thoại OTP hiện lại, không dùng lại OTP cũ', otp2);
ok('lần 2: chưa thanh toán khi chưa nhập OTP mới', !/Thanh toán thành công/.test(await page.locator('#dialog-title').innerText().catch(() => '')));
if (otp2) await nhapOtp();
ok('lần 2: nhập OTP mới thì thanh toán thành công', /Thanh toán thành công/.test(await page.locator('#dialog-title').innerText().catch(() => '')));
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail ? 1 : 0);
