#!/usr/bin/env node
/**
 * Kiểm tra giao diện thật (Chrome) luồng mua vé của Sprint 2 (giữ chỗ trước, OTP xác nhận thanh toán sau), chế độ MOCK:
 * xem và chọn ghế tự do (không cần đăng nhập) -> bấm "Giữ chỗ" -> chưa đăng nhập thì hộp thoại đăng nhập làm mờ nền
 * -> đăng nhập -> giữ chỗ thành công, đồng hồ 5 phút bắt đầu -> bấm "Xác nhận thanh toán" -> hộp thoại OTP (email nhận mã
 * đã che) -> nhập sai, rồi nhập đúng -> "Thanh toán thành công (mô phỏng)", ghế được ghi nhận, đồng hồ tắt.
 * Chạy với VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true; mọi yêu cầu tới *.supabase.co bị chặn.
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
if (!target) { console.error('Usage: checkout-flow.mjs <url sự kiện MOCK có sơ đồ BTC, vd .../events/autumn-arena-festival-2026> [mã khu, mặc định SEC_104; Super Concert: ZONE_A_T1]'); process.exit(2); }
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
let blocked = 0; page.route(/\.supabase\.co/, (r) => { blocked++; r.abort(); });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x='') => { if(!c) fail++; console.log((c?'PASS':'FAIL')+' - '+n+' '+x); };
await page.goto(target, {waitUntil:'networkidle'}); await page.waitForSelector('.et-tm-svg svg', {timeout: 15000}); await page.waitForTimeout(500);
ok('ẩn danh vẫn thấy sơ đồ (không bị chặn bởi cổng OTP)', (await page.locator('.et-tm-svg [data-zone-code]').count()) > 5);
await moKhu(page, process.argv[3] || 'SEC_104');
ok('chọn ghế được khi chưa đăng nhập: chấm ghế hiện trong khu', (await page.locator('.et-tm-dot[data-active=true]').count()) >= 6);
await chonGhe(page, 2); await page.waitForTimeout(300);
ok('chọn 2 ghế khi chưa đăng nhập', (await page.locator('.et-tm-dot[data-status=selected]').count()) === 2);
const label = (await page.locator('#hold').innerText()).replace(/\s+/g,' ');
ok('nút cuối là "Giữ chỗ 2 vé"', /Giữ chỗ 2 vé/.test(label), label);
ok('chưa có đồng hồ khi chưa giữ chỗ', (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 0);
await page.locator('#hold').scrollIntoViewIfNeeded(); await page.locator('#hold').click();
await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 6000}).catch(()=>{});
ok('bấm Giữ chỗ khi chưa đăng nhập: hiện hộp thoại đăng nhập làm mờ nền', (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) === 1);
await page.screenshot({path: `${out}/flow-1-dang-nhap.png`});
await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
await page.waitForSelector('#dialog-title', {timeout: 8000}).catch(()=>{});
const titleHeld = await page.locator('#dialog-title').innerText().catch(()=> '');
ok('đăng nhập xong: giữ chỗ thành công, KHÔNG hỏi OTP ở bước giữ chỗ', /Đã giữ chỗ thành công/.test(titleHeld) && (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 0, titleHeld);
const cd0 = await page.locator('#countdown').innerText().catch(()=> '');
ok('đồng hồ giữ chỗ 5 phút chạy ngay sau khi giữ chỗ', /0[0-5]:\d\d/.test(cd0), cd0);
ok('có nút Xác nhận thanh toán và Hủy giữ chỗ', (await page.locator('#confirm-payment').count()) === 1 && (await page.locator('#release').count()) === 1);
await page.screenshot({path: `${out}/flow-2-da-giu-cho.png`});
await page.locator('#confirm-payment').click();
await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan]', {timeout: 8000}).catch(()=>{});
ok('bấm Xác nhận thanh toán: hiện hộp thoại OTP', (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 1);
ok('ghế vẫn đang được giữ (đồng hồ trong bảng tóm tắt còn)', (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 1);
const desc = (await page.locator('#et-checkout-otp-desc').innerText().catch(()=> '')).replace(/\s+/g,' ');
ok('hộp thoại nêu email nhận mã (đã che)', /\*+.*@/.test(desc), desc);
await page.screenshot({path: `${out}/flow-3-otp.png`});
const send = page.getByRole('button', {name: /gửi mã/i}).first();
await send.click(); await page.waitForTimeout(700);
const input = page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first();
await input.fill('000000');
await page.getByRole('button', {name: /^xác minh/i}).first().click(); await page.waitForTimeout(700);
ok('mã sai bị từ chối, vẫn ở hộp thoại, ghế vẫn giữ', (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 1 && (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 1);
await page.screenshot({path: `${out}/flow-4-ma-sai-dem-nguoc.png`});
await input.fill('123456');
await page.getByRole('button', {name: /^xác minh/i}).first().click();
await page.waitForFunction(() => /Thanh toán thành công/.test(document.querySelector('#dialog-title')?.textContent || ''), null, {timeout: 8000}).catch(()=>{});
const titlePaid = await page.locator('#dialog-title').innerText().catch(()=> '');
ok('OTP đúng: hộp thoại OTP đóng và hiện "Thanh toán thành công (mô phỏng)"', /Thanh toán thành công \(mô phỏng\)/.test(titlePaid) && (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 0, titlePaid);
ok('sau thanh toán: đồng hồ giữ chỗ tắt', (await page.locator('#countdown').count()) === 0 && (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 0);
await page.screenshot({path: `${out}/flow-5-thanh-toan-thanh-cong.png`});
await page.locator('#close-paid').click(); await page.waitForTimeout(300);
ok('đóng thông báo: lựa chọn ghế được xóa, nút về "Chọn ghế"', (await page.locator('.et-tm-dot[data-status=selected]').count()) === 0 && /Chọn ghế để tiếp tục/.test(await page.locator('#hold').innerText()));
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
ok('không gọi Supabase', blocked === 0, String(blocked));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
