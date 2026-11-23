#!/usr/bin/env node
/**
 * Bản đồ kiểu Ticketmaster của sơ đồ BTC (nhà hát / arena): ghế là chấm trên bản đồ, camera phóng vào khu, kéo để di chuyển,
 * nút làm mới / + / −, Ctrl + cuộn, bản đồ nhỏ, khung thông tin vé (Khu, Hàng, Ghế, giá, Thêm), dấu hiệu khi đủ vé, bàn phím.
 * Chrome thật, chế độ MOCK (VITE_USE_MOCK_DATA=true npx vite --port 5199); mọi yêu cầu tới *.supabase.co bị chặn.
 *   CHROME_PATH=<chrome.exe> OUT=<thư mục ảnh> node scripts/nfr/tm-map-flow.mjs [url sự kiện] [mã khu] [số vé tối đa]
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'tm-map-flow-shots');
mkdirSync(out, {recursive: true});
const url = process.argv[2] || 'http://localhost:5199/events/autumn-arena-festival-2026';
const zone = process.argv[3] || 'SEC_104';
const maxTickets = Number(process.argv[4] || 4); // giới hạn vé mỗi lượt của sự kiện (nhà hát: 2)

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
let blocked = 0;
page.route(/\.supabase\.co/, (r) => { blocked++; r.abort(); });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const ok = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + ' ' + x); };
const vb = () => page.evaluate(() => document.querySelector('.et-tm-svg svg').getAttribute('viewBox').split(' ').map(Number));
const count = (sel) => page.locator(sel).count();

async function moKhu() {
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate((c) => document.querySelector(`.et-tm-svg [data-zone-code="${c}"]`).dispatchEvent(new MouseEvent('click', {bubbles: true})), zone);
    if (await page.waitForSelector('.et-tm-map[data-focus-zone]', {timeout: 1500}).catch(() => null)) break;
  }
  await page.waitForTimeout(1500);
}

await page.goto(url, {waitUntil: 'networkidle'});
await page.waitForSelector('.et-tm-svg svg', {timeout: 20000});
await page.waitForTimeout(700);
const full = await vb();
ok('toàn cảnh: có nút làm mới/＋/−, bản đồ nhỏ và khung thông tin vé', (await count('.et-tm-controls button')) === 3 && (await count('.et-tm-mini')) === 1 && (await count('.et-ticket-panel')) === 1);
ok('toàn cảnh: chấm ghế còn ẩn (data-dots=off)', (await page.locator('.et-tm-map').getAttribute('data-dots')) === 'off');

// Bấm khu -> camera phóng vào khu
await moKhu();
const zoomed = await vb();
ok('bấm khu: camera phóng vào (khung nhìn nhỏ hơn toàn cảnh)', zoomed[2] < full[2] * 0.8, `${zoomed[2].toFixed(0)} / ${full[2]}`);
ok('khu đang mở: 40 chấm bấm được, chấm hiện ra', (await count('.et-tm-dot[data-active=true]')) >= 8 && (await page.locator('.et-tm-map').getAttribute('data-dots')) === 'on');
ok('khu đang chọn tô viền, khu xung quanh mờ', (await count('.et-tm-svg .is-focused')) === 1 && (await count('.et-tm-svg .is-dimmed')) >= 3);
await page.locator('.et-tm-card').scrollIntoViewIfNeeded();
await page.screenshot({path: `${out}/tm-1-phong-vao-khu.png`});

// Bấm chấm -> khung thông tin, bấm Thêm -> chọn
await page.locator('.et-tm-dot[data-active=true][data-status=available]').nth(3).click({force: true});
const info = (await page.locator('.et-ticket-panel').innerText()).replace(/\s+/g, ' ');
ok('bấm chấm: khung thông tin hiện Khu, Hàng, Ghế, giá và nút Thêm', /KHU/.test(info) && /HÀNG/.test(info) && /GHẾ/.test(info) && /\d{2,3}\.\d{3}/.test(info) && /Thêm vào lựa chọn/.test(info), info.slice(0, 120));
ok('bấm chấm chỉ xem thông tin, chưa chọn ghế', (await count('.et-tm-dot[data-status=selected]')) === 0);
await page.screenshot({path: `${out}/tm-2-thong-tin-ve.png`});
await page.locator('.et-ticket-panel__action').click();
await page.waitForTimeout(250);
ok('bấm Thêm: ghế thành chấm đen viền vàng, bảng tóm tắt cập nhật', (await count('.et-tm-dot[data-status=selected]')) === 1 && /Thanh toán 1 vé/.test(await page.locator('#hold').innerText()));
ok('khung thông tin đổi thành nút Bỏ chọn', /Bỏ chọn ghế này/.test(await page.locator('.et-ticket-panel__action').innerText()));

// Đủ vé -> dấu hiệu không chọn thêm
for (let i = 0; i < maxTickets - 1; i += 1) {
  await page.locator('.et-tm-dot[data-active=true][data-status=available]').first().click({force: true});
  await page.locator('.et-ticket-panel__action').click();
}
const nLimit = await count('.et-tm-dot[data-limit=true]');
const nFree = await count('.et-tm-dot[data-status=available]');
ok(`đủ ${maxTickets} vé: mọi chấm còn trống bị đánh dấu không chọn thêm được`, (await count('.et-tm-dot[data-status=selected]')) === maxTickets && nLimit > 0 && nLimit === nFree, `${nLimit}/${nFree}`);
await page.locator('.et-tm-dot[data-limit=true][data-active=true]').first().click({force: true});
await page.waitForTimeout(250);
ok('đủ vé: nút Thêm bị khóa và nêu lý do', (await page.locator('.et-ticket-panel__action').isDisabled()) && new RegExp(`đủ ${maxTickets} vé`).test(await page.locator('.et-ticket-panel').innerText()));
await page.screenshot({path: `${out}/tm-3-du-4-ve.png`});
await page.locator('.et-tm-dot[data-status=selected]').first().click({force: true});
await page.locator('.et-ticket-panel__action').click();
await page.waitForTimeout(200);
ok('bỏ chọn 1 ghế: dấu hiệu không chọn thêm biến mất', (await count('.et-tm-dot[data-limit=true]')) === 0);

// Nút điều khiển
const w0 = (await vb())[2];
await page.getByRole('button', {name: 'Phóng to'}).click();
await page.waitForTimeout(700);
const w1 = (await vb())[2];
await page.getByRole('button', {name: 'Thu nhỏ'}).click();
await page.waitForTimeout(700);
const w2 = (await vb())[2];
ok('nút + phóng to, nút − thu nhỏ', w1 < w0 * 0.8 && w2 > w1 * 1.2, `${w0.toFixed(0)} → ${w1.toFixed(0)} → ${w2.toFixed(0)}`);

// Ctrl + cuộn
const box = await page.locator('.et-tm-stage').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.down('Control');
await page.mouse.wheel(0, -400);
await page.keyboard.up('Control');
await page.waitForTimeout(400);
ok('Ctrl + cuộn thu phóng', (await vb())[2] < w2 * 0.9, String((await vb())[2].toFixed(0)));

// Kéo thả: đổi vị trí khung nhìn, không làm bấm nhầm ghế
const before = await vb();
const selBefore = await count('.et-tm-dot[data-status=selected]');
await page.mouse.move(box.x + 200, box.y + 300);
await page.mouse.down();
await page.mouse.move(box.x + 330, box.y + 380, {steps: 8});
await page.mouse.up();
await page.waitForTimeout(150);
const after = await vb();
ok('kéo thả di chuyển khung nhìn', Math.abs(after[0] - before[0]) > 1 || Math.abs(after[1] - before[1]) > 1, `${before[0].toFixed(0)},${before[1].toFixed(0)} → ${after[0].toFixed(0)},${after[1].toFixed(0)}`);
ok('kéo thả không chọn nhầm ghế', (await count('.et-tm-dot[data-status=selected]')) === selBefore);

// Bản đồ nhỏ: bấm để dịch camera
await page.locator('.et-tm-card').scrollIntoViewIfNeeded();
const mini = await page.locator('.et-tm-mini').boundingBox();
const vb3 = await vb();
await page.mouse.click(mini.x + mini.width * 0.2, mini.y + mini.height * 0.2);
await page.waitForTimeout(700);
const vb4 = await vb();
ok('bấm bản đồ nhỏ đưa camera tới điểm đó', Math.abs(vb4[0] - vb3[0]) > 5 || Math.abs(vb4[1] - vb3[1]) > 5);

// Làm mới
await page.getByRole('button', {name: /Làm mới/}).click();
await page.waitForTimeout(1100);
const vb5 = await vb();
ok('nút làm mới về toàn cảnh', Math.abs(vb5[2] - full[2]) < 2 && Math.abs(vb5[0] - full[0]) < 2);
ok('về toàn cảnh: lựa chọn ghế giữ nguyên', (await count('.et-tm-dot[data-status=selected]')) === maxTickets - 1 && new RegExp(`Thanh toán ${maxTickets - 1} vé`).test(await page.locator('#hold').innerText()));

// Thoát khu để xem toàn cảnh: nút làm mới, nút "Xem toàn cảnh", phím Escape
ok('nút làm mới khi đang ở trong khu: thoát khu, không còn khu tô viền/mờ và nút Xem toàn cảnh', (await count('.et-tm-svg .is-focused')) === 0 && (await count('.et-tm-svg .is-dimmed')) === 0 && (await count('.et-tm-exit')) === 0 && (await count('.et-tm-map[data-focus-zone]')) === 0);
await moKhu();
ok('vào khu: có nút "Xem toàn cảnh" rõ ràng', (await count('.et-tm-exit')) === 1);
await page.locator('.et-tm-exit').click();
await page.waitForTimeout(1100);
const vbExit = await vb();
ok('bấm "Xem toàn cảnh": về toàn cảnh, bỏ chọn khu', Math.abs(vbExit[2] - full[2]) < 2 && (await count('.et-tm-exit')) === 0 && (await count('.et-tm-svg .is-dimmed')) === 0);
await moKhu();
await page.locator('.et-tm-stage').focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(1100);
ok('phím Escape: thoát khu về toàn cảnh', Math.abs((await vb())[2] - full[2]) < 2 && (await count('.et-tm-exit')) === 0);
await moKhu();
await page.locator('.et-tm-dot[data-active=true][data-status=available]').first().focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(1100);
ok('phím Escape khi đang ở chấm ghế cũng thoát khu', (await count('.et-tm-exit')) === 0);

// Kéo chuột lan ra ngoài bản đồ: không bôi đen chữ, không bấm nhầm phần tử khác, trạng thái kéo được dọn
await moKhu();
await page.locator('.et-tm-card').scrollIntoViewIfNeeded();
const b2 = await page.locator('.et-tm-stage').boundingBox();
const summaryBox = await page.locator('#hold').boundingBox();
const selBefore2 = await count('.et-tm-dot[data-status=selected]');
const scrollBefore = await page.evaluate(() => window.scrollY);
await page.mouse.move(b2.x + 120, b2.y + 200);
await page.mouse.down();
await page.mouse.move(b2.x + b2.width + 60, b2.y + 260, {steps: 10});
await page.mouse.move(summaryBox.x + summaryBox.width / 2, summaryBox.y + summaryBox.height / 2, {steps: 10});
const dragging = await page.evaluate(() => document.body.classList.contains('et-tm-dragging'));
await page.mouse.up();
await page.waitForTimeout(200);
const sel = await page.evaluate(() => (window.getSelection()?.toString() ?? '').length);
ok('đang kéo: có lớp chặn bôi đen chữ trên toàn trang', dragging);
ok('kéo ra ngoài bản đồ rồi thả: không bôi đen chữ ở phần khác của trang', sel === 0, `độ dài chọn = ${sel}`);
ok('thả chuột lên nút Thanh toán không bấm nhầm (không mở hộp thoại)', (await count('[data-testid=hop-thoai-can-dang-nhap]')) === 0 && (await count('[data-testid=hop-thoai-otp-thanh-toan]')) === 0);
ok('kéo xong: lớp chặn bôi đen được dọn, lựa chọn và vị trí trang không đổi', !(await page.evaluate(() => document.body.classList.contains('et-tm-dragging'))) && (await count('.et-tm-dot[data-status=selected]')) === selBefore2 && Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore) < 3);
await page.locator('.et-tm-exit').click();
await page.waitForTimeout(900);

// Bàn phím trên chấm
await moKhu();
await page.locator('.et-tm-dot[data-active=true][data-status=available]').first().focus();
await page.keyboard.press('Enter');
ok('bàn phím: Enter trên chấm mở khung thông tin', /Thêm vào lựa chọn/.test(await page.locator('.et-ticket-panel').innerText()));
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
ok('không gọi Supabase', blocked === 0, String(blocked));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close();
process.exit(fail ? 1 : 0);
