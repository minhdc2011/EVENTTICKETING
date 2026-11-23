#!/usr/bin/env node
/**
 * Đăng xuất khi đang giữ chỗ (Super Concert): đồng hồ ẩn, lựa chọn xóa, thông báo đã trả chỗ.
 * Chrome thật, chế độ MOCK (VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199); mọi yêu cầu tới *.supabase.co bị chặn.
 *   CHROME_PATH=<chrome.exe> OUT=<thư mục ảnh> node scripts/nfr/logout-hold-flow-super-concert.mjs
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'logout-hold-flow-super-concert-shots');
mkdirSync(out, {recursive: true});
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.route(/\.supabase\.co/, (r) => r.abort());
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x='') => { if(!c) fail++; console.log((c?'PASS':'FAIL')+' - '+n+' '+x); };
await page.goto('http://localhost:5199/events/super-concert-2026', {waitUntil:'networkidle'}); await page.waitForTimeout(1200);
await page.locator('#tab-zone-STANDING').scrollIntoViewIfNeeded(); await page.locator('#tab-zone-STANDING').click();
await page.locator('#map-standing-plus').click(); await page.locator('#map-standing-action').click(); await page.waitForTimeout(300);
await page.locator('#btn-proceed-booking').click();
await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]'); await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click();
await page.waitForSelector('[data-testid=hop-thoai-otp-thanh-toan]');
await page.getByRole('button', {name: /gửi mã/i}).first().click(); await page.waitForTimeout(600);
await page.locator('[data-testid=hop-thoai-otp-thanh-toan] input').first().fill('123456');
await page.getByRole('button', {name: /xác minh|xác nhận/i}).first().click();
await page.waitForTimeout(2200);
const holding = await page.evaluate(() => !document.getElementById('hold-timer-container').classList.contains('hidden'));
ok('Super Concert: đang giữ chỗ, có đồng hồ', holding);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.getByRole('button', {name: /Đăng xuất/}).or(page.getByRole('link', {name: /Đăng xuất/})).first().click(); await page.waitForTimeout(1200);
const st = await page.evaluate(() => ({timerHidden: document.getElementById('hold-timer-container').classList.contains('hidden'), label: document.querySelector('#btn-proceed-booking [data-proceed-label]').innerText, disabled: document.getElementById('btn-proceed-booking').disabled}));
ok('Đăng xuất: đồng hồ ẩn, nút về "Chọn ghế để tiếp tục", lựa chọn xóa', st.timerHidden && /Chọn ghế để tiếp tục/.test(st.label) && st.disabled, JSON.stringify(st));
ok('có thông báo đã trả chỗ', /đã đăng xuất nên chỗ đang giữ đã được trả lại/.test(await page.locator('body').innerText()));
ok('không lỗi JavaScript', errs.length === 0, errs.join('|'));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
