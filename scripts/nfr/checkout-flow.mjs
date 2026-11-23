#!/usr/bin/env node
/**
 * Kiểm tra giao diện thật (Chrome) luồng mua vé mới của Sprint 2, chế độ MOCK:
 * xem và chọn ghế tự do (không cần đăng nhập) -> bấm "Thanh toán" -> chưa đăng nhập thì hộp thoại đăng nhập làm mờ nền
 * -> đăng nhập -> OTP gửi về email của tài khoản (hộp thoại làm mờ nền) -> nhập mã -> "Xác nhận thanh toán thành công"
 * kèm đồng hồ 5 phút. Chạy với VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true; mọi yêu cầu tới *.supabase.co bị chặn.
 *
 *   OUT=<thư mục ảnh> node scripts/nfr/checkout-flow.mjs http://localhost:5199/events/autumn-arena-festival-2026
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'checkout-flow-shots');
mkdirSync(out, {recursive: true});
const target = process.argv[2];
if (!target) { console.error('Usage: checkout-flow.mjs <url sự kiện MOCK có sơ đồ BTC, vd .../events/autumn-arena-festival-2026>'); process.exit(2); }
async function moKhu(page, code) {
  // Chờ SVG và bộ xử lý bấm được gắn xong; thử lại nếu bấm quá sớm.
  await page.waitForSelector('.et-tm-svg svg', {timeout: 15000});
  for (let i = 0; i < 5; i += 1) {
    await page.locator(`.et-tm-svg [data-zone-code="${code}"]`).first().click({force: true});
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
let blocked = 0; page.route(/\.supabase\.co/, (r) => { blocked++; r.abort(); });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x='') => { if(!c) fail++; console.log((c?'PASS':'FAIL')+' - '+n+' '+x); };
await page.goto(target, {waitUntil:'networkidle'}); await page.waitForSelector('.et-tm-svg svg', {timeout: 15000}); await page.waitForTimeout(500);
ok('ẩn danh vẫn thấy sơ đồ (không bị chặn bởi cổng OTP)', (await page.locator('.et-tm-svg [data-zone-code]').count()) > 5);
await moKhu(page, 'SEC_104');
ok('chọn ghế được khi chưa đăng nhập: chấm ghế hiện trong khu', (await page.locator('.et-tm-dot[data-active=true]').count()) >= 20);
await chonGhe(page, 2); await page.waitForTimeout(300);
ok('chọn 2 ghế khi chưa đăng nhập', (await page.locator('.et-tm-dot[data-status=selected]').count()) === 2);
const label = (await page.locator('#hold').innerText()).replace(/\s+/g,' ');
ok('nút cuối là "Thanh toán 2 vé"', /Thanh toán 2 vé/.test(label), label);
ok('chưa có đồng hồ khi chưa thanh toán', (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 0);
await page.locator('#hold').scrollIntoViewIfNeeded(); await page.locator('#hold').click();
await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 6000}).catch(()=>{});
ok('bấm Thanh toán khi chưa đăng nhập: hiện hộp thoại đăng nhập làm mờ nền', (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) === 1);
await page.screenshot({path: `${out}/flow-1-dang-nhap.png`});
await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan]', {timeout: 8000}).catch(()=>{});
ok('đăng nhập xong: hiện hộp thoại OTP (chưa giữ chỗ)', (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 1);
ok('lựa chọn ghế vẫn còn sau đăng nhập', (await page.locator('.et-tm-dot[data-status=selected]').count()) === 2);
const desc = (await page.locator('#et-checkout-otp-desc').innerText().catch(()=> '')).replace(/\s+/g,' ');
ok('hộp thoại nêu email nhận mã (đã che)', /\*+.*@/.test(desc), desc);
await page.screenshot({path: `${out}/flow-2-otp.png`});
// gui ma
const send = page.getByRole('button', {name: /gửi mã/i}).first();
console.log('nút gửi mã:', await send.count());
await send.click(); await page.waitForTimeout(700);
const input = page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first();
await input.fill('000000');
await page.getByRole('button', {name: /xác minh|xác nhận/i}).first().click(); await page.waitForTimeout(700);
ok('mã sai bị từ chối, vẫn ở hộp thoại', (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 1 && (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 0);
await page.screenshot({path: `${out}/flow-3-ma-sai.png`});
await input.fill('123456');
await page.getByRole('button', {name: /xác minh|xác nhận/i}).first().click();
await page.waitForSelector('#dialog-title', {timeout: 8000}).catch(()=>{});
const title = await page.locator('#dialog-title').innerText().catch(()=> '');
ok('OTP đúng: hộp thoại OTP đóng và hiện "Xác nhận thanh toán thành công"', /Xác nhận thanh toán thành công/.test(title) && (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 0, title);
const cd = await page.locator('#countdown').innerText().catch(()=> '');
ok('có đồng hồ đếm ngược 5 phút', /0[0-5]:\d\d/.test(cd), cd);
await page.screenshot({path: `${out}/flow-4-xac-nhan.png`});
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
ok('không gọi Supabase', blocked === 0, String(blocked));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
