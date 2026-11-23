import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

import {resolvePurchaseLimits} from '../src/domain/purchaseLimits.js';
import {PurchaseLimitError, taoLoiVuotGioiHan} from '../src/domain/purchaseLimitError.js';
import {
  LIMIT_NOTICE_MIN_DURATION_MS,
  createPurchaseLimitNotice,
  describePurchaseLimits,
  formatLimitExplanation,
  formatSelectionCounter,
  isPurchaseLimitNoticeActive,
  shouldClearPurchaseLimitNotice,
} from '../src/domain/purchaseLimitPresentation.js';

const serverError = (gioiHan, dangGiu) => {
  const err = new Error('VUOT_GIOI_HAN_VE');
  err.code = '22023';
  err.details = JSON.stringify({gioiHan, dangGiu, conLai: Math.max(gioiHan - dangGiu, 0)});
  return err;
};

test('counter shows x/configuredMax with default 4 and sanitizes input', () => {
  assert.equal(formatSelectionCounter(0, null), 'Đã chọn 0/4 vé');
  assert.equal(formatSelectionCounter(3, resolvePurchaseLimits({maxTicketsPerOrder: 6})), 'Đã chọn 3/6 vé');
  assert.equal(formatSelectionCounter(-2, undefined), 'Đã chọn 0/4 vé');
  assert.equal(formatSelectionCounter(2, resolvePurchaseLimits({maxTicketsPerOrder: 2})), 'Đã chọn 2/2 vé');
});

test('configuredMax is separate from maxPerOrder = min(4, configuredMax)', () => {
  for (const [configured, perOrder] of [[2, 2], [4, 4], [8, 4]]) {
    const limits = resolvePurchaseLimits({maxTicketsPerOrder: configured});
    assert.equal(limits.configuredMax, configured);
    assert.equal(limits.maxPerOrder, perOrder);
    const text = formatLimitExplanation(limits);
    if (configured > 4) {
      assert.match(text, new RegExp(`${configured} vé`));
      assert.match(text, /mỗi lượt[^.]*tối đa 4 vé/);
      assert.equal(describePurchaseLimits(limits).differ, true);
    } else {
      assert.equal(text, null);
      assert.equal(describePurchaseLimits(limits).differ, false);
    }
  }
});

test('over-limit notice uses server numbers, never the client selection', () => {
  const notice = createPurchaseLimitNotice(serverError(6, 5), {nowMs: 1000});
  assert.equal(notice.gioiHan, 6);
  assert.equal(notice.dangGiu, 5);
  assert.equal(notice.conLai, 1);
  assert.match(notice.message, /tối đa 6 vé/);
  assert.match(notice.message, /còn có thể chọn thêm 1 vé/);
  // identical response -> identical numbers regardless of anything selected on the client
  assert.deepEqual(
    createPurchaseLimitNotice(serverError(6, 5), {nowMs: 1000}),
    notice,
  );
});

test('over-limit notice with invalid details is honest and invents no numbers', () => {
  const err = new Error('VUOT_GIOI_HAN_VE');
  err.code = '22023';
  err.details = 'garbage';
  const notice = createPurchaseLimitNotice(err, {nowMs: 0});
  assert.equal(notice.chiTietHopLe, false);
  assert.equal(notice.conLai, null);
  assert.equal(notice.gioiHan, null);
  assert.ok(notice.message.length > 0);
});

test('already normalized errors and other errors are handled', () => {
  const normalized = taoLoiVuotGioiHan({gioiHan: 4, dangGiu: 4, conLai: 0});
  assert.ok(normalized instanceof PurchaseLimitError);
  assert.match(createPurchaseLimitNotice(normalized).message, /không thể chọn thêm vé/i);
  assert.equal(createPurchaseLimitNotice(Object.assign(new Error('conflict'), {status: 409})), null);
  assert.equal(createPurchaseLimitNotice(null), null);
});

test('notice lives at least 5000ms on a fake clock and cannot be shortened', () => {
  assert.equal(LIMIT_NOTICE_MIN_DURATION_MS, 5000);
  const notice = createPurchaseLimitNotice(serverError(4, 4), {nowMs: 10_000, durationMs: 100});
  assert.equal(notice.shownAtMs, 10_000);
  assert.equal(notice.expiresAtMs, 15_000);
  for (const t of [10_000, 12_000, 14_999]) {
    assert.equal(isPurchaseLimitNoticeActive(notice, t), true);
    assert.equal(shouldClearPurchaseLimitNotice(notice, t), false);
  }
  assert.equal(shouldClearPurchaseLimitNotice(notice, 15_000), true);
  assert.equal(isPurchaseLimitNoticeActive(notice, 15_000), false);
  assert.equal(createPurchaseLimitNotice(serverError(4, 4), {nowMs: 0, durationMs: 9000}).expiresAtMs, 9000);
});

async function loadSelectionSummary() {
  const entry = fileURLToPath(new URL('../src/components/event-template/SelectionSummary.tsx', import.meta.url));
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: {'.css': 'empty'},
    plugins: [
      {
        name: 'resolve-react-esm',
        setup(b) {
          b.onResolve({filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/}, (args) => ({
            path: import.meta.resolve(args.path),
            external: true,
          }));
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

const seat = (id) => ({
  GheID: id,
  MaGheDayDu: `A-0${id}`,
  SoHang: 'A',
  SoGhe: String(id),
  TenKhuVuc: 'A',
  GiaVeNiemYet: 1000,
});

test('SelectionSummary renders the counter, two-limit note and a separate alert region', async () => {
  const {SelectionSummary} = await loadSelectionSummary();
  const base = {
    selectedSeats: [seat(1), seat(2)],
    standingLines: [{zoneCode: 'S', name: 'Standing', quantity: 1, price: 500}],
    standingTotal: 500,
    maxCap: 4,
    configuredMax: 6,
    saleOpen: true,
    isPending: false,
    hasActiveHold: false,
    isConnectionTrusted: true,
    onRemoveSeat() {},
    onClearAll() {},
    onProceedHold() {},
  };
  const html = renderToStaticMarkup(
    React.createElement(SelectionSummary, {
      ...base,
      limitExplanation: formatLimitExplanation({configuredMax: 6, maxPerOrder: 4}),
      limitNotice: createPurchaseLimitNotice(serverError(6, 5), {nowMs: 0}),
    }),
  );
  assert.match(html, /Đã chọn 3\/6 vé/);
  assert.match(html, /et-summary-limit-note/);
  assert.match(html, /data-od-id="purchase-limit-alert"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /còn có thể chọn thêm 1 vé/);
  assert.ok(html.indexOf('purchase-limit-alert') < html.indexOf('id="hold"'), 'alert sits above the hold button');

  const plain = renderToStaticMarkup(React.createElement(SelectionSummary, {...base, configuredMax: 4}));
  assert.match(plain, /Đã chọn 3\/4 vé/);
  assert.doesNotMatch(plain, /purchase-limit-alert|et-summary-limit-note/);
});

test('SeatMapSection keeps the per-order ceiling, isolates the notice and keeps the selection', async () => {
  const src = await readFile(new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url), 'utf8');
  assert.match(src, /limits\.maxPerOrder - standingCount/);
  assert.match(src, /configuredMax=\{limits\.configuredMax\}/);
  assert.match(src, /laLoiVuotGioiHan\(normalizedErr\)/);
  const branch = src.slice(src.indexOf('laLoiVuotGioiHan(normalizedErr)'));
  const limitBranch = branch.slice(0, branch.indexOf('console.error'));
  assert.match(limitBranch, /setLimitNotice\(notice\)/);
  assert.match(limitBranch, /return;/);
  assert.doesNotMatch(limitBranch, /setSelectedSeats|setStanding|setRealtimeBanner|dispatchToast/);
});

test('CSS wraps the counter and alert for 360px without touching concert SVG', async () => {
  const css = await readFile(new URL('../src/components/event-template/SeatMapSection.css', import.meta.url), 'utf8');
  const alert = css.match(/\.et-purchase-limit-alert \{[^}]*\}/)[0];
  assert.match(alert, /flex-wrap:\s*wrap/);
  assert.match(alert, /min-width:\s*0/);
  assert.match(alert, /overflow-wrap:\s*anywhere/);
  assert.match(css, /#selected-tickets-summary-card \.concert-summary-actions[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.et-purchase-limit-alert/);
  assert.doesNotMatch(css.slice(css.indexOf('.et-summary-limit-note'), css.indexOf('@media (max-width: 420px)')), /stadium-svg|oval-stadium-root/);
});

// ============================================================================
// Super Concert integration tests (seating.html + concertRuntime.js)
// ============================================================================

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function createConcertDomWithFakeTimers(seatingMarkup, initialNowMs = 1_700_000_000_000) {
  let nowMs = initialNowMs;
  let nextTimerId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const docListeners = new Map();
  const winListeners = new Map();

  class DomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = init.bubbles ?? true;
      this.cancelable = init.cancelable ?? true;
      this.key = init.key;
      this.clientX = init.clientX ?? 0;
      this.clientY = init.clientY ?? 0;
      this.detail = init.detail;
      this.defaultPrevented = false;
      this._stopped = false;
      this.target = null;
      this.currentTarget = null;
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {
      this._stopped = true;
    }
    stopImmediatePropagation() {
      this._stopped = true;
    }
  }

  class DomNode {
    constructor(nodeType, doc) {
      this.nodeType = nodeType;
      this.ownerDocument = doc;
      this.parentNode = null;
      this.childNodes = [];
      this._listeners = new Map();
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement || cur === doc) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    appendChild(child) {
      return this.insertBefore(child, null);
    }
    append(...nodes) {
      for (const node of nodes) {
        this.appendChild(typeof node === 'string' ? new DomText(node, this.ownerDocument) : node);
      }
    }
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (ref == null) this.childNodes.push(child);
      else {
        const idx = this.childNodes.indexOf(ref);
        if (idx >= 0) this.childNodes.splice(idx, 0, child);
        else this.childNodes.push(child);
      }
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    replaceChildren(...nodes) {
      for (const c of [...this.childNodes]) c.parentNode = null;
      this.childNodes = [];
      this.append(...nodes);
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      const path = [];
      for (let cur = this; cur; cur = cur.parentNode) path.push(cur);
      path.push(doc);
      for (const node of path) {
        if (event._stopped) break;
        event.currentTarget = node;
        const set = node === doc ? docListeners.get(event.type) : node._listeners.get(event.type);
        if (set) {
          for (const fn of [...set]) fn.call(node, event);
        }
        if (!event.bubbles) break;
      }
      return !event.defaultPrevented;
    }
  }

  class DomText extends DomNode {
    constructor(text, doc) {
      super(3, doc);
      this._text = String(text);
    }
    get textContent() {
      return this._text;
    }
    set textContent(v) {
      this._text = String(v);
    }
  }

  function toDataAttr(prop) {
    return 'data-' + String(prop).replace(/([A-Z])/g, (_, ch) => `-${ch.toLowerCase()}`);
  }
  function toDatasetProp(attr) {
    return attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  }

  function parseHtmlInto(parent, markup, docRef) {
    const stack = [parent];
    const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9:-]+)\s*>|<([a-zA-Z0-9:-]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|([^<]+)/g;
    let match;
    while ((match = tokenRe.exec(markup)) !== null) {
      const current = stack[stack.length - 1];
      if (match[0].startsWith('<!--')) continue;
      if (match[1]) {
        const closing = match[1].toLowerCase();
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i].tagName.toLowerCase() === closing) {
            stack.length = i;
            break;
          }
        }
        continue;
      }
      if (match[2]) {
        const tag = match[2];
        const lower = tag.toLowerCase();
        const ns = lower === 'svg' || current.namespaceURI === 'http://www.w3.org/2000/svg'
          ? 'http://www.w3.org/2000/svg'
          : 'http://www.w3.org/1999/xhtml';
        const el = new DomElement(tag, docRef, ns);
        const rawAttrs = match[3] || '';
        const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        let attrMatch;
        while ((attrMatch = attrRe.exec(rawAttrs)) !== null) {
          el.setAttribute(attrMatch[1], attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '');
        }
        current.appendChild(el);
        if (!match[4] && !VOID_TAGS.has(lower)) stack.push(el);
        continue;
      }
      if (match[5]) current.appendChild(new DomText(match[5], docRef));
    }
  }

  function splitSeq(seq) {
    const tokens = [];
    let i = 0;
    while (i < seq.length) {
      if (seq[i] === '[') {
        const end = seq.indexOf(']', i);
        tokens.push(seq.slice(i, end + 1));
        i = end + 1;
      } else if ('.#:'.includes(seq[i])) {
        let j = i + 1;
        while (j < seq.length && !'.#[:'.includes(seq[j])) j++;
        tokens.push(seq.slice(i, j));
        i = j;
      } else {
        let j = i;
        while (j < seq.length && !'.#[:'.includes(seq[j])) j++;
        tokens.push(seq.slice(i, j));
        i = j;
      }
    }
    return tokens;
  }

  function tokenizeSel(selector) {
    const parts = [];
    let i = 0;
    const s = selector.trim();
    while (i < s.length) {
      if (s[i] === '>' || s[i] === '+') {
        parts.push(s[i]);
        i++;
        while (i < s.length && /\s/.test(s[i])) i++;
        continue;
      }
      if (/\s/.test(s[i])) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] === '>' || s[i] === '+') continue;
        if (parts.length > 0 && parts[parts.length - 1] !== '>' && parts[parts.length - 1] !== '+') parts.push(' ');
        continue;
      }
      let start = i;
      while (i < s.length) {
        if (s[i] === '[') {
          const end = s.indexOf(']', i);
          i = end >= 0 ? end + 1 : s.length;
        } else if (/\s/.test(s[i]) || s[i] === '>' || s[i] === '+') break;
        else i++;
      }
      parts.push(s.slice(start, i));
    }
    return parts;
  }

  function matchesCompound(el, compound, scopeEl) {
    if (!el || el.nodeType !== 1) return false;
    for (const tok of splitSeq(compound)) {
      if (tok === ':scope') {
        if (el !== scopeEl) return false;
      } else if (tok === ':first-of-type') {
        const siblings = el.parentNode ? el.parentNode.children.filter((c) => c.tagName === el.tagName) : [];
        if (siblings[0] !== el) return false;
      } else if (tok === ':last-child') {
        const siblings = el.parentNode ? el.parentNode.children : [];
        if (siblings[siblings.length - 1] !== el) return false;
      } else if (tok.startsWith('#')) {
        if (el.id !== tok.slice(1)) return false;
      } else if (tok.startsWith('.')) {
        if (!el.classList.contains(tok.slice(1))) return false;
      } else if (tok.startsWith('[')) {
        const m = tok.match(/^\[([a-z0-9_-]+)(?:="([^"]*)")?\]$/i);
        if (!m) return false;
        const k = m[1].toLowerCase();
        if (!el.hasAttribute(k)) return false;
        if (m[2] !== undefined && (el.getAttribute(k) ?? '') !== m[2]) return false;
      } else if (el.tagName.toLowerCase() !== tok.toLowerCase()) {
        return false;
      }
    }
    return true;
  }

  function matchesTokens(el, tokens, idx, scopeEl) {
    if (!matchesCompound(el, tokens[idx], scopeEl)) return false;
    if (idx === 0) return true;
    const comb = tokens[idx - 1];
    if (comb === '>') return Boolean(el.parentElement && matchesTokens(el.parentElement, tokens, idx - 2, scopeEl));
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      if (matchesTokens(cur, tokens, idx - 2, scopeEl)) return true;
    }
    return false;
  }

  class DomElement extends DomNode {
    constructor(tag, docRef, ns = 'http://www.w3.org/1999/xhtml') {
      super(1, docRef);
      this.tagName = String(tag).toUpperCase();
      this.nodeName = this.tagName;
      this.namespaceURI = ns;
      this._attrs = new Map();
      this.style = {setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }};
      this.disabled = false;
      this.hidden = false;
      this.classList = {
        add: (...names) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          for (const n of names) if (n) set.add(n);
          this.className = [...set].join(' ');
        },
        remove: (...names) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          for (const n of names) set.delete(n);
          this.className = [...set].join(' ');
        },
        contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
        toggle: (name, force) => {
          const has = this.classList.contains(name);
          const next = force === undefined ? !has : Boolean(force);
          if (next) this.classList.add(name);
          else this.classList.remove(name);
          return next;
        },
      };
      this.dataset = new Proxy({}, {
        get: (_t, prop) => (typeof prop === 'string' && this._attrs.has(toDataAttr(prop)) ? this._attrs.get(toDataAttr(prop)) : undefined),
        set: (_t, prop, value) => { if (typeof prop === 'string') this.setAttribute(toDataAttr(prop), value); return true; },
        deleteProperty: (_t, prop) => { if (typeof prop === 'string') this.removeAttribute(toDataAttr(prop)); return true; },
      });
    }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get id() { return this._attrs.get('id') ?? ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this._attrs.get('class') ?? ''; }
    set className(v) { if (!v) this.removeAttribute('class'); else this.setAttribute('class', v); }
    get textContent() { return this.childNodes.map((c) => c.textContent ?? '').join(''); }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(new DomText(String(v), this.ownerDocument));
    }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    set innerHTML(markup) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (markup) parseHtmlInto(this, String(markup), this.ownerDocument);
    }
    get innerHTML() { return this.textContent; }
    setAttribute(name, value) {
      const k = String(name).toLowerCase();
      this._attrs.set(k, String(value));
      if (k === 'disabled') this.disabled = true;
      if (k === 'hidden') this.hidden = true;
    }
    getAttribute(name) { const k = String(name).toLowerCase(); return this._attrs.has(k) ? this._attrs.get(k) : null; }
    hasAttribute(name) { return this._attrs.has(String(name).toLowerCase()); }
    removeAttribute(name) {
      const k = String(name).toLowerCase();
      this._attrs.delete(k);
      if (k === 'disabled') this.disabled = false;
      if (k === 'hidden') this.hidden = false;
    }
    getBoundingClientRect() { return {left: 100, top: 100, right: 200, bottom: 200, width: 100, height: 100}; }
    scrollIntoView() {}
    beginElement() {}
    descendants() {
      const out = [];
      for (const c of this.children) out.push(c, ...c.descendants());
      return out;
    }
    querySelectorAll(selector) {
      const branches = String(selector).split(',').map(tokenizeSel).filter((t) => t.length > 0);
      return this.descendants().filter((el) => branches.some((tokens) => matchesTokens(el, tokens, tokens.length - 1, this)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  }

  const doc = {
    nodeType: 9,
    documentElement: null,
    body: null,
    defaultView: null,
    createElement: (tag) => new DomElement(tag, doc),
    createElementNS: (ns, tag) => new DomElement(tag, doc, ns),
    createTextNode: (t) => new DomText(t, doc),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { docListeners.get(type)?.delete(fn); },
    querySelectorAll: (sel) => doc.body.querySelectorAll(sel),
    querySelector: (sel) => doc.body.querySelector(sel),
    getElementById: (id) => doc.body.querySelector(`#${id}`),
  };

  const html = new DomElement('html', doc);
  const body = new DomElement('body', doc);
  html.appendChild(body);
  doc.documentElement = html;
  doc.body = body;

  const win = {
    document: doc,
    innerWidth: 1280,
    innerHeight: 800,
    setInterval(fn, ms) {
      const id = nextTimerId++;
      intervals.set(id, {fn, ms});
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn, ms = 0) {
      const id = nextTimerId++;
      timeouts.set(id, {fn, runAt: nowMs + Math.max(0, Number(ms) || 0)});
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); },
    matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { winListeners.get(type)?.delete(fn); },
    dispatchEvent(event) {
      const set = winListeners.get(event.type);
      if (set) for (const fn of [...set]) fn.call(win, event);
      return true;
    },
    HTMLElement: DomElement,
    SVGSVGElement: DomElement,
    SVGElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    Event: DomEvent,
    CustomEvent: DomEvent,
  };
  doc.defaultView = win;

  const mount = new DomElement('div', doc);
  mount.innerHTML = seatingMarkup;
  body.appendChild(mount);

  function advanceTime(deltaMs) {
    nowMs += deltaMs;
    while (true) {
      const due = [...timeouts.entries()]
        .filter(([, entry]) => entry.runAt <= nowMs)
        .sort((a, b) => a[1].runAt - b[1].runAt);
      if (due.length === 0) break;
      const [id, entry] = due[0];
      timeouts.delete(id);
      entry.fn();
    }
  }

  function click(el) {
    assert.ok(el, 'Element must exist for click');
    assert.equal(el.disabled, false, `Element must not be disabled: ${el.id || el.textContent}`);
    el.dispatchEvent(new DomEvent('click', {bubbles: true, cancelable: true}));
  }

  return {
    doc,
    win,
    body,
    DomEvent,
    click,
    advanceTime,
    now: () => nowMs,
    cleanupTimers() {
      timeouts.clear();
      intervals.clear();
    },
  };
}

let cachedConcertRuntime;
async function loadConcertRuntime() {
  if (!cachedConcertRuntime) {
    cachedConcertRuntime = (async () => {
      const entry = fileURLToPath(new URL('../src/legacy/concertRuntime.js', import.meta.url));
      const built = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        plugins: [
          {
            name: 'concert-limit-test-stubs',
            setup(b) {
              b.onResolve({filter: /services\/ticketDataService$/}, () => ({path: 'ticketDataService', namespace: 'cl-stub'}));
              b.onResolve({filter: /services\/bookingService$/}, () => ({path: 'bookingService', namespace: 'cl-stub'}));
              b.onResolve({filter: /services\/seatRealtimeService$/}, () => ({path: 'seatRealtimeService', namespace: 'cl-stub'}));
              b.onResolve({filter: /services\/priceRealtimeService$/}, () => ({path: 'priceRealtimeService', namespace: 'cl-stub'}));
              b.onResolve({filter: /services\/purchaseConfigService$/}, () => ({path: 'purchaseConfigService', namespace: 'cl-stub'}));
              b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'cl-stub'}));

              b.onLoad({filter: /^ticketDataService$/, namespace: 'cl-stub'}, () => ({
                contents: `export const loadTicketingCatalog = (...args) => globalThis.__CONCERT_LIMIT_MOCK__.loadTicketingCatalog(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^bookingService$/, namespace: 'cl-stub'}, () => ({
                contents: `
                  export const createSeatHold = (...args) => globalThis.__CONCERT_LIMIT_MOCK__.createSeatHold(...args);
                  export const releaseSeatHold = (...args) => globalThis.__CONCERT_LIMIT_MOCK__.releaseSeatHold(...args);
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^seatRealtimeService$/, namespace: 'cl-stub'}, () => ({
                contents: `export const subscribeToSeatUpdates = (...args) => globalThis.__CONCERT_LIMIT_MOCK__.subscribeToSeatUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^priceRealtimeService$/, namespace: 'cl-stub'}, () => ({
                contents: `export const subscribeToPriceUpdates = (...args) => globalThis.__CONCERT_LIMIT_MOCK__.subscribeToPriceUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^purchaseConfigService$/, namespace: 'cl-stub'}, () => ({
                contents: `export const docCauHinhMuaVe = (...args) => globalThis.__CONCERT_LIMIT_MOCK__.docCauHinhMuaVe(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^runtime$/, namespace: 'cl-stub'}, () => ({
                contents: `
                  export const runtimeConfig = {useMockData: false, eventId: 'super-concert-2026'};
                  export const isSupabaseConfigured = () => false;
                  export const getActiveEventContext = () => ({eventDatabaseId: 1, showId: 10});
                `,
                loader: 'js',
              }));
            },
          },
        ],
      });
      return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`);
    })();
  }
  return cachedConcertRuntime;
}

function makeConcertCatalog() {
  return {
    zones: [
      {KhuVucID: 1, MaKhuVuc: 'VVIP_DIAMOND', TenKhuVuc: 'VVIP Diamond Lounge', GiaVeNiemYet: 4_500_000, MauSacHex: '#D500F9'},
      {KhuVucID: 2, MaKhuVuc: 'VIP_PLATINUM_1', TenKhuVuc: 'VIP Platinum 1', GiaVeNiemYet: 3_500_000, MauSacHex: '#2979FF'},
      {KhuVucID: 4, MaKhuVuc: 'GA_STAND_1', TenKhuVuc: 'GA Fanzone Standing 1 (Khu A)', GiaVeNiemYet: 2_200_000, MauSacHex: '#00E676'},
      {KhuVucID: 5, MaKhuVuc: 'GA_STAND_2', TenKhuVuc: 'GA Fanzone Standing 2 (Khu B)', GiaVeNiemYet: 1_800_000, MauSacHex: '#76FF03'},
      {KhuVucID: 6, MaKhuVuc: 'ZONE_A_T1', TenKhuVuc: 'Khán đài A Tầng 1', GiaVeNiemYet: 1_500_000, MauSacHex: '#FF9100'},
      {KhuVucID: 7, MaKhuVuc: 'ZONE_B_T2', TenKhuVuc: 'Khán đài B Tầng 2', GiaVeNiemYet: 1_200_000, MauSacHex: '#FFC400'},
      {KhuVucID: 8, MaKhuVuc: 'ZONE_CD_UP', TenKhuVuc: 'Khán đài C-D Tầng cao', GiaVeNiemYet: 800_000, MauSacHex: '#90A4AE'},
    ],
    seats: [
      {GheID: 1, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '01', MaGheDayDu: 'VVIP-A-01', TrangThai: 'TRONG', GiaVeNiemYet: 4_500_000},
      {GheID: 2, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '02', MaGheDayDu: 'VVIP-A-02', TrangThai: 'TRONG', GiaVeNiemYet: 4_500_000},
      {GheID: 3, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '03', MaGheDayDu: 'VVIP-A-03', TrangThai: 'TRONG', GiaVeNiemYet: 4_500_000},
      {GheID: 4, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '04', MaGheDayDu: 'VVIP-A-04', TrangThai: 'TRONG', GiaVeNiemYet: 4_500_000},
      {GheID: 5, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '05', MaGheDayDu: 'VVIP-A-05', TrangThai: 'DA_BAN', GiaVeNiemYet: 4_500_000},
      {GheID: 13, KhuVucID: 2, TenKhuVuc: 'VIP Platinum 1', SoHang: 'C', SoGhe: '01', MaGheDayDu: 'VIP1-C-01', TrangThai: 'TRONG', GiaVeNiemYet: 3_500_000},
    ],
  };
}

async function runWithConcertRuntime({config = {soVeToiDaMoiDon: 4, thoiGianGiuChoPhut: 5}, createSeatHold} = {}, fn) {
  const seatingMarkup = await readFile(new URL('../src/legacy/fragments/seating.html', import.meta.url), 'utf8');
  const dom = createConcertDomWithFakeTimers(seatingMarkup);
  dom.body.dataset.saleStatus = 'ON_SALE';

  const toasts = [];
  let seatCallback = null;
  let priceCallback = null;
  const onToast = (e) => toasts.push(e.detail);
  dom.win.addEventListener('eventticketing:toast', onToast);

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    SVGSVGElement: globalThis.SVGSVGElement,
    IntersectionObserver: globalThis.IntersectionObserver,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    dateNow: Date.now,
    mock: globalThis.__CONCERT_LIMIT_MOCK__,
  };

  globalThis.window = dom.win;
  globalThis.document = dom.doc;
  globalThis.SVGSVGElement = dom.win.SVGSVGElement;
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.CustomEvent = dom.win.CustomEvent;
  globalThis.Event = dom.win.Event;
  globalThis.setTimeout = dom.win.setTimeout;
  globalThis.clearTimeout = dom.win.clearTimeout;
  globalThis.setInterval = dom.win.setInterval;
  globalThis.clearInterval = dom.win.clearInterval;
  Date.now = dom.now;

  globalThis.__CONCERT_LIMIT_MOCK__ = {
    loadTicketingCatalog: async () => makeConcertCatalog(),
    createSeatHold: createSeatHold || (async () => ({holdId: 'h-1', expiresAt: new Date(dom.now() + 300_000).toISOString(), items: []})),
    releaseSeatHold: async () => ({ok: true}),
    subscribeToSeatUpdates: (onEvent, onStatus) => {
      seatCallback = onEvent;
      onStatus?.('CONNECTED');
      return () => { seatCallback = null; };
    },
    subscribeToPriceUpdates: (onEvent, onStatus) => {
      priceCallback = onEvent;
      onStatus?.('CONNECTED');
      return () => { priceCallback = null; };
    },
    docCauHinhMuaVe: async () => {
      if (config instanceof Error) throw config;
      return config;
    },
  };

  const runtime = await loadConcertRuntime();
  try {
    await runtime.initConcertRuntime();
    await fn({
      dom,
      runtime,
      toasts,
      emitSeatUpdate: (ev) => seatCallback?.(ev),
      emitPriceUpdate: (ev) => priceCallback?.(ev),
    });
  } finally {
    runtime.teardownConcertRuntime();
    dom.cleanupTimers();
    dom.win.removeEventListener('eventticketing:toast', onToast);
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.SVGSVGElement = prev.SVGSVGElement;
    globalThis.IntersectionObserver = prev.IntersectionObserver;
    globalThis.CustomEvent = prev.CustomEvent;
    globalThis.Event = prev.Event;
    globalThis.setTimeout = prev.setTimeout;
    globalThis.clearTimeout = prev.clearTimeout;
    globalThis.setInterval = prev.setInterval;
    globalThis.clearInterval = prev.clearInterval;
    Date.now = prev.dateNow;
    globalThis.__CONCERT_LIMIT_MOCK__ = prev.mock;
  }
}

test('Super Concert: counter tracks seated + standing against configuredMax while clamping per-order at min(4, configuredMax)', async () => {
  await runWithConcertRuntime({config: {soVeToiDaMoiDon: 6, thoiGianGiuChoPhut: 5}}, async ({dom, toasts}) => {
    const summaryCount = dom.doc.getElementById('summary-count');
    const limitNote = dom.doc.getElementById('concert-limit-note');
    const subcopy = dom.doc.getElementById('concert-seatmap-subcopy');

    assert.equal(summaryCount.textContent, 'Đã chọn 0/6 vé');
    assert.equal(limitNote.classList.contains('hidden'), false);
    assert.match(limitNote.textContent, /6 vé.*tối đa 4 vé/);
    assert.match(subcopy.textContent, /giữ tối đa 4 vé/);

    // Select 1 seated ticket
    dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
    dom.advanceTime(400);
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-01"]'));
    dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
    assert.equal(summaryCount.textContent, 'Đã chọn 1/6 vé');

    // Add 2 standing tickets (must not double-count standingTickets inside selectedSeatIds)
    dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
    dom.advanceTime(400);
    dom.click(dom.doc.getElementById('map-standing-plus'));
    dom.click(dom.doc.getElementById('map-standing-plus'));
    dom.click(dom.doc.getElementById('map-standing-action'));
    assert.equal(summaryCount.textContent, 'Đã chọn 3/6 vé');

    // Remove 1 standing ticket
    dom.click(dom.doc.querySelector('[data-remove-ticket-id="GA1-STAND-01"]'));
    assert.equal(summaryCount.textContent, 'Đã chọn 2/6 vé');

    // Select 2 more seated tickets to reach the per-selection ceiling of min(4, 6) = 4
    dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
    dom.advanceTime(400);
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-02"]'));
    dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
    dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
    assert.equal(summaryCount.textContent, 'Đã chọn 4/6 vé');

    // 5th seat is blocked by min(4, 6) = 4 and explains both limits
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-04"]'));
    assert.equal(summaryCount.textContent, 'Đã chọn 4/6 vé');
    // Khung thông tin vé giải thích cả hai giới hạn và khóa nút Thêm (thay cho thông báo nổi trước đây).
    assert.equal(dom.doc.getElementById('map-seat-action').disabled, true);
    assert.match(dom.doc.getElementById('map-selection-panel').textContent, /tối đa 4 vé.*6 vé/);

    // Clear all resets counter
    dom.click(dom.doc.getElementById('btn-clear-all-seats'));
    assert.equal(summaryCount.textContent, 'Đã chọn 0/6 vé');
  });

  // When config load fails, falls back cleanly to default 4
  await runWithConcertRuntime({config: new Error('network down')}, async ({dom}) => {
    assert.equal(dom.doc.getElementById('summary-count').textContent, 'Đã chọn 0/4 vé');
    assert.equal(dom.doc.getElementById('concert-limit-note').classList.contains('hidden'), true);
  });

  // When configuredMax = 2 (< 4), ceiling is min(4, 2) = 2 and note stays hidden
  await runWithConcertRuntime({config: {soVeToiDaMoiDon: 2, thoiGianGiuChoPhut: 5}}, async ({dom}) => {
    assert.equal(dom.doc.getElementById('summary-count').textContent, 'Đã chọn 0/2 vé');
    assert.equal(dom.doc.getElementById('concert-limit-note').classList.contains('hidden'), true);
    dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
    dom.advanceTime(400);
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-01"]'));
    dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-02"]'));
    dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
    dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
    // Ghế thứ 3 vượt giới hạn 2: khung thông tin vé khóa nút Thêm, lựa chọn giữ nguyên.
    assert.equal(dom.doc.getElementById('map-seat-action').disabled, true);
    assert.equal(dom.doc.getElementById('summary-count').textContent, 'Đã chọn 2/2 vé');
  });
});

test('Super Concert: VUOT_GIOI_HAN_VE shows server numbers in dedicated alert for >= 5s, survives toasts/realtime, and keeps selection', async () => {
  let rejectNextHoldWith = serverError(6, 5);
  await runWithConcertRuntime(
    {
      config: {soVeToiDaMoiDon: 6, thoiGianGiuChoPhut: 5},
      createSeatHold: async () => {
        throw rejectNextHoldWith;
      },
    },
    async ({dom, runtime, toasts, emitSeatUpdate, emitPriceUpdate}) => {
      // Select 2 seated + 1 standing (total 3; server will report dangGiu=5, conLai=1)
      dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
      dom.advanceTime(400);
      dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-01"]'));
      dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
      dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-02"]'));
      dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
      dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
      dom.advanceTime(400);
      dom.click(dom.doc.getElementById('map-standing-plus'));
      dom.click(dom.doc.getElementById('map-standing-action'));

      const summaryCount = dom.doc.getElementById('summary-count');
      const alertEl = dom.doc.getElementById('concert-purchase-limit-alert');
      const proceedBtn = dom.doc.getElementById('btn-proceed-booking');
      assert.equal(summaryCount.textContent, 'Đã chọn 3/6 vé');
      assert.equal(alertEl.getAttribute('role'), 'alert');
      assert.equal(alertEl.getAttribute('aria-live'), 'polite');
      assert.equal(alertEl.getAttribute('data-od-id'), 'purchase-limit-alert');

      // Ensure alert sits above #btn-proceed-booking in seating.html
      const seatingHtml = await readFile(new URL('../src/legacy/fragments/seating.html', import.meta.url), 'utf8');
      assert.ok(seatingHtml.includes('id="stadium-svg"') && seatingHtml.includes('id="oval-stadium-root"'));
      assert.ok(
        seatingHtml.indexOf('id="concert-purchase-limit-alert"') < seatingHtml.indexOf('id="btn-proceed-booking"'),
        'alert sits above hold CTA',
      );

      const toastCountBeforeHold = toasts.length;
      dom.click(proceedBtn);
      await new Promise((r) => setImmediate(r));

      // Alert displays server gioiHan=6, dangGiu=5, conLai=1 (NOT derived 6-3=3)
      assert.equal(alertEl.classList.contains('hidden'), false);
      assert.match(alertEl.textContent, /tối đa 6 vé/);
      assert.match(alertEl.textContent, /đang giữ 5 vé/);
      assert.match(alertEl.textContent, /còn có thể chọn thêm 1 vé/);
      // No generic hold failure toast
      assert.equal(toasts.length, toastCountBeforeHold);
      // Selection is preserved so the user can adjust
      assert.equal(summaryCount.textContent, 'Đã chọn 3/6 vé');
      assert.equal(dom.doc.querySelectorAll('#selected-seats-list [data-selected-ticket]').length, 3);
      assert.equal(proceedBtn.disabled, false);

      // Interrupt with another toast, realtime seat update, and price update before 5s
      dom.advanceTime(2500);
      emitSeatUpdate({seatCode: 'VVIP-A-04', seatId: 4, status: 'DA_BAN'});
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 4_800_000});
      dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
      dom.advanceTime(400);
      dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
      dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
      assert.match(toasts.at(-1).message, /Đã chọn ghế VVIP-A-03/);
      assert.equal(alertEl.classList.contains('hidden'), false);
      assert.match(alertEl.textContent, /còn có thể chọn thêm 1 vé/);

      // At 4999ms total elapsed (2500 + 400 + 2099 = 4999ms), notice is still visible
      dom.advanceTime(2099);
      assert.equal(alertEl.classList.contains('hidden'), false);

      // Crossing 5000ms auto-dismisses the notice
      dom.advanceTime(2);
      assert.equal(alertEl.classList.contains('hidden'), true);
      assert.equal(alertEl.textContent, '');

      // Non-limit errors still use the existing generic toast flow without showing the limit alert
      rejectNextHoldWith = Object.assign(new Error('conflict'), {status: 409});
      dom.click(proceedBtn);
      await new Promise((r) => setImmediate(r));
      assert.equal(alertEl.classList.contains('hidden'), true);
      assert.match(toasts.at(-1).message, /Không thể giữ chỗ lúc này/);

      // Teardown while a limit notice is active clears it cleanly
      rejectNextHoldWith = serverError(6, 6);
      dom.click(proceedBtn);
      await new Promise((r) => setImmediate(r));
      assert.equal(alertEl.classList.contains('hidden'), false);
      runtime.teardownConcertRuntime();
      assert.equal(alertEl.classList.contains('hidden'), true);
    },
  );
});
