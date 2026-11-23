#!/usr/bin/env node
/**
 * Kiểm tra giao diện thật (Chrome) hộp thoại "Cần đăng nhập để giữ ghế": bấm Giữ chỗ khi chưa đăng nhập, hộp thoại làm mờ nền,
 * bàn phím (bẫy focus, Escape), đăng nhập nhanh rồi TỰ tiếp tục giữ chỗ, và hiển thị ở 360 px. Chụp ảnh từng bước.
 *
 *   VITE_USE_MOCK_DATA=true VITE_DEMO_QUICK_LOGIN=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5198
 *   FAKE_NOW=2026-10-27T12:00:00+07:00 SHOT_DIR=<thư mục ảnh> node scripts/nfr/login-modal-flow.mjs http://localhost:5198/events/autumn-arena-festival-2026 [http://localhost:5198/events/super-concert-2026]
 *
 * AN TOÀN: chỉ chạy với bản MOCK. Mọi yêu cầu tới *.supabase.co bị chặn và script báo lỗi nếu có yêu cầu nào.
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');

const targetUrl = process.argv[2];
if (!targetUrl) { console.error('Usage: login-modal-flow.mjs <url của trang sự kiện MOCK>'); process.exit(2); }
const shotDir = process.env.SHOT_DIR || path.join(os.tmpdir(), 'login-modal-shots');
mkdirSync(shotDir, {recursive: true});

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
let failed = 0;
let blocked = 0;
const errors = [];
const step = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' ' + extra : ''));
};

async function openEventAndPressHold(page) {
  // Các sự kiện mô phỏng có cửa sổ bán vé cố định; FAKE_NOW (ISO) giả lập ngày để sự kiện còn mở bán, vd 2026-10-27T12:00:00+07:00.
  if (process.env.FAKE_NOW) await page.clock.install({time: new Date(process.env.FAKE_NOW)});
  await page.route(/\.supabase\.co/, (route) => { blocked += 1; return route.abort(); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(targetUrl, {waitUntil: 'networkidle'});
  await page.waitForSelector('#search');
  await page.locator('role=radio[name="Section 104"]').first().focus();
  await page.keyboard.press('Space');
  await page.waitForSelector('.et-seat');
  const seat = page.locator('.et-seat[aria-disabled=false]').first();
  await seat.scrollIntoViewIfNeeded();
  await seat.click();
  const hold = page.locator('#hold');
  await hold.scrollIntoViewIfNeeded();
  await hold.click();
}

// ---------- Máy tính để bàn 1280 px ----------
{
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await openEventAndPressHold(page);
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 8000}).catch(() => {});
  const modal = page.locator('[data-testid=hop-thoai-can-dang-nhap]');
  step('chưa đăng nhập mà bấm Giữ chỗ thì hiện hộp thoại "Cần đăng nhập"', (await modal.count()) === 1);
  const dlg = page.locator('[role=dialog][aria-labelledby=et-login-modal-title]');
  step('hộp thoại có role=dialog, aria-modal=true và tiêu đề', (await dlg.getAttribute('aria-modal')) === 'true' && /Cần đăng nhập/.test(await page.locator('#et-login-modal-title').innerText()));
  const backdrop = await modal.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter || '', pos: cs.position};
  });
  step('nền phía sau được làm mờ (phủ tối và blur)', backdrop.pos === 'fixed' && /blur/.test(backdrop.blur) && /rgba\(15, 23, 42/.test(backdrop.bg), JSON.stringify(backdrop));
  step('trang phía sau không cuộn được khi hộp thoại mở', (await page.evaluate(() => document.body.style.overflow)) === 'hidden');
  step('lựa chọn ghế vẫn được giữ', (await page.locator('.et-seat[aria-pressed=true]').count()) === 1);
  step('focus nằm trong hộp thoại', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  const inside = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    inside.push(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  }
  step('Tab không rời khỏi hộp thoại (bẫy focus)', inside.every(Boolean));
  await page.screenshot({path: path.join(shotDir, '01-hop-thoai-can-dang-nhap-1280.png')});

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  step('Escape đóng hộp thoại', (await modal.count()) === 0);
  step('lựa chọn ghế vẫn còn sau khi đóng', (await page.locator('.et-seat[aria-pressed=true]').count()) === 1);
  step('trang cuộn lại được sau khi đóng', (await page.evaluate(() => document.body.style.overflow)) !== 'hidden');

  await page.locator('#hold').click();
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 5000});
  const quick = page.locator('.et-login-modal__btn--primary', {hasText: 'Đăng nhập nhanh'});
  step('có nút "Đăng nhập nhanh: Người dùng demo"', (await quick.count()) === 1);
  await quick.click();
  await page.waitForSelector('[role=dialog]:not([aria-labelledby=et-login-modal-title])', {timeout: 10000}).catch(() => {});
  step('đăng nhập nhanh xong thì hộp thoại đóng', (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) === 0);
  const hoDlg = await page.locator('[role=dialog]').count();
  step('TỰ tiếp tục giữ chỗ: hộp thoại xác nhận giữ chỗ hiện ra, không phải bấm lại', hoDlg === 1);
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(shotDir, '02-sau-dang-nhap-nhanh-tiep-tuc-giu-cho-1280.png')});
  await page.close();
}

// ---------- Điện thoại 360 px ----------
{
  const page = await browser.newPage({viewport: {width: 360, height: 800}});
  await openEventAndPressHold(page);
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 8000}).catch(() => {});
  const card = page.locator('.et-login-modal__card');
  step('360 px: hộp thoại hiện', (await card.count()) === 1);
  const box = await card.boundingBox();
  step('360 px: hộp thoại nằm gọn trong màn hình', !!box && box.x >= 0 && box.x + box.width <= 360, JSON.stringify(box));
  step('360 px: trang không cuộn ngang', await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth));
  const buttons = await page.locator('.et-login-modal__btn').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  step('360 px: nút cao ít nhất 44 px (dễ chạm)', buttons.length > 0 && buttons.every((h) => h >= 44), buttons.join(','));
  await page.screenshot({path: path.join(shotDir, '03-hop-thoai-can-dang-nhap-360.png')});
  await page.close();
}

// ---------- Đăng nhập thường (sang trang đăng nhập rồi quay lại): khôi phục lựa chọn và tự tiếp tục ----------
{
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await openEventAndPressHold(page);
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 8000}).catch(() => {});
  await page.locator('a.et-login-modal__btn', {hasText: /^Đăng nhập$/}).click();
  await page.waitForSelector('input[type=email], input[name=email]', {timeout: 8000}).catch(() => {});
  step('đăng nhập thường: chuyển sang trang đăng nhập', (await page.locator('input[type=password]').count()) >= 1);
  await page.locator('input[type=email], input[name=email]').first().fill('buyer@demo.vn');
  await page.locator('input[type=password]').first().fill('Demo@12345');
  await page.locator('form button[type=submit]').first().click();
  await page.waitForSelector('#hold', {timeout: 15000}).catch(() => {});
  step('đăng nhập thường: quay lại đúng trang sự kiện', /autumn-arena-festival-2026/.test(page.url()));
  await page.waitForSelector('[role=dialog]', {timeout: 15000}).catch(() => {});
  step('đăng nhập thường: lựa chọn được khôi phục và TỰ tiếp tục giữ chỗ (hộp thoại xác nhận hiện ra)', (await page.locator('[role=dialog]').count()) === 1);
  await page.screenshot({path: path.join(shotDir, '06-dang-nhap-thuong-quay-lai-tiep-tuc-giu-cho-1280.png')});
  await page.close();
}

// ---------- Sơ đồ Super Concert (legacy), tùy chọn: tham số thứ 2 là URL sự kiện Super Concert ----------
const legacyUrl = process.argv[3];
if (legacyUrl) {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.route(/\.supabase\.co/, (route) => { blocked += 1; return route.abort(); });
  page.on('pageerror', (e) => errors.push(e.message));
  // Không giả lập đồng hồ ở sơ đồ legacy (runtime dùng nhiều bộ hẹn giờ); Super Concert mở bán đến 30/11/2026.
  await page.goto(legacyUrl, {waitUntil: 'networkidle'});
  await page.waitForTimeout(1500);
  await page.locator('#tab-zone-STANDING').click();
  await page.waitForTimeout(500);
  await page.locator('#map-standing-plus').click();
  await page.locator('#map-standing-action').click();
  const btn = page.locator('#btn-proceed-booking');
  step('Super Concert: chọn 1 vé đứng thì nút Giữ chỗ bật', await btn.isEnabled());
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForSelector('[data-testid=hop-thoai-can-dang-nhap]', {timeout: 8000}).catch(() => {});
  step('Super Concert: chưa đăng nhập mà bấm Giữ chỗ thì hiện hộp thoại "Cần đăng nhập"', (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) === 1);
  await page.screenshot({path: path.join(shotDir, '04-super-concert-hop-thoai-can-dang-nhap-1280.png')});
  await page.locator('.et-login-modal__btn--primary', {hasText: 'Đăng nhập nhanh'}).click();
  await page.waitForSelector('[role=dialog]:not([aria-labelledby=et-login-modal-title])', {timeout: 10000}).catch(() => {});
  step('Super Concert: đăng nhập nhanh xong thì hộp thoại đóng', (await page.locator('[data-testid=hop-thoai-can-dang-nhap]').count()) === 0);
  step('Super Concert: TỰ tiếp tục giữ chỗ (hộp thoại xác nhận giữ chỗ hiện ra)', (await page.locator('[role=dialog]').count()) === 1);
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(shotDir, '05-super-concert-sau-dang-nhap-nhanh-1280.png')});
  await page.close();
}

step('không có lỗi JavaScript trong trang', errors.length === 0, errors.join('|'));
step('không có yêu cầu nào tới Supabase (chỉ dữ liệu mock)', blocked === 0, String(blocked));
await browser.close();
console.log(failed === 0 ? 'TẤT CẢ ĐẠT' : `CÓ ${failed} BƯỚC KHÔNG ĐẠT`);
console.log('ảnh:', shotDir);
process.exit(failed === 0 ? 0 : 1);
