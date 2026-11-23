import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {build} from 'esbuild';
import React, {act} from 'react';

import {
  DEFAULT_SO_VE_TOI_DA,
  NHAN_MO_PHONG_UI,
  PurchaseConfigError,
  buildPurchaseConfigFormValues,
  classifyPurchaseConfigError,
  createPurchaseConfigSession,
  hasPurchaseConfigAccess,
  isSimulatedPurchaseConfig,
  loadPurchaseConfig,
  savePurchaseConfig,
  validatePurchaseConfigForm,
} from '../src/components/organizer-ui/purchaseConfigController.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

const OWNER = {organizationId: 'org-1', role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'};
const ADMIN = {organizationId: 'org-1', role: 'QUAN_TRI', accountKind: 'ORGANIZER'};
const EDITOR = {organizationId: 'org-1', role: 'BIEN_TAP', accountKind: 'ORGANIZER'};
const OTHER_ORG = {organizationId: 'org-2', role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'};
const EVENT_A = {id: 11, organizationId: 'org-1'};
const EVENT_B = {id: 12, organizationId: 'org-1'};
const VALID_FORM = {soVeToiDaMoiDon: '6', yeuCauXacMinhOtp: true};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function spyServices({read, save} = {}) {
  const calls = {read: [], save: []};
  return {
    calls,
    services: {
      docCauHinhMuaVe: async (id) => {
        calls.read.push(id);
        return read ? read(id) : {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false, moPhong: false, nguon: 'SUPABASE'};
      },
      luuCauHinhMuaVe: async (id, value) => {
        calls.save.push({id, value});
        return save
          ? save(id, value)
          : {suKienId: id, ...value, daThayDoi: true, nguon: 'SUPABASE', moPhong: false};
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Quyền
// ---------------------------------------------------------------------------

test('quyền: chỉ CHU_SO_HUU/QUAN_TRI của đúng tổ chức sở hữu sự kiện', () => {
  assert.equal(hasPurchaseConfigAccess(OWNER, EVENT_A), true);
  assert.equal(hasPurchaseConfigAccess(ADMIN, EVENT_A), true);
  assert.equal(hasPurchaseConfigAccess(EDITOR, EVENT_A), false);
  assert.equal(hasPurchaseConfigAccess(OTHER_ORG, EVENT_A), false);
  assert.equal(hasPurchaseConfigAccess({...OWNER, accountKind: 'BUYER'}, EVENT_A), false);
  assert.equal(hasPurchaseConfigAccess(null, EVENT_A), false);
  assert.equal(hasPurchaseConfigAccess(OWNER, null), false);
  assert.equal(hasPurchaseConfigAccess(OWNER, {id: 1, organizationId: null}), false);
});

test('quyền: nạp và lưu không gọi dịch vụ khi BIEN_TAP, khác tổ chức hoặc mất quyền', async () => {
  const {services, calls} = spyServices();
  const session = createPurchaseConfigSession();
  for (const org of [EDITOR, OTHER_ORG, null]) {
    assert.deepEqual(await loadPurchaseConfig(session, services, {activeOrg: org, event: EVENT_A}), {
      status: 'forbidden',
    });
    assert.deepEqual(
      await savePurchaseConfig(session, services, {activeOrg: org, event: EVENT_A, formValues: VALID_FORM}),
      {status: 'forbidden'},
    );
  }
  assert.deepEqual(calls.read, []);
  assert.deepEqual(calls.save, []);
  assert.equal(session.busy, false);

  // Mất quyền giữa chừng: lần lưu kế tiếp bị chặn dù trước đó có quyền.
  const ok = await savePurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A, formValues: VALID_FORM});
  assert.equal(ok.status, 'saved');
  const lost = await savePurchaseConfig(session, services, {activeOrg: EDITOR, event: EVENT_A, formValues: VALID_FORM});
  assert.equal(lost.status, 'forbidden');
  assert.equal(calls.save.length, 1);
});

// ---------------------------------------------------------------------------
// Validation và giá trị biểu mẫu
// ---------------------------------------------------------------------------

test('validation: biên 1-20 và kiểu boolean, lỗi theo từng trường', () => {
  for (const good of ['1', '20', ' 7 ', 5]) {
    const r = validatePurchaseConfigForm({soVeToiDaMoiDon: good, yeuCauXacMinhOtp: false});
    assert.equal(r.ok, true, `giá trị ${good} phải hợp lệ`);
    assert.equal(typeof r.value.soVeToiDaMoiDon, 'number');
  }
  for (const bad of ['0', '21', '', '4.5', 'abc', '-1', null, undefined, 2.5]) {
    const r = validatePurchaseConfigForm({soVeToiDaMoiDon: bad, yeuCauXacMinhOtp: true});
    assert.equal(r.ok, false, `giá trị ${String(bad)} phải bị từ chối`);
    assert.equal(r.firstInvalidField, 'soVeToiDaMoiDon');
    assert.ok(r.errors.soVeToiDaMoiDon);
    assert.equal(r.errors.yeuCauXacMinhOtp, undefined);
  }
  for (const bad of ['true', 1, 0, null, undefined]) {
    const r = validatePurchaseConfigForm({soVeToiDaMoiDon: '4', yeuCauXacMinhOtp: bad});
    assert.equal(r.ok, false);
    assert.equal(r.firstInvalidField, 'yeuCauXacMinhOtp');
    assert.ok(r.errors.yeuCauXacMinhOtp);
    assert.equal(r.errors.soVeToiDaMoiDon, undefined);
  }
  const both = validatePurchaseConfigForm({soVeToiDaMoiDon: '99', yeuCauXacMinhOtp: 'x'});
  assert.ok(both.errors.soVeToiDaMoiDon && both.errors.yeuCauXacMinhOtp);
  assert.equal(both.firstInvalidField, 'soVeToiDaMoiDon');
});

test('validation: dữ liệu sai không gọi dịch vụ lưu', async () => {
  const {services, calls} = spyServices();
  const session = createPurchaseConfigSession();
  const r = await savePurchaseConfig(session, services, {
    activeOrg: OWNER,
    event: EVENT_A,
    formValues: {soVeToiDaMoiDon: '21', yeuCauXacMinhOtp: 'khong'},
  });
  assert.equal(r.status, 'invalid');
  assert.equal(r.firstInvalidField, 'soVeToiDaMoiDon');
  assert.ok(r.errors.soVeToiDaMoiDon);
  assert.ok(r.errors.yeuCauXacMinhOtp);
  assert.deepEqual(calls.save, []);
  assert.equal(session.busy, false);
});

test('buildPurchaseConfigFormValues: chuỗi cho input, mặc định 4/false khi thiếu', () => {
  assert.deepEqual(buildPurchaseConfigFormValues({soVeToiDaMoiDon: 12, yeuCauXacMinhOtp: true}), {
    soVeToiDaMoiDon: '12',
    yeuCauXacMinhOtp: true,
  });
  assert.deepEqual(buildPurchaseConfigFormValues(null), {
    soVeToiDaMoiDon: String(DEFAULT_SO_VE_TOI_DA),
    yeuCauXacMinhOtp: false,
  });
});

test('isSimulatedPurchaseConfig: moPhong hoặc nguon MO_PHONG', () => {
  assert.equal(NHAN_MO_PHONG_UI, '[MÔ PHỎNG]');
  assert.equal(isSimulatedPurchaseConfig({config: {moPhong: true}}), true);
  assert.equal(isSimulatedPurchaseConfig({config: {nguon: 'MO_PHONG'}}), true);
  assert.equal(isSimulatedPurchaseConfig({saveResult: {moPhong: true}}), true);
  assert.equal(isSimulatedPurchaseConfig({event: {moPhong: true}}), true);
  assert.equal(isSimulatedPurchaseConfig({config: {moPhong: false, nguon: 'SUPABASE'}}), false);
  assert.equal(isSimulatedPurchaseConfig(), false);
});

// ---------------------------------------------------------------------------
// Lưu thành công, khóa gửi trùng
// ---------------------------------------------------------------------------

test('lưu thành công: dùng event.id và giá trị đã chuẩn hóa, kèm thông báo áp dụng lần sau', async () => {
  const {services, calls} = spyServices();
  const session = createPurchaseConfigSession();
  const r = await savePurchaseConfig(session, services, {activeOrg: ADMIN, event: EVENT_A, formValues: VALID_FORM});
  assert.equal(r.status, 'saved');
  assert.deepEqual(calls.save, [{id: 11, value: {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}}]);
  assert.deepEqual(r.config, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true});
  assert.deepEqual(r.formValues, {soVeToiDaMoiDon: '6', yeuCauXacMinhOtp: true});
  assert.match(r.message, /lần chọn vé tiếp theo/);
  assert.equal(r.simulated, false);
  assert.equal(session.busy, false);
});

test('lưu: kết quả chỉ có sau khi dịch vụ hoàn tất; khóa busy chặn gửi trùng', async () => {
  const gate = deferred();
  const {services, calls} = spyServices({save: () => gate.promise});
  const session = createPurchaseConfigSession();
  const ctx = {activeOrg: OWNER, event: EVENT_A, formValues: VALID_FORM};

  let settled = false;
  const first = savePurchaseConfig(session, services, ctx).then((r) => {
    settled = true;
    return r;
  });
  await Promise.resolve();
  assert.equal(session.busy, true);
  assert.equal(settled, false);

  const duplicate = await savePurchaseConfig(session, services, ctx);
  assert.deepEqual(duplicate, {status: 'busy'});
  assert.equal(calls.save.length, 1);

  gate.resolve({suKienId: 11, soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true, daThayDoi: true, nguon: 'MO_PHONG', moPhong: true});
  const done = await first;
  assert.equal(done.status, 'saved');
  assert.equal(done.simulated, true);
  assert.equal(session.busy, false);
});

test('lưu không thay đổi: thông báo nêu rõ không có thay đổi', async () => {
  const {services} = spyServices({
    save: (id, v) => ({suKienId: id, ...v, daThayDoi: false, nguon: 'SUPABASE', moPhong: false}),
  });
  const r = await savePurchaseConfig(createPurchaseConfigSession(), services, {
    activeOrg: OWNER,
    event: EVENT_A,
    formValues: VALID_FORM,
  });
  assert.equal(r.status, 'saved');
  assert.match(r.message, /không thay đổi/);
});

// ---------------------------------------------------------------------------
// Lỗi dịch vụ
// ---------------------------------------------------------------------------

test('lỗi lưu: PurchaseConfigError, RPC 42501/22023 và lỗi mạng; không trả config mới', async () => {
  const cases = [
    [new PurchaseConfigError('KHONG_CO_QUYEN', 'x'), 'KHONG_CO_QUYEN', false],
    [{code: '42501', message: 'permission denied'}, 'KHONG_CO_QUYEN', false],
    [{code: '22023', message: 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_so_ve_toi_da'}, 'KHONG_HOP_LE', true],
    [new Error('network down'), 'LOI_LUU', true],
    [new PurchaseConfigError('LOI_LUU', 'x'), 'LOI_LUU', true],
  ];
  for (const [error, code, retryable] of cases) {
    const {services, calls} = spyServices({
      save: () => {
        throw error;
      },
    });
    const session = createPurchaseConfigSession();
    const r = await savePurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A, formValues: VALID_FORM});
    assert.equal(r.status, 'error', code);
    assert.equal(r.error.code, code);
    assert.equal(r.error.retryable, retryable);
    assert.ok(r.error.message.length > 0);
    assert.equal(r.config, undefined, 'lỗi không được mang giá trị đã lưu mới');
    assert.equal(calls.save.length, 1);
    assert.equal(session.busy, false, 'lỗi phải nhả khóa để thử lại');
  }
});

test('lỗi 22023 có tên trường: trả fieldErrors để gắn cạnh trường', async () => {
  const {services} = spyServices({
    save: () => {
      throw {code: '22023', message: 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_so_ve_toi_da'};
    },
  });
  const r = await savePurchaseConfig(createPurchaseConfigSession(), services, {
    activeOrg: OWNER,
    event: EVENT_A,
    formValues: VALID_FORM,
  });
  assert.equal(r.status, 'error');
  assert.ok(r.fieldErrors.soVeToiDaMoiDon);
});

test('lỗi nạp: LOI_DOC cho lỗi không nhận diện và PurchaseConfigError LOI_DOC', async () => {
  for (const error of [new Error('boom'), new PurchaseConfigError('LOI_DOC', 'x'), 'chuoi']) {
    const {services} = spyServices({
      read: () => {
        throw error;
      },
    });
    const r = await loadPurchaseConfig(createPurchaseConfigSession(), services, {activeOrg: OWNER, event: EVENT_A});
    assert.equal(r.status, 'error');
    assert.equal(r.error.code, 'LOI_DOC');
    assert.equal(r.error.retryable, true);
  }
  assert.equal(classifyPurchaseConfigError('x').code, 'LOI_LUU');
});

test('nạp thành công: formValues từ cấu hình, cờ mô phỏng', async () => {
  const {services, calls} = spyServices({
    read: () => ({soVeToiDaMoiDon: 9, yeuCauXacMinhOtp: true, moPhong: true, nguon: 'MO_PHONG'}),
  });
  const r = await loadPurchaseConfig(createPurchaseConfigSession(), services, {activeOrg: OWNER, event: EVENT_A});
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.formValues, {soVeToiDaMoiDon: '9', yeuCauXacMinhOtp: true});
  assert.equal(r.simulated, true);
  assert.deepEqual(calls.read, [11]);
});

// ---------------------------------------------------------------------------
// Ngữ cảnh: phản hồi cũ bị bỏ qua
// ---------------------------------------------------------------------------

test('đổi sự kiện: phản hồi nạp của sự kiện cũ là stale', async () => {
  const gateA = deferred();
  const {services} = spyServices({
    read: (id) => (id === EVENT_A.id ? gateA.promise : {soVeToiDaMoiDon: 2, yeuCauXacMinhOtp: true, moPhong: false}),
  });
  const session = createPurchaseConfigSession();
  const loadA = loadPurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A});
  session.reset();
  const loadB = await loadPurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_B});
  assert.equal(loadB.status, 'ok');
  gateA.resolve({soVeToiDaMoiDon: 20, yeuCauXacMinhOtp: false, moPhong: false});
  assert.deepEqual(await loadA, {status: 'stale'});
});

test('nạp lại cùng sự kiện: yêu cầu cũ hơn là stale (mới nhất thắng)', async () => {
  const first = deferred();
  const second = deferred();
  const queue = [first, second];
  const {services} = spyServices({read: () => queue.shift().promise});
  const session = createPurchaseConfigSession();
  const p1 = loadPurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A});
  const p2 = loadPurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A});
  second.resolve({soVeToiDaMoiDon: 3, yeuCauXacMinhOtp: true});
  first.resolve({soVeToiDaMoiDon: 15, yeuCauXacMinhOtp: false});
  assert.equal((await p2).status, 'ok');
  assert.deepEqual(await p1, {status: 'stale'});
});

test('đổi tổ chức/sự kiện khi đang lưu: phản hồi cũ là stale và không nhả khóa của phiên mới', async () => {
  const gateA = deferred();
  const gateB = deferred();
  const {services, calls} = spyServices({save: (id) => (id === EVENT_A.id ? gateA.promise : gateB.promise)});
  const session = createPurchaseConfigSession();

  const saveA = savePurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A, formValues: VALID_FORM});
  await Promise.resolve();
  assert.equal(session.busy, true);

  session.reset();
  assert.equal(session.busy, false);

  const saveB = savePurchaseConfig(session, services, {
    activeOrg: OWNER,
    event: EVENT_B,
    formValues: {soVeToiDaMoiDon: '2', yeuCauXacMinhOtp: false},
  });
  await Promise.resolve();
  assert.equal(session.busy, true);

  gateA.resolve({suKienId: 11, soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true, daThayDoi: true, moPhong: false});
  assert.deepEqual(await saveA, {status: 'stale'});
  assert.equal(session.busy, true, 'phản hồi cũ không được nhả khóa phiên mới');
  assert.deepEqual(await savePurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_B, formValues: VALID_FORM}), {
    status: 'busy',
  });

  gateB.resolve({suKienId: 12, soVeToiDaMoiDon: 2, yeuCauXacMinhOtp: false, daThayDoi: true, moPhong: false});
  const resB = await saveB;
  assert.equal(resB.status, 'saved');
  assert.equal(resB.config.soVeToiDaMoiDon, 2);
  assert.equal(session.busy, false);
  assert.equal(calls.save.length, 2);
});

test('đổi ngữ cảnh khi đang lưu và dịch vụ lỗi: vẫn là stale, không báo lỗi cho form mới', async () => {
  const gate = deferred();
  const {services} = spyServices({save: () => gate.promise});
  const session = createPurchaseConfigSession();
  const p = savePurchaseConfig(session, services, {activeOrg: OWNER, event: EVENT_A, formValues: VALID_FORM});
  await Promise.resolve();
  session.reset();
  gate.reject(new Error('muộn'));
  assert.deepEqual(await p, {status: 'stale'});
});

// ---------------------------------------------------------------------------
// Tích hợp kho mock T1: BTC lưu -> mở lại -> khán giả đọc
// ---------------------------------------------------------------------------

async function loadMockServices() {
  const built = await build({
    stdin: {
      contents: `
        export * from './src/services/purchaseConfigService.ts';
        export { loadEventPurchaseConfig } from './src/services/eventService.ts';
      `,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    define: {'import.meta.env.BASE_URL': '"/"'},
    plugins: [
      {
        name: 'opc-harness',
        setup(b) {
          b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'opc-stub'}));
          b.onResolve({filter: /(services\/|\.\.?\/)supabaseClient$/}, (args) => {
            const resolved = path.resolve(args.resolveDir, args.path).replaceAll('\\', '/');
            return resolved.endsWith('/src/services/supabaseClient')
              ? {path: 'supabaseClient', namespace: 'opc-stub'}
              : undefined;
          });
          b.onLoad({filter: /^runtime$/, namespace: 'opc-stub'}, () => ({
            contents: `
              export const runtimeConfig = {apiBaseUrl: '', websocketUrl: '', supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key', eventId: 'SUPER_CONCERT_2026', eventDatabaseId: 1, useMockData: true};
              export const isSupabaseConfigured = () => true;
              export const isApiConfigured = () => false;
              export const isWebSocketConfigured = () => false;
              export const getActiveEventContext = () => ({eventId: 'SUPER_CONCERT_2026', eventDatabaseId: 1, showId: 1, showSlug: 'dem-chinh'});
              export const setActiveEventContext = () => {};
            `,
            loader: 'js',
          }));
          b.onLoad({filter: /^supabaseClient$/, namespace: 'opc-stub'}, () => ({
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
  const dataUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

test('tích hợp mock: BTC lưu, mở lại đọc đúng, khán giả loadEventPurchaseConfig nhận đúng cờ', async () => {
  const svc = await loadMockServices();
  svc.datLaiKhoMoPhongCauHinhMuaVe();
  const services = {docCauHinhMuaVe: svc.docCauHinhMuaVe, luuCauHinhMuaVe: svc.luuCauHinhMuaVe};
  const org = {organizationId: svc.DEMO_TO_CHUC_ID, role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'};
  const event = {id: 3, organizationId: svc.DEMO_TO_CHUC_ID};
  const session = createPurchaseConfigSession();

  const before = await loadPurchaseConfig(session, services, {activeOrg: org, event});
  assert.equal(before.status, 'ok');
  assert.equal(before.simulated, true);

  const saved = await savePurchaseConfig(session, services, {
    activeOrg: org,
    event,
    formValues: {soVeToiDaMoiDon: '9', yeuCauXacMinhOtp: true},
  });
  assert.equal(saved.status, 'saved');
  assert.equal(saved.simulated, true);

  const reopened = await loadPurchaseConfig(createPurchaseConfigSession(), services, {activeOrg: org, event});
  assert.equal(reopened.status, 'ok');
  assert.deepEqual(reopened.formValues, {soVeToiDaMoiDon: '9', yeuCauXacMinhOtp: true});

  const audience = await svc.loadEventPurchaseConfig({id: 3});
  assert.equal(audience.maxTicketsPerOrder, 9);
  assert.equal(audience.requireOtp, true);

  // Sự kiện khác không bị ảnh hưởng.
  const other = await svc.loadEventPurchaseConfig({id: 1});
  assert.equal(other.maxTicketsPerOrder, 4);
  assert.equal(other.requireOtp, true);
});

test('tích hợp mock: người không đủ quyền ở kho mock bị từ chối và lỗi được phân loại', async () => {
  const svc = await loadMockServices();
  svc.datLaiKhoMoPhongCauHinhMuaVe();
  const org = {organizationId: svc.DEMO_TO_CHUC_ID, role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'};
  const event = {id: 3, organizationId: svc.DEMO_TO_CHUC_ID};
  const services = {
    docCauHinhMuaVe: svc.docCauHinhMuaVe,
    luuCauHinhMuaVe: (id, input) => svc.luuCauHinhMuaVe(id, input, {nguoiDung: {id: 'mock-editor', loaiTaiKhoan: 'ORGANIZER'}}),
  };
  const r = await savePurchaseConfig(createPurchaseConfigSession(), services, {
    activeOrg: org,
    event,
    formValues: {soVeToiDaMoiDon: '9', yeuCauXacMinhOtp: true},
  });
  assert.equal(r.status, 'error');
  assert.equal(r.error.code, 'KHONG_CO_QUYEN');
  const audience = await svc.loadEventPurchaseConfig({id: 3});
  assert.notEqual(audience.maxTicketsPerOrder, 9);
});

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

test('CSS: font-size >= 11px, vùng chạm 44px, breakpoints và reduced-motion, không emoji', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'src/components/organizer-ui/organizer-purchase-config.css'), 'utf8');
  for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
    assert.ok(Number(m[1]) >= 11, `font-size ${m[1]}px nhỏ hơn 11px`);
  }
  assert.match(css, /min-height:\s*44px/);
  for (const bp of ['1024px', '768px', '480px', '360px']) {
    assert.ok(css.includes(`max-width: ${bp}`), `thiếu breakpoint ${bp}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /tabular-nums/);
  assert.match(css, /\.org-field-error/);
  assert.doesNotMatch(css, /\p{Extended_Pictographic}/u);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

// ---------------------------------------------------------------------------
// React component: OrganizerPurchaseConfig & OrganizerEventCard
// ---------------------------------------------------------------------------

let cachedUiComponentsPromise = null;
async function loadUiComponents() {
  if (!cachedUiComponentsPromise) {
    cachedUiComponentsPromise = (async () => {
      const built = await build({
        stdin: {
          contents: `
            export { OrganizerPurchaseConfig } from './src/components/organizer-ui/OrganizerPurchaseConfig.tsx';
            export { OrganizerEventCard } from './src/components/organizer-ui/OrganizerEventCard.tsx';
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
            name: 'opc-ui-stubs',
            setup(b) {
              b.onResolve({filter: /^react(\/jsx-runtime)?$/}, (args) => ({
                path: import.meta.resolve(args.path),
                external: true,
              }));
              b.onResolve({filter: /\.css$/}, () => ({path: 'css', namespace: 'opc-ui-stub'}));
              b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'opc-ui-stub'}));
              b.onResolve({filter: /(services\/|\.\.?\/)supabaseClient$/}, (args) => {
                const resolved = path.resolve(args.resolveDir, args.path).replaceAll('\\', '/');
                return resolved.endsWith('/src/services/supabaseClient')
                  ? {path: 'supabaseClient', namespace: 'opc-ui-stub'}
                  : undefined;
              });
              b.onLoad({filter: /^css$/, namespace: 'opc-ui-stub'}, () => ({contents: '', loader: 'js'}));
              b.onLoad({filter: /^runtime$/, namespace: 'opc-ui-stub'}, () => ({
                contents: `
                  export const runtimeConfig = {apiBaseUrl: '', websocketUrl: '', supabaseUrl: '',
                    supabaseAnonKey: '', eventId: 'SUPER_CONCERT_2026', eventDatabaseId: 1, useMockData: true};
                  export const isSupabaseConfigured = () => false;
                  export const isApiConfigured = () => false;
                  export const isWebSocketConfigured = () => false;
                  export const getActiveEventContext = () => ({eventId: 'SUPER_CONCERT_2026', eventDatabaseId: 1, showId: 1, showSlug: 'dem-chinh'});
                  export const setActiveEventContext = () => {};
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^supabaseClient$/, namespace: 'opc-ui-stub'}, () => ({
                contents: `
                  export function requireSupabaseClient() { throw new Error('Không dùng supabaseClient trong test UI'); }
                  export function getSupabaseClient() { throw new Error('Không dùng supabaseClient trong test UI'); }
                `,
                loader: 'js',
              }));
            },
          },
        ],
      });
      const modUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
      return import(modUrl);
    })();
  }
  return cachedUiComponentsPromise;
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
    constructor(nodeType, doc) {
      this.nodeType = nodeType;
      this.ownerDocument = doc;
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
      const path = [];
      for (let cur = this; cur; cur = cur.parentNode) path.push(cur);
      path.push(doc);
      event._path = path;
      for (let i = path.length - 1; i >= 0; i -= 1) {
        if (event._stopped) break;
        const node = path[i];
        event.currentTarget = node;
        event.eventPhase = 1;
        const set = node === doc ? docListeners.get(`cap:${event.type}`) : node._capListeners.get(event.type);
        if (set) {
          for (const fn of [...set]) fn.call(node, event);
        }
      }
      for (const node of path) {
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
  const win = {
    document: doc,
    location: {pathname: '/organizer'},
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

  function click(el) {
    if (!el || el.disabled) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      const desc = Object.getOwnPropertyDescriptor(DomElement.prototype, 'checked');
      desc.set.call(el, !el.checked);
    }
    const ev = new DomEvent('click', {bubbles: true, cancelable: true});
    el.dispatchEvent(ev);
    if (!ev.defaultPrevented && el.tagName === 'BUTTON' && el.type === 'submit') {
      const form = el.closest('form');
      if (form) form.dispatchEvent(new DomEvent('submit', {bubbles: true, cancelable: true}));
    }
  }

  function setInputValue(input, nextValue) {
    const desc = Object.getOwnPropertyDescriptor(DomElement.prototype, 'value');
    desc.set.call(input, nextValue);
    input.dispatchEvent(new DomEvent('input', {bubbles: true, cancelable: true}));
  }

  function keyDown(el, key, {shiftKey = false} = {}) {
    el.dispatchEvent(new DomEvent('keydown', {bubbles: true, cancelable: true, key, shiftKey}));
  }

  return {doc, win, body, click, setInputValue, keyDown, DomElement};
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = prev.actEnv;
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.HTMLElement = prev.HTMLElement;
    globalThis.HTMLInputElement = prev.HTMLInputElement;
    globalThis.HTMLIFrameElement = prev.HTMLIFrameElement;
    globalThis.SVGElement = prev.SVGElement;
    globalThis.Element = prev.Element;
    globalThis.Node = prev.Node;
  }
}

async function withMountedPurchaseConfig(initialProps, fn) {
  const {OrganizerPurchaseConfig} = await loadUiComponents();
  await withReactEnv(async (dom, createRoot) => {
    const opener = dom.doc.createElement('button');
    opener.textContent = 'Cấu hình mua vé';
    const main = dom.doc.createElement('main');
    main.appendChild(opener);
    const container = dom.doc.createElement('div');
    dom.body.appendChild(main);
    dom.body.appendChild(container);
    opener.focus();

    const root = createRoot(container);
    const renderProps = async (props) => {
      await act(async () => {
        root.render(React.createElement(OrganizerPurchaseConfig, props));
      });
    };
    const flush = async () => {
      await act(async () => {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
      });
    };

    try {
      await renderProps(initialProps);
      await flush();
      await fn({container, main, opener, dom, renderProps, flush});
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
}

test('React render OrganizerEventCard: nút Cấu hình mua vé chỉ hiện khi đủ quyền', async () => {
  const {OrganizerEventCard} = await loadUiComponents();
  await withReactEnv(async (dom, createRoot) => {
    const container = dom.doc.createElement('div');
    dom.body.appendChild(container);
    const root = createRoot(container);
    const event = {
      id: 11,
      organizationId: 'org-1',
      name: 'Đêm nhạc Demo',
      slug: 'dem-nhac-demo',
      status: 'CONG_KHAI',
      startsAt: '2026-12-20T19:00:00+07:00',
      showCount: 1,
    };

    let opened = null;
    await act(async () => {
      root.render(
        React.createElement(OrganizerEventCard, {
          event,
          canEdit: true,
          isPublishing: false,
          onEdit: () => {},
          onPublish: () => {},
          canManagePurchaseConfig: false,
          onOpenPurchaseConfig: (ev) => {
            opened = ev;
          },
        }),
      );
    });
    assert.equal(
      container.querySelectorAll('button').some((b) => b.textContent.includes('Cấu hình mua vé')),
      false,
    );

    await act(async () => {
      root.render(
        React.createElement(OrganizerEventCard, {
          event,
          canEdit: true,
          isPublishing: false,
          onEdit: () => {},
          onPublish: () => {},
          canManagePurchaseConfig: true,
          onOpenPurchaseConfig: (ev) => {
            opened = ev;
          },
        }),
      );
    });
    const btn = container.querySelectorAll('button').find((b) => b.textContent.includes('Cấu hình mua vé'));
    assert.ok(btn);
    await act(async () => {
      dom.click(btn);
    });
    assert.equal(opened?.id, 11);

    await act(async () => {
      root.unmount();
    });
  });
});

test('React render OrganizerPurchaseConfig: validation gắn aria-describedby, focus trường lỗi và không gọi dịch vụ', async () => {
  const {services, calls} = spyServices({
    read: async () => ({soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false, moPhong: true, nguon: 'MO_PHONG'}),
  });
  await withMountedPurchaseConfig(
    {event: {...EVENT_A, name: 'Concert A'}, activeOrg: OWNER, onClose: () => {}, services},
    async ({container, dom, flush}) => {
      assert.match(container.textContent, /\[MÔ PHỎNG\]/);
      assert.match(container.textContent, /lần chọn vé tiếp theo/);
      const input = container.querySelector('#purchase-config-max-tickets');
      assert.ok(input);
      assert.equal(input.value, '4');

      await act(async () => {
        dom.setInputValue(input, '25');
      });
      const submitBtn = container.querySelectorAll('button').find((b) => b.type === 'submit');
      await act(async () => {
        dom.click(submitBtn);
      });
      await flush();

      assert.equal(calls.save.length, 0);
      assert.equal(input.getAttribute('aria-invalid'), 'true');
      const errId = input.getAttribute('aria-describedby');
      assert.equal(errId, 'purchase-config-max-tickets-error');
      const errEl = container.querySelector(`#${errId}`);
      assert.ok(errEl);
      assert.match(errEl.textContent, /1 đến 20/);
      assert.equal(dom.doc.activeElement === input, true);
    },
  );
});

test('React render OrganizerPurchaseConfig: lỗi lưu giữ nguyên dữ liệu đang sửa, thành công mới cập nhật và khóa gửi trùng', async () => {
  const saveGate = deferred();
  let shouldFailFirst = true;
  const {services, calls} = spyServices({
    read: async () => ({soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false, moPhong: false, nguon: 'SUPABASE'}),
    save: async (id, value) => {
      if (shouldFailFirst) {
        throw new Error('Mất kết nối');
      }
      return saveGate.promise;
    },
  });

  await withMountedPurchaseConfig(
    {event: {...EVENT_A, name: 'Concert A'}, activeOrg: OWNER, onClose: () => {}, services},
    async ({container, dom, flush}) => {
      const input = container.querySelector('#purchase-config-max-tickets');
      const checkbox = container.querySelector('#purchase-config-require-otp');
      const submitBtn = container.querySelectorAll('button').find((b) => b.type === 'submit');

      await act(async () => {
        dom.setInputValue(input, '8');
        dom.click(checkbox);
      });
      assert.equal(input.value, '8');
      assert.equal(checkbox.checked, true);

      // Lần 1: lỗi dịch vụ -> không cập nhật summary đã lưu, giữ nguyên input = '8' và checkbox = true.
      await act(async () => {
        dom.click(submitBtn);
      });
      await flush();

      assert.equal(calls.save.length, 1);
      assert.equal(input.value, '8');
      assert.equal(checkbox.checked, true);
      assert.match(container.querySelector('.org-purchase-summary').textContent, /4 vé/);
      assert.match(container.querySelector('.org-purchase-summary').textContent, /Không bắt buộc/);
      assert.equal(container.querySelector('.org-purchase-notice--success'), null);
      assert.ok(container.querySelector('.org-purchase-notice--error'));

      // Lần 2: đang lưu -> chặn gửi trùng; chỉ cập nhật đã lưu khi hoàn tất.
      shouldFailFirst = false;
      await act(async () => {
        dom.click(submitBtn);
      });
      assert.equal(submitBtn.disabled, true);
      assert.match(container.querySelector('.org-purchase-summary').textContent, /4 vé/);

      await act(async () => {
        dom.click(submitBtn);
      });
      assert.equal(calls.save.length, 2);

      saveGate.resolve({
        suKienId: 11,
        soVeToiDaMoiDon: 8,
        yeuCauXacMinhOtp: true,
        daThayDoi: true,
        nguon: 'SUPABASE',
        moPhong: false,
      });
      await flush();

      assert.equal(submitBtn.disabled, false);
      assert.match(container.querySelector('.org-purchase-summary').textContent, /8 vé/);
      assert.match(container.querySelector('.org-purchase-summary').textContent, /Bắt buộc/);
      const okNotice = container.querySelector('.org-purchase-notice--success');
      assert.ok(okNotice);
      assert.match(okNotice.textContent, /lần chọn vé tiếp theo/);
    },
  );
});

test('React render OrganizerPurchaseConfig: focus scope, Tab wrap, Escape đóng và trả focus về opener', async () => {
  let closed = 0;
  const {services} = spyServices();
  const {OrganizerPurchaseConfig} = await loadUiComponents();

  await withReactEnv(async (dom, createRoot) => {
    const opener = dom.doc.createElement('button');
    opener.textContent = 'Mở';
    const main = dom.doc.createElement('main');
    main.appendChild(opener);
    const container = dom.doc.createElement('div');
    dom.body.appendChild(main);
    dom.body.appendChild(container);
    opener.focus();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(OrganizerPurchaseConfig, {
          event: {...EVENT_A, name: 'Concert A'},
          activeOrg: OWNER,
          onClose: () => {
            closed += 1;
          },
          services,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    assert.equal(main.inert, true);
    assert.equal(main.getAttribute('aria-hidden'), 'true');
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.ok(dialog.contains(dom.doc.activeElement));

    // Tab từ nút cuối cùng quay về phần tử đầu tiên trong dialog.
    const buttons = dialog.querySelectorAll('button');
    const firstBtn = buttons[0];
    const lastBtn = buttons[buttons.length - 1];
    lastBtn.focus();
    dom.keyDown(dialog, 'Tab');
    assert.equal(dom.doc.activeElement === firstBtn, true);

    firstBtn.focus();
    dom.keyDown(dialog, 'Tab', {shiftKey: true});
    assert.equal(dom.doc.activeElement === lastBtn, true);

    dom.keyDown(dialog, 'Escape');
    assert.equal(closed, 1);

    await act(async () => {
      root.unmount();
    });
    assert.equal(main.inert, false);
    assert.equal(dom.doc.activeElement === opener, true);
  });
});

test('React render OrganizerPurchaseConfig: mất quyền hoặc đổi sự kiện vô hiệu form và bỏ qua phản hồi cũ', async () => {
  const gateA = deferred();
  const {services, calls} = spyServices({
    read: (id) => (id === EVENT_A.id ? gateA.promise : {soVeToiDaMoiDon: 2, yeuCauXacMinhOtp: true, moPhong: false}),
  });

  await withMountedPurchaseConfig(
    {event: {...EVENT_A, name: 'Concert A'}, activeOrg: OWNER, onClose: () => {}, services},
    async ({container, renderProps, flush}) => {
      // Đang nạp EVENT_A -> đổi sang EVENT_B.
      await renderProps({event: {...EVENT_B, name: 'Concert B'}, activeOrg: OWNER, onClose: () => {}, services});
      await flush();
      assert.equal(container.querySelector('#purchase-config-max-tickets').value, '2');

      // Phản hồi muộn của EVENT_A không được ghi đè EVENT_B.
      gateA.resolve({soVeToiDaMoiDon: 19, yeuCauXacMinhOtp: false, moPhong: false});
      await flush();
      assert.equal(container.querySelector('#purchase-config-max-tickets').value, '2');

      // Thu hồi quyền xuống BIEN_TAP -> form biến mất, hiện cảnh báo không có quyền.
      await renderProps({event: {...EVENT_B, name: 'Concert B'}, activeOrg: EDITOR, onClose: () => {}, services});
      await flush();
      assert.equal(container.querySelector('#purchase-config-max-tickets'), null);
      assert.match(container.textContent, /không có quyền/i);
      assert.equal(calls.save.length, 0);
    },
  );
});

test('React component files: không chứa emoji trong OrganizerPurchaseConfig, OrganizerEventCard và OrganizerPortal', () => {
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  for (const rel of [
    'src/components/organizer-ui/OrganizerPurchaseConfig.tsx',
    'src/components/organizer-ui/OrganizerEventCard.tsx',
    'src/components/OrganizerPortal.tsx',
    'src/components/organizer-ui/purchaseConfigController.js',
  ]) {
    const content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.equal(content.match(emojiRegex), null, `Không được chứa emoji trong ${rel}`);
  }
});
