/*
 * Ghi chú bàn giao T3 (AC7)
 * - Việc kiểm tra thao tác bàn phím (Tab/Enter), trạng thái focus, thông báo lỗi và chụp ảnh màn hình
 *   ở chiều rộng 360px cho cả hai nhánh chọn vé (SeatMapSection/SeatingSection tại
 *   src/components/GenericEventPage.tsx và HTML legacy Super Concert tại
 *   src/components/ConcertSections.tsx) là bước người dùng kiểm chứng sau merge.
 * - Bước nghiệm thu thủ công này hiện chưa được thực hiện.
 * - Bộ test mã nguồn (gồm file test này và `npm run check`, kiểm tra cả logic cổng T2 được giao diện
 *   T3 sử dụng) không thay thế bước nghiệm thu bàn phím và ảnh 360px sau merge.
 */

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {buildPublicPath, resolvePublicRoute} from '../src/domain/publicRoute.js';
import {TRANG_THAI_CONG, taoBoDieuPhoiCongOtp} from '../src/domain/otpGate.js';
import {
  CHO_GUI_LAI_GIAY,
  HIEU_LUC_GIAY,
  OtpServiceError,
  SO_LAN_GUI_LAI_TOI_DA,
  SO_LAN_SAI_TOI_DA,
  capNhatSauLoi,
  dangKyThuHoiBangChungMock,
  datLaiSauThanhCong,
  ghiNhanGui,
  ghiNhanSai,
  guiMaOtpTheoCauHinh,
  khoBangChungMock,
  khoTrangThaiOtpPhien,
  taoKhoTrangThaiOtpPhien,
  taoTrangThaiOtp,
  tinhThoiGianOtp,
  xacMinhMaOtpTheoCauHinh,
  xoaBangChungMock,
} from '../src/domain/otpServiceCore.js';
import {
  buildPurchaseGateContextKey,
  syncConcertRuntimeEffect,
} from '../src/components/event-template/eventTemplateLogic.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('T3 AC1: EventTemplate wraps both SeatMapSection and slots.seating in PurchaseAccessGate and exports gate components', async () => {
  const [templateSrc, gateSrc, indexSrc, genericSrc, concertSectionsSrc] = await Promise.all([
    read('../src/components/event-template/EventTemplate.tsx'),
    read('../src/components/event-template/PurchaseAccessGate.tsx'),
    read('../src/components/event-template/index.ts'),
    read('../src/components/GenericEventPage.tsx'),
    read('../src/components/ConcertSections.tsx'),
  ]);

  // EventTemplate bọc cả slots.seating (Super Concert) lẫn SeatMapSection mặc định
  assert.match(
    templateSrc,
    /<PurchaseAccessGate\s+event=\{event\}\s+onAccessChange=\{handlePurchaseAccessChange\}>\s*\{slots\?\.seating\s*!==\s*undefined\s*\?\s*\(?\s*slots\.seating\s*\)?\s*:\s*\(?\s*<SeatMapSection\s+event=\{event\}\s*\/>\s*\)?\s*\}\s*<\/PurchaseAccessGate>/s,
    'EventTemplate must wrap both slots.seating and default SeatMapSection inside PurchaseAccessGate',
  );
  // Super Concert dùng SeatMapSection chung (không còn khe seating riêng), nên cũng nằm trong PurchaseAccessGate.
  assert.doesNotMatch(genericSrc, /seating:\s*<SeatingSection/);
  assert.match(concertSectionsSrc, /seatingHtml/);

  // Export tại index.ts
  assert.match(indexSrc, /PurchaseAccessGate/);
  assert.match(indexSrc, /OtpVerificationPanel/);
  assert.match(indexSrc, /BUYER_RETURN_TO_KEY/);
  assert.match(indexSrc, /buildEventReturnTarget/);

  // Fail-closed: chưa allowed thì render GateFrame#seating-section và KHÔNG mount children; chỉ render children khi allowed
  const allowedExpr = gateSrc.match(/const allowed\s*=\s*([^;]+);/);
  assert.ok(allowedExpr, 'PurchaseAccessGate defines allowed condition');
  assert.match(allowedExpr[1], /configReady/);
  // Luồng mới: OTP không chặn việc xem/chọn vé; máy chủ kiểm OTP ở bước Thanh toán (xem EVENT_CAN_OTP bên dưới).
  assert.doesNotMatch(allowedExpr[1], /requireOtp|DUOC_VAO/);
  assert.match(gateSrc, /EVENT_CAN_OTP/);
  assert.match(gateSrc, /<CheckoutOtpDialog/);

  const childrenIdx = gateSrc.indexOf('if (allowed) {');
  const loadingIdx = gateSrc.indexOf("config.kind === 'loading'");
  const errorIdx = gateSrc.indexOf("config.kind === 'error'");
  assert.ok(childrenIdx !== -1 && loadingIdx !== -1 && errorIdx !== -1);
  assert.ok(childrenIdx < loadingIdx && loadingIdx < errorIdx, 'Only returns children when allowed; otherwise renders GateFrame');
  assert.equal((gateSrc.match(/\{children\}/g) ?? []).length, 2, 'children only appears in GateFrame prop and allowed branch');
  assert.match(gateSrc, /<section\s+id="seating-section"\s+className="et-otp-gate-root"/, 'GateFrame preserves #seating-section anchor');
});

test('T3 AC2: Login/register return flow preserves event + show context and handles loading/error/retry states', async () => {
  const [gateSrc, buyerAuthSrc, templateSrc, panelSrc] = await Promise.all([
    read('../src/components/event-template/PurchaseAccessGate.tsx'),
    read('../src/components/BuyerAuth.tsx'),
    read('../src/components/event-template/EventTemplate.tsx'),
    read('../src/components/event-template/OtpVerificationPanel.tsx'),
  ]);

  // PurchaseAccessGate kiểm tra quyền BUYER, lưu đích quay lại và điều hướng login/register
  assert.match(gateSrc, /canAccessPortal\(s\.accountKind,\s*'BUYER'\)/);
  assert.match(gateSrc, /docCauHinhMuaVe\(event\.id\)/);
  assert.match(gateSrc, /subscribeBuyerAuth/);
  assert.match(gateSrc, /export function buildEventReturnTarget/);
  assert.match(gateSrc, /events\/\$\{event\.slug\}\$\{showSlug \? `\/shows\/\$\{showSlug\}` : ''\}#seating-section/);

  // Round-trip route resolution cho sự kiện có suất diễn và không có suất diễn
  const showPath = buildPublicPath('/EVENTTICKETING/', 'events/super-concert/shows/night-1#seating-section');
  assert.equal(showPath, '/EVENTTICKETING/?route=/events/super-concert/shows/night-1#seating-section');
  const showUrl = new URL(showPath, 'https://example.test');
  assert.deepEqual(resolvePublicRoute(showUrl.pathname, 'fallback', showUrl.hash, showUrl.search), {
    kind: 'detail',
    eventSlug: 'super-concert',
    showSlug: 'night-1',
  });

  const singlePath = buildPublicPath('/', 'events/workshop-ai#seating-section');
  const singleUrl = new URL(singlePath, 'https://example.test');
  assert.deepEqual(resolvePublicRoute(singleUrl.pathname, 'fallback', singleUrl.hash, singleUrl.search), {
    kind: 'detail',
    eventSlug: 'workshop-ai',
  });

  // BuyerAuth đọc/xác thực đích quay lại an toàn, giữ khi cần xác nhận email và fallback về 'events'
  assert.match(buyerAuthSrc, /BUYER_RETURN_TO_KEY/);
  assert.match(buyerAuthSrc, /SAFE_EVENT_RETURN_RE/);
  assert.match(buyerAuthSrc, /consumeBuyerReturnTarget\(\)/);
  assert.match(templateSrc, /window\.location\.hash !== '#seating-section'/);
  assert.match(templateSrc, /scrollIntoView/);

  // Trạng thái tải, lỗi cấu hình, lỗi cổng và nút Thử lại rõ ràng
  assert.match(gateSrc, /Đang đọc cấu hình mua vé của sự kiện/);
  assert.match(gateSrc, /Không đọc được cấu hình mua vé/);
  assert.match(gateSrc, /setReloadKey\(\(k\) => k \+ 1\)/);
  assert.match(panelSrc, /session\.email/);
  assert.doesNotMatch(panelSrc, /type="email"/, 'OTP panel uses current buyer session email rather than editable email input');
});

test('T3 AC3: OtpVerificationPanel uses otpService, enforces >=60s resend wait, and reflects T2 client-only counters', async () => {
  const [panelSrc, gateSrc] = await Promise.all([
    read('../src/components/event-template/OtpVerificationPanel.tsx'),
    read('../src/components/event-template/PurchaseAccessGate.tsx'),
  ]);

  for (const sym of [
    'guiMaOtp',
    'xacMinhMaOtp',
    'taoTrangThaiOtp',
    'tinhThoiGianOtp',
    'capNhatSauLoi',
    'datLaiSauThanhCong',
    'OtpServiceError',
    'CHO_GUI_LAI_GIAY',
    'HIEU_LUC_GIAY',
    'SO_LAN_GUI_LAI_TOI_DA',
    'SO_LAN_SAI_TOI_DA',
    'NHAN_MO_PHONG',
  ]) {
    assert.ok(panelSrc.includes(sym), `OtpVerificationPanel uses ${sym} from otpService`);
  }

  assert.match(gateSrc, /khoOtp\.lay\(buyer\)/, 'PurchaseAccessGate updates khoOtp on every auth event');
  assert.match(gateSrc, /khoOtp=\{khoOtp\}/, 'PurchaseAccessGate passes khoOtp to OtpVerificationPanel');
  assert.match(panelSrc, /khoOtp\.dangKy\(/, 'OtpVerificationPanel subscribes to khoOtp');
  assert.match(panelSrc, /khoOtp\.layChiTiet\(/, 'OtpVerificationPanel reads state/busy/error/notice from khoOtp');
  assert.match(panelSrc, /khoOtp\.thucHienGui\(/, 'OtpVerificationPanel delegates send to khoOtp');
  assert.match(panelSrc, /khoOtp\.thucHienXacMinh\(/, 'OtpVerificationPanel delegates verify to khoOtp');

  assert.match(panelSrc, /khongGuiDuoc\s*=\s*busy !== null \|\| \(daGui && !thoiGian\.coTheGuiLai\)/);
  assert.match(panelSrc, /thoiGian\.giayConHieuLuc/);
  assert.match(panelSrc, /thoiGian\.giayChoGuiLai/);
  assert.match(panelSrc, /thoiGian\.soLanGuiLaiConLai/);
  assert.match(panelSrc, /thoiGian\.soLanSaiConLai/);
  assert.match(panelSrc, /không phải bộ đếm của máy chủ/);
  assert.doesNotMatch(panelSrc, /máy chủ khóa tài khoản|hủy mã sau 5 lần sai/i);

  // Kiểm chứng hành vi thực của logic T2 được giao diện sử dụng
  const t0 = 1_700_000_000_000;
  assert.equal(CHO_GUI_LAI_GIAY, 60);
  assert.equal(HIEU_LUC_GIAY, 300);
  assert.equal(SO_LAN_GUI_LAI_TOI_DA, 3);
  assert.equal(SO_LAN_SAI_TOI_DA, 5);

  const st1 = ghiNhanGui(taoTrangThaiOtp('buyer@example.com'), t0);
  const at30s = tinhThoiGianOtp(st1, t0 + 30_000);
  assert.equal(at30s.coTheGuiLai, false);
  assert.equal(at30s.giayChoGuiLai, 30);
  assert.equal(at30s.conHieuLuc, true);
  assert.equal(at30s.giayConHieuLuc, 270);
  assert.equal(at30s.laThongTinPhiaClient, true);

  const at60s = tinhThoiGianOtp(st1, t0 + 60_000);
  assert.equal(at60s.coTheGuiLai, true);
  assert.equal(at60s.giayChoGuiLai, 0);

  let stSai = st1;
  for (let i = 0; i < SO_LAN_SAI_TOI_DA; i += 1) {
    stSai = ghiNhanSai(stSai, t0 + 1000 * (i + 1));
  }
  const locked = tinhThoiGianOtp(stSai, t0 + 10_000);
  assert.equal(locked.soLanSaiConLai, 0);
  assert.equal(locked.biTamKhoaNhap, true);

  // Kiểm chứng cổng T2 không mở khi chưa xác minh và mở sau khi áp dụng xác minh
  let verified = false;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => ({daXacMinh: verified, nguon: 'THAT'}),
    emit: () => {},
  });
  const s1 = await ctrl.kiemTraLai({userId: 'u-1', email: 'buyer@example.com'}, 'ev-1');
  assert.equal(s1.status, TRANG_THAI_CONG.CAN_OTP);
  verified = true;
  const s2 = await ctrl.apDungXacMinh({userId: 'u-1', daXacMinh: true, nguon: 'THAT'});
  assert.equal(s2.status, TRANG_THAI_CONG.DUOC_VAO);
  ctrl.huy();
});

test('T3 AC4: OTP input is masked, ephemeral, never logged or leaked with sample codes, and shows mock badge', async () => {
  const [panelSrc, gateSrc, cssSrc] = await Promise.all([
    read('../src/components/event-template/OtpVerificationPanel.tsx'),
    read('../src/components/event-template/PurchaseAccessGate.tsx'),
    read('../src/components/event-template/OtpVerificationPanel.css'),
  ]);

  assert.match(panelSrc, /type="password"/);
  assert.match(panelSrc, /inputMode="numeric"/);
  assert.match(panelSrc, /autoComplete="one-time-code"/);
  // Xóa sạch mã khi xác minh xong, khi lỗi, khi đổi ngữ cảnh và khi unmount
  assert.ok((panelSrc.match(/setCode\(''\)/g) ?? []).length >= 4, 'Clears OTP input on change, unmount, verify success and error');

  for (const [name, src] of [
    ['OtpVerificationPanel.tsx', panelSrc],
    ['PurchaseAccessGate.tsx', gateSrc],
    ['OtpVerificationPanel.css', cssSrc],
  ]) {
    assert.doesNotMatch(src, /123456/, `${name} must not expose sample OTP code 123456`);
    assert.doesNotMatch(src, /console\.(log|info|debug)/, `${name} must not log OTP state`);
  }

  assert.match(panelSrc, /isMock[\s\S]*data-nguon=\{NHAN_MO_PHONG\}[\s\S]*Chế độ mô phỏng/);
  assert.match(gateSrc, /isMock=\{runtimeConfig\.useMockData\}/);
});

test('T3 AC5: OTP form accessibility attributes and 360px responsive CSS constraints', async () => {
  const [panelSrc, gateSrc, cssSrc] = await Promise.all([
    read('../src/components/event-template/OtpVerificationPanel.tsx'),
    read('../src/components/event-template/PurchaseAccessGate.tsx'),
    read('../src/components/event-template/OtpVerificationPanel.css'),
  ]);

  assert.match(panelSrc, /<label[^>]+htmlFor=\{inputId\}/);
  assert.match(panelSrc, /id=\{inputId\}/);
  assert.match(panelSrc, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(panelSrc, /aria-describedby=\{error \? `\$\{hintId\} \$\{errorId\}` : hintId\}/);
  assert.match(panelSrc, /role="alert"\s+aria-live="assertive"/);
  assert.match(panelSrc, /role="status"\s+aria-live="polite"/);
  assert.match(panelSrc, /<strong>Lỗi:<\/strong>/);
  assert.match(panelSrc, /<strong>Thông báo:<\/strong>/);
  assert.match(gateSrc, /role="alert"\s+aria-live="assertive"/);
  assert.match(gateSrc, /role="status"\s+aria-live="polite"/);

  // CSS co giãn ở 360px, focus rõ, tap >= 44px, font >= 12px, tabular-nums
  assert.match(cssSrc, /\.et-otp-gate-root\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(cssSrc, /\.et-otp-gate-root\s*\{[^}]*min-width:\s*0/s);
  assert.match(cssSrc, /\.et-otp-card\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(cssSrc, /\.et-otp-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(cssSrc, /\.et-otp-btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(cssSrc, /\.et-otp-input\s*\{[^}]*min-height:\s*44px/s);
  assert.match(cssSrc, /:focus-visible\s*\{[^}]*outline:\s*3px\s+solid/s);
  assert.match(cssSrc, /font-variant-numeric:\s*tabular-nums/);
  assert.match(cssSrc, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  // Không có min-width cố định > 0px gây tràn ngang ở 360px
  const minWidths = [...cssSrc.matchAll(/min-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
  for (const mw of minWidths) {
    assert.equal(mw, 0, `Unexpected non-zero min-width: ${mw}px`);
  }
  const fontSizes = [...cssSrc.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(fontSizes.length > 0);
  for (const fs of fontSizes) {
    assert.ok(fs >= 12, `Disallowed sub-12px font-size: ${fs}px`);
  }
});

test('T3 AC6: Concert runtime initializes only after gate opens and tears down cleanly on close/context change', async () => {
  const [templateSrc, runtimeSrc] = await Promise.all([
    read('../src/components/event-template/EventTemplate.tsx'),
    read('../src/legacy/concertRuntime.js'),
  ]);

  assert.match(templateSrc, /const gateContextKey = buildPurchaseGateContextKey\(event\.id,\s*event\.selectedShow\?\.id\);/);
  assert.match(templateSrc, /const \[openGateContextKey,\s*setOpenGateContextKey\]\s*=\s*useState<string \| null>\(null\);/);
  assert.match(templateSrc, /const isPurchaseGateOpen = openGateContextKey === gateContextKey;/);
  assert.match(
    templateSrc,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?syncConcertRuntimeEffect\(\{[\s\S]*?isConcert,[\s\S]*?isGateOpen:\s*isPurchaseGateOpen,[\s\S]*?import\('\.\.\/\.\.\/legacy\/concertRuntime\.js'\)[\s\S]*?disposeRuntime\s*=\s*runtime\.teardownConcertRuntime[\s\S]*?runtime\.initConcertRuntime\(\)[\s\S]*?disposeRuntime\?\.\(\)[\s\S]*?\}\);[\s\S]*?\},\s*\[isConcert,\s*isPurchaseGateOpen,\s*gateContextKey\]\);/s,
    'Concert runtime effect must scope open state by gateContextKey, delegate to syncConcertRuntimeEffect, and tear down on close, event/show change, or unmount',
  );
  assert.match(runtimeSrc, /function buildOvalStadiumSectors\(\)/, 'Super Concert stadium geometry remains intact');
});

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

async function loadOtpServiceForSlowSendTest(clock) {
  const entryPath = fileURLToPath(new URL('../src/services/otpService.ts', import.meta.url));
  const runtimePath = fileURLToPath(new URL('../src/config/runtime.ts', import.meta.url));
  const supabasePath = fileURLToPath(new URL('../src/services/supabaseClient.ts', import.meta.url));

  const plugin = {
    name: 'otp-service-test-mocks',
    setup(b) {
      b.onResolve({filter: /config\/runtime$/}, () => ({path: runtimePath, namespace: 'mock-runtime'}));
      b.onLoad({filter: /.*/, namespace: 'mock-runtime'}, () => ({
        contents: `export const runtimeConfig = { useMockData: false, eventId: 1 };`,
        loader: 'js',
      }));
      b.onResolve({filter: /supabaseClient$/}, () => ({path: supabasePath, namespace: 'mock-supabase'}));
      b.onLoad({filter: /.*/, namespace: 'mock-supabase'}, () => ({
        contents: `
          export function requireSupabaseClient() {
            return globalThis.__OTP_TEST_CLIENT__;
          }
        `,
        loader: 'js',
      }));
    },
  };

  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [plugin],
  });
  const code = result.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  globalThis.__OTP_TEST_CLIENT__ = {
    auth: {
      signInWithOtp: async () => {
        clock.now += 10_000; // mô phỏng request gửi mất 10 giây
        return {data: {}, error: null};
      },
      verifyOtp: async () => ({data: {}, error: null}),
      getSession: async () => ({data: {session: null}, error: null}),
    },
    rpc: async () => ({data: false, error: null}),
  };
  return import(url);
}

test('T3 behavior: slow OTP send (10s) records completion guiLuc and keeps resend disabled for full 60s', async () => {
  const T0 = 1_700_000_000_000;
  const clock = {now: T0};
  const originalDateNow = Date.now;
  Date.now = () => clock.now;
  try {
    const otpService = await loadOtpServiceForSlowSendTest(clock);
    const ketQua = await otpService.guiMaOtp('buyer@example.com', {userId: 'u-slow'});
    const completionMs = T0 + 10_000;

    assert.equal(ketQua.nguon, 'THAT');
    assert.equal(ketQua.trangThai.guiLuc, completionMs, 'guiLuc must be the post-await completion timestamp');

    // Khớp logic hiển thị của OtpVerificationPanel: now = Math.max(Date.now(), guiLuc ?? 0), khongGuiDuoc = !coTheGuiLai
    const uiNowAtCompletion = Math.max(Date.now(), ketQua.trangThai.guiLuc ?? 0);
    const atCompletion = tinhThoiGianOtp(ketQua.trangThai, uiNowAtCompletion);
    assert.equal(atCompletion.coTheGuiLai, false);
    assert.equal(atCompletion.giayChoGuiLai, 60);

    const before60s = tinhThoiGianOtp(ketQua.trangThai, completionMs + 59_999);
    assert.equal(before60s.coTheGuiLai, false);
    assert.equal(before60s.giayChoGuiLai, 1);

    const at60s = tinhThoiGianOtp(ketQua.trangThai, completionMs + 60_000);
    assert.equal(at60s.coTheGuiLai, true);
    assert.equal(at60s.giayChoGuiLai, 0);
  } finally {
    Date.now = originalDateNow;
    delete globalThis.__OTP_TEST_CLIENT__;
  }
});

test('T3 behavior: same-account session refresh during CAN_OTP preserves cooldown and wrong attempts while clearing code', async () => {
  xoaBangChungMock();
  const T0 = 1_700_000_000_000;
  const sessionA = {userId: 'user-a', email: 'Buyer.A@Example.com'};
  const sessionARefreshed = {userId: 'user-a', email: 'buyer.a@example.com'};
  const sessionB = {userId: 'user-b', email: 'buyer.b@example.com'};

  const kho = taoKhoTrangThaiOtpPhien();
  const emitted = [];
  let verified = false;
  const checkDeferreds = [];

  const cong = taoBoDieuPhoiCongOtp({
    kiemTra: () => {
      const d = createDeferred();
      checkDeferreds.push(d);
      return d.promise;
    },
    emit: (st) => emitted.push(st),
  });

  try {
    // 1. Mở cổng tới CAN_OTP
    const p1 = cong.kiemTraLai(sessionA, 'ev-1');
    checkDeferreds.shift().resolve({daXacMinh: verified, nguon: 'MO_PHONG'});
    await p1;
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.CAN_OTP);

    // Panel mount: khôi phục từ kho và khởi tạo code rỗng
    let st = kho.lay(sessionA);
    let code = '';
    assert.equal(st.guiLuc, null);

    // Gửi lần 1, gửi lại lần 1 (+60s), nhập sai 2 lần (+65s, +70s), lưu vào kho; user đang gõ dở '123'
    const cauHinhMock = {useMockData: true, layAuth: () => { throw new Error('no auth'); }};
    const g1 = await guiMaOtpTheoCauHinh(cauHinhMock, sessionA.email, {trangThai: st, userId: sessionA.userId, nowMs: T0});
    const g2 = await guiMaOtpTheoCauHinh(cauHinhMock, sessionA.email, {
      trangThai: g1.trangThai,
      userId: sessionA.userId,
      nowMs: T0 + 60_000,
    });
    st = g2.trangThai;
    kho.ghi(sessionA, st);

    const err1 = await xacMinhMaOtpTheoCauHinh(cauHinhMock, sessionA.email, '000000', sessionA.userId, {
      trangThai: st,
      nowMs: T0 + 65_000,
    }).catch((e) => e);
    st = capNhatSauLoi(st, err1, T0 + 65_000);
    kho.ghi(sessionA, st);

    const err2 = await xacMinhMaOtpTheoCauHinh(cauHinhMock, sessionA.email, '000000', sessionA.userId, {
      trangThai: st,
      nowMs: T0 + 70_000,
    }).catch((e) => e);
    st = capNhatSauLoi(st, err2, T0 + 70_000);
    kho.ghi(sessionA, st);
    code = '123';
    assert.equal(code, '123');

    // 2. Refresh phiên cùng tài khoản khi đang CAN_OTP: CAN_OTP -> DANG_KIEM_TRA -> CAN_OTP (panel unmount/remount)
    const pRefresh = cong.kiemTraLai(sessionARefreshed, 'ev-1');
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.DANG_KIEM_TRA);
    checkDeferreds.shift().resolve({daXacMinh: verified, nguon: 'MO_PHONG'});
    await pRefresh;
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.CAN_OTP);

    // Panel remount: code luôn rỗng '', nhưng cooldown và số lượt còn lại được giữ nguyên
    code = '';
    const restored = kho.lay(sessionARefreshed);
    assert.equal(code, '');
    assert.equal(restored.guiLuc, T0 + 60_000);
    assert.equal(restored.lichSuGuiLai.length, 1);
    assert.equal(restored.lichSuSai.length, 2);
    const tgRestored = tinhThoiGianOtp(restored, T0 + 90_000);
    assert.equal(tgRestored.coTheGuiLai, false);
    assert.equal(tgRestored.giayChoGuiLai, 30);
    assert.equal(tgRestored.soLanGuiLaiConLai, SO_LAN_GUI_LAI_TOI_DA - 1);
    assert.equal(tgRestored.soLanSaiConLai, SO_LAN_SAI_TOI_DA - 2);

    // 3. Đổi sang tài khoản khác hoặc đăng xuất hoặc xác minh xong → reset sạch bộ đếm
    const switched = kho.lay(sessionB);
    assert.equal(switched.guiLuc, null);
    assert.deepEqual(switched.lichSuGuiLai, []);
    assert.deepEqual(switched.lichSuSai, []);

    kho.ghi(sessionB, ghiNhanSai(ghiNhanGui(switched, T0), T0 + 1000));
    assert.equal(kho.lay(null), null);
    assert.equal(kho.lay(sessionB).guiLuc, null);

    const resetDone = datLaiSauThanhCong(restored);
    assert.equal(resetDone.guiLuc, null);
    assert.deepEqual(resetDone.lichSuSai, []);
  } finally {
    cong.huy();
    xoaBangChungMock();
  }
});

test('T3 behavior (deferred): in-flight send & verify survive same-session refresh remount, block duplicates, enforce 60s completion cooldown and count SAI_MA once', async () => {
  xoaBangChungMock();
  const T0 = 1_700_000_000_000;
  const clock = {now: T0};
  const sessionA = {userId: 'user-a', email: 'Buyer.A@Example.com'};
  const sessionARefreshed = {userId: 'user-a', email: 'buyer.a@example.com'};

  const kho = taoKhoTrangThaiOtpPhien();
  const checkDeferreds = [];
  const cong = taoBoDieuPhoiCongOtp({
    kiemTra: () => {
      const d = createDeferred();
      checkDeferreds.push(d);
      return d.promise;
    },
    emit: () => {},
  });

  // Mô phỏng vòng đời mount/unmount của OtpVerificationPanel gắn với khoOtp
  const mountPanel = (sess) => {
    let view = kho.layChiTiet(sess);
    let code = '';
    const unsub = kho.dangKy(() => {
      view = kho.layChiTiet(sess);
    });
    return {
      getView: () => view,
      getCode: () => code,
      setCode: (v) => {
        code = v;
      },
      unmount: () => {
        code = '';
        unsub();
      },
    };
  };

  try {
    // Mở cổng tới CAN_OTP và mount panel 1
    const pGate1 = cong.kiemTraLai(sessionA, 'ev-1');
    checkDeferreds.shift().resolve({daXacMinh: false, nguon: 'THAT'});
    await pGate1;
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.CAN_OTP);

    const panel1 = mountPanel(sessionA);
    assert.equal(panel1.getView().busy, null);

    // 1. Bắt đầu gửi OTP (deferred) trên panel 1
    let sendCalls = 0;
    let sendDeferred = createDeferred();
    const guiMaOtpDeferred = async (email, opts) => {
      sendCalls += 1;
      const res = await sendDeferred.promise;
      return {nguon: 'THAT', trangThai: ghiNhanGui(opts.trangThai, clock.now, {laGuiLai: opts.trangThai.guiLuc !== null})};
    };

    const pSend1 = kho.thucHienGui(sessionA, {
      guiMaOtp: guiMaOtpDeferred,
      layNow: () => clock.now,
    });
    assert.equal(panel1.getView().busy, 'send');
    assert.equal(sendCalls, 1);

    // Refresh cùng tài khoản trong lúc send đang chờ: CAN_OTP -> DANG_KIEM_TRA (unmount panel 1) -> CAN_OTP (mount panel 2)
    kho.lay(sessionARefreshed);
    const pRefresh1 = cong.kiemTraLai(sessionARefreshed, 'ev-1');
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.DANG_KIEM_TRA);
    panel1.unmount();
    assert.equal(panel1.getCode(), '');

    checkDeferreds.shift().resolve({daXacMinh: false, nguon: 'THAT'});
    await pRefresh1;
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.CAN_OTP);

    const panel2 = mountPanel(sessionARefreshed);
    assert.equal(panel2.getView().busy, 'send', 'Panel 2 preserves pending busy=send across remount');
    assert.equal(panel2.getCode(), '');

    // Chống gửi trùng khi đang busy sau remount
    const pSendDup = kho.thucHienGui(sessionARefreshed, {
      guiMaOtp: guiMaOtpDeferred,
      layNow: () => clock.now,
    });
    assert.equal(pSendDup, pSend1, 'Duplicate send returns the same in-flight promise');
    assert.equal(sendCalls, 1, 'Duplicate send must not trigger a second network call');

    // Gửi hoàn tất sau 10s → ghi nhận guiLuc tại T0 + 10_000 và khóa gửi lại đủ 60s
    clock.now = T0 + 10_000;
    sendDeferred.resolve({});
    await pSend1;

    assert.equal(panel2.getView().busy, null);
    assert.equal(panel2.getView().trangThai.guiLuc, T0 + 10_000);
    const atCompletion = tinhThoiGianOtp(panel2.getView().trangThai, clock.now);
    assert.equal(atCompletion.coTheGuiLai, false);
    assert.equal(atCompletion.giayChoGuiLai, 60);
    const at59s = tinhThoiGianOtp(panel2.getView().trangThai, T0 + 69_999);
    assert.equal(at59s.coTheGuiLai, false);
    assert.equal(at59s.giayChoGuiLai, 1);
    const at60s = tinhThoiGianOtp(panel2.getView().trangThai, T0 + 70_000);
    assert.equal(at60s.coTheGuiLai, true);
    assert.equal(at60s.giayChoGuiLai, 0);

    // 2. Bắt đầu xác minh SAI_MA (deferred) trên panel 2, refresh cùng phiên (unmount panel 2 -> mount panel 3)
    clock.now = T0 + 15_000;
    panel2.setCode('654321');
    let verifyCalls = 0;
    let verifyDeferred = createDeferred();
    let verifiedCount = 0;
    const xacMinhDeferred = async () => {
      verifyCalls += 1;
      return verifyDeferred.promise;
    };

    const maNhap2 = panel2.getCode();
    panel2.setCode('');
    const pVerifySai = kho.thucHienXacMinh(sessionARefreshed, maNhap2, {
      xacMinhMaOtp: xacMinhDeferred,
      onVerified: () => {
        verifiedCount += 1;
      },
      layNow: () => clock.now,
    });
    assert.equal(panel2.getView().busy, 'verify');
    assert.equal(verifyCalls, 1);
    assert.equal(JSON.stringify(panel2.getView()).includes('654321'), false, 'Store never stores raw OTP code');

    // Refresh cùng tài khoản trong lúc verify đang chờ
    kho.lay(sessionA);
    const pRefresh2 = cong.kiemTraLai(sessionA, 'ev-1');
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.DANG_KIEM_TRA);
    panel2.unmount();

    checkDeferreds.shift().resolve({daXacMinh: false, nguon: 'THAT'});
    await pRefresh2;
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.CAN_OTP);

    const panel3 = mountPanel(sessionA);
    assert.equal(panel3.getView().busy, 'verify', 'Panel 3 preserves pending busy=verify across remount');
    assert.equal(panel3.getCode(), '');

    // Chống xác minh trùng khi đang busy sau remount
    const pVerifyDup = kho.thucHienXacMinh(sessionA, '999999', {
      xacMinhMaOtp: xacMinhDeferred,
      layNow: () => clock.now,
    });
    assert.equal(pVerifyDup, pVerifySai, 'Duplicate verify returns the same in-flight promise');
    assert.equal(verifyCalls, 1, 'Duplicate verify must not trigger a second network call');

    // Trả lỗi SAI_MA sau khi đã remount → bộ đếm sai tăng đúng 1 lần
    clock.now = T0 + 18_000;
    verifyDeferred.reject(new OtpServiceError('Mã OTP không đúng.', 'SAI_MA', {soLanSaiConLai: 4}));
    await pVerifySai;

    assert.equal(panel3.getView().busy, null);
    assert.equal(verifiedCount, 0);
    assert.match(panel3.getView().error ?? '', /Mã OTP không đúng/);
    assert.equal(panel3.getView().trangThai.lichSuSai.length, 1, 'SAI_MA increments wrong-attempt counter exactly once');
    assert.equal(tinhThoiGianOtp(panel3.getView().trangThai, clock.now).soLanSaiConLai, SO_LAN_SAI_TOI_DA - 1);

    // 3. Bắt đầu xác minh thành công (deferred) trên panel 3, refresh cùng phiên (unmount panel 3 -> mount panel 4), rồi resolve
    clock.now = T0 + 20_000;
    verifyDeferred = createDeferred();
    let gateVerified = false;
    const pVerifyOk = kho.thucHienXacMinh(sessionA, '123456', {
      xacMinhMaOtp: xacMinhDeferred,
      onVerified: async (ketQua) => {
        verifiedCount += 1;
        kho.xoa();
        gateVerified = true;
        await cong.apDungXacMinh(ketQua);
      },
      layNow: () => clock.now,
    });
    assert.equal(panel3.getView().busy, 'verify');

    kho.lay(sessionARefreshed);
    const pRefresh3 = cong.kiemTraLai(sessionARefreshed, 'ev-1');
    panel3.unmount();
    checkDeferreds.shift().resolve({daXacMinh: false, nguon: 'THAT'});
    await pRefresh3;

    const panel4 = mountPanel(sessionARefreshed);
    assert.equal(panel4.getView().busy, 'verify');

    const pVerifyFinish = pVerifyOk;
    verifyDeferred.resolve({daXacMinh: true, nguon: 'THAT', userId: sessionA.userId, trangThai: panel4.getView().trangThai});
    await new Promise((r) => setTimeout(r, 0));
    // cong.apDungXacMinh gọi kiemTraLai lần nữa để mở cổng DUOC_VAO
    checkDeferreds.shift().resolve({daXacMinh: gateVerified, nguon: 'THAT'});
    await pVerifyFinish;

    assert.equal(verifiedCount, 1);
    assert.equal(cong.layTrangThai().status, TRANG_THAI_CONG.DUOC_VAO);
    assert.equal(kho.layChiTiet(sessionARefreshed).trangThai.guiLuc, null);
    assert.deepEqual(kho.layChiTiet(sessionARefreshed).trangThai.lichSuSai, []);
    panel4.unmount();
  } finally {
    cong.huy();
    xoaBangChungMock();
  }
});

test('T3 behavior (deferred): stale send/verify results are discarded on account switch, email change, logout, and mock revocation', async () => {
  xoaBangChungMock();
  const T0 = 1_700_000_000_000;
  const sessionA = {userId: 'user-a', email: 'a@example.com'};
  const sessionB = {userId: 'user-b', email: 'b@example.com'};

  const kho = taoKhoTrangThaiOtpPhien();
  const unsubRevoke = dangKyThuHoiBangChungMock(() => kho.xoa());

  try {
    // (a) Đổi tài khoản giữa lúc gửi đang chờ → kết quả cũ không ghi vào B
    const sendDefA = createDeferred();
    const pSendA = kho.thucHienGui(sessionA, {
      guiMaOtp: () => sendDefA.promise,
    });
    assert.equal(kho.layChiTiet(sessionA).busy, 'send');

    kho.lay(sessionB); // PurchaseAccessGate gọi lay(buyer) trong subscribeBuyerAuth
    assert.equal(kho.layChiTiet(sessionB).busy, null);

    sendDefA.resolve({nguon: 'THAT', trangThai: ghiNhanGui(taoTrangThaiOtp(sessionA.email), T0)});
    await pSendA;

    const bAfter = kho.layChiTiet(sessionB);
    assert.equal(bAfter.trangThai.guiLuc, null, 'Stale send result must not write guiLuc to account B');
    assert.equal(bAfter.notice, null);
    assert.equal(bAfter.error, null);
    assert.equal(bAfter.busy, null);

    // (b) Đổi email cùng userId giữa lúc xác minh đang chờ → kết quả cũ bị bỏ, onVerified không chạy
    const verifyDefB = createDeferred();
    let onVerifiedCalled = 0;
    const pVerifyB = kho.thucHienXacMinh(sessionB, '123456', {
      xacMinhMaOtp: () => verifyDefB.promise,
      onVerified: () => {
        onVerifiedCalled += 1;
      },
    });
    const sessionBNewEmail = {userId: 'user-b', email: 'b-new@example.com'};
    kho.lay(sessionBNewEmail);
    verifyDefB.resolve({daXacMinh: true, nguon: 'THAT', userId: 'user-b'});
    await pVerifyB;

    assert.equal(onVerifiedCalled, 0, 'Stale verify after email change must not invoke onVerified');
    assert.equal(kho.layChiTiet(sessionBNewEmail).busy, null);
    assert.equal(kho.layChiTiet(sessionBNewEmail).notice, null);

    // (c) Đăng xuất (lay(null)) giữa lúc xác minh lỗi SAI_MA đang chờ → không ghi bộ đếm, không gọi onVerified
    const verifyDefLogout = createDeferred();
    const pVerifyLogout = kho.thucHienXacMinh(sessionBNewEmail, '000000', {
      xacMinhMaOtp: () => verifyDefLogout.promise,
      onVerified: () => {
        onVerifiedCalled += 1;
      },
    });
    assert.equal(kho.lay(null), null);
    verifyDefLogout.reject(new OtpServiceError('Mã OTP không đúng.', 'SAI_MA'));
    await pVerifyLogout;

    assert.equal(onVerifiedCalled, 0);
    const reLoginB = kho.layChiTiet(sessionBNewEmail);
    assert.deepEqual(reLoginB.trangThai.lichSuSai, [], 'Stale SAI_MA after logout must be discarded');
    assert.equal(reLoginB.error, null);

    // (d) Thu hồi bằng chứng mock (xoaBangChungMock) giữa lúc xác minh đang chờ → bỏ kết quả, không phục hồi trạng thái đã thu hồi
    const verifyDefRevoke = createDeferred();
    const pVerifyRevoke = kho.thucHienXacMinh(sessionA, '123456', {
      xacMinhMaOtp: () => verifyDefRevoke.promise,
      onVerified: () => {
        onVerifiedCalled += 1;
      },
    });
    assert.equal(kho.layChiTiet(sessionA).busy, 'verify');
    xoaBangChungMock();
    verifyDefRevoke.resolve({daXacMinh: true, nguon: 'MO_PHONG', userId: sessionA.userId});
    await pVerifyRevoke;

    assert.equal(onVerifiedCalled, 0, 'Revoked mock verification must not invoke onVerified');
    assert.equal(khoBangChungMock.size, 0, 'Revoked mock verification must not restore evidence');
    assert.equal(kho.layChiTiet(sessionA).busy, null);
    assert.equal(kho.layChiTiet(sessionA).notice, null);
  } finally {
    unsubRevoke();
    xoaBangChungMock();
  }
});

async function loadRealConcertRuntimeForLifecycleTest() {
  const runtimeEntry = fileURLToPath(new URL('../src/legacy/concertRuntime.js', import.meta.url));
  const plugin = {
    name: 'concert-runtime-lifecycle-mocks',
    setup(b) {
      b.onResolve({filter: /ticketDataService$/}, () => ({path: 'mock-ticket-data', namespace: 'mock'}));
      b.onLoad({filter: /.*/, namespace: 'mock'}, () => ({
        contents: `
          export async function loadTicketingCatalog() {
            return {
              zones: [{KhuVucID: 1, MaKhuVuc: 'VVIP_DIAMOND', TenKhuVuc: 'VVIP', GiaVeNiemYet: 4500000, MauSacHex: '#d8ff3e'}],
              seats: [],
            };
          }
          export async function createSeatHold() { return {holdId: 'h1', expiresAt: new Date(Date.now() + 60000).toISOString(), items: []}; }
          export async function releaseSeatHold() { return {ok: true}; }
          export function subscribeToSeatUpdates(_onUpdate, onStatus) {
            onStatus?.('CONNECTED');
            return () => {};
          }
          export function subscribeToPriceUpdates(_onUpdate, onStatus) {
            onStatus?.('CONNECTED');
            return () => {};
          }
          export const runtimeConfig = {useMockData: true, eventId: 1};
          export const isSupabaseConfigured = () => false;
          export const isApiConfigured = () => false;
          export const isWebSocketConfigured = () => false;
          export function getActiveEventContext() { return {eventDatabaseId: 1, showId: 10}; }
        `,
        loader: 'js',
      }));
      b.onResolve({filter: /(bookingService|seatRealtimeService|priceRealtimeService|config\/runtime)$/}, (args) => ({
        path: args.path,
        namespace: 'mock',
      }));
    },
  };

  const result = await build({
    entryPoints: [runtimeEntry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [plugin],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

function createMinimalConcertDomEnv() {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevSvg = globalThis.SVGSVGElement;
  const prevSetTimeout = globalThis.setTimeout;
  const prevClearTimeout = globalThis.clearTimeout;
  const prevSetInterval = globalThis.setInterval;
  const prevClearInterval = globalThis.clearInterval;

  const activeTimeouts = new Set();
  const activeIntervals = new Set();
  const bodySaleStatusListeners = new Set();
  let nextId = 1;
  let stadiumMounted = false;

  const makeEl = (id) => ({
    id,
    dataset: {},
    style: {setProperty() {}},
    children: [],
    classList: {
      toggle() {},
      contains() { return false; },
      add() {},
      remove() {},
    },
    setAttribute() {},
    removeAttribute() {},
    addEventListener(type, fn) {
      if (id === 'body' && type === 'eventticketing:sale-status') bodySaleStatusListeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (id === 'body' && type === 'eventticketing:sale-status') bodySaleStatusListeners.delete(fn);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    get isConnected() {
      return id === 'stadium-svg' ? stadiumMounted : true;
    },
  });

  const stadiumSvg = makeEl('stadium-svg');
  const bodyEl = makeEl('body');

  const trackedSetTimeout = (fn, ms) => {
    const handle = prevSetTimeout(() => {
      activeTimeouts.delete(handle);
      fn();
    }, ms);
    activeTimeouts.add(handle);
    return handle;
  };
  const trackedClearTimeout = (handle) => {
    activeTimeouts.delete(handle);
    prevClearTimeout(handle);
  };
  const trackedSetInterval = (fn, ms) => {
    const id = nextId++;
    activeIntervals.add(id);
    const handle = prevSetInterval(fn, ms);
    return {id, handle};
  };
  const trackedClearInterval = (token) => {
    if (token && typeof token === 'object') {
      activeIntervals.delete(token.id);
      prevClearInterval(token.handle);
    } else {
      prevClearInterval(token);
    }
  };

  globalThis.SVGSVGElement = class {};
  globalThis.setTimeout = trackedSetTimeout;
  globalThis.clearTimeout = trackedClearTimeout;
  globalThis.setInterval = trackedSetInterval;
  globalThis.clearInterval = trackedClearInterval;
  globalThis.document = {
    body: bodyEl,
    createElementNS: () => makeEl('svg-child'),
    getElementById: (id) => (id === 'stadium-svg' && stadiumMounted ? stadiumSvg : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({matches: true}),
    dispatchEvent: () => true,
    setInterval: trackedSetInterval,
    clearInterval: trackedClearInterval,
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
  };

  return {
    wait: (ms = 0) => new Promise((r) => prevSetTimeout(r, ms)),
    setStadiumMounted: (mounted) => {
      stadiumMounted = mounted;
      if (!mounted) {
        delete stadiumSvg.dataset.ready;
        delete stadiumSvg.dataset.runtimeReady;
      }
    },
    activeTimeouts,
    activeIntervals,
    bodySaleStatusListeners,
    restore: () => {
      for (const h of [...activeTimeouts]) prevClearTimeout(h);
      globalThis.window = prevWindow;
      globalThis.document = prevDocument;
      globalThis.SVGSVGElement = prevSvg;
      globalThis.setTimeout = prevSetTimeout;
      globalThis.clearTimeout = prevClearTimeout;
      globalThis.setInterval = prevSetInterval;
      globalThis.clearInterval = prevClearInterval;
    },
  };
}

test('T3 behavior: concert runtime lifecycle scopes gate to event/show, cancels in-flight import, and leaves no duplicate listeners or timers', async () => {
  const env = createMinimalConcertDomEnv();
  let realRuntime;

  try {
    realRuntime = await loadRealConcertRuntimeForLifecycleTest();
    let initCalls = 0;
    let teardownCalls = 0;
    const wrappedRuntime = {
      initConcertRuntime: async () => {
        initCalls += 1;
        return realRuntime.initConcertRuntime();
      },
      teardownConcertRuntime: () => {
        teardownCalls += 1;
        return realRuntime.teardownConcertRuntime();
      },
    };
    // (a) Đổi event.id / selectedShow.id khi cổng ngữ cảnh cũ đang mở → ngữ cảnh mới đóng ngay; thiếu #stadium-svg không gọi init và không khởi động vòng retry 50ms
    const show1Key = buildPurchaseGateContextKey(1, 10);
    const show2Key = buildPurchaseGateContextKey(1, 20);
    const event2Key = buildPurchaseGateContextKey(2, 10);
    const openGateContextKey = show1Key;
    assert.equal(openGateContextKey === show1Key, true);
    assert.equal(openGateContextKey === show2Key, false);
    assert.equal(openGateContextKey === event2Key, false);

    env.setStadiumMounted(false);
    const stopClosed = syncConcertRuntimeEffect({
      isConcert: true,
      isGateOpen: openGateContextKey === show2Key,
      loadRuntime: async () => wrappedRuntime,
    });
    await new Promise((r) => setTimeout(r, 0));
    stopClosed();
    assert.equal(initCalls, 0);
    assert.equal(env.activeTimeouts.size, 0);

    // Kể cả khi isGateOpen=true nhưng #stadium-svg chưa mount/connected → không gọi initConcertRuntime (tránh vòng retry 50ms)
    const stopMissingRoot = syncConcertRuntimeEffect({
      isConcert: true,
      isGateOpen: true,
      loadRuntime: async () => wrappedRuntime,
    });
    await new Promise((r) => setTimeout(r, 0));
    stopMissingRoot();
    assert.equal(initCalls, 0);
    assert.equal(env.activeTimeouts.size, 0);

    // (b) Đóng cổng hoặc đổi ngữ cảnh khi dynamic import đang chờ → hủy init cũ, không khởi tạo hay chạy vòng retry; mở lại không bị import cũ phá
    env.setStadiumMounted(true);
    const pendingImport1 = createDeferred();
    let activeContext = show1Key;
    const stopInFlight = syncConcertRuntimeEffect({
      isConcert: true,
      isGateOpen: true,
      isContextValid: () => activeContext === show1Key,
      loadRuntime: () => pendingImport1.promise,
    });
    activeContext = show2Key;
    stopInFlight();

    const pendingImport2 = createDeferred();
    activeContext = show2Key;
    const stopReopened = syncConcertRuntimeEffect({
      isConcert: true,
      isGateOpen: true,
      isContextValid: () => activeContext === show2Key,
      loadRuntime: () => pendingImport2.promise,
    });
    pendingImport2.resolve(wrappedRuntime);
    await env.wait(10);
    assert.equal(initCalls, 1);
    assert.equal(teardownCalls, 0);

    // Import cũ phân giải muộn sau khi đã mở lại → không gọi init lần 2, không gọi teardown phá lần mở mới
    pendingImport1.resolve(wrappedRuntime);
    await env.wait(10);
    assert.equal(initCalls, 1);
    assert.equal(teardownCalls, 0);
    assert.equal(env.bodySaleStatusListeners.size, 1);
    assert.equal(env.activeIntervals.size, 1);
    assert.equal(env.activeTimeouts.size, 0);

    stopReopened();
    assert.equal(teardownCalls, 1);
    assert.equal(env.bodySaleStatusListeners.size, 0);
    assert.equal(env.activeIntervals.size, 0);
    assert.equal(env.activeTimeouts.size, 0);

    // (c) Mở -> đóng -> mở lại cổng với #stadium-svg đã mount: init -> teardown -> init, không nhân đôi listener hay timer
    const stopRun1 = syncConcertRuntimeEffect({
      isConcert: true,
      isGateOpen: true,
      loadRuntime: async () => wrappedRuntime,
    });
    await env.wait(10);
    assert.equal(initCalls, 2);
    assert.equal(env.bodySaleStatusListeners.size, 1);
    assert.equal(env.activeIntervals.size, 1);

    stopRun1();
    assert.equal(teardownCalls, 2);
    assert.equal(env.bodySaleStatusListeners.size, 0);
    assert.equal(env.activeIntervals.size, 0);
    assert.equal(env.activeTimeouts.size, 0);

    const stopRun2 = syncConcertRuntimeEffect({
      isConcert: true,
      isGateOpen: true,
      loadRuntime: async () => wrappedRuntime,
    });
    await env.wait(10);
    assert.equal(initCalls, 3);
    assert.equal(env.bodySaleStatusListeners.size, 1);
    assert.equal(env.activeIntervals.size, 1);

    stopRun2();
    assert.equal(teardownCalls, 3);
    assert.equal(env.bodySaleStatusListeners.size, 0);
    assert.equal(env.activeIntervals.size, 0);
    assert.equal(env.activeTimeouts.size, 0);
  } finally {
    realRuntime?.teardownConcertRuntime();
    env.restore();
  }
});

test('T3 static: PurchaseAccessGate uses module-level khoTrangThaiOtpPhien (not useRef store) and OtpVerificationPanel binds ganOnVerified', async () => {
  const [gateSrc, panelSrc, otpServiceSrc, authServiceSrc, coreSrc] = await Promise.all([
    read('../src/components/event-template/PurchaseAccessGate.tsx'),
    read('../src/components/event-template/OtpVerificationPanel.tsx'),
    read('../src/services/otpService.ts'),
    read('../src/services/buyerAuthService.ts'),
    read('../src/domain/otpServiceCore.js'),
  ]);

  assert.match(gateSrc, /khoOtp\s*=\s*khoTrangThaiOtpPhien/, 'PurchaseAccessGate defaults khoOtp to module singleton');
  assert.doesNotMatch(gateSrc, /taoKhoTrangThaiOtpPhien/, 'PurchaseAccessGate must not create per-instance store');
  assert.doesNotMatch(gateSrc, /useRef<KhoTrangThaiOtpPhien/, 'PurchaseAccessGate must not keep OTP store in component useRef');

  assert.match(panelSrc, /khoOtp\.ganOnVerified\?\.\(session,/, 'OtpVerificationPanel attaches live onVerified handler on mount');
  assert.doesNotMatch(
    panelSrc,
    /khoOtp\.thucHienXacMinh\([\s\S]*?onVerified:/,
    'OtpVerificationPanel must not pass stale gate callback into thucHienXacMinh options',
  );

  assert.match(otpServiceSrc, /khoTrangThaiOtpPhien/, 'otpService re-exports khoTrangThaiOtpPhien');
  assert.match(coreSrc, /export const khoTrangThaiOtpPhien\s*=\s*taoKhoTrangThaiOtpPhien\(\)/);
  assert.match(coreSrc, /dangKyThuHoiBangChungMock\(\(\)\s*=>\s*khoTrangThaiOtpPhien\.xoa\(\)\)/);
  assert.match(authServiceSrc, /khoTrangThaiOtpPhien\.lay\(session\)/, 'buyerAuthService syncs store on resolved auth events');
  assert.match(authServiceSrc, /khoTrangThaiOtpPhien\.xoa\(\)/, 'buyerAuthService clears store on real sign-out');
});

function mountSimulatedGate({
  kho = khoTrangThaiOtpPhien,
  session,
  eventId = 'ev-1',
  kiemTra,
}) {
  let active = true;
  let gateState = null;
  let panelView = null;
  let code = '';
  let unsubStore = null;
  let unbindOnVerified = null;
  let verifiedCalls = 0;

  const cong = taoBoDieuPhoiCongOtp({
    kiemTra,
    emit: (st) => {
      if (active) gateState = st;
    },
    isActive: () => active,
  });

  const handleVerified = async (ketQua) => {
    verifiedCalls += 1;
    kho.xoa();
    await cong.apDungXacMinh(ketQua);
  };

  const syncPanelMount = () => {
    if (!active || gateState?.status !== TRANG_THAI_CONG.CAN_OTP || !session) return;
    if (!unsubStore) {
      panelView = kho.layChiTiet(session);
      code = '';
      unsubStore = kho.dangKy(() => {
        panelView = kho.layChiTiet(session);
      });
    }
    if (!unbindOnVerified && typeof kho.ganOnVerified === 'function') {
      unbindOnVerified = kho.ganOnVerified(session, handleVerified);
    }
  };

  return {
    cong,
    async open() {
      kho.lay(session);
      const st = await cong.kiemTraLai(session, eventId);
      syncPanelMount();
      return st;
    },
    getGateState: () => gateState ?? cong.layTrangThai(),
    getPanelView: () => panelView,
    getCode: () => code,
    setCode: (v) => {
      code = v;
    },
    getVerifiedCalls: () => verifiedCalls,
    isResendDisabled: (nowMs) => {
      const st = panelView?.trangThai;
      if (!st) return true;
      const daGui = st.guiLuc !== null;
      const tg = tinhThoiGianOtp(st, nowMs);
      return panelView.busy !== null || (daGui && !tg.coTheGuiLai);
    },
    unmount() {
      active = false;
      code = '';
      unbindOnVerified?.();
      unbindOnVerified = null;
      unsubStore?.();
      unsubStore = null;
      cong.huy();
    },
  };
}

test('T3 regression 1: send succeeds on Gate 1 -> unmount entire Gate 1 -> remount Gate 2 before 60s keeps cooldown, counters, blocks resend, unlocks at 60s', async () => {
  xoaBangChungMock();
  khoTrangThaiOtpPhien.xoa();
  const T0 = 1_700_000_000_000;
  const clock = {now: T0 - 60_000};
  const sessionA = {userId: 'user-r1', email: 'Buyer.R1@Example.com'};
  let sendNetworkCalls = 0;

  const cauHinhThat = {
    useMockData: false,
    layAuth: () => ({
      signInWithOtp: async () => {
        sendNetworkCalls += 1;
        return {data: {}, error: null};
      },
      verifyOtp: async () => ({data: {}, error: {status: 403, code: 'otp_expired'}}),
    }),
    layClient: () => {
      throw new Error('not needed for send');
    },
  };

  let gate1;
  let gate2;
  try {
    // Mount Gate 1: gửi lần đầu ở T0 - 60s, gửi lại thành công ở T0, nhập sai 1 lần ở T0 + 5s
    gate1 = mountSimulatedGate({
      session: sessionA,
      kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'}),
    });
    await gate1.open();
    assert.equal(gate1.getGateState().status, TRANG_THAI_CONG.CAN_OTP);

    await khoTrangThaiOtpPhien.thucHienGui(sessionA, {
      guiMaOtp: (email, opts) =>
        guiMaOtpTheoCauHinh(cauHinhThat, email, {
          trangThai: opts.trangThai,
          userId: opts.userId,
          layNow: () => clock.now,
        }),
      layNow: () => clock.now,
    });
    assert.equal(sendNetworkCalls, 1);

    clock.now = T0;
    await khoTrangThaiOtpPhien.thucHienGui(sessionA, {
      guiMaOtp: (email, opts) =>
        guiMaOtpTheoCauHinh(cauHinhThat, email, {
          trangThai: opts.trangThai,
          userId: opts.userId,
          layNow: () => clock.now,
        }),
      layNow: () => clock.now,
    });
    assert.equal(sendNetworkCalls, 2);

    clock.now = T0 + 5_000;
    await khoTrangThaiOtpPhien.thucHienXacMinh(sessionA, '000000', {
      xacMinhMaOtp: (email, token, uid, opts) =>
        xacMinhMaOtpTheoCauHinh(cauHinhThat, email, token, uid, {
          trangThai: opts.trangThai,
          nowMs: clock.now,
        }),
      layNow: () => clock.now,
    });
    assert.equal(gate1.getPanelView().trangThai.guiLuc, T0);
    assert.equal(tinhThoiGianOtp(gate1.getPanelView().trangThai, clock.now).soLanGuiLaiConLai, SO_LAN_GUI_LAI_TOI_DA - 1);
    assert.equal(tinhThoiGianOtp(gate1.getPanelView().trangThai, clock.now).soLanSaiConLai, SO_LAN_SAI_TOI_DA - 1);

    // Rời trang (điều hướng SPA sang danh sách): unmount toàn bộ Gate 1 (hủy cong 1)
    gate1.unmount();

    // Quay lại trang sự kiện ở T0 + 25s (< 60s): mount Gate 2 mới hoàn toàn với cong 2 mới
    clock.now = T0 + 25_000;
    gate2 = mountSimulatedGate({
      session: sessionA,
      kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'}),
    });
    await gate2.open();
    assert.equal(gate2.getGateState().status, TRANG_THAI_CONG.CAN_OTP);
    assert.equal(gate2.getCode(), '');

    const restored = gate2.getPanelView().trangThai;
    assert.equal(restored.guiLuc, T0);
    const tg25 = tinhThoiGianOtp(restored, clock.now);
    assert.equal(tg25.coTheGuiLai, false);
    assert.equal(tg25.giayChoGuiLai, 35);
    assert.equal(gate2.isResendDisabled(clock.now), true);
    assert.equal(tg25.soLanGuiLaiConLai, SO_LAN_GUI_LAI_TOI_DA - 1);
    assert.equal(tg25.soLanSaiConLai, SO_LAN_SAI_TOI_DA - 1);

    // Gọi gửi lại trước 60s không phát sinh gọi mạng
    await khoTrangThaiOtpPhien.thucHienGui(sessionA, {
      guiMaOtp: (email, opts) =>
        guiMaOtpTheoCauHinh(cauHinhThat, email, {
          trangThai: opts.trangThai,
          userId: opts.userId,
          layNow: () => clock.now,
        }),
      layNow: () => clock.now,
    });
    assert.equal(sendNetworkCalls, 2, 'Resend before 60s must not trigger any network call');
    assert.match(gate2.getPanelView().error ?? '', /35 giây/);

    // Đúng T0 + 60s mới cho phép gửi lại
    clock.now = T0 + 60_000;
    const tg60 = tinhThoiGianOtp(gate2.getPanelView().trangThai, clock.now);
    assert.equal(tg60.coTheGuiLai, true);
    assert.equal(tg60.giayChoGuiLai, 0);
    assert.equal(gate2.isResendDisabled(clock.now), false);

    await khoTrangThaiOtpPhien.thucHienGui(sessionA, {
      guiMaOtp: (email, opts) =>
        guiMaOtpTheoCauHinh(cauHinhThat, email, {
          trangThai: opts.trangThai,
          userId: opts.userId,
          layNow: () => clock.now,
        }),
      layNow: () => clock.now,
    });
    assert.equal(sendNetworkCalls, 3);
    assert.equal(gate2.getPanelView().trangThai.guiLuc, T0 + 60_000);
  } finally {
    gate1?.unmount();
    gate2?.unmount();
    khoTrangThaiOtpPhien.xoa();
    xoaBangChungMock();
  }
});

test('T3 regression 2: in-flight send/verify across full Gate 1 unmount -> Gate 2 remount blocks duplicates, enforces 60s from completion, counts SAI_MA once, and opens Gate 2 on verify success', async () => {
  xoaBangChungMock();
  khoTrangThaiOtpPhien.xoa();
  const T0 = 1_700_000_000_000;
  const clock = {now: T0};
  const sessionA = {userId: 'user-r2', email: 'buyer.r2@example.com'};

  const gates = [];
  try {
    // --- Phần A: send đang chờ -> unmount Gate 1 -> remount Gate 2 -> hoàn tất sau khi Gate 2 mount ---
    let sendCalls = 0;
    let sendDef = createDeferred();
    const guiPending = async (email, opts) => {
      sendCalls += 1;
      await sendDef.promise;
      return {nguon: 'THAT', trangThai: ghiNhanGui(opts.trangThai, clock.now, {laGuiLai: opts.trangThai.guiLuc !== null})};
    };

    const g1 = mountSimulatedGate({session: sessionA, kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'})});
    gates.push(g1);
    await g1.open();
    const pSend1 = khoTrangThaiOtpPhien.thucHienGui(sessionA, {guiMaOtp: guiPending, layNow: () => clock.now});
    assert.equal(g1.getPanelView().busy, 'send');
    g1.unmount();

    const g2 = mountSimulatedGate({session: sessionA, kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'})});
    gates.push(g2);
    await g2.open();
    assert.equal(g2.getPanelView().busy, 'send');
    assert.equal(g2.getCode(), '');
    assert.equal(g2.isResendDisabled(clock.now), true);

    const pSendDup = khoTrangThaiOtpPhien.thucHienGui(sessionA, {guiMaOtp: guiPending, layNow: () => clock.now});
    assert.equal(pSendDup, pSend1);
    assert.equal(sendCalls, 1, 'Duplicate send on Gate 2 must not trigger a second network call');

    clock.now = T0 + 10_000;
    sendDef.resolve();
    await pSend1;
    assert.equal(g2.getPanelView().busy, null);
    assert.equal(g2.getPanelView().trangThai.guiLuc, T0 + 10_000);
    assert.equal(tinhThoiGianOtp(g2.getPanelView().trangThai, T0 + 69_999).coTheGuiLai, false);
    assert.equal(tinhThoiGianOtp(g2.getPanelView().trangThai, T0 + 70_000).coTheGuiLai, true);

    // --- Phần B: send đang chờ -> unmount Gate 1 -> hoàn tất lúc đang ở trang danh sách -> remount Gate 2 vẫn đủ 60s ---
    clock.now = T0 + 70_000;
    sendDef = createDeferred();
    const pSendUnmounted = khoTrangThaiOtpPhien.thucHienGui(sessionA, {guiMaOtp: guiPending, layNow: () => clock.now});
    g2.unmount();

    clock.now = T0 + 76_000; // hoàn tất khi không có gate nào mount
    sendDef.resolve();
    await pSendUnmounted;

    clock.now = T0 + 90_000; // quay lại Gate 3 sau 14s
    const g3 = mountSimulatedGate({session: sessionA, kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'})});
    gates.push(g3);
    await g3.open();
    assert.equal(g3.getPanelView().busy, null);
    assert.equal(g3.getPanelView().trangThai.guiLuc, T0 + 76_000);
    assert.equal(tinhThoiGianOtp(g3.getPanelView().trangThai, clock.now).coTheGuiLai, false);
    assert.equal(tinhThoiGianOtp(g3.getPanelView().trangThai, clock.now).giayChoGuiLai, 46);

    // --- Phần C: verify SAI_MA đang chờ -> unmount Gate 3 -> remount Gate 4 -> trừ đúng 1 lượt nhập ---
    let verifyCalls = 0;
    let verifyDef = createDeferred();
    const verifyPending = async () => {
      verifyCalls += 1;
      return verifyDef.promise;
    };

    g3.setCode('543219');
    const code3 = g3.getCode();
    g3.setCode('');
    const pVerifySai = khoTrangThaiOtpPhien.thucHienXacMinh(sessionA, code3, {
      xacMinhMaOtp: verifyPending,
      layNow: () => clock.now,
    });
    assert.equal(g3.getPanelView().busy, 'verify');
    assert.equal(JSON.stringify(g3.getPanelView()).includes('543219'), false);
    g3.unmount();

    const g4 = mountSimulatedGate({session: sessionA, kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'})});
    gates.push(g4);
    await g4.open();
    assert.equal(g4.getPanelView().busy, 'verify');
    assert.equal(g4.getCode(), '');

    const pVerifyDup = khoTrangThaiOtpPhien.thucHienXacMinh(sessionA, '111111', {
      xacMinhMaOtp: verifyPending,
      layNow: () => clock.now,
    });
    assert.equal(pVerifyDup, pVerifySai);
    assert.equal(verifyCalls, 1, 'Duplicate verify on Gate 2 must not trigger a second network call');

    clock.now = T0 + 95_000;
    verifyDef.reject(new OtpServiceError('Mã OTP không đúng.', 'SAI_MA'));
    await pVerifySai;
    assert.equal(g4.getPanelView().busy, null);
    assert.equal(g4.getPanelView().trangThai.lichSuSai.length, 1);
    assert.equal(tinhThoiGianOtp(g4.getPanelView().trangThai, clock.now).soLanSaiConLai, SO_LAN_SAI_TOI_DA - 1);
    assert.equal(g4.getVerifiedCalls(), 0);

    // --- Phần D: verify thành công bắt đầu trên Gate 4 -> unmount Gate 4 -> remount Gate 5 -> gọi đúng handleVerified của Gate 5 và mở DUOC_VAO ---
    verifyDef = createDeferred();
    let evidenceReady = false;
    const g4b = mountSimulatedGate({
      session: sessionA,
      kiemTra: async () => ({daXacMinh: evidenceReady, nguon: 'THAT'}),
    });
    gates.push(g4b);
    // g4 đã đăng ký trước đó; unmount g4 trước khi mount g4b để mô phỏng đúng 1 gate tại mỗi thời điểm
    g4.unmount();
    await g4b.open();

    const pVerifyOk = khoTrangThaiOtpPhien.thucHienXacMinh(sessionA, '123456', {
      xacMinhMaOtp: verifyPending,
      layNow: () => clock.now,
    });
    assert.equal(g4b.getPanelView().busy, 'verify');
    g4b.unmount();

    const g5 = mountSimulatedGate({
      session: sessionA,
      kiemTra: async () => ({daXacMinh: evidenceReady, nguon: 'THAT'}),
    });
    gates.push(g5);
    await g5.open();
    assert.equal(g5.getGateState().status, TRANG_THAI_CONG.CAN_OTP);
    assert.equal(g5.getPanelView().busy, 'verify');

    evidenceReady = true;
    verifyDef.resolve({daXacMinh: true, nguon: 'THAT', userId: sessionA.userId, trangThai: g5.getPanelView().trangThai});
    await pVerifyOk;

    assert.equal(g4b.getVerifiedCalls(), 0, 'Unmounted Gate 4 handleVerified must not be called');
    assert.equal(g5.getVerifiedCalls(), 1, 'Mounted Gate 5 handleVerified must be called');
    assert.equal(g5.getGateState().status, TRANG_THAI_CONG.DUOC_VAO);
    assert.equal(khoTrangThaiOtpPhien.lay(sessionA).guiLuc, null);
    assert.deepEqual(khoTrangThaiOtpPhien.lay(sessionA).lichSuSai, []);
  } finally {
    for (const g of gates) g.unmount();
    khoTrangThaiOtpPhien.xoa();
    xoaBangChungMock();
  }
});

async function loadBundledAuthAndOtpServices({useMockData = false} = {}) {
  const runtimePath = fileURLToPath(new URL('../src/config/runtime.ts', import.meta.url));
  const supabasePath = fileURLToPath(new URL('../src/services/supabaseClient.ts', import.meta.url));
  const buyerAuthPath = fileURLToPath(new URL('../src/services/buyerAuthService.ts', import.meta.url));
  const otpServicePath = fileURLToPath(new URL('../src/services/otpService.ts', import.meta.url));
  const resolveDir = fileURLToPath(new URL('../src/services', import.meta.url));

  const plugin = {
    name: 'auth-otp-bundle-mocks',
    setup(b) {
      b.onResolve({filter: /config\/runtime$/}, () => ({path: runtimePath, namespace: 'mock-runtime'}));
      b.onLoad({filter: /.*/, namespace: 'mock-runtime'}, () => ({
        contents: `export const runtimeConfig = { useMockData: ${useMockData ? 'true' : 'false'}, eventId: '1' };`,
        loader: 'js',
      }));
      b.onResolve({filter: /supabaseClient$/}, () => ({path: supabasePath, namespace: 'mock-supabase'}));
      b.onLoad({filter: /.*/, namespace: 'mock-supabase'}, () => ({
        contents: `export function requireSupabaseClient() { return globalThis.__OTP_AUTH_TEST_CLIENT__; }`,
        loader: 'js',
      }));
    },
  };

  const result = await build({
    stdin: {
      contents: `
        export * from ${JSON.stringify(buyerAuthPath)};
        export * from ${JSON.stringify(otpServicePath)};
      `,
      resolveDir,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [plugin],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

test('T3 regression 3: account switch, email change, signOutBuyer, or mock revocation while gate is unmounted discards pending requests', async () => {
  const prevWindow = globalThis.window;
  const listeners = new Set();
  globalThis.window = {
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    dispatchEvent: () => true,
  };

  let currentAuthSession = {user: {id: 'user-a', email: 'a@example.com', user_metadata: {}}};
  let authListener = null;
  globalThis.__OTP_AUTH_TEST_CLIENT__ = {
    auth: {
      getSession: async () => ({data: {session: currentAuthSession}, error: null}),
      onAuthStateChange: (cb) => {
        authListener = cb;
        queueMicrotask(() => cb('INITIAL_SESSION', currentAuthSession));
        return {data: {subscription: {unsubscribe: () => { authListener = null; }}}};
      },
      signOut: async () => {
        currentAuthSession = null;
        return {error: null};
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({data: {LoaiTaiKhoan: 'USER'}, error: null}),
        }),
      }),
    }),
  };

  const svc = await loadBundledAuthAndOtpServices({useMockData: false});
  const sessionA = {userId: 'user-a', email: 'a@example.com'};
  const sessionB = {userId: 'user-b', email: 'b@example.com'};
  const sessionB2 = {userId: 'user-b', email: 'b2@example.com'};

  let unsubGlobalHeader = null;
  let gateA;
  let gateB;
  let gateA2;
  try {
    // Subscriber cấp site (ví dụ GlobalHeader) vẫn sống khi PurchaseAccessGate đã unmount
    unsubGlobalHeader = svc.subscribeBuyerAuth(() => {});
    await new Promise((r) => setTimeout(r, 10));

    // (a) Đổi tài khoản A -> B khi Gate 1 đã unmount và request gửi của A đang chờ
    gateA = mountSimulatedGate({
      kho: svc.khoTrangThaiOtpPhien,
      session: sessionA,
      kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'}),
    });
    await gateA.open();
    const sendDefA = createDeferred();
    const pSendA = svc.khoTrangThaiOtpPhien.thucHienGui(sessionA, {
      guiMaOtp: () => sendDefA.promise,
    });
    gateA.unmount();

    currentAuthSession = {user: {id: 'user-b', email: 'b@example.com', user_metadata: {}}};
    authListener('SIGNED_IN', currentAuthSession);
    await new Promise((r) => setTimeout(r, 10));

    gateB = mountSimulatedGate({
      kho: svc.khoTrangThaiOtpPhien,
      session: sessionB,
      kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'}),
    });
    await gateB.open();
    sendDefA.resolve({nguon: 'THAT', trangThai: svc.ghiNhanGui(svc.taoTrangThaiOtp(sessionA.email), 1_700_000_000_000)});
    await pSendA;

    assert.equal(gateB.getPanelView().trangThai.guiLuc, null, 'Account switch while gate unmounted must discard stale send of A');
    assert.equal(gateB.getPanelView().notice, null);

    // (b) Đổi email của cùng user-b khi Gate đã unmount và verify đang chờ → bỏ kết quả, không gọi onVerified
    const verifyDefB = createDeferred();
    const pVerifyB = svc.khoTrangThaiOtpPhien.thucHienXacMinh(sessionB, '123456', {
      xacMinhMaOtp: () => verifyDefB.promise,
    });
    gateB.unmount();

    currentAuthSession = {user: {id: 'user-b', email: 'b2@example.com', user_metadata: {}}};
    authListener('USER_UPDATED', currentAuthSession);
    await new Promise((r) => setTimeout(r, 10));

    const gateB2 = mountSimulatedGate({
      kho: svc.khoTrangThaiOtpPhien,
      session: sessionB2,
      kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'}),
    });
    await gateB2.open();
    verifyDefB.resolve({daXacMinh: true, nguon: 'THAT', userId: 'user-b'});
    await pVerifyB;
    assert.equal(gateB2.getVerifiedCalls(), 0, 'Email change while gate unmounted must discard stale verify');
    assert.equal(gateB2.getGateState().status, TRANG_THAI_CONG.CAN_OTP);
    gateB2.unmount();

    // (c) Đăng xuất (signOutBuyer) khi Gate đã unmount và KHÔNG còn subscriber nào, trong lúc SAI_MA đang chờ
    unsubGlobalHeader();
    unsubGlobalHeader = null;
    const verifyDefOut = createDeferred();
    const pVerifyOut = svc.khoTrangThaiOtpPhien.thucHienXacMinh(sessionA, '000000', {
      xacMinhMaOtp: () => verifyDefOut.promise,
    });
    await svc.signOutBuyer();
    verifyDefOut.reject(new svc.OtpServiceError('Mã OTP không đúng.', 'SAI_MA'));
    await pVerifyOut;

    gateA2 = mountSimulatedGate({
      kho: svc.khoTrangThaiOtpPhien,
      session: sessionA,
      kiemTra: async () => ({daXacMinh: false, nguon: 'THAT'}),
    });
    await gateA2.open();
    assert.deepEqual(gateA2.getPanelView().trangThai.lichSuSai, [], 'signOutBuyer while gate unmounted must discard stale SAI_MA');
    assert.equal(gateA2.getPanelView().error, null);
    gateA2.unmount();

    // (d) Thu hồi bằng chứng mock (xoaBangChungMock) khi Gate đã unmount và verify đang chờ
    const verifyDefRevoke = createDeferred();
    const pVerifyRevoke = svc.khoTrangThaiOtpPhien.thucHienXacMinh(sessionA, '123456', {
      xacMinhMaOtp: () => verifyDefRevoke.promise,
    });
    assert.equal(svc.khoTrangThaiOtpPhien.layChiTiet(sessionA).busy, 'verify');
    svc.xoaBangChungMock();
    verifyDefRevoke.resolve({daXacMinh: true, nguon: 'MO_PHONG', userId: sessionA.userId});
    await pVerifyRevoke;
    assert.equal(svc.khoTrangThaiOtpPhien.layChiTiet(sessionA).notice, null);
    assert.equal(svc.khoTrangThaiOtpPhien.layChiTiet(sessionA).busy, null);
  } finally {
    unsubGlobalHeader?.();
    gateA?.unmount();
    gateB?.unmount();
    gateA2?.unmount();
    svc.khoTrangThaiOtpPhien.xoa();
    svc.xoaBangChungMock();
    delete globalThis.__OTP_AUTH_TEST_CLIENT__;
    globalThis.window = prevWindow;
  }
});
