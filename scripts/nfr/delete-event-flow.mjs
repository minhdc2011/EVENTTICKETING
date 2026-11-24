#!/usr/bin/env node
/**
 * BTC xóa sự kiện (xóa mềm), chế độ MOCK, Chrome thật: bản nháp và sự kiện đã kết thúc xóa được (có hộp xác nhận),
 * sự kiện đang bán chưa kết thúc thì nút Xóa bị khóa. Phần cưỡng chế thật nằm ở máy chủ (pgTAP sprint2_xoa_mem_su_kien.sql).
 *   VITE_USE_MOCK_DATA=true npx vite --port 5199
 *   CHROME_PATH=<chrome.exe> node scripts/nfr/delete-event-flow.mjs [url gốc]
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const out = process.env.OUT || path.join(os.tmpdir(), 'delete-event-shots');
mkdirSync(out, {recursive: true});
const base = (process.argv[2] || 'http://localhost:5199').replace(/\/$/, '');
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.route(/\.supabase\.co/, (r) => r.abort());
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + ' ' + x); };
const day = 86_400_000;
const mk = (id, name, status, startOffset, endOffset) => ({
  id, organizationId: 'mock-org-1', name, slug: `su-kien-${id}`, status, category: 'AM_NHAC',
  startsAt: new Date(Date.now() + startOffset * day).toISOString(), endsAt: new Date(Date.now() + endOffset * day).toISOString(), showCount: 1,
});
await page.addInitScript((events) => {
  localStorage.setItem('eventticketing:mock-organizer-session', 'organizer@demo.vn');
  localStorage.setItem('eventticketing:mock-organizer-events', JSON.stringify(events));
}, [mk(9001, 'Bản nháp thử xóa', 'BAN_NHAP', 10, 11), mk(9002, 'Đang bán chưa kết thúc', 'CONG_KHAI', 10, 11), mk(9003, 'Đã kết thúc thử xóa', 'CONG_KHAI', -5, -4)]);
await page.goto(`${base}/organizer`, {waitUntil: 'networkidle'});
await page.waitForSelector('.org-event-card', {timeout: 15000});
const card = (name) => page.locator('.org-event-card', {hasText: name});
const delBtn = (name) => card(name).getByRole('button', {name: /^Xóa$/});
ok('thấy cả 3 sự kiện', (await page.locator('.org-event-card').count()) === 3);
ok('bản nháp: nút Xóa bấm được', !(await delBtn('Bản nháp thử xóa').isDisabled()));
ok('đã kết thúc: nút Xóa bấm được', !(await delBtn('Đã kết thúc thử xóa').isDisabled()));
ok('đang bán chưa kết thúc: nút Xóa bị khóa', await delBtn('Đang bán chưa kết thúc').isDisabled());
await delBtn('Đã kết thúc thử xóa').click();
ok('hiện hộp xác nhận xóa', (await page.getByText(/Xóa sự kiện .*Đã kết thúc thử xóa/).count()) >= 1);
await page.screenshot({path: `${out}/xac-nhan-xoa.png`});
await page.getByRole('button', {name: /Xác nhận xóa/}).click();
await page.waitForTimeout(800);
ok('sau khi xóa: sự kiện biến mất khỏi danh sách', (await card('Đã kết thúc thử xóa').count()) === 0 && (await page.locator('.org-event-card').count()) === 2);
ok('có thông báo đã xóa', /Đã xóa sự kiện/.test(await page.locator('body').innerText()));
await delBtn('Bản nháp thử xóa').click();
await page.getByRole('button', {name: /^Hủy$/}).click();
ok('bấm Hủy: sự kiện vẫn còn', (await card('Bản nháp thử xóa').count()) === 1);
ok('không lỗi JavaScript', errs.length === 0, errs.join(' | '));
console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
await browser.close(); process.exit(fail ? 1 : 0);
