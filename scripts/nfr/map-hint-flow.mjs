#!/usr/bin/env node
/** Gợi ý thao tác sơ đồ lần đầu (UT-04): hiện lần đầu, đóng thì không hiện lại sau khi tải lại trang. Chế độ MOCK, Chrome thật. */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../.multiagent/package.json'));
const {chromium} = require('playwright-core');
const url = process.argv[2] || 'http://localhost:5199/events/autumn-arena-festival-2026';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
await page.route(/supabase\.co/, (r) => r.abort());
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail++; };
await page.goto(url); await page.waitForSelector('[data-testid="so-do-kieu-ticketmaster"]', {timeout: 30000});
check(await page.locator('[data-testid="goi-y-so-do"]').count() === 1, 'lần đầu: gợi ý hiện');
await page.getByRole('button', {name: /Đã hiểu/}).click();
check(await page.locator('[data-testid="goi-y-so-do"]').count() === 0, 'bấm Đã hiểu: gợi ý ẩn');
await page.reload(); await page.waitForSelector('[data-testid="so-do-kieu-ticketmaster"]', {timeout: 30000});
check(await page.locator('[data-testid="goi-y-so-do"]').count() === 0, 'tải lại: không hiện lại');
await browser.close();
process.exit(fail ? 1 : 0);
