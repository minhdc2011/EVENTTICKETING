import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const SEATING_HTML_URL = new URL('../src/legacy/fragments/seating.html', import.meta.url);
const CONCERT_RUNTIME_URL = new URL('../src/legacy/concertRuntime.js', import.meta.url);

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function createConcertTestDom(seatingMarkup = '') {
  const nativeSetInterval = globalThis.setInterval;
  const nativeClearInterval = globalThis.clearInterval;
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const docListeners = new Map();
  const winListeners = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  let nextTimerId = 1;

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
    get firstChild() {
      return this.childNodes[0] ?? null;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] ?? null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
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
      this.nodeName = '#text';
      this._text = String(text);
    }
    get textContent() {
      return this._text;
    }
    set textContent(v) {
      this._text = String(v);
    }
  }

  class DomComment extends DomNode {
    constructor(text, doc) {
      super(8, doc);
      this.nodeName = '#comment';
      this.data = String(text);
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
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          el.setAttribute(attrName, attrVal);
        }
        current.appendChild(el);
        const selfClosing = Boolean(match[4]) || VOID_TAGS.has(lower);
        if (!selfClosing) stack.push(el);
        continue;
      }
      if (match[5]) {
        current.appendChild(new DomText(match[5], docRef));
      }
    }
  }

  function splitSelectorSequence(seq) {
    const tokens = [];
    let i = 0;
    while (i < seq.length) {
      if (seq[i] === '[') {
        const end = seq.indexOf(']', i);
        tokens.push(seq.slice(i, end + 1));
        i = end + 1;
      } else if (seq[i] === ':' || seq[i] === '.' || seq[i] === '#') {
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

  function tokenizeSelector(selector) {
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
        if (parts.length > 0 && parts[parts.length - 1] !== '>' && parts[parts.length - 1] !== '+') {
          parts.push(' ');
        }
        continue;
      }
      let start = i;
      while (i < s.length) {
        if (s[i] === '[') {
          const end = s.indexOf(']', i);
          i = end >= 0 ? end + 1 : s.length;
        } else if (/\s/.test(s[i]) || s[i] === '>' || s[i] === '+') {
          break;
        } else {
          i++;
        }
      }
      parts.push(s.slice(start, i));
    }
    return parts;
  }

  function matchesCompound(el, compound, scopeEl) {
    if (!el || el.nodeType !== 1) return false;
    const tokens = splitSelectorSequence(compound);
    for (const tok of tokens) {
      if (tok === ':scope') {
        if (el !== scopeEl) return false;
      } else if (tok === ':first-child') {
        const siblings = el.parentNode ? el.parentNode.children : [];
        if (siblings[0] !== el) return false;
      } else if (tok === ':last-child') {
        const siblings = el.parentNode ? el.parentNode.children : [];
        if (siblings[siblings.length - 1] !== el) return false;
      } else if (tok === ':first-of-type') {
        const siblings = el.parentNode
          ? el.parentNode.children.filter((c) => c.tagName.toLowerCase() === el.tagName.toLowerCase())
          : [];
        if (siblings[0] !== el) return false;
      } else if (tok.startsWith('#')) {
        if (el.id !== tok.slice(1)) return false;
      } else if (tok.startsWith('.')) {
        if (!el.classList.contains(tok.slice(1))) return false;
      } else if (tok.startsWith('[')) {
        const m = tok.match(/^\[([a-z0-9_-]+)(?:(\^?=)"([^"]*)")?\]$/i);
        if (!m) return false;
        const [, attr, op, expected] = m;
        const k = attr.toLowerCase();
        if (!el.hasAttribute(k)) return false;
        if (op) {
          const actual = el.getAttribute(k) ?? '';
          if (op === '^=' ? !actual.startsWith(expected) : actual !== expected) return false;
        }
      } else {
        if (el.tagName.toLowerCase() !== tok.toLowerCase()) return false;
      }
    }
    return true;
  }

  function matchesTokens(el, tokens, idx, scopeEl) {
    if (!matchesCompound(el, tokens[idx], scopeEl)) return false;
    if (idx === 0) return true;
    const comb = tokens[idx - 1];
    if (comb === '>') {
      return Boolean(el.parentElement && matchesTokens(el.parentElement, tokens, idx - 2, scopeEl));
    }
    if (comb === '+') {
      const siblings = el.parentNode ? el.parentNode.children : [];
      const pos = siblings.indexOf(el);
      return pos > 0 && matchesTokens(siblings[pos - 1], tokens, idx - 2, scopeEl);
    }
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
      this.style = {
        setProperty(k, v) {
          this[k] = v;
        },
        removeProperty(k) {
          delete this[k];
        },
      };
      this.disabled = false;
      this.hidden = false;
      this._value = '';
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
      this.dataset = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (typeof prop !== 'string') return undefined;
            const key = toDataAttr(prop);
            return this._attrs.has(key) ? this._attrs.get(key) : undefined;
          },
          set: (_target, prop, value) => {
            if (typeof prop === 'string') {
              this.setAttribute(toDataAttr(prop), value);
            }
            return true;
          },
          deleteProperty: (_target, prop) => {
            if (typeof prop === 'string') {
              this.removeAttribute(toDataAttr(prop));
            }
            return true;
          },
          ownKeys: () => [...this._attrs.keys()].filter((k) => k.startsWith('data-')).map(toDatasetProp),
          getOwnPropertyDescriptor: (_target, prop) => {
            if (typeof prop !== 'string') return undefined;
            const key = toDataAttr(prop);
            if (!this._attrs.has(key)) return undefined;
            return {enumerable: true, configurable: true, value: this._attrs.get(key)};
          },
        },
      );
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get id() {
      return this._attrs.get('id') ?? '';
    }
    set id(v) {
      this.setAttribute('id', v);
    }
    get className() {
      return this._attrs.get('class') ?? '';
    }
    set className(v) {
      if (v === '' || v == null) this.removeAttribute('class');
      else this.setAttribute('class', v);
    }
    get value() {
      return this._value;
    }
    set value(v) {
      this._value = String(v ?? '');
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent ?? '').join('');
    }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(new DomText(String(v), this.ownerDocument));
    }
    get innerText() {
      return this.textContent;
    }
    set innerText(v) {
      this.textContent = v;
    }
    set innerHTML(markup) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (markup) parseHtmlInto(this, String(markup), this.ownerDocument);
    }
    get innerHTML() {
      return this.textContent;
    }
    setAttribute(name, value) {
      const k = String(name).toLowerCase();
      this._attrs.set(k, String(value));
      if (k === 'disabled') this.disabled = true;
      if (k === 'hidden') this.hidden = true;
    }
    getAttribute(name) {
      const k = String(name).toLowerCase();
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    hasAttribute(name) {
      return this._attrs.has(String(name).toLowerCase());
    }
    removeAttribute(name) {
      const k = String(name).toLowerCase();
      this._attrs.delete(k);
      if (k === 'disabled') this.disabled = false;
      if (k === 'hidden') this.hidden = false;
    }
    getBoundingClientRect() {
      return {left: 100, top: 100, right: 200, bottom: 200, width: 100, height: 100};
    }
    scrollIntoView() {}
    beginElement() {}
    descendants() {
      const out = [];
      for (const c of this.children) out.push(c, ...c.descendants());
      return out;
    }
    querySelectorAll(selector) {
      const branches = String(selector).split(',').map(tokenizeSelector).filter((t) => t.length > 0);
      const out = [];
      for (const el of this.descendants()) {
        if (branches.some((tokens) => matchesTokens(el, tokens, tokens.length - 1, this))) {
          out.push(el);
        }
      }
      return out;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
  }

  const doc = {
    nodeType: 9,
    activeElement: null,
    documentElement: null,
    body: null,
    defaultView: null,
    createElement: (tag) => new DomElement(tag, doc),
    createElementNS: (ns, tag) => new DomElement(tag, doc, ns),
    createTextNode: (t) => new DomText(t, doc),
    createComment: (t) => new DomComment(t, doc),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    querySelectorAll: (sel) => doc.body.querySelectorAll(sel),
    querySelector: (sel) => doc.body.querySelector(sel),
    getElementById: (id) => doc.body.querySelector(`#${id}`),
  };

  const html = new DomElement('html', doc);
  const body = new DomElement('body', doc);
  html.appendChild(body);
  doc.documentElement = html;
  doc.body = body;
  doc.activeElement = body;

  const win = {
    document: doc,
    innerWidth: 1280,
    innerHeight: 800,
    setInterval(fn, ms) {
      const id = nextTimerId++;
      const handle = nativeSetInterval(fn, ms);
      intervals.set(id, {fn, ms, handle});
      return id;
    },
    clearInterval(id) {
      const entry = intervals.get(id);
      if (entry) {
        nativeClearInterval(entry.handle);
        intervals.delete(id);
      }
    },
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      const handle = nativeSetTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.set(id, {fn, ms, handle});
      return id;
    },
    clearTimeout(id) {
      const entry = timeouts.get(id);
      if (entry) {
        nativeClearTimeout(entry.handle);
        timeouts.delete(id);
      }
    },
    matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      const set = winListeners.get(event.type);
      if (set) {
        for (const fn of [...set]) fn.call(win, event);
      }
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

  if (seatingMarkup) {
    const mount = new DomElement('div', doc);
    mount.innerHTML = seatingMarkup;
    body.appendChild(mount);
  }

  function click(el, extra = {}) {
    assert.ok(el, 'Không tìm thấy phần tử để click');
    assert.equal(el.disabled, false, `Phần tử đang bị disabled: ${el.id || el.textContent}`);
    el.dispatchEvent(new DomEvent('click', {bubbles: true, cancelable: true, ...extra}));
  }

  function dispatchMouse(el, type, {clientX = 120, clientY = 240} = {}) {
    assert.ok(el, `Không tìm thấy phần tử cho ${type}`);
    el.dispatchEvent(new DomEvent(type, {bubbles: false, cancelable: true, clientX, clientY}));
  }

  function tickIntervals(ms) {
    for (const entry of [...intervals.values()]) {
      if (entry.ms === ms) entry.fn();
    }
  }

  function flushTimeouts() {
    for (const [id, entry] of [...timeouts.entries()]) {
      nativeClearTimeout(entry.handle);
      timeouts.delete(id);
      entry.fn();
    }
  }

  function cleanupAllTimers() {
    for (const id of [...intervals.keys()]) win.clearInterval(id);
    for (const id of [...timeouts.keys()]) win.clearTimeout(id);
  }

  return {doc, win, body, click, dispatchMouse, tickIntervals, flushTimeouts, cleanupAllTimers, DomEvent};
}

function makeCatalog() {
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
      {GheID: 2, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '02', MaGheDayDu: 'VVIP-A-02', TrangThai: 'DA_BAN', GiaVeNiemYet: 4_500_000},
      {GheID: 3, KhuVucID: 1, TenKhuVuc: 'VVIP Diamond Lounge', SoHang: 'A', SoGhe: '03', MaGheDayDu: 'VVIP-A-03', TrangThai: 'TRONG', GiaVeNiemYet: 4_500_000},
      {GheID: 13, KhuVucID: 2, TenKhuVuc: 'VIP Platinum 1', SoHang: 'C', SoGhe: '01', MaGheDayDu: 'VIP1-C-01', TrangThai: 'TRONG', GiaVeNiemYet: 3_500_000},
      {GheID: 25, KhuVucID: 6, TenKhuVuc: 'Khán đài A Tầng 1', SoHang: 'E', SoGhe: '01', MaGheDayDu: 'KDA-E-01', TrangThai: 'TRONG', GiaVeNiemYet: 1_500_000},
      {GheID: 37, KhuVucID: 7, TenKhuVuc: 'Khán đài B Tầng 2', SoHang: 'G', SoGhe: '01', MaGheDayDu: 'KDB-G-01', TrangThai: 'TRONG', GiaVeNiemYet: 1_200_000},
    ],
  };
}

let cachedRuntimeLoader = null;
async function loadConcertRuntimeWithStubs() {
  if (!cachedRuntimeLoader) {
    cachedRuntimeLoader = (async () => {
      const entry = fileURLToPath(CONCERT_RUNTIME_URL);
      const built = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        plugins: [
          {
            name: 'concert-runtime-stubs',
            setup(b) {
              b.onResolve({filter: /services\/ticketDataService$/}, () => ({path: 'ticketDataService', namespace: 'concert-stub'}));
              b.onResolve({filter: /services\/bookingService$/}, () => ({path: 'bookingService', namespace: 'concert-stub'}));
              b.onResolve({filter: /services\/seatRealtimeService$/}, () => ({path: 'seatRealtimeService', namespace: 'concert-stub'}));
              b.onResolve({filter: /services\/priceRealtimeService$/}, () => ({path: 'priceRealtimeService', namespace: 'concert-stub'}));
              b.onResolve({filter: /services\/purchaseConfigService$/}, () => ({path: 'purchaseConfigService', namespace: 'concert-stub'}));
              b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'concert-stub'}));

              b.onLoad({filter: /^ticketDataService$/, namespace: 'concert-stub'}, () => ({
                contents: `export const loadTicketingCatalog = (...args) => globalThis.__CONCERT_TEST_MOCK__.loadTicketingCatalog(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^bookingService$/, namespace: 'concert-stub'}, () => ({
                contents: `
                  export const createSeatHold = (...args) => globalThis.__CONCERT_TEST_MOCK__.createSeatHold(...args);
                  export const releaseSeatHold = (...args) => globalThis.__CONCERT_TEST_MOCK__.releaseSeatHold(...args);
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^seatRealtimeService$/, namespace: 'concert-stub'}, () => ({
                contents: `export const subscribeToSeatUpdates = (...args) => globalThis.__CONCERT_TEST_MOCK__.subscribeToSeatUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^priceRealtimeService$/, namespace: 'concert-stub'}, () => ({
                contents: `export const subscribeToPriceUpdates = (...args) => globalThis.__CONCERT_TEST_MOCK__.subscribeToPriceUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^purchaseConfigService$/, namespace: 'concert-stub'}, () => ({
                contents: `export const docCauHinhMuaVe = (...args) => globalThis.__CONCERT_TEST_MOCK__.docCauHinhMuaVe?.(...args) ?? Promise.resolve({soVeToiDaMoiDon: 4, thoiGianGiuChoPhut: 5});`,
                loader: 'js',
              }));
              b.onLoad({filter: /^runtime$/, namespace: 'concert-stub'}, () => ({
                contents: `
                  export const runtimeConfig = {useMockData: false, eventId: 'super-concert-2026'};
                  export const isSupabaseConfigured = () => false;
                  export const getActiveEventContext = () => globalThis.__CONCERT_TEST_MOCK__.getActiveEventContext();
                `,
                loader: 'js',
              }));
            },
          },
        ],
      });
      const dataUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
      return import(dataUrl);
    })();
  }
  return cachedRuntimeLoader;
}

async function withConcertRuntime({mockOverrides = {}, saleStatus = 'ON_SALE', extraHtml = ''} = {}, fn) {
  const seatingMarkup = await readFile(SEATING_HTML_URL, 'utf8');
  const dom = createConcertTestDom(seatingMarkup + extraHtml);
  dom.body.dataset.saleStatus = saleStatus;

  const priceSubscribers = new Set();
  const seatSubscribers = new Set();
  let priceSubscribeCount = 0;
  let priceStopCount = 0;
  let seatSubscribeCount = 0;
  let seatStopCount = 0;
  let activeContext = {eventDatabaseId: 1, showId: 10};

  const mockApi = {
    loadTicketingCatalog: async () => structuredClone(makeCatalog()),
    createSeatHold: async () => ({
      holdId: 'hold-default',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      items: [],
    }),
    releaseSeatHold: async () => ({ok: true}),
    subscribeToSeatUpdates: (onEvent, onStatus) => {
      seatSubscribeCount += 1;
      const sub = {onEvent, onStatus, active: true};
      seatSubscribers.add(sub);
      onStatus?.('CONNECTED');
      return () => {
        if (!sub.active) return;
        sub.active = false;
        seatStopCount += 1;
        seatSubscribers.delete(sub);
      };
    },
    subscribeToPriceUpdates: (onEvent, onStatus, options = {}) => {
      priceSubscribeCount += 1;
      const sub = {onEvent, onStatus, options, active: true};
      priceSubscribers.add(sub);
      onStatus?.('CONNECTING');
      return () => {
        if (!sub.active) return;
        sub.active = false;
        priceStopCount += 1;
        priceSubscribers.delete(sub);
      };
    },
    getActiveEventContext: () => ({...activeContext}),
    ...mockOverrides,
  };

  const tooltipPayloads = [];
  const modalPayloads = [];
  const onTooltip = (e) => tooltipPayloads.push(e.detail);
  const onModal = (e) => modalPayloads.push(e.detail);
  dom.win.addEventListener('eventticketing:seat-tooltip', onTooltip);
  dom.win.addEventListener('eventticketing:booking-modal', onModal);

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    SVGSVGElement: globalThis.SVGSVGElement,
    IntersectionObserver: globalThis.IntersectionObserver,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    mock: globalThis.__CONCERT_TEST_MOCK__,
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
  globalThis.setInterval = dom.win.setInterval.bind(dom.win);
  globalThis.clearInterval = dom.win.clearInterval.bind(dom.win);
  globalThis.setTimeout = dom.win.setTimeout.bind(dom.win);
  globalThis.clearTimeout = dom.win.clearTimeout.bind(dom.win);
  globalThis.__CONCERT_TEST_MOCK__ = mockApi;

  const runtime = await loadConcertRuntimeWithStubs();
  const emitPriceSnapshot = (priceMap) => {
    for (const sub of [...priceSubscribers]) sub.options?.onSnapshot?.(priceMap);
  };
  const emitPriceUpdate = (event) => {
    for (const sub of [...priceSubscribers]) sub.onEvent?.(event);
  };
  const emitPriceStatus = (status) => {
    for (const sub of [...priceSubscribers]) sub.onStatus?.(status);
  };
  const emitSeatStatus = (status) => {
    for (const sub of [...seatSubscribers]) sub.onStatus?.(status);
  };

  try {
    await runtime.initConcertRuntime();
    await fn({
      dom,
      runtime,
      priceSubscribers,
      seatSubscribers,
      tooltipPayloads,
      modalPayloads,
      emitPriceSnapshot,
      emitPriceUpdate,
      emitPriceStatus,
      emitSeatStatus,
      setContext: (next) => {
        activeContext = {...activeContext, ...next};
      },
      getStats: () => ({
        priceSubscribeCount,
        priceStopCount,
        seatSubscribeCount,
        seatStopCount,
        activePriceSubscribers: priceSubscribers.size,
        activeSeatSubscribers: seatSubscribers.size,
      }),
      remountDom: () => {
        const mount = dom.doc.createElement('div');
        mount.innerHTML = seatingMarkup + extraHtml;
        dom.body.replaceChildren(mount);
      },
    });
  } finally {
    runtime.teardownConcertRuntime();
    dom.cleanupAllTimers();
    dom.win.removeEventListener('eventticketing:seat-tooltip', onTooltip);
    dom.win.removeEventListener('eventticketing:booking-modal', onModal);
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.SVGSVGElement = prev.SVGSVGElement;
    globalThis.IntersectionObserver = prev.IntersectionObserver;
    globalThis.CustomEvent = prev.CustomEvent;
    globalThis.Event = prev.Event;
    globalThis.setInterval = prev.setInterval;
    globalThis.clearInterval = prev.clearInterval;
    globalThis.setTimeout = prev.setTimeout;
    globalThis.clearTimeout = prev.clearTimeout;
    globalThis.__CONCERT_TEST_MOCK__ = prev.mock;
  }
}

test('snapshot & ZONE_PRICE_CHANGED cập nhật SVG, ghế (gồm visualOnly), camera seats, tooltip đang mở và không đụng React pricing-section', async () => {
  const pricingCardHtml = `
    <section id="pricing-section">
      <div data-zone-code="VVIP_DIAMOND">
        <h3>VVIP Diamond Lounge</h3>
        <div><span>4.500.000</span><span>VNĐ</span></div>
      </div>
    </section>
  `;
  let catalogLoadCount = 0;

  await withConcertRuntime(
    {
      extraHtml: pricingCardHtml,
      mockOverrides: {
        loadTicketingCatalog: async () => {
          catalogLoadCount += 1;
          return structuredClone(makeCatalog());
        },
      },
    },
    async ({dom, priceSubscribers, tooltipPayloads, emitPriceSnapshot, emitPriceUpdate, emitSeatStatus}) => {
      assert.equal(priceSubscribers.size, 1);
      const [sub] = [...priceSubscribers];
      assert.deepEqual(sub.options.scope, {suKienId: 1, suatDienId: 10});

      // 1. Snapshot giá ban đầu cập nhật SVG, block phân khu, và giữ nguyên #pricing-section (React)
      emitPriceSnapshot(new Map([[1, 4_800_000], [2, 3_750_000], [4, 2_350_000], [5, 1_950_000], [8, 950_000]]));

      const vvipShapes = dom.doc.querySelectorAll('.stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]');
      assert.ok(vvipShapes.length >= 2);
      for (const shape of vvipShapes) {
        assert.equal(shape.dataset.price, '4800000');
        assert.match(shape.getAttribute('aria-label'), /4\.800\.000 VNĐ/);
      }

      const vvipTextLabel = dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="VVIP_DIAMOND"]');
      assert.equal(vvipTextLabel.textContent, '4.800.000 VNĐ');
      assert.equal(dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="VIP_PLATINUM_1"]').textContent, '3.750.000 VNĐ');
      assert.equal(dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="GA_STAND_2"]').textContent, '1.950.000 VNĐ');

      const ga1TextLabels = dom.doc.querySelectorAll('#stadium-svg text.svg-zone-price[data-zone-code="GA_STAND_1"]');
      assert.equal(ga1TextLabels.length, 2);
      for (const label of ga1TextLabels) {
        assert.equal(label.textContent, '2.350.000 VNĐ');
      }

      const vvipBlockPrice = dom.doc.querySelector('#seats-wrapper > .zone-block[data-zone-code="VVIP_DIAMOND"] > div:first-of-type > span:last-child');
      assert.equal(vvipBlockPrice.textContent, '4.800.000 VNĐ / ghế');
      const ga1BlockPrice = dom.doc.querySelector('#seats-wrapper > .zone-block[data-zone-code="GA_STAND_1"] > div:first-of-type > span:last-child');
      assert.equal(ga1BlockPrice.textContent, '2.350.000 VNĐ / vé');

      // Ghế tầng cao (visualOnly) trong ZONE_CD_UP cũng cập nhật theo snapshot
      const upperShapes = dom.doc.querySelectorAll('.stadium-svg-zone[data-zone-code="ZONE_CD_UP"]');
      assert.ok(upperShapes.length > 0);
      assert.equal(upperShapes[0].dataset.price, '950000');
      assert.match(upperShapes[0].getAttribute('aria-label'), /950\.000 VNĐ/);
      const upperBlockPrice = dom.doc.querySelector('#seats-wrapper > .zone-block[data-zone-code="ZONE_CD_UP"] > div:first-of-type > span:last-child');
      assert.equal(upperBlockPrice.textContent, '950.000 VNĐ / ghế');

      // Không đụng bảng giá React chung của GenericEventPage
      const reactCardPrice = dom.doc.querySelector('#pricing-section [data-zone-code="VVIP_DIAMOND"] h3 + div span:first-child');
      assert.equal(reactCardPrice.textContent, '4.500.000');

      // 2. Mở tooltip phân khu SVG và zoom camera vào VVIP_DIAMOND
      const vvipOvalSector = dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]');
      dom.dispatchMouse(vvipOvalSector, 'mouseenter', {clientX: 200, clientY: 180});
      const svgTooltip = dom.doc.getElementById('svg-zone-tooltip');
      assert.equal(svgTooltip.classList.contains('is-visible'), true);
      assert.match(svgTooltip.textContent, /4\.800\.000 VNĐ/);

      // Click vào phân khu để zoom camera và render ghế camera
      dom.click(vvipOvalSector);
      dom.flushTimeouts();

      const subheading = dom.doc.querySelector('#stadium-seat-layer .camera-zone-subheading');
      assert.ok(subheading);
      assert.match(subheading.textContent, /4\.800\.000 VNĐ/);

      const seatA1Group = dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-01"]');
      assert.ok(seatA1Group);
      assert.match(seatA1Group.getAttribute('aria-label'), /4\.800\.000 VNĐ/);
      assert.match(seatA1Group.querySelector('title').textContent, /4\.800\.000 VNĐ/);

      // Hover ghế A1 để mở tooltip ghế + di chuột sang tọa độ mới
      dom.dispatchMouse(seatA1Group, 'mouseenter', {clientX: 310, clientY: 220});
      dom.dispatchMouse(seatA1Group, 'mousemove', {clientX: 345, clientY: 255});
      const initialTip = tooltipPayloads.at(-2);
      assert.equal(initialTip.seatCode, 'VVIP-A-01');
      assert.equal(initialTip.price, 4_800_000);
      assert.equal(initialTip.priceFormatted, '4.800.000 VNĐ');

      // 3. Nhận ZONE_PRICE_CHANGED -> cập nhật đồng bộ cả tooltip SVG đang mở, tooltip ghế đang mở, camera seats, nhãn SVG, khối phân khu và ZONE_CD_UP (visualOnly)
      emitPriceUpdate({
        type: 'ZONE_PRICE_CHANGED',
        suKienId: 1,
        suatDienId: 10,
        khuVucId: 1,
        gia: 5_100_000,
      });
      emitPriceUpdate({
        type: 'ZONE_PRICE_CHANGED',
        suKienId: 1,
        suatDienId: 10,
        khuVucId: 8,
        gia: 1_050_000,
      });

      assert.equal(vvipTextLabel.textContent, '5.100.000 VNĐ');
      for (const shape of vvipShapes) {
        assert.equal(shape.dataset.price, '5100000');
        assert.match(shape.getAttribute('aria-label'), /5\.100\.000 VNĐ/);
      }
      assert.equal(vvipBlockPrice.textContent, '5.100.000 VNĐ / ghế');
      assert.equal(upperShapes[0].dataset.price, '1050000');
      assert.match(upperShapes[0].getAttribute('aria-label'), /1\.050\.000 VNĐ/);
      assert.equal(upperBlockPrice.textContent, '1.050.000 VNĐ / ghế');
      assert.match(svgTooltip.textContent, /5\.100\.000 VNĐ/);
      assert.match(dom.doc.querySelector('#stadium-seat-layer .camera-zone-subheading').textContent, /5\.100\.000 VNĐ/);
      const updatedSeatA1 = dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-01"]');
      assert.match(updatedSeatA1.getAttribute('aria-label'), /5\.100\.000 VNĐ/);
      assert.match(updatedSeatA1.querySelector('title').textContent, /5\.100\.000 VNĐ/);
      const updatedSeatA2Sold = dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-02"]');
      assert.equal(updatedSeatA2Sold.classList.contains('sold'), true);
      assert.match(updatedSeatA2Sold.getAttribute('aria-label'), /DA_BAN.*5\.100\.000 VNĐ/);
      assert.equal(reactCardPrice.textContent, '4.500.000');

      const updatedTip = tooltipPayloads.at(-1);
      assert.equal(updatedTip.visible, true);
      assert.equal(updatedTip.seatCode, 'VVIP-A-01');
      assert.equal(updatedTip.price, 5_100_000);
      assert.equal(updatedTip.priceFormatted, '5.100.000 VNĐ');
      assert.equal(updatedTip.x, 345);
      assert.equal(updatedTip.y, 255);

      // 4. Sự kiện sai phạm vi hoặc giá không hợp lệ bị bỏ qua
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 2, suatDienId: 10, khuVucId: 1, gia: 9_999_000});
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 99, khuVucId: 1, gia: 9_999_000});
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: null, khuVucId: 1, gia: 9_999_000});
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 0});
      emitPriceUpdate({type: 'OTHER_EVENT', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 9_999_000});

      assert.equal(vvipTextLabel.textContent, '5.100.000 VNĐ');
      assert.equal(tooltipPayloads.at(-1).price, 5_100_000);

      // 5. Khi mất kết nối ghế và phục hồi (resyncSeatSnapshot gọi lại loadTicketingCatalog trả giá cũ 4.5M),
      // runtime vẫn giữ giá realtime 5.1M / 1.05M chứ không bị catalog cũ ghi đè
      const loadsBeforeResync = catalogLoadCount;
      emitSeatStatus('DISCONNECTED');
      emitSeatStatus('CONNECTED');
      await new Promise((r) => setTimeout(r, 0));

      assert.equal(catalogLoadCount, loadsBeforeResync + 1);
      assert.equal(vvipTextLabel.textContent, '5.100.000 VNĐ');
      assert.equal(dom.doc.querySelector('.stadium-svg-zone[data-zone-code="ZONE_CD_UP"]').dataset.price, '1050000');
      assert.equal(reactCardPrice.textContent, '4.500.000');

      // Ẩn tooltip ghế & tooltip SVG -> cập nhật giá sau đó không phát tooltip mở lại
      const tipCountBeforeHide = tooltipPayloads.length;
      dom.dispatchMouse(seatA1Group, 'mouseleave');
      dom.dispatchMouse(vvipOvalSector, 'mouseleave');
      assert.equal(svgTooltip.classList.contains('is-visible'), false);
      assert.equal(tooltipPayloads.length, tipCountBeforeHide + 1);
      assert.equal(tooltipPayloads.at(-1).visible, false);

      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 5_250_000});
      assert.equal(tooltipPayloads.length, tipCountBeforeHide + 1);

      // Panel chọn vé đứng trên bản đồ đang mở cũng cập nhật giá khi nhận giá mới
      const ga1Shape = dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]');
      dom.click(ga1Shape);
      dom.flushTimeouts();
      assert.match(dom.doc.getElementById('map-selection-panel').textContent, /2\.350\.000 VNĐ/);
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 2_600_000});
      assert.match(dom.doc.getElementById('map-selection-panel').textContent, /2\.600\.000 VNĐ/);
    },
  );
});

test('lựa chọn chưa giữ theo giá mới; giữ chỗ đóng băng snapshot hoặc DonGiaChot (kể cả khi đổi giá lúc chờ RPC); hủy/bỏ/hết hạn đồng bộ lại', async () => {
  // Kịch bản A: Không có DonGiaChot -> lấy giá mới nhất lúc createSeatHold resolve, đóng băng sau đó, bỏ vé thì đồng bộ lại giá mới
  {
    let pendingHold = createDeferred();
    const releasedHolds = [];

    await withConcertRuntime(
      {
        mockOverrides: {
          createSeatHold: () => pendingHold.promise,
          releaseSeatHold: async (holdId) => {
            releasedHolds.push(holdId);
            return {ok: true};
          },
        },
      },
      async ({dom, modalPayloads, emitPriceUpdate}) => {
        // Chọn ghế VVIP-A-03 (4.5M) + 2 vé đứng GA_STAND_1 (2.2M)
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
        dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.getElementById('map-standing-plus'));
        dom.click(dom.doc.getElementById('map-standing-plus'));
        dom.click(dom.doc.getElementById('map-standing-action'));

        const summaryTotal = dom.doc.getElementById('summary-total');
        const readRowPrices = () => dom.doc.querySelectorAll('#selected-seats-list [data-selected-ticket] .et-ticket-right span').map((el) => el.textContent);
        assert.equal(summaryTotal.textContent, '8.900.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['4.500.000 VNĐ', '2.200.000 VNĐ', '2.200.000 VNĐ']);

        // Chưa giữ chỗ: giá đổi -> từng dòng và tổng cộng cập nhật theo giá mới
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 4_700_000});
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 2_400_000});
        assert.equal(summaryTotal.textContent, '9.500.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['4.700.000 VNĐ', '2.400.000 VNĐ', '2.400.000 VNĐ']);

        // Bấm giữ chỗ -> trong lúc chờ RPC, giá cả ghế ngồi và vé đứng đổi tiếp
        dom.click(dom.doc.getElementById('btn-proceed-booking'));
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 5_000_000});
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 2_600_000});

        pendingHold.resolve({
          holdId: 'hold-client-snap',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          items: [
            {ticketCode: 'VVIP-A-03', zoneCode: 'VVIP_DIAMOND'},
            {ticketCode: 'GA1-STAND-01', zoneCode: 'GA_STAND_1', quantity: 1},
            {ticketCode: 'GA1-STAND-02', zoneCode: 'GA_STAND_1', quantity: 1},
          ],
        });
        await new Promise((r) => setTimeout(r, 0));

        // Snapshot đóng băng theo giá mới nhất tại thời điểm RPC resolve (5.0M + 2 * 2.6M = 10.2M)
        assert.equal(summaryTotal.textContent, '10.200.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['5.000.000 VNĐ', '2.600.000 VNĐ', '2.600.000 VNĐ']);
        const openModal = modalPayloads.at(-1);
        assert.equal(openModal.open, true);
        assert.equal(openModal.totalAmount, 10_200_000);
        assert.deepEqual(openModal.items.map((it) => it.price), [5_000_000, 2_600_000, 2_600_000]);

        // Sau khi đã giữ chỗ: giá thị trường tăng tiếp -> SVG vẫn đổi, sidebar giữ nguyên giá đóng băng
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 6_000_000});
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 3_000_000});
        assert.equal(dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="VVIP_DIAMOND"]').textContent, '6.000.000 VNĐ');
        assert.equal(dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="GA_STAND_1"]').textContent, '3.000.000 VNĐ');
        assert.equal(summaryTotal.textContent, '10.200.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['5.000.000 VNĐ', '2.600.000 VNĐ', '2.600.000 VNĐ']);

        // Bỏ 1 vé đứng khỏi lựa chọn -> hủy hold cũ và các vé còn lại đồng bộ lại giá mới (6.0M + 3.0M = 9.0M)
        const removeBtn = dom.doc.querySelector('[data-remove-ticket-id="GA1-STAND-01"]');
        dom.click(removeBtn);
        await new Promise((r) => setTimeout(r, 0));

        assert.deepEqual(releasedHolds, ['hold-client-snap']);
        assert.equal(summaryTotal.textContent, '9.000.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['6.000.000 VNĐ', '3.000.000 VNĐ']);
      },
    );
  }

  // Kịch bản B: Máy chủ trả DonGiaChot -> ưu tiên DonGiaChot cho cả ghế ngồi và vé đứng, hết hạn bộ đếm giải phóng hold
  {
    let pendingHold = createDeferred();
    const releasedHolds = [];

    await withConcertRuntime(
      {
        mockOverrides: {
          createSeatHold: () => pendingHold.promise,
          releaseSeatHold: async (holdId) => {
            releasedHolds.push(holdId);
            return {ok: true};
          },
        },
      },
      async ({dom, modalPayloads, emitPriceUpdate}) => {
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
        dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.getElementById('map-standing-plus'));
        dom.click(dom.doc.getElementById('map-standing-plus'));
        dom.click(dom.doc.getElementById('map-standing-action'));

        dom.click(dom.doc.getElementById('btn-proceed-booking'));
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 5_500_000});
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 2_800_000});

        pendingHold.resolve({
          holdId: 'hold-server-locked',
          expiresAt: new Date(Date.now() + 1_000).toISOString(),
          items: [
            {ticketCode: 'VVIP-A-03', zoneCode: 'VVIP_DIAMOND', DonGiaChot: 4_200_000},
            {ticketCode: 'GA1-STAND-01', zoneCode: 'GA_STAND_1', DonGiaChot: 2_100_000},
            {ticketCode: 'GA1-STAND-02', zoneCode: 'GA_STAND_1', DonGiaChot: 2_100_000},
          ],
        });
        await new Promise((r) => setTimeout(r, 0));

        const summaryTotal = dom.doc.getElementById('summary-total');
        const readRowPrices = () => dom.doc.querySelectorAll('#selected-seats-list [data-selected-ticket] .et-ticket-right span').map((el) => el.textContent);
        assert.equal(summaryTotal.textContent, '8.400.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['4.200.000 VNĐ', '2.100.000 VNĐ', '2.100.000 VNĐ']);
        const openModal = modalPayloads.at(-1);
        assert.equal(openModal.totalAmount, 8_400_000);
        assert.deepEqual(openModal.items.map((it) => it.price), [4_200_000, 2_100_000, 2_100_000]);

        // Giá mới đến khi đang giữ không ghi đè DonGiaChot của ghế hay vé đứng
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 5_900_000});
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 2_800_000});
        assert.equal(summaryTotal.textContent, '8.400.000 VNĐ');
        assert.deepEqual(readRowPrices(), ['4.200.000 VNĐ', '2.100.000 VNĐ', '2.100.000 VNĐ']);

        // Bộ đếm hết hạn -> giải phóng hold, xóa lựa chọn, đóng modal, và vé mới chọn dùng giá thị trường mới nhất
        dom.tickIntervals(1000);
        await new Promise((r) => setTimeout(r, 0));

        assert.deepEqual(releasedHolds, ['hold-server-locked']);
        assert.equal(summaryTotal.textContent, '0 VNĐ');
        assert.equal(modalPayloads.at(-1).open, false);

        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.getElementById('map-standing-plus'));
        dom.click(dom.doc.getElementById('map-standing-action'));
        assert.equal(summaryTotal.textContent, '2.800.000 VNĐ');

        // Kịch bản C: DonGiaChot cấp bản ghi cho đúng một dòng (1 loại vé đứng) & clearAllSeats hủy giữ chỗ
        pendingHold = createDeferred();
        dom.click(dom.doc.getElementById('btn-proceed-booking'));
        pendingHold.resolve({
          holdId: 'hold-record-level',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          DonGiaChot: 2_050_000,
          items: [],
        });
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(summaryTotal.textContent, '2.050.000 VNĐ');
        assert.equal(modalPayloads.at(-1).totalAmount, 2_050_000);

        dom.click(dom.doc.getElementById('btn-clear-all-seats'));
        await new Promise((r) => setTimeout(r, 0));
        assert.deepEqual(releasedHolds, ['hold-server-locked', 'hold-record-level']);
        assert.equal(summaryTotal.textContent, '0 VNĐ');
      },
    );
  }
});

test('trạng thái kết nối giá bằng chữ độc lập với trạng thái ghế; teardownConcertRuntime hủy sạch kênh/listener khi đổi suất hoặc quay lại', async () => {
  let holdCalls = 0;
  let shouldFailFirstCatalog = false;
  const holdDeferreds = [];
  const releasedOrphanHolds = [];

  await withConcertRuntime(
    {
      mockOverrides: {
        createSeatHold: () => {
          holdCalls += 1;
          if (holdCalls === 2) {
            const d = createDeferred();
            holdDeferreds.push(d);
            return d.promise;
          }
          return Promise.resolve({holdId: `hold-${holdCalls}`, expiresAt: new Date(Date.now() + 300_000).toISOString(), items: []});
        },
        releaseSeatHold: async (holdId) => {
          releasedOrphanHolds.push(holdId);
          return {ok: true};
        },
        loadTicketingCatalog: async () => {
          if (shouldFailFirstCatalog) {
            shouldFailFirstCatalog = false;
            throw new Error('Catalog error');
          }
          return structuredClone(makeCatalog());
        },
      },
    },
    async ({dom, runtime, modalPayloads, emitPriceStatus, emitPriceUpdate, setContext, getStats, remountDom}) => {
      const priceBar = dom.doc.getElementById('price-connection-status');
      const seatBadge = dom.doc.getElementById('realtime-connection-status');
      assert.ok(priceBar);
      assert.equal(priceBar.getAttribute('data-od-id'), 'price-connection-status');
      assert.equal(priceBar.getAttribute('role'), 'status');
      assert.equal(priceBar.getAttribute('aria-live'), 'polite');

      // 1. Trạng thái CONNECTING lần đầu ẩn; sau khi từng kết nối thì hiện thông báo kết nối lại
      assert.equal(priceBar.classList.contains('hidden'), true);
      emitPriceStatus('CONNECTED');
      assert.equal(priceBar.classList.contains('hidden'), true);
      assert.equal(seatBadge.querySelector('strong').textContent, 'Dữ liệu ghế trực tuyến');

      emitPriceStatus('DISCONNECTED');
      assert.equal(priceBar.classList.contains('hidden'), false);
      assert.equal(priceBar.classList.contains('et-price-status-bar--warning'), true);
      assert.match(priceBar.textContent, /Kết nối giá vé đang gián đoạn · Đang kết nối lại/);
      assert.equal(seatBadge.classList.contains('is-connected'), true);
      assert.equal(seatBadge.querySelector('strong').textContent, 'Dữ liệu ghế trực tuyến');

      emitPriceStatus('ERROR');
      assert.equal(priceBar.classList.contains('hidden'), false);
      assert.equal(priceBar.classList.contains('et-price-status-bar--error'), true);
      assert.match(priceBar.textContent, /Chưa thể đồng bộ giá trực tiếp · Đang thử kết nối lại/);

      emitPriceStatus('CONNECTING');
      assert.equal(priceBar.classList.contains('hidden'), false);
      assert.equal(priceBar.classList.contains('et-price-status-bar--warning'), true);
      assert.match(priceBar.textContent, /Kết nối giá vé đang gián đoạn · Đang kết nối lại/);

      emitPriceStatus('LOCAL_ONLY');
      assert.equal(priceBar.classList.contains('hidden'), false);
      assert.equal(priceBar.classList.contains('et-price-status-bar--info'), true);
      assert.match(priceBar.textContent, /Giá chỉ đồng bộ trong tab này/);
      assert.equal(seatBadge.classList.contains('is-connected'), true);

      emitPriceStatus('CONNECTED');
      assert.equal(priceBar.classList.contains('hidden'), true);

      // 2. Đổi suất diễn trên cùng DOM (teardown -> đổi showId -> init lại):
      // không nhân đôi kênh giá/ghế, không nhân đôi listener nút giữ chỗ, trả #svg-zone-tooltip về .stadium-vector-shell, giá suất cũ bị chặn
      const vvipSector = dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]');
      const svgTooltip = dom.doc.getElementById('svg-zone-tooltip');
      assert.equal(svgTooltip.parentElement, dom.body);
      dom.dispatchMouse(vvipSector, 'mouseenter', {clientX: 180, clientY: 160});
      assert.equal(svgTooltip.classList.contains('is-visible'), true);

      emitPriceStatus('ERROR');
      runtime.teardownConcertRuntime();

      const vectorShell = dom.doc.querySelector('.stadium-vector-shell');
      assert.equal(svgTooltip.parentElement, vectorShell);
      assert.equal(svgTooltip.classList.contains('is-visible'), false);
      assert.equal(svgTooltip.getAttribute('aria-hidden'), 'true');

      const statsAfterTeardown = getStats();
      assert.equal(statsAfterTeardown.activePriceSubscribers, 0);
      assert.equal(statsAfterTeardown.activeSeatSubscribers, 0);
      assert.equal(statsAfterTeardown.priceStopCount, statsAfterTeardown.priceSubscribeCount);
      assert.equal(statsAfterTeardown.seatStopCount, statsAfterTeardown.seatSubscribeCount);
      assert.equal(priceBar.classList.contains('hidden'), true);

      setContext({showId: 20});
      await runtime.initConcertRuntime();

      const statsAfterSwitch = getStats();
      assert.equal(statsAfterSwitch.priceSubscribeCount, 2);
      assert.equal(statsAfterSwitch.seatSubscribeCount, 2);
      assert.equal(statsAfterSwitch.activePriceSubscribers, 1);
      assert.equal(statsAfterSwitch.activeSeatSubscribers, 1);

      // Sự kiện giá của suất 10 bị bỏ qua khi đang ở suất 20
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 9_000_000});
      assert.equal(dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="VVIP_DIAMOND"]').textContent, '4.500.000 VNĐ');

      // Sự kiện giá của suất 20 được áp dụng bình thường và tooltip SVG sau khi đổi suất vẫn hoạt động
      emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 20, khuVucId: 1, gia: 4_900_000});
      assert.equal(dom.doc.querySelector('#stadium-svg text.svg-zone-price[data-zone-code="VVIP_DIAMOND"]').textContent, '4.900.000 VNĐ');
      const vvipSectorShow20 = dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]');
      dom.dispatchMouse(vvipSectorShow20, 'mouseenter', {clientX: 190, clientY: 170});
      assert.equal(svgTooltip.parentElement, dom.body);
      assert.equal(svgTooltip.classList.contains('is-visible'), true);
      assert.match(svgTooltip.textContent, /4\.900\.000 VNĐ/);

      // Chọn vé đứng và bấm #btn-proceed-booking chỉ gọi createSeatHold 1 lần (không nhân đôi click listener)
      dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
      dom.flushTimeouts();
      dom.click(dom.doc.getElementById('map-standing-plus'));
      dom.click(dom.doc.getElementById('map-standing-action'));
      dom.click(dom.doc.getElementById('btn-proceed-booking'));
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(holdCalls, 1);

      // 3. Quay lại trang (remount DOM mới) và thử lỗi catalog rồi bấm retry -> vẫn chỉ có 1 kênh giá hoạt động
      runtime.teardownConcertRuntime();
      remountDom();
      shouldFailFirstCatalog = true;
      setContext({showId: 30});
      await runtime.initConcertRuntime();

      assert.equal(getStats().activePriceSubscribers, 0);
      dom.click(dom.doc.getElementById('btn-retry-seating-data'));
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(getStats().activePriceSubscribers, 1);
      assert.equal(getStats().activeSeatSubscribers, 1);

      // 4. Đổi suất trong lúc createSeatHold đang chờ -> teardown + re-init không nhận hold cũ, tự giải phóng hold mồ côi
      dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
      dom.flushTimeouts();
      dom.click(dom.doc.getElementById('map-standing-plus'));
      dom.click(dom.doc.getElementById('map-standing-action'));
      dom.click(dom.doc.getElementById('btn-proceed-booking'));

      const modalCountBeforeTeardown = modalPayloads.length;
      runtime.teardownConcertRuntime();
      setContext({showId: 40});
      await runtime.initConcertRuntime();

      holdDeferreds[0].resolve({
        holdId: 'hold-orphan-show-30',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        items: [],
      });
      await new Promise((r) => setTimeout(r, 0));

      assert.deepEqual(releasedOrphanHolds, ['hold-orphan-show-30']);
      assert.equal(modalPayloads.length, modalCountBeforeTeardown);
    },
  );
});

test('deferred RPC createSeatHold: giữ nút disabled & aria-busy khi nhận snapshot/event giá, chặn click trùng, không ghi đè hold/countdown và giải phóng đúng hold', async () => {
  // Kịch bản 1: Nhận snapshot + ZONE_PRICE_CHANGED + sale-status + dispatch click lần 2 khi RPC đang chờ -> chỉ 1 RPC, đóng băng giá & countdown đúng, bỏ vé giải phóng đúng holdId
  {
    const pendingHold = createDeferred();
    let holdCalls = 0;
    const releasedHolds = [];

    await withConcertRuntime(
      {
        mockOverrides: {
          createSeatHold: () => {
            holdCalls += 1;
            return pendingHold.promise;
          },
          releaseSeatHold: async (holdId) => {
            releasedHolds.push(holdId);
            return {ok: true};
          },
        },
      },
      async ({dom, modalPayloads, emitPriceSnapshot, emitPriceUpdate}) => {
        // Chọn 1 ghế ngồi (VVIP-A-03) và 1 vé đứng (GA_STAND_1)
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
        dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="GA_STAND_1"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.getElementById('map-standing-plus'));
        dom.click(dom.doc.getElementById('map-standing-action'));

        const btnProceed = dom.doc.getElementById('btn-proceed-booking');
        const summaryTotal = dom.doc.getElementById('summary-total');
        const holdCountdown = dom.doc.getElementById('hold-countdown');
        assert.equal(btnProceed.disabled, false);
        assert.equal(summaryTotal.textContent, '6.700.000 VNĐ');

        // Bấm giữ chỗ khi RPC đang chờ
        dom.click(btnProceed);
        assert.equal(holdCalls, 1);
        assert.equal(btnProceed.disabled, true);
        assert.equal(btnProceed.getAttribute('aria-busy'), 'true');

        // Phát cả emitPriceSnapshot, emitPriceUpdate và sale-status trong lúc RPC đang chờ
        emitPriceSnapshot(new Map([[1, 4_900_000], [4, 2_500_000]]));
        assert.equal(btnProceed.disabled, true);
        assert.equal(btnProceed.getAttribute('aria-busy'), 'true');

        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 5_200_000});
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 4, gia: 2_700_000});
        assert.equal(btnProceed.disabled, true);
        assert.equal(btnProceed.getAttribute('aria-busy'), 'true');
        assert.equal(summaryTotal.textContent, '7.900.000 VNĐ');

        // Kích hoạt syncSaleAvailabilityUI qua event sale-status vẫn phải giữ disabled & aria-busy
        dom.body.dispatchEvent(new dom.DomEvent('eventticketing:sale-status', {bubbles: false}));
        assert.equal(btnProceed.disabled, true);
        assert.equal(btnProceed.getAttribute('aria-busy'), 'true');

        // Thử dispatch click lần hai trực tiếp lên nút đang pending -> không gọi createSeatHold lần 2
        btnProceed.dispatchEvent(new dom.DomEvent('click', {bubbles: true, cancelable: true}));
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(holdCalls, 1);
        assert.equal(btnProceed.disabled, true);
        assert.equal(btnProceed.getAttribute('aria-busy'), 'true');
        assert.equal(modalPayloads.length, 0);

        // Resolve RPC với DonGiaChot và expiresAt 120s -> kiểm tra holdId, snapshot, modal và countdown
        pendingHold.resolve({
          holdId: 'hold-deferred-1',
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          items: [
            {ticketCode: 'VVIP-A-03', zoneCode: 'VVIP_DIAMOND', DonGiaChot: 5_000_000},
            {ticketCode: 'GA1-STAND-01', zoneCode: 'GA_STAND_1', DonGiaChot: 2_450_000},
          ],
        });
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(holdCalls, 1);
        assert.equal(btnProceed.disabled, false);
        assert.equal(btnProceed.getAttribute('aria-busy'), null);
        assert.equal(modalPayloads.length, 1);

        const modal = modalPayloads[0];
        assert.equal(modal.open, true);
        assert.equal(modal.holdId, 'hold-deferred-1');
        assert.equal(modal.totalAmount, 7_450_000);
        assert.deepEqual(modal.items.map((it) => it.price), [5_000_000, 2_450_000]);
        assert.ok(modal.remainingSeconds >= 119 && modal.remainingSeconds <= 120);
        assert.equal(summaryTotal.textContent, '7.450.000 VNĐ');

        // Giá thị trường tiếp tục đổi sau khi hold resolve không ghi đè heldPriceSnapshot hay countdown
        const timerBeforeTick = holdCountdown.textContent;
        assert.match(timerBeforeTick, /^0(1:59|2:00)$/);
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 6_500_000});
        assert.equal(summaryTotal.textContent, '7.450.000 VNĐ');
        dom.tickIntervals(1000);
        assert.notEqual(holdCountdown.textContent, timerBeforeTick);

        // Hủy/bỏ vé -> giải phóng đúng holdId
        dom.click(dom.doc.getElementById('btn-clear-all-seats'));
        await new Promise((r) => setTimeout(r, 0));
        assert.deepEqual(releasedHolds, ['hold-deferred-1']);
        assert.equal(summaryTotal.textContent, '0 VNĐ');
      },
    );
  }

  // Kịch bản 2: Hết hạn countdown sau deferred RPC giải phóng đúng holdId, và teardown khi RPC đang chờ không khóa phiên sau remount
  {
    let holdCalls = 0;
    const deferreds = [];
    const releasedHolds = [];

    await withConcertRuntime(
      {
        mockOverrides: {
          createSeatHold: () => {
            holdCalls += 1;
            const d = createDeferred();
            deferreds.push(d);
            return d.promise;
          },
          releaseSeatHold: async (holdId) => {
            releasedHolds.push(holdId);
            return {ok: true};
          },
        },
      },
      async ({dom, runtime, modalPayloads, emitPriceSnapshot, emitPriceUpdate, setContext, remountDom}) => {
        // Chọn ghế và bấm giữ chỗ (deferred #1), phát giá mới rồi resolve với thời hạn 1s
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
        dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn

        const btnProceed = dom.doc.getElementById('btn-proceed-booking');
        dom.click(btnProceed);
        emitPriceSnapshot(new Map([[1, 4_850_000]]));
        emitPriceUpdate({type: 'ZONE_PRICE_CHANGED', suKienId: 1, suatDienId: 10, khuVucId: 1, gia: 5_150_000});
        btnProceed.dispatchEvent(new dom.DomEvent('click', {bubbles: true, cancelable: true}));
        assert.equal(holdCalls, 1);

        deferreds[0].resolve({
          holdId: 'hold-expire-deferred',
          expiresAt: new Date(Date.now() + 1_000).toISOString(),
          items: [{ticketCode: 'VVIP-A-03', zoneCode: 'VVIP_DIAMOND'}],
        });
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(modalPayloads.at(-1).holdId, 'hold-expire-deferred');
        assert.equal(modalPayloads.at(-1).totalAmount, 5_150_000);

        // Hết hạn giữ chỗ -> giải phóng đúng hold-expire-deferred
        dom.tickIntervals(1000);
        await new Promise((r) => setTimeout(r, 0));
        assert.deepEqual(releasedHolds, ['hold-expire-deferred']);
        assert.equal(modalPayloads.at(-1).open, false);

        // Bấm giữ chỗ lần 2 (deferred #2) rồi teardown + remount trong lúc RPC đang chờ
        dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
        dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
        dom.click(btnProceed);
        assert.equal(holdCalls, 2);
        assert.equal(btnProceed.getAttribute('aria-busy'), 'true');

        runtime.teardownConcertRuntime();
        assert.equal(btnProceed.getAttribute('aria-busy'), null);

        remountDom();
        setContext({showId: 20});
        await runtime.initConcertRuntime();

        const remountedProceed = dom.doc.getElementById('btn-proceed-booking');
        assert.equal(remountedProceed.getAttribute('aria-busy'), null);
        assert.equal(remountedProceed.disabled, true);

        // Chọn ghế ở phiên mới -> nút mở bình thường, không bị khóa bởi RPC đang chờ của phiên cũ
        dom.click(dom.doc.querySelector('#oval-stadium-root .stadium-svg-zone[data-zone-code="VVIP_DIAMOND"]'));
        dom.flushTimeouts();
        dom.click(dom.doc.querySelector('#stadium-seat-layer [data-seat-id="VVIP-A-03"]'));
        dom.click(dom.doc.getElementById('map-seat-action')); // bấm chấm mở khung thông tin vé, bấm Thêm/Bỏ chọn mới thay đổi lựa chọn
        assert.equal(remountedProceed.disabled, false);
        assert.equal(remountedProceed.getAttribute('aria-busy'), null);

        // RPC cũ resolve muộn -> bị bỏ qua, tự release hold mồ côi và không mở modal hay khóa nút phiên mới
        const modalsBeforeStaleResolve = modalPayloads.length;
        deferreds[1].resolve({
          holdId: 'hold-stale-before-remount',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          items: [],
        });
        await new Promise((r) => setTimeout(r, 0));

        assert.deepEqual(releasedHolds, ['hold-expire-deferred', 'hold-stale-before-remount']);
        assert.equal(modalPayloads.length, modalsBeforeStaleResolve);
        assert.equal(remountedProceed.disabled, false);
        assert.equal(remountedProceed.getAttribute('aria-busy'), null);

        // Phiên mới vẫn bấm giữ chỗ được
        dom.click(remountedProceed);
        assert.equal(holdCalls, 3);
        assert.equal(remountedProceed.getAttribute('aria-busy'), 'true');
        deferreds[2].resolve({
          holdId: 'hold-new-session',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          items: [{ticketCode: 'VVIP-A-03', zoneCode: 'VVIP_DIAMOND'}],
        });
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(modalPayloads.at(-1).holdId, 'hold-new-session');
        assert.equal(remountedProceed.disabled, false);
        assert.equal(remountedProceed.getAttribute('aria-busy'), null);
      },
    );
  }
});
