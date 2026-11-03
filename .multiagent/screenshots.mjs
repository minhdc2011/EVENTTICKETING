// Before/after screenshots + objective layout audit for the director's review.
// Usage: node .multiagent/screenshots.mjs <outDir> <beforeBaseUrl> <afterBaseUrl>
// Writes <outDir>/{before,after}/<page>-<width>.png, audit.json per side, and <outDir>/audit-compare.txt
import {chromium} from 'playwright-core';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [outDir, beforeBase, afterBase] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(join(import.meta.dirname, 'pages.json'), 'utf8'));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const exe = join(root, d, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('No Chromium found: set CHROME_PATH or run `npx playwright install chromium`');
}

// Runs in the page: horizontal page scroll, elements past the right edge (outside intended scrollers),
// clipped text (ignoring .sr-only) and interactive targets smaller than 44px tall / 24px wide.
function audit() {
  const vw = document.documentElement.clientWidth;
  const sel = (el) => {
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : '');
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const all = [...document.body.querySelectorAll('*')].filter(visible);
  const overflowX = all.filter((el) => el.getBoundingClientRect().right > vw + 1 && !inScroller(el))
    .slice(0, 8).map((el) => `${sel(el)} right=${Math.round(el.getBoundingClientRect().right)}`);
  const clipped = all.filter((el) => {
    if (el.closest('.sr-only')) return false;
    const s = getComputedStyle(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    return hasText && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2;
  }).slice(0, 8).map((el) => `${sel(el)} "${el.textContent.trim().slice(0, 40)}"`);
  const smallTargets = all.filter((el) => el.matches('button,a[href],input:not([type=hidden]),select,[role=button]'))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 24; })
    .slice(0, 12).map((el) => { const r = el.getBoundingClientRect(); return `${sel(el)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
  const pageScrollX = Math.max(0, document.documentElement.scrollWidth - vw);
  return {pageScrollX, overflowX, clipped, smallTargets};
}

async function shoot(browser, label, base) {
  const dir = join(outDir, label);
  mkdirSync(dir, {recursive: true});
  const report = {};
  for (const [name, path] of Object.entries(cfg.pages)) {
    for (const w of cfg.widths) {
      const ctx = await browser.newContext({viewport: {width: w, height: w < 768 ? 780 : 900}});
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      try {
        await page.goto(base + path, {waitUntil: 'networkidle', timeout: 30000});
        await page.waitForTimeout(1200);
        await page.screenshot({path: join(dir, `${name}-${w}.png`), fullPage: true});
        report[`${name}-${w}`] = {...(await page.evaluate(audit)), errors};
      } catch (e) {
        report[`${name}-${w}`] = {error: String(e).slice(0, 200), errors};
      }
      await ctx.close();
    }
  }
  writeFileSync(join(dir, 'audit.json'), JSON.stringify(report, null, 1));
  return report;
}

const browser = await chromium.launch({executablePath: chromePath()});
const before = await shoot(browser, 'before', beforeBase);
const after = await shoot(browser, 'after', afterBase);
await browser.close();

const n = (v) => (Array.isArray(v) ? v.length : 0);
const lines = ['capture | pageScrollX | elements past right edge | clipped text | small targets | page errors   (before -> after)'];
const worse = [];
for (const k of Object.keys(after)) {
  const b = before[k] || {}, a = after[k];
  lines.push(`${k} | ${b.pageScrollX ?? '?'}->${a.pageScrollX ?? '?'} | ${n(b.overflowX)}->${n(a.overflowX)} | ` +
    `${n(b.clipped)}->${n(a.clipped)} | ${n(b.smallTargets)}->${n(a.smallTargets)} | ${n(b.errors)}->${n(a.errors)}` +
    (a.error ? ` | AFTER FAILED: ${a.error}` : ''));
  if ((a.pageScrollX || 0) > (b.pageScrollX || 0) || n(a.overflowX) > n(b.overflowX) || n(a.clipped) > n(b.clipped) ||
      n(a.smallTargets) > n(b.smallTargets) || n(a.errors) > n(b.errors) || a.error) worse.push(k);
}
lines.push('', worse.length ? `REGRESSIONS: ${worse.join(', ')}` : 'REGRESSIONS: none',
  'Elements inside overflow-x:auto/scroll containers and .sr-only text are not counted. Data: mock (VITE_USE_MOCK_DATA=true).');
writeFileSync(join(outDir, 'audit-compare.txt'), lines.join('\n'));
console.log(lines.join('\n'));
