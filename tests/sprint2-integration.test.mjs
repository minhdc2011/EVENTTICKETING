/*
 * Kiểm thử tích hợp Sprint 2 (T3): OTP, giới hạn vé và duyệt giá trên CÙNG sự kiện demo (990001 / suất 990101).
 *
 * Chạy các dịch vụ thật trong src/services (buyerAuthService, otpService, purchaseConfigService, bookingService,
 * pricingService, priceRealtimeService) và PurchaseAccessGate.tsx trong MỘT bundle esbuild để mọi singleton
 * (kho giữ chỗ mock, kho pricing, kho cấu hình mua vé, kho OTP) được dùng chung giữa các bước. Chỉ runtime config và
 * supabaseClient bị thay bằng stub (nhánh mock); nghiệp vụ không được viết lại trong test.
 *
 * Phạm vi: nhánh mock. Test này không chạy SQL/pgTAP (xem supabase/tests/sprint2_integration.sql, cần
 * `npm run db:reset && npm run db:test`) và không đo độ trễ.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {build} from 'esbuild';
import React, {act} from 'react';

const repoRoot = path.resolve(import.meta.dirname, '..');

const DEMO_EVENT_ID = 990001;
const DEMO_SLUG = 'demo-dinh-gia-mo-phong';
const DEMO_SHOW_ID = 990101;
const DEMO_SHOW_SLUG = 'suat-demo';
const VIP_KHU_ID = 990201;
const ECONOMY_KHU_ID = 990203;
const VIP_SEED_PRICE = 1_500_000;
const ECONOMY_SEED_PRICE = 520_000;
const BUYER_EMAIL = 'nguoi.mua.sprint2@example.com';
const BUYER_PASSWORD = 'secret1';
const SENTINEL_ID = 'sprint2-seat-picker';

// ---------------------------------------------------------------------------
// Môi trường trình duyệt tối thiểu dùng chung (localStorage, window, StorageEvent)
// ---------------------------------------------------------------------------

const store = new Map();
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};
const browserStubs = {
  localStorage: localStorageStub,
  window: {
    localStorage: localStorageStub,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  },
  // Phải là function thường vì mã nguồn gọi `new StorageEvent(...)`.
  StorageEvent: function (type, init = {}) {
    return {type, key: init.key ?? null};
  },
};
for (const [name, value] of Object.entries(browserStubs)) {
  Object.defineProperty(globalThis, name, {value, writable: true, configurable: true});
}

/**
 * pricingService phát thông báo giá mock trên globalThis (không phải window): biến globalThis thành EventTarget
 * trong lúc test và trả hàm khôi phục.
 */
function installGlobalEventTarget() {
  const target = new EventTarget();
  const names = ['addEventListener', 'removeEventListener', 'dispatchEvent'];
  const previous = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) {
    Object.defineProperty(globalThis, name, {value: target[name].bind(target), writable: true, configurable: true});
  }
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

/** Đẩy Date.now về phía trước `offsetMs` (đồng hồ vẫn chạy); trả hàm khôi phục. */
function advanceDateNow(offsetMs) {
  const realNow = Date.now;
  Date.now = () => realNow() + offsetMs;
  return () => {
    Date.now = realNow;
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitUntil(condition, what, tries = 100) {
  for (let i = 0; i < tries; i += 1) {
    if (condition()) return;
    await tick();
  }
  assert.fail(`Hết thời gian chờ: ${what}`);
}

// ---------------------------------------------------------------------------
// Bundle các dịch vụ thật + PurchaseAccessGate (một bản mới cho mỗi kịch bản)
// ---------------------------------------------------------------------------

let instance = 0;

async function loadStoryModules() {
  instance += 1;
  const built = await build({
    stdin: {
      contents: `
        export {PurchaseAccessGate} from './src/components/event-template/PurchaseAccessGate.tsx';
        export {getBuyerSession, signInBuyer, signUpBuyer} from './src/services/buyerAuthService.ts';
        export {
          MA_MO_PHONG,
          guiMaOtp,
          khoTrangThaiOtpPhien,
          kiemTraDaXacMinhOtp,
          xacMinhMaOtp,
          xoaBangChungMock,
        } from './src/services/otpService.ts';
        export {
          datLaiKhoMoPhongCauHinhMuaVe,
          docCauHinhMuaVe,
          luuCauHinhMuaVe,
        } from './src/services/purchaseConfigService.ts';
        export {createSeatHold, releaseSeatHold} from './src/services/bookingService.ts';
        export {
          DEMO_NGUOI_DUNG,
          chayDinhGiaNgay,
          datLaiBoNhoMoPhong,
          docBangGiaChotDemo,
          docTrangThaiMoPhong,
          duyetDeXuatGia,
          hetHanDeXuat,
          khoiTaoDemoDinhGia,
          layDanhSachDeXuat,
          moPhongNhuCau,
          tuChoiDeXuatGia,
        } from './src/services/pricingService.ts';
        export {subscribeToPriceUpdates} from './src/services/priceRealtimeService.ts';
        // instance ${instance}
      `,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    define: {'import.meta.env.BASE_URL': '"/"'},
    plugins: [
      {
        name: 'sprint2-integration-stubs',
        setup(b) {
          b.onResolve({filter: /^react(\/jsx-runtime)?$/}, (args) => ({
            path: import.meta.resolve(args.path),
            external: true,
          }));
          b.onResolve({filter: /\.css$/}, () => ({path: 'css', namespace: 's2-stub'}));
          b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 's2-stub'}));
          b.onResolve({filter: /(services\/|\.\.?\/)supabaseClient$/}, (args) => {
            const resolved = path.resolve(args.resolveDir, args.path).replaceAll('\\', '/');
            return resolved.endsWith('/src/services/supabaseClient')
              ? {path: 'supabaseClient', namespace: 's2-stub'}
              : undefined;
          });
          b.onLoad({filter: /^css$/, namespace: 's2-stub'}, () => ({contents: '', loader: 'js'}));
          b.onLoad({filter: /^runtime$/, namespace: 's2-stub'}, () => ({
            contents: `
              export const runtimeConfig = {
                apiBaseUrl: '',
                websocketUrl: '',
                supabaseUrl: '',
                supabaseAnonKey: '',
                eventId: '${DEMO_SLUG}',
                eventDatabaseId: ${DEMO_EVENT_ID},
                get useMockData() {
                  return true;
                },
              };
              export const isSupabaseConfigured = () => false;
              export const isApiConfigured = () => false;
              export const isWebSocketConfigured = () => false;
              export const getActiveEventContext = () => globalThis.__sprint2Ctx;
              export const setActiveEventContext = () => {};
            `,
            loader: 'js',
          }));
          b.onLoad({filter: /^supabaseClient$/, namespace: 's2-stub'}, () => ({
            contents: `
              export function requireSupabaseClient() { throw new Error('Không được gọi supabaseClient ở nhánh mock'); }
              export function getSupabaseClient() { throw new Error('Không được gọi supabaseClient ở nhánh mock'); }
            `,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const source = `${built.outputFiles[0].text}\n// instance ${instance}\n`;
  return import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`);
}

/**
 * Điểm xuất phát chung của kịch bản: bundle mới, mọi kho về trạng thái sạch, giá demo được seed,
 * sự kiện 990001 bật OTP với giới hạn 4 vé/đơn, và người mua đã đăng ký (phiên mock).
 */
async function startDemoStory() {
  store.clear();
  globalThis.__sprint2Ctx = {
    eventId: DEMO_SLUG,
    eventDatabaseId: DEMO_EVENT_ID,
    showId: DEMO_SHOW_ID,
    showSlug: DEMO_SHOW_SLUG,
  };
  const svc = await loadStoryModules();
  svc.datLaiBoNhoMoPhong();
  svc.datLaiKhoMoPhongCauHinhMuaVe();
  svc.khoTrangThaiOtpPhien.xoa();
  svc.xoaBangChungMock();

  await svc.khoiTaoDemoDinhGia();
  await svc.luuCauHinhMuaVe(
    DEMO_EVENT_ID,
    {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: true},
    {nguoiDung: svc.DEMO_NGUOI_DUNG},
  );
  const config = await svc.docCauHinhMuaVe(DEMO_EVENT_ID);
  assert.equal(config.yeuCauXacMinhOtp, true, 'sự kiện demo phải bật OTP');
  assert.equal(config.soVeToiDaMoiDon, 4, 'giới hạn vé của sự kiện demo phải là 4');

  const {session} = await svc.signUpBuyer(BUYER_EMAIL, BUYER_PASSWORD, 'Người mua demo');
  assert.ok(session?.userId, 'đăng ký người mua mock phải trả về phiên');
  return {svc, session};
}

const vipItem = (n) => ({ticketCode: `DEMO_VIP-A${n}`, zoneCode: 'DEMO_VIP'});

function expectOverLimit({gioiHan, dangGiu, conLai}) {
  return (err) => {
    assert.equal(err.ma, 'VUOT_GIOI_HAN_VE');
    assert.equal(err.gioiHan, gioiHan);
    assert.equal(err.dangGiu, dangGiu);
    assert.equal(err.conLai, conLai);
    return true;
  };
}

/** BO_QUA, BI_CHAN và LOI không bao giờ được coi là thành công: fail kèm lý do. */
function assertDaLuu(zone, label) {
  assert.ok(zone, `${label}: thiếu kết quả của khu`);
  if (zone.ketQua !== 'DA_LUU') {
    assert.fail(
      `${label}: engine không lưu đề xuất, ketQua=${zone.ketQua}, lý do=${JSON.stringify(
        zone.lyDoBoQua ?? zone.maChan ?? zone.loi ?? null,
      )}`,
    );
  }
  assert.equal(typeof zone.deXuatId, 'number', `${label}: DA_LUU phải kèm deXuatId`);
}

function pendingIdsOf(danhSach) {
  return danhSach.khuVuc
    .flatMap((khu) => khu.deXuat.filter((d) => d.trangThai === 'PENDING').map((d) => d.deXuatId))
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// DOM giả cho React (điều chỉnh từ tests/organizer-purchase-config.test.mjs)
// ---------------------------------------------------------------------------

function createReactTestDom() {
  const docListeners = new Map();
  class DomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = init.bubbles ?? true;
      this.cancelable = init.cancelable ?? true;
      this.key = init.key;
      this.shiftKey = Boolean(init.shiftKey);
      this.defaultPrevented = false;
      this._stopped = false;
      this.target = null;
      this.currentTarget = null;
      this.eventPhase = 0;
      this._path = [];
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
    composedPath() {
      return this._path;
    }
  }

  class DomNode {
    constructor(nodeType, ownerDoc) {
      this.nodeType = nodeType;
      this.ownerDocument = ownerDoc;
      this.parentNode = null;
      this.childNodes = [];
      this._capListeners = new Map();
      this._bubListeners = new Map();
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
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (ref == null) {
        this.childNodes.push(child);
      } else {
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
    replaceChild(newChild, oldChild) {
      this.insertBefore(newChild, oldChild);
      this.removeChild(oldChild);
      return oldChild;
    }
    addEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
      const map = cap ? this._capListeners : this._bubListeners;
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
    }
    removeEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
      const map = cap ? this._capListeners : this._bubListeners;
      map.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      const eventPath = [];
      for (let cur = this; cur; cur = cur.parentNode) eventPath.push(cur);
      eventPath.push(doc);
      event._path = eventPath;
      for (let i = eventPath.length - 1; i >= 0; i -= 1) {
        if (event._stopped) break;
        const node = eventPath[i];
        event.currentTarget = node;
        event.eventPhase = 1;
        const set = node === doc ? docListeners.get(`cap:${event.type}`) : node._capListeners.get(event.type);
        if (set) {
          for (const fn of [...set]) fn.call(node, event);
        }
      }
      for (const node of eventPath) {
        if (event._stopped) break;
        event.currentTarget = node;
        event.eventPhase = 2;
        const set = node === doc ? docListeners.get(event.type) : node._bubListeners.get(event.type);
        if (set) {
          for (const fn of [...set]) fn.call(node, event);
        }
        if (!event.bubbles) break;
      }
      return !event.defaultPrevented;
    }
    contains(other) {
      for (let cur = other; cur; cur = cur.parentNode) {
        if (cur === this) return true;
      }
      return false;
    }
  }

  class DomText extends DomNode {
    constructor(text, ownerDoc) {
      super(3, ownerDoc);
      this.nodeName = '#text';
      this._text = String(text);
    }
    get nodeValue() {
      return this._text;
    }
    set nodeValue(v) {
      this._text = String(v);
    }
    get textContent() {
      return this._text;
    }
    set textContent(v) {
      this._text = String(v);
    }
  }

  class DomComment extends DomNode {
    constructor(text, ownerDoc) {
      super(8, ownerDoc);
      this.nodeName = '#comment';
      this.data = String(text);
    }
  }

  class DomElement extends DomNode {
    constructor(tag, ownerDoc, ns = 'http://www.w3.org/1999/xhtml') {
      super(1, ownerDoc);
      this.tagName = String(tag).toUpperCase();
      this.nodeName = this.tagName;
      this.namespaceURI = ns;
      this._attrs = new Map();
      this.style = {};
      this.dataset = {};
      this.disabled = false;
      this.hidden = false;
      this.inert = false;
      this._value = '';
      this._checked = false;
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
    get type() {
      return this._attrs.get('type') ?? (this.tagName === 'BUTTON' ? 'submit' : 'text');
    }
    set type(v) {
      this.setAttribute('type', v);
    }
    get tabIndex() {
      const raw = this._attrs.get('tabindex');
      return raw != null ? Number.parseInt(raw, 10) : -1;
    }
    set tabIndex(v) {
      this.setAttribute('tabindex', String(v));
    }
    get value() {
      return this._value;
    }
    set value(v) {
      this._value = String(v ?? '');
    }
    get checked() {
      return this._checked;
    }
    set checked(v) {
      this._checked = Boolean(v);
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent ?? '').join('');
    }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(new DomText(String(v), this.ownerDocument));
    }
    setAttribute(name, value) {
      const k = String(name).toLowerCase();
      this._attrs.set(k, String(value));
      if (k === 'disabled') this.disabled = true;
      if (k === 'hidden') this.hidden = true;
      if (k === 'inert') this.inert = true;
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
      if (k === 'inert') this.inert = false;
    }
    descendants() {
      const out = [];
      for (const c of this.children) out.push(c, ...c.descendants());
      return out;
    }
    matchesSimple(part) {
      const p = part.trim();
      if (!p) return false;
      if (p === 'a[href]' || p === 'area[href]') {
        return this.tagName === p.split('[')[0].toUpperCase() && this.hasAttribute('href');
      }
      if (p === '[tabindex]') return this.hasAttribute('tabindex');
      if (p === '[contenteditable="true"]') return this.getAttribute('contenteditable') === 'true';
      if (p === '[role="dialog"]') return this.getAttribute('role') === 'dialog';
      if (p === '[role="alert"]') return this.getAttribute('role') === 'alert';
      if (p === '[role="status"]') return this.getAttribute('role') === 'status';
      if (p === '[hidden]') return this.hidden || this.hasAttribute('hidden');
      if (p === '[inert]') return this.inert || this.hasAttribute('inert');
      if (p === 'fieldset[disabled]') return this.tagName === 'FIELDSET' && this.disabled;
      if (p.startsWith('.')) return this.className.split(/\s+/).includes(p.slice(1));
      if (p.startsWith('#')) return this.id === p.slice(1);
      return this.tagName.toLowerCase() === p.toLowerCase();
    }
    closest(selector) {
      const parts = String(selector).split(',');
      for (let cur = this; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (parts.some((p) => cur.matchesSimple(p))) return cur;
      }
      return null;
    }
    querySelectorAll(selector) {
      const parts = String(selector).split(',');
      return this.descendants().filter((el) => parts.some((p) => el.matchesSimple(p)));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    focus() {
      if (!this.isConnected || this.disabled || this.closest('[hidden],[inert],fieldset[disabled]')) return;
      doc.activeElement = this;
      this.dispatchEvent(new DomEvent('focusin', {bubbles: true}));
    }
  }

  class DomIFrameElement extends DomElement {}
  DomElement.prototype.oninput = null;

  const doc = {
    nodeType: 9,
    activeElement: null,
    documentElement: null,
    body: null,
    defaultView: null,
    oninput: null,
    createElement: (tag) => new DomElement(tag, doc),
    createElementNS: (ns, tag) => new DomElement(tag, doc, ns),
    createTextNode: (t) => new DomText(t, doc),
    createComment: (t) => new DomComment(t, doc),
    addEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
      const key = cap ? `cap:${type}` : type;
      if (!docListeners.has(key)) docListeners.set(key, new Set());
      docListeners.get(key).add(fn);
    },
    removeEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
      const key = cap ? `cap:${type}` : type;
      docListeners.get(key)?.delete(fn);
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
  const winTarget = new EventTarget();
  const win = {
    document: doc,
    location: {pathname: '/'},
    localStorage: localStorageStub,
    // subscribeBuyerAuth đăng ký 'storage' trên window.
    addEventListener: (...args) => winTarget.addEventListener(...args),
    removeEventListener: (...args) => winTarget.removeEventListener(...args),
    dispatchEvent: (event) => winTarget.dispatchEvent(event),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    getComputedStyle: () => ({display: 'block', visibility: 'visible'}),
    HTMLElement: DomElement,
    HTMLInputElement: DomElement,
    HTMLIFrameElement: DomIFrameElement,
    SVGElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    Event: DomEvent,
  };
  doc.defaultView = win;

  return {doc, win, body};
}

async function withReactEnv(fn) {
  const dom = createReactTestDom();
  const prev = {
    actEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLIFrameElement: globalThis.HTMLIFrameElement,
    SVGElement: globalThis.SVGElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
  };
  const restoreGlobal = (name, value) => {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = dom.win;
  globalThis.document = dom.doc;
  globalThis.HTMLElement = dom.win.HTMLElement;
  globalThis.HTMLInputElement = dom.win.HTMLInputElement;
  globalThis.HTMLIFrameElement = dom.win.HTMLIFrameElement;
  globalThis.SVGElement = dom.win.SVGElement;
  globalThis.Element = dom.win.Element;
  globalThis.Node = dom.win.Node;

  const {createRoot} = await import('react-dom/client');
  try {
    await fn(dom, createRoot);
  } finally {
    restoreGlobal('IS_REACT_ACT_ENVIRONMENT', prev.actEnv);
    globalThis.window = prev.window;
    restoreGlobal('document', prev.document);
    restoreGlobal('HTMLElement', prev.HTMLElement);
    restoreGlobal('HTMLInputElement', prev.HTMLInputElement);
    restoreGlobal('HTMLIFrameElement', prev.HTMLIFrameElement);
    restoreGlobal('SVGElement', prev.SVGElement);
    restoreGlobal('Element', prev.Element);
    restoreGlobal('Node', prev.Node);
  }
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await tick();
  });
}

async function waitForReact(condition, what, tries = 100) {
  for (let i = 0; i < tries; i += 1) {
    if (condition()) return;
    await flushReact();
  }
  assert.fail(`Hết thời gian chờ: ${what}`);
}

// ---------------------------------------------------------------------------
// T1 (AC1): đăng nhập người mua -> gửi/xác minh OTP mock -> mở cổng chọn vé
// ---------------------------------------------------------------------------

test('T1: sự kiện bật OTP không mount phần chọn vé cho tới khi người mua xác minh OTP mock', async () => {
  const {svc, session} = await startDemoStory();

  // Đăng nhập lại (mock) bằng tài khoản vừa đăng ký.
  const signedIn = await svc.signInBuyer(BUYER_EMAIL, BUYER_PASSWORD);
  assert.equal(signedIn.userId, session.userId);
  const current = await svc.getBuyerSession();
  assert.equal(current?.userId, session.userId);
  assert.equal((await svc.kiemTraDaXacMinhOtp({userId: current.userId})).daXacMinh, false);

  const event = {id: DEMO_EVENT_ID, slug: DEMO_SLUG, selectedShow: {id: DEMO_SHOW_ID, slug: DEMO_SHOW_SLUG}};
  const accessChanges = [];

  await withReactEnv(async (dom, createRoot) => {
    const container = dom.doc.createElement('div');
    dom.body.appendChild(container);
    const root = createRoot(container);
    const renderGate = () =>
      React.createElement(
        svc.PurchaseAccessGate,
        {
          event,
          khoOtp: svc.khoTrangThaiOtpPhien,
          onAccessChange: (allowed) => accessChanges.push(allowed),
        },
        React.createElement('div', {id: SENTINEL_ID}, 'Chọn vé'),
      );

    try {
      await act(async () => {
        root.render(renderGate());
      });
      await waitForReact(
        () => container.textContent.includes('Xác minh OTP để chọn vé'),
        'cổng OTP hiển thị khung xác minh (CAN_OTP)',
      );

      // Chưa xác minh: khung cổng có mặt, phần chọn vé của sự kiện KHÔNG được mount.
      assert.ok(container.querySelector('#seating-section'), 'khung #seating-section của cổng phải có mặt');
      assert.equal(container.querySelector(`#${SENTINEL_ID}`), null, 'chưa xác minh thì không mount phần chọn vé');
      assert.equal(accessChanges.includes(true), false, 'onAccessChange không được báo true trước khi xác minh');

      // Gửi mã (dịch vụ thật), nhập sai một lần: cổng vẫn đóng.
      const kho = svc.khoTrangThaiOtpPhien;
      await act(async () => {
        await kho.thucHienGui(current, {guiMaOtp: svc.guiMaOtp});
      });
      assert.ok(kho.layChiTiet(current).trangThai.guiLuc !== null, 'gửi mã phải ghi mốc gửi');

      await act(async () => {
        await kho.thucHienXacMinh(current, '000000', {xacMinhMaOtp: svc.xacMinhMaOtp});
      });
      assert.ok(kho.layChiTiet(current).error, 'mã sai phải báo lỗi trong kho OTP');
      assert.equal(container.querySelector(`#${SENTINEL_ID}`), null, 'mã sai thì cổng vẫn đóng');
      assert.equal((await svc.kiemTraDaXacMinhOtp({userId: current.userId})).daXacMinh, false);

      // Xác minh bằng mã mô phỏng: cổng kiểm tra lại và mở.
      await act(async () => {
        await kho.thucHienXacMinh(current, svc.MA_MO_PHONG, {xacMinhMaOtp: svc.xacMinhMaOtp});
      });
      await waitForReact(() => container.querySelector(`#${SENTINEL_ID}`) !== null, 'phần chọn vé được mount sau xác minh');

      assert.equal(container.querySelector('#seating-section'), null, 'khung cổng phải biến mất khi cổng mở');
      assert.equal(accessChanges.at(-1), true, 'onAccessChange(true) phải được gọi sau khi xác minh');
      assert.equal((await svc.kiemTraDaXacMinhOtp({userId: current.userId})).daXacMinh, true);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// T2 (AC2): giới hạn 4 vé, hủy và hết hạn giải phóng số đếm
// ---------------------------------------------------------------------------

test('T2: giữ 3 vé rồi xin thêm 2 bị VUOT_GIOI_HAN_VE (giới hạn 4, còn lại 1) và không lưu giữ chỗ vượt giới hạn', async () => {
  const {svc} = await startDemoStory();

  const hold3 = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(17), vipItem(18), vipItem(19)]});
  assert.equal(hold3.status, 'ACTIVE');
  assert.equal(hold3.items.length, 3);

  await assert.rejects(
    () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(20), vipItem(21)]}),
    expectOverLimit({gioiHan: 4, dangGiu: 3, conLai: 1}),
  );

  // Yêu cầu 2 vé bị từ chối không chiếm hạn mức: vẫn còn đúng 1 vé.
  const hold1 = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(20)]});
  assert.equal(hold1.status, 'ACTIVE');

  // Đã đủ 4 vé: nếu lần bị từ chối ở trên có lưu thì dangGiu sẽ lớn hơn 4.
  await assert.rejects(
    () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(21)]}),
    expectOverLimit({gioiHan: 4, dangGiu: 4, conLai: 0}),
  );
});

test('T2: hủy giữ chỗ giải phóng số đếm vé', async () => {
  const {svc} = await startDemoStory();

  const holdA = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(17), vipItem(18), vipItem(19)]});
  await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(20)]});
  await assert.rejects(
    () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(21)]}),
    expectOverLimit({gioiHan: 4, dangGiu: 4, conLai: 0}),
  );

  await svc.releaseSeatHold(holdA.holdId);

  const holdC = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(22), vipItem(23), vipItem(24)]});
  assert.equal(holdC.status, 'ACTIVE', 'sau khi hủy 3 vé, người mua giữ lại được 3 vé');
  await assert.rejects(
    () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(25)]}),
    expectOverLimit({gioiHan: 4, dangGiu: 4, conLai: 0}),
  );
});

test('T2: giữ chỗ hết hạn (quá 300 giây) không còn tính vào giới hạn', async () => {
  const {svc} = await startDemoStory();

  await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(17), vipItem(18), vipItem(19)]});
  await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(20)]});
  await assert.rejects(
    () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(21)]}),
    expectOverLimit({gioiHan: 4, dangGiu: 4, conLai: 0}),
  );

  const restoreNow = advanceDateNow(301_000);
  try {
    const fresh = await svc.createSeatHold({
      eventId: DEMO_SLUG,
      items: [vipItem(22), vipItem(23), vipItem(24), vipItem(25)],
    });
    assert.equal(fresh.status, 'ACTIVE', 'giữ chỗ cũ đã hết hạn nên đủ 4 vé mới');
    await assert.rejects(
      () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(26)]}),
      expectOverLimit({gioiHan: 4, dangGiu: 4, conLai: 0}),
    );
  } finally {
    restoreNow();
  }
});

// ---------------------------------------------------------------------------
// T3 (AC3): engine -> PENDING -> BTC duyệt; giá khán giả chỉ đổi sau duyệt
// ---------------------------------------------------------------------------

test('T3: chạy engine lưu PENDING, giá chỉ đổi sau khi BTC duyệt; giữ chỗ cũ giữ DonGiaChot, subscriber đúng suất nhận thông báo', async () => {
  const {svc} = await startDemoStory();
  const nguoiDung = svc.DEMO_NGUOI_DUNG;

  const h1 = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(17)]});
  assert.equal(h1.items[0].DonGiaChot, VIP_SEED_PRICE);

  const restoreTarget = installGlobalEventTarget();
  const received = [];
  const decoyOtherShow = [];
  const decoyOtherEvent = [];
  const snapshots = {main: null, otherShow: null, otherEvent: null};
  const unsubscribes = [];
  try {
    unsubscribes.push(
      svc.subscribeToPriceUpdates((e) => received.push(e), () => {}, {
        scope: {suKienId: DEMO_EVENT_ID, suatDienId: DEMO_SHOW_ID},
        eventTarget: globalThis,
        onSnapshot: (prices) => {
          snapshots.main = prices;
        },
      }),
      svc.subscribeToPriceUpdates((e) => decoyOtherShow.push(e), () => {}, {
        scope: {suKienId: DEMO_EVENT_ID, suatDienId: 990199},
        eventTarget: globalThis,
        onSnapshot: (prices) => {
          snapshots.otherShow = prices;
        },
      }),
      svc.subscribeToPriceUpdates((e) => decoyOtherEvent.push(e), () => {}, {
        scope: {suKienId: 990002, suatDienId: DEMO_SHOW_ID},
        eventTarget: globalThis,
        onSnapshot: (prices) => {
          snapshots.otherEvent = prices;
        },
      }),
    );
    await waitUntil(
      () => snapshots.main && snapshots.otherShow && snapshots.otherEvent,
      'subscriber nhận ảnh chụp giá ban đầu',
    );
    assert.equal(snapshots.main.get(VIP_KHU_ID), VIP_SEED_PRICE);
    assert.equal(snapshots.otherShow.size, 0);
    assert.equal(snapshots.otherEvent.size, 0);

    // Engine chạy: VIP phải lưu được đề xuất PENDING (DA_LUU), giá khán giả chưa đổi.
    const run = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
    const vipRun = run.theoKhu.find((k) => k.khuVucId === VIP_KHU_ID);
    assertDaLuu(vipRun, 'Khu VIP demo');
    assert.equal(vipRun.giaHienTai, VIP_SEED_PRICE);
    assert.notEqual(vipRun.giaDeXuat, VIP_SEED_PRICE);

    const danhSach = await svc.layDanhSachDeXuat(DEMO_EVENT_ID, {nguoiDung});
    const pendingVip = danhSach.khuVuc
      .find((k) => k.khuVucId === VIP_KHU_ID)
      ?.deXuat.find((d) => d.trangThai === 'PENDING');
    assert.equal(pendingVip?.deXuatId, vipRun.deXuatId);

    const truocDuyet = await svc.docBangGiaChotDemo();
    assert.equal(truocDuyet.get('DEMO_VIP'), VIP_SEED_PRICE, 'giá VIP không đổi trước khi duyệt');
    const trangThaiTruoc = await svc.docTrangThaiMoPhong();
    assert.equal(trangThaiTruoc.state.nhatKyGia.length, 0, 'chưa duyệt thì chưa có nhật ký giá');
    await tick();
    await tick();
    assert.equal(received.length, 0, 'chưa duyệt thì không có thông báo giá');

    // BTC duyệt qua dịch vụ.
    const duyet = await svc.duyetDeXuatGia(vipRun.deXuatId, {}, {nguoiDung});
    assert.equal(duyet.ketQua, 'DA_DUYET');
    assert.equal(duyet.khuVucId, VIP_KHU_ID);
    assert.equal(duyet.giaCu, VIP_SEED_PRICE);
    assert.equal(duyet.giaMoi, vipRun.giaDeXuat);

    const sauDuyet = await svc.docBangGiaChotDemo();
    assert.equal(sauDuyet.get('DEMO_VIP'), duyet.giaMoi, 'giá VIP đổi sau khi duyệt');

    // Nhật ký giá: đúng một dòng, khớp kết quả duyệt.
    const trangThaiSau = await svc.docTrangThaiMoPhong();
    assert.equal(trangThaiSau.state.nhatKyGia.length, 1);
    const nhatKy = trangThaiSau.state.nhatKyGia[0];
    assert.equal(nhatKy.NhatKyGiaID, duyet.nhatKyGiaId);
    assert.equal(nhatKy.KhuVucID, VIP_KHU_ID);
    assert.equal(nhatKy.DeXuatID, vipRun.deXuatId);
    assert.equal(nhatKy.GiaCu, VIP_SEED_PRICE);
    assert.equal(nhatKy.GiaMoi, duyet.giaMoi);

    // Thông báo giá: subscriber đúng sự kiện/suất nhận đúng khu VIP, các subscriber khác không nhận gì.
    await waitUntil(() => received.length >= 1, 'subscriber đúng suất nhận thông báo giá');
    await tick();
    await tick();
    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'ZONE_PRICE_CHANGED');
    assert.equal(received[0].khuVucId, VIP_KHU_ID);
    assert.equal(received[0].gia, duyet.giaMoi);
    assert.equal(received[0].suKienId, DEMO_EVENT_ID);
    assert.equal(received[0].suatDienId, DEMO_SHOW_ID);
    assert.equal(decoyOtherShow.length, 0, 'suất khác của cùng sự kiện không nhận thông báo');
    assert.equal(decoyOtherEvent.length, 0, 'sự kiện khác không nhận thông báo');

    // Giữ chỗ trước duyệt giữ nguyên DonGiaChot; giữ chỗ mới nhận giá đã duyệt.
    assert.equal(h1.items[0].DonGiaChot, VIP_SEED_PRICE);
    const h2 = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(18)]});
    assert.equal(h2.items[0].DonGiaChot, duyet.giaMoi);
    assert.equal(h1.items[0].DonGiaChot, VIP_SEED_PRICE);
  } finally {
    for (const unsubscribe of unsubscribes) unsubscribe();
    restoreTarget();
  }
});

// ---------------------------------------------------------------------------
// Xuyên suốt (AC1-AC3): MỘT bundle, MỘT phiên người mua, MỘT kho OTP, không reset giữa các bước
// ---------------------------------------------------------------------------

test('xuyên suốt: đăng nhập -> OTP -> mở cổng -> giữ 3 vé -> xin thêm 2 bị từ chối -> engine PENDING -> BTC duyệt -> giữ chỗ cũ giữ DonGiaChot', async () => {
  // startDemoStory chỉ được gọi MỘT lần; từ đây không xóa store, không nạp lại bundle, không đăng xuất/đăng ký lại.
  const {svc, session} = await startDemoStory();
  const nguoiDung = svc.DEMO_NGUOI_DUNG;

  // 1. Đăng nhập người mua; chưa xác minh OTP.
  const signedIn = await svc.signInBuyer(BUYER_EMAIL, BUYER_PASSWORD);
  assert.equal(signedIn.userId, session.userId);
  const current = await svc.getBuyerSession();
  assert.equal(current?.userId, session.userId);
  assert.equal((await svc.kiemTraDaXacMinhOtp({userId: current.userId})).daXacMinh, false);

  const event = {id: DEMO_EVENT_ID, slug: DEMO_SLUG, selectedShow: {id: DEMO_SHOW_ID, slug: DEMO_SHOW_SLUG}};
  const accessChanges = [];
  const restoreTarget = installGlobalEventTarget();
  const unsubscribes = [];

  await withReactEnv(async (dom, createRoot) => {
    const container = dom.doc.createElement('div');
    dom.body.appendChild(container);
    const root = createRoot(container);
    const kho = svc.khoTrangThaiOtpPhien;

    try {
      // 2. Cổng OTP: chưa xác minh thì không mount phần chọn vé.
      await act(async () => {
        root.render(
          React.createElement(
            svc.PurchaseAccessGate,
            {event, khoOtp: kho, onAccessChange: (allowed) => accessChanges.push(allowed)},
            React.createElement('div', {id: SENTINEL_ID}, 'Chọn vé'),
          ),
        );
      });
      await waitForReact(
        () => container.textContent.includes('Xác minh OTP để chọn vé'),
        'cổng OTP hiển thị khung xác minh (CAN_OTP)',
      );
      assert.equal(container.querySelector(`#${SENTINEL_ID}`), null, 'chưa xác minh thì không mount phần chọn vé');
      assert.equal(accessChanges.includes(true), false, 'onAccessChange không được báo true trước khi xác minh');

      // 3. Gửi mã, nhập sai một lần (cổng vẫn đóng), rồi mã mô phỏng (cổng mở).
      await act(async () => {
        await kho.thucHienGui(current, {guiMaOtp: svc.guiMaOtp});
      });
      await act(async () => {
        await kho.thucHienXacMinh(current, '000000', {xacMinhMaOtp: svc.xacMinhMaOtp});
      });
      assert.ok(kho.layChiTiet(current).error, 'mã sai phải báo lỗi trong kho OTP');
      assert.equal(container.querySelector(`#${SENTINEL_ID}`), null, 'mã sai thì cổng vẫn đóng');
      await act(async () => {
        await kho.thucHienXacMinh(current, svc.MA_MO_PHONG, {xacMinhMaOtp: svc.xacMinhMaOtp});
      });
      await waitForReact(() => container.querySelector(`#${SENTINEL_ID}`) !== null, 'phần chọn vé được mount sau xác minh');
      assert.equal(accessChanges.at(-1), true, 'onAccessChange(true) phải được gọi sau khi xác minh');

      // 4. Cùng phiên, cổng vẫn mở: giữ 3 vé VIP ở giá seed.
      const hold3 = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(17), vipItem(18), vipItem(19)]});
      assert.equal(hold3.status, 'ACTIVE');
      assert.equal(hold3.items.length, 3);
      for (const item of hold3.items) assert.equal(item.DonGiaChot, VIP_SEED_PRICE);

      // 5. Xin thêm 2 vé: bị từ chối (giới hạn 4, đang giữ 3, còn lại 1).
      await assert.rejects(
        () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(20), vipItem(21)]}),
        expectOverLimit({gioiHan: 4, dangGiu: 3, conLai: 1}),
      );

      // 6. Subscriber giá: đúng sự kiện/suất + hai subscriber mồi (suất khác, sự kiện khác).
      const received = [];
      const decoyOtherShow = [];
      const decoyOtherEvent = [];
      const snapshots = {main: null, otherShow: null, otherEvent: null};
      unsubscribes.push(
        svc.subscribeToPriceUpdates((e) => received.push(e), () => {}, {
          scope: {suKienId: DEMO_EVENT_ID, suatDienId: DEMO_SHOW_ID},
          eventTarget: globalThis,
          onSnapshot: (prices) => {
            snapshots.main = prices;
          },
        }),
        svc.subscribeToPriceUpdates((e) => decoyOtherShow.push(e), () => {}, {
          scope: {suKienId: DEMO_EVENT_ID, suatDienId: 990199},
          eventTarget: globalThis,
          onSnapshot: (prices) => {
            snapshots.otherShow = prices;
          },
        }),
        svc.subscribeToPriceUpdates((e) => decoyOtherEvent.push(e), () => {}, {
          scope: {suKienId: 990002, suatDienId: DEMO_SHOW_ID},
          eventTarget: globalThis,
          onSnapshot: (prices) => {
            snapshots.otherEvent = prices;
          },
        }),
      );
      await waitUntil(
        () => snapshots.main && snapshots.otherShow && snapshots.otherEvent,
        'subscriber nhận ảnh chụp giá ban đầu',
      );
      assert.equal(snapshots.main.get(VIP_KHU_ID), VIP_SEED_PRICE);
      assert.equal(snapshots.otherShow.size, 0);
      assert.equal(snapshots.otherEvent.size, 0);

      // 7. Engine chạy khi đang giữ 3 vé: VIP phải lưu PENDING. Nếu engine bỏ qua khu VIP (BO_QUA) vì không có
      //    tín hiệu cầu, mô phỏng cầu ban_nhanh NGAY TRONG kịch bản này rồi chạy lại; assertDaLuu không được nới.
      let run = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
      if (run.theoKhu.find((k) => k.khuVucId === VIP_KHU_ID)?.ketQua === 'BO_QUA') {
        const fast = await svc.moPhongNhuCau(DEMO_EVENT_ID, 'ban_nhanh');
        assert.equal(fast.ketQua, 'DA_MO_PHONG');
        run = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
      }
      const vipRun = run.theoKhu.find((k) => k.khuVucId === VIP_KHU_ID);
      assertDaLuu(vipRun, 'Khu VIP demo (đang giữ 3 vé)');
      assert.equal(vipRun.giaHienTai, VIP_SEED_PRICE);
      assert.notEqual(vipRun.giaDeXuat, VIP_SEED_PRICE);

      const danhSach = await svc.layDanhSachDeXuat(DEMO_EVENT_ID, {nguoiDung});
      assert.ok(pendingIdsOf(danhSach).includes(vipRun.deXuatId), 'đề xuất VIP phải ở trạng thái PENDING');

      // 8. Trước duyệt: giá không đổi, chưa có nhật ký, chưa có thông báo.
      assert.equal((await svc.docBangGiaChotDemo()).get('DEMO_VIP'), VIP_SEED_PRICE, 'giá VIP không đổi trước khi duyệt');
      assert.equal((await svc.docTrangThaiMoPhong()).state.nhatKyGia.length, 0, 'chưa duyệt thì chưa có nhật ký giá');
      await tick();
      await tick();
      assert.equal(received.length, 0, 'chưa duyệt thì không có thông báo giá');

      // 9. BTC duyệt qua dịch vụ.
      const duyet = await svc.duyetDeXuatGia(vipRun.deXuatId, {}, {nguoiDung});
      assert.equal(duyet.ketQua, 'DA_DUYET');
      assert.equal(duyet.khuVucId, VIP_KHU_ID);
      assert.equal(duyet.giaCu, VIP_SEED_PRICE);
      assert.equal(duyet.giaMoi, vipRun.giaDeXuat);
      assert.equal((await svc.docBangGiaChotDemo()).get('DEMO_VIP'), duyet.giaMoi, 'giá VIP đổi sau khi duyệt');

      const trangThaiSau = await svc.docTrangThaiMoPhong();
      assert.equal(trangThaiSau.state.nhatKyGia.length, 1);
      const nhatKy = trangThaiSau.state.nhatKyGia[0];
      assert.equal(nhatKy.NhatKyGiaID, duyet.nhatKyGiaId);
      assert.equal(nhatKy.KhuVucID, VIP_KHU_ID);
      assert.equal(nhatKy.DeXuatID, vipRun.deXuatId);
      assert.equal(nhatKy.GiaCu, VIP_SEED_PRICE);
      assert.equal(nhatKy.GiaMoi, duyet.giaMoi);

      await waitUntil(() => received.length >= 1, 'subscriber đúng suất nhận thông báo giá');
      await tick();
      await tick();
      assert.equal(received.length, 1);
      assert.equal(received[0].type, 'ZONE_PRICE_CHANGED');
      assert.equal(received[0].khuVucId, VIP_KHU_ID);
      assert.equal(received[0].gia, duyet.giaMoi);
      assert.equal(received[0].suKienId, DEMO_EVENT_ID);
      assert.equal(received[0].suatDienId, DEMO_SHOW_ID);
      assert.equal(decoyOtherShow.length, 0, 'suất khác của cùng sự kiện không nhận thông báo');
      assert.equal(decoyOtherEvent.length, 0, 'sự kiện khác không nhận thông báo');

      // 10. Giữ chỗ trước duyệt giữ nguyên DonGiaChot; giữ chỗ mới (vé thứ 4) nhận giá đã duyệt.
      for (const item of hold3.items) assert.equal(item.DonGiaChot, VIP_SEED_PRICE, 'DonGiaChot của hold3 không đổi');
      assert.ok(container.querySelector(`#${SENTINEL_ID}`), 'cổng vẫn mở sau khi duyệt giá');
      const hold1 = await svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(20)]});
      assert.equal(hold1.status, 'ACTIVE');
      assert.equal(hold1.items[0].DonGiaChot, duyet.giaMoi);

      // 11. Đã đủ 4 vé: lần xin 2 vé bị từ chối ở bước 5 không chiếm hạn mức (nếu có thì dangGiu > 4).
      await assert.rejects(
        () => svc.createSeatHold({eventId: DEMO_SLUG, items: [vipItem(21)]}),
        expectOverLimit({gioiHan: 4, dangGiu: 4, conLai: 0}),
      );
      for (const item of hold3.items) assert.equal(item.DonGiaChot, VIP_SEED_PRICE);
    } finally {
      for (const unsubscribe of unsubscribes) unsubscribe();
      restoreTarget();
      await act(async () => {
        root.unmount();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// T4 (AC4): ban_nhanh rồi ban_cham, kết thúc PENDING hợp lệ giữa hai lần
// ---------------------------------------------------------------------------

test('T4: ban_nhanh đề xuất tăng giá, kết thúc PENDING hợp lệ, rồi ban_cham đề xuất đổi hướng (giảm)', async () => {
  const {svc} = await startDemoStory();
  const nguoiDung = svc.DEMO_NGUOI_DUNG;

  // --- ban_nhanh ---
  const fast = await svc.moPhongNhuCau(DEMO_EVENT_ID, 'ban_nhanh');
  assert.equal(fast.ketQua, 'DA_MO_PHONG');
  assert.equal(fast.kichBan, 'ban_nhanh');

  const run1 = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
  assert.equal(run1.theoKhu.length, 3);
  for (const zone of run1.theoKhu) {
    assertDaLuu(zone, `ban_nhanh, khu ${zone.khuVucId}`);
    assert.ok(zone.giaDeXuat > zone.giaHienTai, `ban_nhanh khu ${zone.khuVucId}: ${zone.giaDeXuat} phải > ${zone.giaHienTai}`);
  }
  const vipUp = run1.theoKhu.find((k) => k.khuVucId === VIP_KHU_ID);
  const economyUp = run1.theoKhu.find((k) => k.khuVucId === ECONOMY_KHU_ID);
  assert.equal(vipUp.giaHienTai, VIP_SEED_PRICE);
  assert.equal(economyUp.giaHienTai, ECONOMY_SEED_PRICE);

  // PENDING hiển thị đúng với các đề xuất vừa lưu.
  const listed1 = await svc.layDanhSachDeXuat(DEMO_EVENT_ID, {nguoiDung});
  assert.deepEqual(
    pendingIdsOf(listed1),
    run1.theoKhu.map((z) => z.deXuatId).sort((a, b) => a - b),
  );

  // Kết thúc PENDING hợp lệ giữa hai lần: BTC từ chối từng đề xuất.
  for (const zone of run1.theoKhu) {
    const rejected = await svc.tuChoiDeXuatGia(zone.deXuatId, {lyDo: 'Kết thúc lượt ban_nhanh'}, {nguoiDung});
    assert.equal(rejected.ketQua, 'DA_TU_CHOI', `khu ${zone.khuVucId}: từ chối phải trả DA_TU_CHOI`);
  }
  assert.deepEqual(pendingIdsOf(await svc.layDanhSachDeXuat(DEMO_EVENT_ID, {nguoiDung})), []);
  const bangSauTuChoi = await svc.docBangGiaChotDemo();
  assert.equal(bangSauTuChoi.get('DEMO_VIP'), VIP_SEED_PRICE, 'từ chối không đổi giá');
  assert.equal(bangSauTuChoi.get('DEMO_ECONOMY'), ECONOMY_SEED_PRICE, 'từ chối không đổi giá');

  // --- ban_cham ---
  const slow = await svc.moPhongNhuCau(DEMO_EVENT_ID, 'ban_cham');
  assert.equal(slow.ketQua, 'DA_MO_PHONG');
  assert.equal(slow.kichBan, 'ban_cham');

  const run2 = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
  assert.equal(run2.theoKhu.length, 3);
  for (const zone of run2.theoKhu) assertDaLuu(zone, `ban_cham, khu ${zone.khuVucId}`);
  const economyDown = run2.theoKhu.find((k) => k.khuVucId === ECONOMY_KHU_ID);
  assert.equal(economyDown.giaHienTai, ECONOMY_SEED_PRICE);
  assert.ok(
    economyDown.giaDeXuat < economyDown.giaHienTai,
    `ban_cham khu Phổ thông: ${economyDown.giaDeXuat} phải < ${economyDown.giaHienTai}`,
  );
  assert.ok(economyUp.giaDeXuat > economyUp.giaHienTai && economyDown.giaDeXuat < economyDown.giaHienTai, 'đề xuất phải đổi hướng');
  assert.ok(economyDown.giaDeXuat < economyUp.giaDeXuat);

  // Kết thúc PENDING lần hai bằng cách hết hạn (TTL đề xuất 120 phút).
  const restoreNow = advanceDateNow(121 * 60_000);
  try {
    const expired = await svc.hetHanDeXuat(DEMO_EVENT_ID);
    assert.equal(expired.soLuong, 3);
    assert.deepEqual(
      [...expired.deXuatHetHan].sort((a, b) => a - b),
      run2.theoKhu.map((z) => z.deXuatId).sort((a, b) => a - b),
    );
  } finally {
    restoreNow();
  }
  assert.deepEqual(pendingIdsOf(await svc.layDanhSachDeXuat(DEMO_EVENT_ID, {nguoiDung})), []);
});
