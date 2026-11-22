import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {build} from 'esbuild';
import React, {act} from 'react';
import {
  createDialogFocusScope,
  resolveDialogKeyDown,
} from '../src/components/organizer-ui/pricingPanelController.js';
import {PRICING_FIELDS} from '../src/components/organizer-ui/pricingFormLogic.js';
import {PricingServiceError, ghepDanhSachDeXuat} from '../src/domain/pricingServiceCore.js';
import {
  createMockState,
  duyetDeXuatGia as duyetMock,
  layDeXuatGia,
  tuChoiDeXuatGia as tuChoiMock,
} from '../src/domain/mockPricing.js';
import {
  DEMO_KHU_IDS,
  DEMO_NGUOI_DUNG,
  DEMO_SU_KIEN_ID,
  DEMO_TO_CHUC_ID,
  khoiTaoDemoPricing,
} from '../src/domain/pricingMockDemo.js';

/**
 * Bộ kiểm thử tiếp cận (Accessibility) Sprint 2 cho hai màn hình định giá BTC:
 * - OrganizerPricingPanel + OrganizerPricingConfig
 * - OrganizerPriceProposals
 *
 * Lưu ý nghiệm thu: Bộ test tự động này xác minh ngữ nghĩa ARIA, liên kết label/lỗi,
 * bẫy focus (Tab/Shift+Tab/Escape/focusin/inert), thông báo live region và quy tắc CSS
 * trên DOM mô phỏng React 19. Kiểm tra điều hướng bàn phím thực tế và bố cục trực quan
 * ở độ rộng 360 px trên trình duyệt thật vẫn là bước nghiệm thu thủ công bắt buộc.
 */
export const MANUAL_ACCEPTANCE_NOTE =
  'Kiểm tra bàn phím và bố cục trên trình duyệt thật (bao gồm viewport 360 px) là bước nghiệm thu thủ công.';

const NOW = '2026-11-21T10:00:00.000Z';
const EVENT = {
  id: DEMO_SU_KIEN_ID,
  name: 'Đêm nhạc Demo Pricing',
  organizationId: DEMO_TO_CHUC_ID,
  moPhong: true,
};
const OWNER_ORG = {organizationId: DEMO_TO_CHUC_ID, role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'};
const OWNER_ORGS = [OWNER_ORG];
const VIEWER_ORG = {organizationId: DEMO_TO_CHUC_ID, role: 'BIEN_TAP', accountKind: 'ORGANIZER'};

const SAMPLE_ROWS = [
  {
    khu_vuc_id: DEMO_KHU_IDS[0],
    suat_dien_id: 101,
    su_kien_id: DEMO_SU_KIEN_ID,
    ma_khu_vuc: 'VIP',
    ten_khu_vuc: 'Khu VIP',
    trang_thai_suat: 'DANG_MO_BAN',
    co_quy_tac: true,
    kich_hoat: true,
    gia_hien_hanh: 1_500_000,
    gia_goc: 1_500_000,
    gia_san: 1_050_000,
    gia_tran: 2_250_000,
    buoc_nhay: 50_000,
    bien_do: 0.15,
    nguong_thap: 0.3,
    nguong_cao: 0.8,
    trong_so_lap_day: 0.5,
    trong_so_toc_do: 0.3,
    trong_so_thoi_gian: 0.2,
    mo_phong: true,
  },
];

let cachedComponentsPromise = null;
async function loadPricingComponents() {
  if (!cachedComponentsPromise) {
    cachedComponentsPromise = (async () => {
      const built = await build({
        stdin: {
          contents: `
            export { OrganizerPricingPanel } from './src/components/organizer-ui/OrganizerPricingPanel.tsx';
            export { OrganizerPriceProposals } from './src/components/organizer-ui/OrganizerPriceProposals.tsx';
          `,
          resolveDir: process.cwd(),
          loader: 'ts',
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        plugins: [
          {
            name: 'a11y-test-stubs',
            setup(b) {
              b.onResolve({filter: /^react(\/jsx-runtime)?$/}, (args) => ({
                path: import.meta.resolve(args.path),
                external: true,
              }));
              b.onResolve({filter: /\.css$/}, () => ({path: 'css', namespace: 'stub'}));
              b.onResolve({filter: /services\/pricingService$/}, () => ({path: 'pricingService', namespace: 'stub'}));
              b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
                contents: `
                  export const DEMO_NGUOI_DUNG = {};
                  export function laySoLieuDinhGia() {}
                  export function luuCauHinhGia() {}
                  export function chayDinhGiaNgay() {}
                  export function moPhongNhuCau() {}
                  export function layDanhSachDeXuat() {}
                  export function duyetDeXuatGia() {}
                  export function tuChoiDeXuatGia() {}
                `,
                loader: 'js',
              }));
            },
          },
        ],
      });
      const modUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`;
      return import(modUrl);
    })();
  }
  return cachedComponentsPromise;
}

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
      event._path = path;
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
    contains(other) {
      for (let cur = other; cur; cur = cur.parentNode) {
        if (cur === this) return true;
      }
      return false;
    }
  }

  class DomText extends DomNode {
    constructor(text, doc) {
      super(3, doc);
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
    constructor(text, doc) {
      super(8, doc);
      this.nodeName = '#comment';
      this.data = String(text);
    }
  }

  class DomElement extends DomNode {
    constructor(tag, doc, ns = 'http://www.w3.org/1999/xhtml') {
      super(1, doc);
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
      this.checked = false;
      this.selected = false;
    }
    get options() {
      return this.descendants().filter((el) => el.tagName === 'OPTION');
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
    get htmlFor() {
      return this._attrs.get('for') ?? '';
    }
    set htmlFor(v) {
      this.setAttribute('for', v);
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
      const tokens = p.match(/(?:^[a-zA-Z0-9_-]+)|(?:\.[a-zA-Z0-9_-]+)|(?:#[a-zA-Z0-9_-]+)|(?:\[[^\]]+\])/g);
      if (!tokens || tokens.join('') !== p) return false;
      return tokens.every((tok) => {
        if (tok === '[tabindex]') return this.hasAttribute('tabindex');
        if (tok === '[disabled]') return this.disabled || this.hasAttribute('disabled');
        if (tok === '[hidden]') return this.hidden || this.hasAttribute('hidden');
        if (tok === '[inert]') return this.inert || this.hasAttribute('inert');
        if (tok.startsWith('[')) {
          const m = tok.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/);
          if (!m) return false;
          const [, attrName, attrVal] = m;
          if (attrVal === undefined) return this.hasAttribute(attrName);
          return this.getAttribute(attrName) === attrVal;
        }
        if (tok.startsWith('.')) return this.className.split(/\s+/).includes(tok.slice(1));
        if (tok.startsWith('#')) return this.id === tok.slice(1);
        return this.tagName.toLowerCase() === tok.toLowerCase();
      });
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

  const doc = {
    nodeType: 9,
    activeElement: null,
    documentElement: null,
    body: null,
    defaultView: null,
    oninput: null,
    onchange: null,
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
    listenerCount: (type) => docListeners.get(type)?.size ?? 0,
  };
  const html = new DomElement('html', doc);
  const body = new DomElement('body', doc);
  html.appendChild(body);
  doc.documentElement = html;
  doc.body = body;
  doc.activeElement = body;
  const win = {
    document: doc,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    getComputedStyle: () => ({display: 'block', visibility: 'visible'}),
    HTMLElement: DomElement,
    HTMLIFrameElement: DomIFrameElement,
    SVGElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    Event: DomEvent,
  };
  doc.defaultView = win;

  function click(el) {
    if (!el || el.disabled) return;
    const ev = new DomEvent('click', {bubbles: true, cancelable: true});
    el.dispatchEvent(ev);
    if (!ev.defaultPrevented && el.tagName === 'BUTTON' && el.type === 'submit') {
      const form = el.closest('form');
      if (form) form.dispatchEvent(new DomEvent('submit', {bubbles: true, cancelable: true}));
    }
  }

  function pressKey(el, key, {shiftKey = false} = {}) {
    const ev = new DomEvent('keydown', {bubbles: true, cancelable: true, key, shiftKey});
    (el ?? doc.activeElement ?? doc.body).dispatchEvent(ev);
    return ev;
  }

  function setInputValue(el, value) {
    if (doc.activeElement !== el && typeof el.focus === 'function') el.focus();
    const proto = Object.getPrototypeOf(el);
    const ownDesc = Object.getOwnPropertyDescriptor(el, 'value');
    const protoDesc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (ownDesc && ownDesc.set) {
      // React attaches a value tracker on the element instance; assign via prototype then dispatch input.
      protoDesc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new DomEvent('input', {bubbles: true, cancelable: true}));
    el.dispatchEvent(new DomEvent('change', {bubbles: true, cancelable: true}));
  }

  return {doc, win, body, click, pressKey, setInputValue, DomEvent};
}

async function withTestDom(fn) {
  const components = await loadPricingComponents();
  const dom = createReactTestDom();
  const prev = {
    actEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLIFrameElement: globalThis.HTMLIFrameElement,
    SVGElement: globalThis.SVGElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = dom.win;
  globalThis.document = dom.doc;
  globalThis.HTMLElement = dom.win.HTMLElement;
  globalThis.HTMLIFrameElement = dom.win.HTMLIFrameElement;
  globalThis.SVGElement = dom.win.SVGElement;
  globalThis.Element = dom.win.Element;
  globalThis.Node = dom.win.Node;

  const {createRoot} = await import('react-dom/client');

  const mainShell = dom.doc.createElement('main');
  const openerBtn = dom.doc.createElement('button');
  openerBtn.type = 'button';
  openerBtn.textContent = 'Mở cấu hình giá';
  mainShell.appendChild(openerBtn);
  dom.body.appendChild(mainShell);
  openerBtn.focus();

  const container = dom.doc.createElement('div');
  dom.body.appendChild(container);
  const root = createRoot(container);

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const renderElement = async (el) => {
    await act(async () => {
      root.render(el);
    });
  };

  try {
    await fn({...components, dom, mainShell, openerBtn, container, root, renderElement, flush});
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prev.actEnv;
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.HTMLElement = prev.HTMLElement;
    globalThis.HTMLIFrameElement = prev.HTMLIFrameElement;
    globalThis.SVGElement = prev.SVGElement;
    globalThis.Element = prev.Element;
    globalThis.Node = prev.Node;
  }
}

function makePendingProposalState() {
  const state = khoiTaoDemoPricing(createMockState(), NOW);
  const khuId = DEMO_KHU_IDS[0];
  state.deXuatGia.push({
    DeXuatID: 9001,
    KhuVucID: khuId,
    QuyTacGiaID: state.quyTacGia[khuId].QuyTacGiaID,
    TrangThaiDuyet: 'PENDING',
    GiaHienTai: state.khuVuc[khuId].GiaVeNiemYet,
    GiaDeXuat: 1_650_000,
    TyLeLapDay: 0.45,
    TocDoBanThucTe: 3,
    TocDoBanKyVong: 2,
    SoGioConLai: 48,
    LoaiCanhBao: 'BINH_THUONG',
    CoCanhBaoVuotKhung: false,
    LyDoDeXuat: 'Nhu cầu tăng',
    ThoiGianDeXuat: NOW,
  });
  return state;
}

function makeServices({proposalSeed} = {}) {
  const state = proposalSeed ?? makePendingProposalState();
  return {
    panelServices: {
      laySoLieuDinhGia: async () => ({nguon: 'MO_PHONG', luuTru: null, hang: SAMPLE_ROWS}),
      luuCauHinhGia: async () => ({
        nguon: 'MO_PHONG',
        luuTru: null,
        ok: true,
        taoMoi: false,
        canhBao: [],
        deXuatHetHieuLuc: [],
      }),
      chayDinhGiaNgay: async () => ({
        nguon: 'MO_PHONG',
        luuTru: null,
        suKienId: DEMO_SU_KIEN_ID,
        hetHan: {soLuong: 0, deXuatHetHan: []},
        theoKhu: [],
      }),
      moPhongNhuCau: async (_id, kichBan) => ({
        nguon: 'MO_PHONG',
        luuTru: null,
        ketQua: 'DA_MO_PHONG',
        kichBan,
        thoiDiemNeo: NOW,
        suatDaMoPhong: [101],
        suatBoQua: [],
        datLai: {tong: 1, boQuaDaThayDoi: 0, boQuaDangKhoa: 0, chuaDatLai: 0},
        khuVuc: [],
      }),
    },
    proposalServices: {
      layDanhSachDeXuat: async (suKienId) => {
        const {result} = layDeXuatGia(state, suKienId, DEMO_NGUOI_DUNG, NOW);
        if (result.ok === false) {
          throw new PricingServiceError(result.loi.ma, null, {status: result.loi.status, ma: result.loi.ma});
        }
        return {nguon: 'MO_PHONG', luuTru: null, suKienId, khuVuc: ghepDanhSachDeXuat(result.soLieu, result.deXuat, NOW)};
      },
      duyetDeXuatGia: async (deXuatId, params = {}) => {
        const {state: next, result} = duyetMock(
          state,
          {deXuatId, ghiChu: params.ghiChu ?? null, giaDieuChinh: params.giaDieuChinh, nguoiDung: DEMO_NGUOI_DUNG},
          NOW,
        );
        Object.assign(state, next);
        if (result.ok === false && result.loi) {
          throw new PricingServiceError(result.loi.ma, null, {
            status: result.loi.status,
            ma: result.loi.ma,
            chiTiet: result.loi.chiTiet ?? null,
          });
        }
        return result;
      },
      tuChoiDeXuatGia: async (deXuatId, params = {}) => {
        const {state: next, result} = tuChoiMock(
          state,
          {deXuatId, lyDo: params.lyDo ?? null, nguoiDung: DEMO_NGUOI_DUNG},
          NOW,
        );
        Object.assign(state, next);
        if (result.ok === false && result.loi) {
          throw new PricingServiceError(result.loi.ma, null, {
            status: result.loi.status,
            ma: result.loi.ma,
            chiTiet: result.loi.chiTiet ?? null,
          });
        }
        return result;
      },
    },
  };
}

function renderPricingPanelTree({OrganizerPricingPanel, OrganizerPriceProposals, panelServices, proposalServices, activeOrg = OWNER_ORG, onClose = () => {}}) {
  return React.createElement(OrganizerPricingPanel, {
    event: EVENT,
    activeOrg,
    onClose,
    services: panelServices,
    renderProposals: (ctx) =>
      React.createElement(OrganizerPriceProposals, {
        event: EVENT,
        activeOrg: OWNER_ORGS,
        rows: ctx.rows,
        refreshMetrics: ctx.refreshMetrics,
        services: proposalServices,
      }),
  });
}

function assertAccessibleFormControl(container, control) {
  const id = control.id;
  assert.ok(id, `trường ${control.tagName} thiếu id`);
  const labels = container.querySelectorAll('label').filter((l) => l.getAttribute('for') === id);
  assert.equal(labels.length, 1, `trường #${id} phải liên kết đúng 1 <label htmlFor="${id}">`);
  assert.ok(labels[0].textContent.trim().length > 0, `label của #${id} không được rỗng`);
}

// ---------------------------------------------------------------------------
// AC1: Tên truy cập được, nút chỉ biểu tượng, liên kết label + lỗi/gợi ý
// ---------------------------------------------------------------------------

test('AC1: mọi nút có tên truy cập, nút chỉ có biểu tượng có aria-label, mọi input/select/textarea liên kết label và id/aria-describedby', async () => {
  await withTestDom(async ({OrganizerPricingPanel, OrganizerPriceProposals, container, dom, renderElement, flush}) => {
    const {panelServices, proposalServices} = makeServices();
    await renderElement(renderPricingPanelTree({OrganizerPricingPanel, OrganizerPriceProposals, panelServices, proposalServices}));
    await flush();

    // Nút chỉ có biểu tượng đóng panel phải có aria-label rõ ràng.
    const panelCloseBtn = container.querySelector('button[aria-label="Đóng cấu hình giá"]');
    assert.ok(panelCloseBtn);
    assert.equal(panelCloseBtn.textContent.trim(), '');

    // Mọi button trong panel đều phải có tên truy cập được (text hoặc aria-label).
    for (const btn of container.querySelectorAll('button')) {
      const name = (btn.getAttribute('aria-label') || btn.textContent || '').trim();
      assert.ok(name.length > 0, 'button phải có tên truy cập được');
    }

    // Kiểm tra mọi input/select/textarea trong config + simulator đều có <label htmlFor>.
    const formControls = container.querySelectorAll('input, select, textarea');
    assert.ok(formControls.length >= 13);
    for (const ctrl of formControls) {
      assertAccessibleFormControl(container, ctrl);
    }

    // Gửi biểu mẫu cấu hình không hợp lệ -> xác minh aria-invalid + aria-describedby + id lỗi + chuyển focus.
    const giaSanInput = container.querySelector('#pricing-giaSan');
    await act(async () => {
      dom.setInputValue(giaSanInput, 'khong-hop-le');
    });
    const saveBtn = container.querySelectorAll('button').find((b) => b.textContent.includes('Lưu cấu hình'));
    await act(async () => {
      dom.click(saveBtn);
    });
    await flush();

    assert.equal(giaSanInput.getAttribute('aria-invalid'), 'true');
    assert.equal(giaSanInput.getAttribute('aria-describedby'), 'pricing-giaSan-error');
    const sanErr = container.querySelector('#pricing-giaSan-error');
    assert.ok(sanErr);
    assert.equal(sanErr.getAttribute('role'), 'alert');
    assert.ok(sanErr.textContent.trim().length > 0);
    assert.equal(dom.doc.activeElement, giaSanInput);

    // Mở hộp thoại "Duyệt với giá điều chỉnh" trong OrganizerPriceProposals để kiểm tra label, hint + error aria-describedby.
    const adjustOpenBtn = container.querySelectorAll('button').find((b) => b.textContent.includes('Duyệt với giá điều chỉnh'));
    await act(async () => {
      dom.click(adjustOpenBtn);
    });

    const nestedDialog = container.querySelector('.org-proposal-dialog');
    assert.ok(nestedDialog);
    const dialogCloseBtn = nestedDialog.querySelector('button[aria-label="Đóng hộp thoại xử lý đề xuất"]');
    assert.ok(dialogCloseBtn);
    assert.equal(dialogCloseBtn.textContent.trim(), '');

    const adjPrice = nestedDialog.querySelector('#proposal-adjusted-price');
    const adjNote = nestedDialog.querySelector('#proposal-adjusted-note');
    assertAccessibleFormControl(nestedDialog, adjPrice);
    assertAccessibleFormControl(nestedDialog, adjNote);
    assert.equal(adjPrice.getAttribute('aria-describedby'), 'proposal-adjusted-price-hint');
    assert.ok(nestedDialog.querySelector('#proposal-adjusted-price-hint'));

    // Gửi giá ngoài khung + thiếu lý do -> aria-describedby phải giữ CẢ hint lẫn error.
    await act(async () => {
      dom.setInputValue(adjPrice, '100');
      dom.setInputValue(adjNote, '   ');
    });
    const submitAdjustBtn = nestedDialog.querySelectorAll('button').find((b) => b.type === 'submit');
    await act(async () => {
      dom.click(submitAdjustBtn);
    });

    assert.equal(adjPrice.getAttribute('aria-invalid'), 'true');
    assert.equal(adjPrice.getAttribute('aria-describedby'), 'proposal-adjusted-price-hint proposal-adjusted-price-error');
    assert.ok(nestedDialog.querySelector('#proposal-adjusted-price-hint'));
    const adjPriceErr = nestedDialog.querySelector('#proposal-adjusted-price-error');
    assert.ok(adjPriceErr);
    assert.equal(adjPriceErr.getAttribute('role'), 'alert');
    assert.equal(dom.doc.activeElement, adjPrice);

    assert.equal(adjNote.getAttribute('aria-invalid'), 'true');
    assert.equal(adjNote.getAttribute('aria-describedby'), 'proposal-adjusted-note-error');
    assert.equal(nestedDialog.querySelector('#proposal-adjusted-note-error')?.getAttribute('role'), 'alert');

    // Kiểm tra chế độ duyệt thường (#proposal-approve-note) và từ chối (#proposal-reject-reason).
    await act(async () => {
      dom.click(dialogCloseBtn);
    });
    const approveOpenBtn = container.querySelectorAll('button').find((b) => b.textContent.trim() === 'Duyệt');
    await act(async () => {
      dom.click(approveOpenBtn);
    });
    assertAccessibleFormControl(container, container.querySelector('#proposal-approve-note'));

    await act(async () => {
      dom.click(container.querySelector('button[aria-label="Đóng hộp thoại xử lý đề xuất"]'));
    });
    const rejectOpenBtn = container.querySelectorAll('button').find((b) => b.textContent.trim() === 'Từ chối');
    await act(async () => {
      dom.click(rejectOpenBtn);
    });
    const rejectReason = container.querySelector('#proposal-reject-reason');
    assertAccessibleFormControl(container, rejectReason);
    assert.equal(rejectReason.getAttribute('aria-describedby'), 'proposal-reject-reason-hint');
    assert.ok(container.querySelector('#proposal-reject-reason-hint'));
  });
});

// ---------------------------------------------------------------------------
// AC2: Tab/Shift+Tab, Escape theo trạng thái, trả focus và lồng hộp thoại
// ---------------------------------------------------------------------------

test('AC2 (controller): resolveDialogKeyDown canClose=false và ngăn xếp createDialogFocusScope lồng nhau không tranh focusin', () => {
  const {doc, body} = createReactTestDom();
  const bgBtn = doc.createElement('button');
  const main = doc.createElement('main');
  main.appendChild(bgBtn);

  const parentFirst = doc.createElement('button');
  const childOpener = doc.createElement('button');
  const parentDialog = doc.createElement('div');
  parentDialog.setAttribute('role', 'dialog');
  parentDialog.setAttribute('tabindex', '-1');
  parentDialog.appendChild(parentFirst);
  parentDialog.appendChild(childOpener);
  const parentOverlay = doc.createElement('div');
  parentOverlay.appendChild(parentDialog);

  body.appendChild(main);
  body.appendChild(parentOverlay);
  bgBtn.focus();

  assert.deepEqual(
    resolveDialogKeyDown({key: 'Escape', activeElement: parentFirst, dialogElement: parentDialog, focusables: [parentFirst], canClose: false}),
    {action: 'none'},
  );
  assert.deepEqual(
    resolveDialogKeyDown({key: 'Escape', activeElement: parentFirst, dialogElement: parentDialog, focusables: [parentFirst]}),
    {action: 'close'},
  );

  const parentScope = createDialogFocusScope({dialog: parentDialog, overlay: parentOverlay, ownerDocument: doc});
  assert.equal(doc.activeElement, parentFirst);

  childOpener.focus();
  const childFirst = doc.createElement('button');
  const childDialog = doc.createElement('div');
  childDialog.setAttribute('role', 'dialog');
  childDialog.setAttribute('tabindex', '-1');
  childDialog.appendChild(childFirst);
  const childOverlay = doc.createElement('div');
  childOverlay.appendChild(childDialog);
  parentDialog.appendChild(childOverlay);

  const childScope = createDialogFocusScope({dialog: childDialog, overlay: childOverlay, ownerDocument: doc});
  assert.equal(doc.activeElement, childFirst);

  // Focus thoát ra phần tử trong panel cha (nhưng ngoài hộp thoại con) -> chỉ childScope kéo về childFirst.
  doc.activeElement = parentFirst;
  parentFirst.dispatchEvent(new doc.defaultView.Event('focusin', {bubbles: true}));
  assert.equal(doc.activeElement, childFirst);

  // Đóng hộp thoại con -> trả focus về childOpener và nhường quyền topmost lại cho parentScope.
  childScope.cleanup();
  parentDialog.removeChild(childOverlay);
  assert.equal(doc.activeElement, childOpener);

  doc.activeElement = bgBtn;
  bgBtn.dispatchEvent(new doc.defaultView.Event('focusin', {bubbles: true}));
  assert.equal(doc.activeElement, parentFirst);

  parentScope.cleanup();
  assert.equal(doc.activeElement, bgBtn);
  assert.equal(doc.listenerCount('focusin'), 0);
});

test('AC2 (React): Tab/Shift+Tab giữ focus trong dialog, Escape bị chặn khi submitting, đóng trả focus, lồng dialog không tranh nhau', async () => {
  await withTestDom(async ({OrganizerPricingPanel, OrganizerPriceProposals, container, dom, mainShell, openerBtn, renderElement, flush}) => {
    let resolveRun;
    let resolveApprove;
    let closeCalls = 0;
    const {panelServices, proposalServices} = makeServices();
    panelServices.chayDinhGiaNgay = () =>
      new Promise((resolve) => {
        resolveRun = () =>
          resolve({
            nguon: 'MO_PHONG',
            luuTru: null,
            suKienId: DEMO_SU_KIEN_ID,
            hetHan: {soLuong: 0, deXuatHetHan: []},
            theoKhu: [],
          });
      });
    const baseApprove = proposalServices.duyetDeXuatGia;
    proposalServices.duyetDeXuatGia = (deXuatId, params) =>
      new Promise((resolve) => {
        resolveApprove = async () => resolve(await baseApprove(deXuatId, params));
      });

    await renderElement(
      renderPricingPanelTree({
        OrganizerPricingPanel,
        OrganizerPriceProposals,
        panelServices,
        proposalServices,
        onClose: () => {
          closeCalls += 1;
        },
      }),
    );
    await flush();

    // Nền ngoài panel phải bị inert + aria-hidden.
    assert.equal(mainShell.inert, true);
    assert.equal(mainShell.getAttribute('aria-hidden'), 'true');

    const panelDialog = container.querySelector('.org-pricing-panel');
    const panelCloseBtn = panelDialog.querySelector('button[aria-label="Đóng cấu hình giá"]');
    assert.equal(dom.doc.activeElement, panelCloseBtn);

    // Shift+Tab từ phần tử đầu tiên của panel quay vòng về nút cuối cùng (nút Từ chối của card cuối).
    const rejectBtn = panelDialog.querySelectorAll('button').find((b) => b.textContent.trim() === 'Từ chối');
    const shiftTabEv = dom.pressKey(panelCloseBtn, 'Tab', {shiftKey: true});
    assert.equal(shiftTabEv.defaultPrevented, true);
    assert.equal(dom.doc.activeElement, rejectBtn);

    // Tab từ nút cuối cùng quay vòng về nút đầu tiên của panel.
    const tabWrapEv = dom.pressKey(rejectBtn, 'Tab');
    assert.equal(tabWrapEv.defaultPrevented, true);
    assert.equal(dom.doc.activeElement, panelCloseBtn);

    // Khi panel đang gửi ("Chạy tính giá ngay"), nút đóng bị disabled và Escape bị chặn.
    const runBtn = panelDialog.querySelectorAll('button').find((b) => b.textContent.includes('Chạy tính giá ngay'));
    await act(async () => {
      dom.click(runBtn);
    });
    assert.equal(panelCloseBtn.disabled, true);
    const lockedEsc = dom.pressKey(panelDialog, 'Escape');
    assert.equal(lockedEsc.defaultPrevented, true);
    assert.equal(closeCalls, 0);

    await act(async () => {
      resolveRun();
    });
    await flush();
    assert.equal(panelCloseBtn.disabled, false);

    // Mở hộp thoại duyệt lồng bên trong panel.
    const approveCardBtn = panelDialog.querySelectorAll('button').find((b) => b.textContent.trim() === 'Duyệt');
    approveCardBtn.focus();
    await act(async () => {
      dom.click(approveCardBtn);
    });

    const childDialog = panelDialog.querySelector('.org-proposal-dialog');
    assert.ok(childDialog);
    const childCloseBtn = childDialog.querySelector('button[aria-label="Đóng hộp thoại xử lý đề xuất"]');
    const childSubmitBtn = childDialog.querySelectorAll('button').find((b) => b.type === 'submit');
    assert.equal(dom.doc.activeElement, childCloseBtn);

    // Tab/Shift+Tab giữ focus xoay vòng trong hộp thoại con, không nhảy ra panel cha.
    dom.pressKey(childCloseBtn, 'Tab', {shiftKey: true});
    assert.equal(dom.doc.activeElement, childSubmitBtn);
    dom.pressKey(childSubmitBtn, 'Tab');
    assert.equal(dom.doc.activeElement, childCloseBtn);

    // Focus thoát từ hộp thoại con sang nút đóng của panel cha bị chặn bởi scope con (vẫn kéo về childCloseBtn).
    await act(async () => {
      panelCloseBtn.focus();
    });
    assert.equal(dom.doc.activeElement, childCloseBtn);

    // Escape khi hộp thoại con rảnh chỉ đóng hộp thoại con, KHÔNG đóng panel cha, trả focus về approveCardBtn.
    await act(async () => {
      dom.pressKey(childCloseBtn, 'Escape');
    });
    assert.equal(panelDialog.querySelector('.org-proposal-dialog'), null);
    assert.equal(closeCalls, 0);
    assert.equal(dom.doc.activeElement, approveCardBtn);

    // Mở lại và gửi duyệt -> khi đang submitting, nút đóng con bị disabled và Escape bị chặn (cả con lẫn cha).
    await act(async () => {
      dom.click(approveCardBtn);
    });
    const activeChild = panelDialog.querySelector('.org-proposal-dialog');
    const activeChildClose = activeChild.querySelector('button[aria-label="Đóng hộp thoại xử lý đề xuất"]');
    const activeChildSubmit = activeChild.querySelectorAll('button').find((b) => b.type === 'submit');
    await act(async () => {
      dom.click(activeChildSubmit);
    });
    assert.equal(activeChildClose.disabled, true);
    let childLockedEsc;
    await act(async () => {
      childLockedEsc = dom.pressKey(activeChild, 'Escape');
    });
    assert.equal(childLockedEsc.defaultPrevented, true);
    assert.ok(panelDialog.querySelector('.org-proposal-dialog'));
    assert.equal(closeCalls, 0);

    // Hoàn tất duyệt -> card opener bị gỡ khỏi DOM -> fallback focus sang nút "Tải lại danh sách".
    await act(async () => {
      await resolveApprove();
    });
    await flush();
    assert.equal(panelDialog.querySelector('.org-proposal-dialog'), null);
    assert.equal(approveCardBtn.isConnected, false);
    const reloadBtn = panelDialog.querySelector('.org-proposals-reload-btn');
    assert.equal(dom.doc.activeElement, reloadBtn);

    // Khi panel rảnh, Escape gọi onClose() và unmount trả focus về openerBtn ngoài panel.
    await act(async () => {
      dom.pressKey(reloadBtn, 'Escape');
    });
    assert.equal(closeCalls, 1);

    await renderElement(null);
    assert.equal(mainShell.inert, false);
    assert.equal(mainShell.hasAttribute('aria-hidden'), false);
    assert.equal(dom.doc.activeElement, openerBtn);
  });
});

// ---------------------------------------------------------------------------
// AC3: Thông báo bằng chữ & live region cho lỗi cấu hình, 403, 409, chờ và kết quả
// ---------------------------------------------------------------------------

test('AC3: lỗi cấu hình, 403, xung đột 409, trạng thái chờ và kết quả bất đồng bộ được thông báo qua live region phù hợp', async () => {
  await withTestDom(async ({OrganizerPricingPanel, OrganizerPriceProposals, container, dom, renderElement, flush}) => {
    let resolveLoad;
    const {panelServices, proposalServices} = makeServices();
    panelServices.laySoLieuDinhGia = () =>
      new Promise((resolve) => {
        resolveLoad = () => resolve({nguon: 'MO_PHONG', luuTru: null, hang: SAMPLE_ROWS});
      });
    panelServices.luuCauHinhGia = async () => ({
      nguon: 'MO_PHONG',
      luuTru: null,
      ok: true,
      taoMoi: false,
      canhBao: [{ma: 'GIA_HIEN_HANH_NGOAI_KHUNG', giaHienHanh: 2_500_000, giaSan: 1_050_000, giaTran: 2_250_000}],
      deXuatHetHieuLuc: [9001],
    });

    // 1. Trạng thái đang tải của panel: role="status" + aria-busy="true".
    await renderElement(renderPricingPanelTree({OrganizerPricingPanel, OrganizerPriceProposals, panelServices, proposalServices}));
    const panelDialog = container.querySelector('.org-pricing-panel');
    assert.equal(panelDialog.getAttribute('aria-busy'), 'true');
    const loadingStatus = container.querySelector('.org-pricing-state[role="status"]');
    assert.ok(loadingStatus);
    assert.match(loadingStatus.textContent, /Đang tải số liệu định giá/);

    await act(async () => {
      resolveLoad();
    });
    await flush();
    assert.equal(panelDialog.getAttribute('aria-busy'), 'false');

    // 2. Lưu cấu hình thành công kèm cảnh báo ngoài khung & đề xuất hết hiệu lực trong vùng aria-live="polite".
    const saveBtn = container.querySelectorAll('button').find((b) => b.textContent.includes('Lưu cấu hình'));
    await act(async () => {
      dom.click(saveBtn);
    });
    await flush();

    const feedbackRegion = container.querySelector('.org-pricing-feedback[aria-live="polite"]');
    assert.ok(feedbackRegion);
    const successAlert = feedbackRegion.querySelector('.org-alert-success[role="status"]');
    const warnAlert = feedbackRegion.querySelector('.org-alert-warning[role="alert"]');
    const infoAlert = feedbackRegion.querySelector('.org-alert-info[role="status"]');
    assert.ok(successAlert);
    assert.match(successAlert.textContent, /Đã lưu cấu hình/);
    assert.ok(warnAlert);
    assert.match(warnAlert.textContent, /nằm ngoài khung/);
    assert.ok(infoAlert);
    assert.match(infoAlert.textContent, /1 đề xuất chờ duyệt đã bị vô hiệu/);

    // 3. Chạy tính giá ngay & Simulator có vùng aria-live="polite" cho kết quả bất đồng bộ.
    // Vùng live phải được mount sẵn (rỗng) trước khi có kết quả, và cùng node đó được cập nhật sau đó.
    const defaultRun = panelServices.chayDinhGiaNgay;
    const defaultSim = panelServices.moPhongNhuCau;
    let resolveRun;
    let resolveSim;
    panelServices.chayDinhGiaNgay = (...args) =>
      new Promise((resolve) => {
        resolveRun = () => resolve(defaultRun(...args));
      });
    panelServices.moPhongNhuCau = (...args) =>
      new Promise((resolve) => {
        resolveSim = () => resolve(defaultSim(...args));
      });

    const runLiveBefore = container.querySelector('[data-pricing-run-result][aria-live="polite"]');
    assert.ok(runLiveBefore);
    assert.equal(runLiveBefore.textContent.trim(), '');
    const simLiveInitial = container.querySelector('[data-pricing-sim-result][aria-live="polite"]');
    assert.ok(simLiveInitial);
    assert.equal(simLiveInitial.textContent.trim(), '');

    const runBtn = container.querySelectorAll('button').find((b) => b.textContent.includes('Chạy tính giá ngay'));
    await act(async () => {
      dom.click(runBtn);
    });
    await flush();
    // Đang chờ: vùng live vẫn là node cũ và còn rỗng.
    assert.equal(container.querySelector('[data-pricing-run-result][aria-live="polite"]'), runLiveBefore);
    assert.equal(runLiveBefore.textContent.trim(), '');
    assert.equal(typeof resolveRun, 'function');
    await act(async () => {
      resolveRun();
    });
    await flush();
    const runLiveAfter = container.querySelector('[data-pricing-run-result][aria-live="polite"]');
    assert.equal(runLiveAfter, runLiveBefore);
    assert.match(runLiveAfter.textContent, /Đã lưu/);

    const simLiveBefore = container.querySelector('[data-pricing-sim-result][aria-live="polite"]');
    assert.ok(simLiveBefore);
    assert.equal(simLiveBefore.textContent.trim(), '');
    const simBtn = container.querySelectorAll('button').find((b) => b.textContent.includes('Chạy mô phỏng'));
    await act(async () => {
      dom.click(simBtn);
    });
    await flush();
    assert.equal(container.querySelector('[data-pricing-sim-result][aria-live="polite"]'), simLiveBefore);
    assert.equal(simLiveBefore.textContent.trim(), '');
    assert.equal(typeof resolveSim, 'function');
    await act(async () => {
      resolveSim();
    });
    await flush();
    const simLiveAfter = container.querySelector('[data-pricing-sim-result][aria-live="polite"]');
    assert.equal(simLiveAfter, simLiveBefore);
    assert.match(simLiveAfter.textContent, /Đã mô phỏng kịch bản/);

    // 4. Lỗi 403 trên màn hình cấu hình giá (vai trò BIEN_TAP).
    await renderElement(
      React.createElement(OrganizerPricingPanel, {
        key: 'viewer-403',
        event: EVENT,
        activeOrg: VIEWER_ORG,
        onClose: () => {},
        services: panelServices,
      }),
    );
    await flush();
    const forbiddenAlert = container.querySelector('.org-alert-danger[role="alert"]');
    assert.ok(forbiddenAlert);
    assert.match(forbiddenAlert.textContent, /không có quyền/i);
  });
});

test('AC3 (Đề xuất giá): thông báo 403 máy chủ, xung đột 409 GIA_DA_THAY_DOI / DE_XUAT_DA_XU_LY và kết quả bất đồng bộ', async () => {
  await withTestDom(async ({OrganizerPriceProposals, container, dom, renderElement, flush}) => {
    // 1. Lỗi 403 từ máy chủ khi tải danh sách đề xuất.
    const {proposalServices: svc403} = makeServices();
    svc403.layDanhSachDeXuat = async () => {
      throw new PricingServiceError('KHONG_CO_QUYEN', '42501', {status: 403, ma: 'KHONG_CO_QUYEN'});
    };
    await renderElement(
      React.createElement(OrganizerPriceProposals, {
        event: EVENT,
        activeOrg: OWNER_ORGS,
        rows: SAMPLE_ROWS,
        services: svc403,
      }),
    );
    await flush();
    const alert403 = container.querySelector('.org-alert-danger[role="alert"]');
    assert.ok(alert403);
    assert.match(alert403.textContent, /không có quyền/i);

    // 2. Xung đột 409 GIA_DA_THAY_DOI và DE_XUAT_DA_XU_LY trong hộp thoại có vùng aria-live="polite" + role="alert".
    for (const conflictErr of [
      new PricingServiceError('GIA_DA_THAY_DOI', '40001', {status: 409, ma: 'GIA_DA_THAY_DOI'}),
      new PricingServiceError('DE_XUAT_DA_XU_LY', '40001', {
        status: 409,
        ma: 'DE_XUAT_DA_XU_LY',
        chiTiet: {trangThai: 'APPROVED'},
      }),
    ]) {
      const {proposalServices} = makeServices();
      proposalServices.duyetDeXuatGia = async () => {
        throw conflictErr;
      };
      await renderElement(
        React.createElement(OrganizerPriceProposals, {
          key: conflictErr.ma,
          event: EVENT,
          activeOrg: OWNER_ORGS,
          rows: SAMPLE_ROWS,
          services: proposalServices,
        }),
      );
      await flush();

      const approveBtn = container.querySelectorAll('button').find((b) => b.textContent.trim() === 'Duyệt');
      await act(async () => {
        dom.click(approveBtn);
      });
      const dialog = container.querySelector('.org-proposal-dialog');
      const submitBtn = dialog.querySelectorAll('button').find((b) => b.type === 'submit');
      await act(async () => {
        dom.click(submitBtn);
      });
      await flush();

      const dialogLive = dialog.querySelector('.org-proposals-feedback[aria-live="polite"]');
      assert.ok(dialogLive);
      const conflictAlert = dialogLive.querySelector('.org-alert-danger[role="alert"]');
      assert.ok(conflictAlert);
      if (conflictErr.ma === 'GIA_DA_THAY_DOI') {
        assert.match(conflictAlert.textContent, /Giá niêm yết đã thay đổi/);
      } else {
        assert.match(conflictAlert.textContent, /APPROVED/);
      }
      assert.ok(conflictAlert.querySelectorAll('button').some((b) => b.textContent.includes('Tải lại danh sách')));
    }

    // 3. Duyệt thành công -> banner kết quả xuất hiện trong vùng live aria-live="polite" với role="status".
    const {proposalServices: okSvc} = makeServices();
    await renderElement(
      React.createElement(OrganizerPriceProposals, {
        key: 'ok-flow',
        event: EVENT,
        activeOrg: OWNER_ORGS,
        rows: SAMPLE_ROWS,
        services: okSvc,
      }),
    );
    await flush();

    const approveBtn = container.querySelectorAll('button').find((b) => b.textContent.trim() === 'Duyệt');
    await act(async () => {
      dom.click(approveBtn);
    });
    const submitBtn = container.querySelector('.org-proposal-dialog').querySelectorAll('button').find((b) => b.type === 'submit');
    await act(async () => {
      dom.click(submitBtn);
    });
    await flush();

    const bannerLive = container.querySelector('.org-proposals-feedback[aria-live="polite"]');
    assert.ok(bannerLive);
    const successBanner = bannerLive.querySelector('.org-alert-success[role="status"]');
    assert.ok(successBanner);
    assert.match(successBanner.textContent, /Đã duyệt/);
  });
});

// ---------------------------------------------------------------------------
// AC4 & AC5: Quy tắc focus-visible, cuộn nội dung và breakpoint 360 px trong CSS
// ---------------------------------------------------------------------------

test('AC4 & AC5: CSS có focus-visible (gồm textarea), min-height:0/overflow-y:auto và media query 360px không che hành động chính', async () => {
  const [pricingCss, proposalsCss] = await Promise.all([
    fs.readFile('src/components/organizer-ui/organizer-pricing.css', 'utf8'),
    fs.readFile('src/components/organizer-ui/organizer-price-proposals.css', 'utf8'),
  ]);

  // 1. Focus-visible cho mọi điều khiển tương tác gồm button, input, select, textarea, a, [tabindex].
  assert.match(
    pricingCss,
    /\.org-pricing-panel\s+:is\(button,\s*input,\s*select,\s*textarea,\s*a,\s*\[tabindex\]\):focus-visible/,
  );
  assert.match(
    proposalsCss,
    /\.org-proposals\s+:is\(button,\s*input,\s*select,\s*textarea,\s*a,\s*\[tabindex\]\):focus-visible/,
  );
  assert.match(
    proposalsCss,
    /\.org-proposal-dialog\s+:is\(button,\s*input,\s*select,\s*textarea,\s*a,\s*\[tabindex\]\):focus-visible/,
  );

  // 2. Flex child cuộn đúng chiều cao và footer hành động chính luôn hiển thị.
  assert.match(pricingCss, /\.org-pricing-body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(
    proposalsCss,
    /\.org-proposal-dialog-body\s*\{[^}]*flex:\s*1\s+1\s+auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s,
  );
  assert.match(
    proposalsCss,
    /\.org-proposal-dialog-footer\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*background-color:/s,
  );

  // 3. Quy tắc @media (max-width: 360px) cho cả 2 màn hình để tránh che/tràn hành động chính.
  const pricing360Match = pricingCss.match(/@media\s*\(max-width:\s*360px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(pricing360Match, 'organizer-pricing.css phải có @media (max-width: 360px)');
  const pricing360 = pricing360Match[1];
  assert.match(pricing360, /\.org-pricing-header/);
  assert.match(pricing360, /\.org-pricing-body/);
  assert.match(pricing360, /\.org-pricing-section/);
  assert.match(pricing360, /\.org-pricing-sim-select-wrap\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*flex:\s*1\s+1\s+100%;/s);
  assert.match(pricing360, /\.org-pricing-actions/);
  assert.match(pricing360, /\.org-pricing-run-controls/);
  assert.match(pricing360, /\.org-pricing-sim-controls/);
  assert.match(pricing360, /\.org-pricing-next-step/);

  const proposals360Match = proposalsCss.match(/@media\s*\(max-width:\s*360px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(proposals360Match, 'organizer-price-proposals.css phải có @media (max-width: 360px)');
  const proposals360 = proposals360Match[1];
  assert.match(proposals360, /\.org-proposal-card/);
  assert.match(proposals360, /\.org-proposal-dialog-overlay/);
  assert.match(proposals360, /\.org-proposal-dialog-header/);
  assert.match(proposals360, /\.org-proposal-dialog-body/);
  assert.match(proposals360, /max-height:\s*calc\(100vh\s*-\s*16px\)/);
  assert.match(proposals360, /max-height:\s*calc\(100dvh\s*-\s*16px\)/);
  assert.match(proposals360, /width:\s*100%/);

  // 4. Ghi nhận rõ bước nghiệm thu thủ công trên trình duyệt thật.
  assert.match(MANUAL_ACCEPTANCE_NOTE, /nghiệm thu thủ công/);
});
