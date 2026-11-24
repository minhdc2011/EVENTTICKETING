#!/usr/bin/env node
/**
 * Đăng xuất khi đang giữ chỗ (sơ đồ BTC): trả chỗ lại, về trạng thái chưa giữ, giữ lại được đủ vé ở lượt mới.
 * Chrome thật, chế độ MOCK (VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true npx vite --port 5199); mọi yêu cầu tới *.supabase.co bị chặn.
 *   CHROME_PATH=<chrome.exe> OUT=<thư mục ảnh> node scripts/nfr/logout-hold-flow.mjs [url sự kiện] [mã khu]   (Super Concert: .../events/super-concert-2026 ZONE_A_T1)
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'logout-hold-flow-shots');
mkdirSync(out, {recursive: true});
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
async function giuCho(n) {
  await chonGhe(page, n);
  await page.locator('#hold').scrollIntoViewIfNeeded(); await page.locator('#hold').click();
  const needLogin = page.locator('[data-testid=hop-thoai-can-dang-nhap]');
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap], #dialog-title', {timeout: 8000});
  if (await needLogin.count()) { await page.getByRole('button', {name: /Đăng nhập nhanh/}).first().click(); }
  await page.waitForSelector('#dialog-title', {timeout: 8000});
}
await page.goto(process.argv[2] || 'http://localhost:5199/events/autumn-arena-festival-2026', {waitUntil:'networkidle'});
await page.waitForSelector('.et-tm-svg svg'); await page.waitForTimeout(500);
await moKhu(page, process.argv[3] || 'SEC_104');
await giuCho(2);
ok('đã giữ chỗ và có đồng hồ', /Đã giữ chỗ thành công/.test(await page.locator('#dialog-title').innerText()));
await page.locator('#close-dialog').click(); await page.waitForTimeout(300);
ok('đang giữ chỗ: đồng hồ trong bảng tóm tắt', (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 1);
// Đăng xuất qua nút trên thanh đầu trang
await page.getByRole('button', {name: /Đăng xuất/}).or(page.getByRole('link', {name: /Đăng xuất/})).first().click();
await page.waitForTimeout(1200);
ok('đăng xuất: không còn đồng hồ giữ chỗ', (await page.locator('[data-testid=dong-ho-giu-cho]').count()) === 0);
ok('đăng xuất: hộp thoại xác nhận đóng', (await page.locator('#dialog-title').count()) === 0);
ok('đăng xuất: lựa chọn ghế bị xóa, về trạng thái chưa giữ', (await page.locator('.et-tm-dot[data-status=selected]').count()) === 0 && /Chọn ghế để tiếp tục/.test(await page.locator('#hold').innerText()));
const txt = await page.locator('body').innerText();
ok('có thông báo đã trả chỗ', /đã đăng xuất nên chỗ đang giữ đã được trả lại/.test(txt));
await page.screenshot({path: `${out}/dang-xuat-tra-cho.png`});
// Chỗ đã thật sự được trả: đăng nhập lại và giữ đủ 4 vé thành công (nếu hold cũ chưa trả, 2 + 4 > 4 sẽ bị từ chối)
await giuCho(4);
ok('chỗ cũ đã được trả: giữ đủ 4 vé ở lượt mới thành công', /Đã giữ chỗ thành công/.test(await page.locator('#dialog-title').innerText()));
ok('không lỗi JavaScript', errs.length === 0, errs.join('|'));
ok('không gọi Supabase', blocked === 0, String(blocked));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail?1:0);
