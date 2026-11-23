#!/usr/bin/env node
/**
 * Kiểm tra giao diện thật (Chrome) luồng mua vé mới của Sprint 2, chế độ MOCK:
 * xem và chọn ghế tự do (không cần đăng nhập) -> bấm "Thanh toán" -> chưa đăng nhập thì hộp thoại đăng nhập làm mờ nền
 * -> đăng nhập -> OTP gửi về email của tài khoản (hộp thoại làm mờ nền) -> nhập mã -> "Xác nhận thanh toán thành công"
 * kèm đồng hồ 5 phút. Chạy với VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true; mọi yêu cầu tới *.supabase.co bị chặn.
 *
 *   OUT=<thư mục ảnh> node scripts/nfr/checkout-flow-super-concert.mjs 
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
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
let blocked = 0; page.route(/\.supabase\.co/, (r) => { blocked++; r.abort(); });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x='') => { if(!c) fail++; console.log((c?'PASS':'FAIL')+' - '+n+' '+x); };
await page.goto('http://localhost:5199/events/super-concert-2026', {waitUntil:'networkidle'}); await page.waitForTimeout(1200);
ok('Super Concert: ẩn danh vẫn thấy sơ đồ', (await page.locator('#stadium-svg').count()) === 1);
await page.locator('#tab-zone-STANDING').scrollIntoViewIfNeeded(); await page.locator('#tab-zone-STANDING').click();
await page.locator('#map-standing-plus').click(); await page.locator('#map-standing-action').click(); await page.waitForTimeout(400);
const lab = (await page.locator('#btn-proceed-booking [data-proceed-label]').innerText()).replace(/\s+/g,' ');
ok('nút cuối là "Thanh toán 1 vé"', /Thanh toán 1 vé/.test(lab), lab);
ok('chưa có đồng hồ khi chưa thanh toán', await page.evaluate(() => document.getElementById('hold-timer-container').classList.contains('hidden')));
await page.locator('#btn-proceed-booking').click();
await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 6000}).catch(()=>{});
ok('chưa đăng nhập: hiện hộp thoại đăng nhập', (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) === 1);
await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan]', {timeout: 8000}).catch(()=>{});
ok('đăng nhập xong: hiện hộp thoại OTP', (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 1);
await page.getByRole('button', {name: /gửi mã/i}).first().click(); await page.waitForTimeout(700);
await page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first().fill('123456');
await page.getByRole('button', {name: /xác minh|xác nhận/i}).first().click();
await page.waitForTimeout(2500);
const dialogText = await page.locator('body').innerText();
ok('OTP đúng: hiện xác nhận thanh toán', /Xác nhận thanh toán thành công|xác nhận/i.test(dialogText) && (await page.locator('[data-testid=hop-thoai-otp-thanh-toan]').count()) === 0);
const timer = await page.evaluate(() => ({hidden: document.getElementById('hold-timer-container').classList.contains('hidden'), t: document.getElementById('hold-countdown').innerText}));
ok('đồng hồ 5 phút chạy sau khi xác nhận', !timer.hidden && /0[0-5]:\d\d/.test(timer.t), JSON.stringify(timer));
await page.screenshot({path: `${out}/flow-5-super-xac-nhan.png`});
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
ok('không gọi Supabase', blocked === 0, String(blocked));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
