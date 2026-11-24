#!/usr/bin/env node
/**
 * Mã demo thay OTP (giao diện): chỉ tài khoản @demo.vn nhập được chữ vào ô OTP; mã có chữ được gửi lên máy chủ kiểm
 * (không đi qua Supabase Auth). Ở chế độ MOCK không có máy chủ nên mã bị từ chối: kiểm việc nối giao diện
 * (nhận chữ, gửi mã, báo "Mã không đúng", mở lại hộp thoại OTP, ghế vẫn giữ). Phần kiểm thật ở máy chủ nằm trong pgTAP
 * supabase/tests/sprint2_ma_demo_otp.sql.
 *
 *   VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199
 *   node scripts/nfr/demo-code-flow.mjs [url sự kiện]
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'demo-code-flow-shots');
mkdirSync(out, {recursive: true});
const target = process.argv[2] || 'http://localhost:5199/events/autumn-arena-festival-2026';
async function moKhu(page, code) {
  // Chờ SVG và bộ xử lý bấm được gắn xong; thử lại nếu bấm quá sớm. Bấm thẳng vào phần tử vì tâm hộp bao của khu hình vành nằm ở chỗ trống.
  await page.waitForSelector('.et-tm-svg svg', {timeout: 15000});
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate((c) => document.querySelector(`.et-tm-svg [data-zone-code="${c}"]`).dispatchEvent(new MouseEvent('click', {bubbles: true})), code);
    if (await page.waitForSelector('.et-tm-map[data-focus-zone]', {timeout: 1500}).catch(() => null)) break;
  }
  await page.waitForTimeout(1500);
}
async function chonGhe(page, n) {
  // Bấm một chấm ghế (mở khung thông tin) rồi bấm Thêm vào lựa chọn.
  for (let i = 0; i < n; i += 1) {
    await page.locator('.et-tm-dot[data-active=true][data-status=available]').first().click({force: true});
    await page.locator('.et-ticket-panel__action').click();
    await page.waitForTimeout(150);
  }
}
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.route(/\.supabase\.co/, (r) => r.abort());
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x='') => { if(!c) fail++; console.log((c?'PASS':'FAIL')+' - '+n+' '+x); };
await page.goto(target, {waitUntil:'networkidle'}); await page.waitForSelector('.et-tm-svg svg', {timeout: 15000});
await moKhu(page, 'SEC_104'); await chonGhe(page, 2);
await page.locator('#hold').scrollIntoViewIfNeeded(); await page.locator('#hold').click();
await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 6000});
await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
await page.waitForSelector('#confirm-payment', {timeout: 8000});
await page.locator('#confirm-payment').click();
await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan]', {timeout: 8000});
const input = page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first();
await input.fill('abcd1234');
ok('tài khoản demo nhập được chữ vào ô OTP', (await input.inputValue()) === 'abcd1234', await input.inputValue());
ok('ô nhập vẫn che mã (type=password)', (await input.getAttribute('type')) === 'password');
ok('có thể bấm Xác minh khi nhập mã demo (không cần bấm Gửi mã trước)', !(await page.getByRole('button', {name: /^xác minh/i}).first().isDisabled()));
await page.getByRole('button', {name: /^xác minh/i}).first().click();
await page.waitForTimeout(1200);
ok('mã bị máy chủ từ chối: hộp thoại OTP mở lại và ghế vẫn đang được giữ', (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 1 && (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 1);
ok('có thông báo mã không đúng', /Mã không đúng/.test(await page.locator('body').innerText()));
await page.screenshot({path: `${out}/ma-demo-bi-tu-choi.png`});
// OTP số bình thường vẫn chạy
const input2 = page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first();
await page.getByRole('button', {name: /gửi mã/i}).first().click(); await page.waitForTimeout(600);
await input2.fill('123456');
await page.getByRole('button', {name: /^xác minh/i}).first().click();
await page.waitForFunction(() => /Thanh toán thành công/.test(document.querySelector('#dialog-title')?.textContent || ''), null, {timeout: 8000}).catch(()=>{});
ok('OTP số vẫn xác nhận thanh toán bình thường sau khi mã demo bị từ chối', /Thanh toán thành công/.test(await page.locator('#dialog-title').innerText().catch(()=> '')));
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
