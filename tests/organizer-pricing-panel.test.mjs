import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFormValues,
  createDialogFocusScope,
  createPricingSession,
  getFocusableElements,
  resolveDialogKeyDown,
  groupBySuat,
  isSimulatedView,
  isSimulationEnabled,
  loadMetrics,
  resolveSelection,
  runGuarded,
  runPricingNow,
  runSimulation,
  saveConfig,
  summarizeRun,
} from '../src/components/organizer-ui/pricingPanelController.js';

const owner = {organizationId: 'org-1', role: 'CHU_SO_HUU'};
const editor = {organizationId: 'org-1', role: 'BIEN_TAP'};
const event = {id: 7, organizationId: 'org-1'};

const validValues = () => ({
  giaGoc: '100000',
  giaSan: '80000',
  giaTran: '150000',
  buocNhayGia: '5000',
  bienDoToiDa: '0.1',
  nguongLapDayThap: '0.3',
  nguongLapDayCao: '0.8',
  trongSoLapDay: '0.5',
  trongSoTocDoBan: '0.3',
  trongSoThoiGian: '0.2',
  trangThaiKichHoat: true,
});

const row = (over = {}) => ({
  khu_vuc_id: 11,
  suat_dien_id: 1,
  su_kien_id: 7,
  co_quy_tac: false,
  gia_hien_hanh: 100000,
  mo_phong: false,
  ...over,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

test('BIEN_TAP khong duoc luu, chay hay mo phong va khong goi dich vu', async () => {
  const calls = [];
  const services = {
    luuCauHinhGia: async () => calls.push('luu'),
    chayDinhGiaNgay: async () => calls.push('chay'),
    moPhongNhuCau: async () => calls.push('mo_phong'),
    laySoLieuDinhGia: async () => calls.push('lay'),
  };
  const s = createPricingSession();
  assert.equal((await saveConfig(s, services, {activeOrg: editor, event, khuVucId: 11, formValues: validValues()})).status, 'forbidden');
  assert.equal((await runPricingNow(s, services, {activeOrg: editor, event})).status, 'forbidden');
  assert.equal(
    (await runSimulation(s, services, {activeOrg: editor, event: {...event, moPhong: true}, rows: [], kichBan: 'ban_deu'})).status,
    'forbidden',
  );
  assert.equal((await loadMetrics(s, services, {activeOrg: editor, event})).status, 'forbidden');
  // Tổ chức khác cũng bị chặn.
  assert.equal(
    (await saveConfig(s, services, {activeOrg: {organizationId: 'org-2', role: 'CHU_SO_HUU'}, event, khuVucId: 11, formValues: validValues()})).status,
    'forbidden',
  );
  assert.deepEqual(calls, []);
});

test('CHU_SO_HUU va QUAN_TRI duoc cau hinh gia, BIEN_TAP/khac to chuc thi khong', async () => {
  const services = {luuCauHinhGia: async () => ({ok: true, taoMoi: false, canhBao: [], deXuatHetHieuLuc: []})};
  const s = createPricingSession();
  for (const role of ['CHU_SO_HUU', 'QUAN_TRI']) {
    const out = await saveConfig(s, services, {
      activeOrg: {organizationId: 'org-1', role},
      event,
      khuVucId: 11,
      formValues: validValues(),
    });
    assert.equal(out.status, 'saved', role);
  }
  const denied = await saveConfig(s, services, {
    activeOrg: {organizationId: 'org-2', role: 'QUAN_TRI'},
    event,
    khuVucId: 11,
    formValues: validValues(),
  });
  assert.equal(denied.status, 'forbidden');
});

test('luu bi tu choi khi dang khoa khong nha khoa cua thao tac khac', async () => {
  const gate = deferred();
  const s = createPricingSession();
  const running = runPricingNow(s, {chayDinhGiaNgay: () => gate.promise}, {activeOrg: owner, event});
  const blocked = await saveConfig(
    s,
    {luuCauHinhGia: async () => assert.fail('khong duoc goi')},
    {activeOrg: owner, event, khuVucId: 11, formValues: validValues()},
  );
  assert.equal(blocked.status, 'busy');
  assert.equal(s.busy, true, 'khoa cua thao tac dang chay van giu nguyen');
  gate.resolve({theoKhu: [], hetHan: {soLuong: 0, deXuatHetHan: []}});
  assert.equal((await running).status, 'done');
  assert.equal(s.busy, false);
});

test('luu cau hinh bi doi phien giua chung tra stale va khong nha khoa phien moi', async () => {
  const old = deferred();
  const s = createPricingSession();
  const pending = saveConfig(s, {luuCauHinhGia: () => old.promise}, {activeOrg: owner, event, khuVucId: 11, formValues: validValues()});
  s.reset();
  const gate = deferred();
  const fresh = runPricingNow(s, {chayDinhGiaNgay: () => gate.promise}, {activeOrg: owner, event});
  old.resolve({ok: true, canhBao: [], deXuatHetHieuLuc: []});
  assert.equal((await pending).status, 'stale');
  assert.equal(s.busy, true, 'phien moi van dang khoa');
  gate.resolve({theoKhu: [], hetHan: {soLuong: 0, deXuatHetHan: []}});
  await fresh;
});

test('bieu mau sai chan luu truoc khi goi dich vu va tra truong dau tien loi', async () => {
  let called = 0;
  const services = {luuCauHinhGia: async () => (called += 1)};
  const s = createPricingSession();
  const out = await saveConfig(s, services, {
    activeOrg: owner,
    event,
    khuVucId: 11,
    formValues: {...validValues(), giaSan: 'abc', giaTran: ''},
  });
  assert.equal(out.status, 'invalid');
  assert.equal(out.firstInvalidField, 'giaSan');
  assert.ok(out.errors.giaSan && out.errors.giaTran);
  assert.equal(called, 0);
  assert.equal(s.busy, false);
});

test('luu thanh cong tra canh bao ngoai khung va de xuat het hieu luc, khong tu ap gia', async () => {
  let args;
  const services = {
    luuCauHinhGia: async (khu, params) => {
      args = {khu, params};
      return {
        nguon: 'THAT',
        luuTru: null,
        ok: true,
        taoMoi: false,
        canhBao: [{ma: 'GIA_HIEN_HANH_NGOAI_KHUNG', giaHienHanh: 200000, giaSan: 80000, giaTran: 150000}],
        deXuatHetHieuLuc: [5, 6],
      };
    },
  };
  const s = createPricingSession();
  const out = await saveConfig(s, services, {activeOrg: owner, event, khuVucId: 11, formValues: validValues()});
  assert.equal(out.status, 'saved');
  assert.equal(args.khu, 11);
  assert.equal(args.params.giaSan, 80000);
  assert.equal(args.params.trangThaiKichHoat, true);
  assert.equal(out.notice.khongTuApDungGia, true);
  assert.deepEqual(out.notice.canhBaoNgoaiKhung, [{giaHienHanh: 200000, giaSan: 80000, giaTran: 150000}]);
  assert.deepEqual(out.notice.deXuatHetHieuLuc, [5, 6]);
  assert.equal(s.busy, false);
});

test('luu bi tu choi (ok:false) va loi dich vu duoc bao ro', async () => {
  const s = createPricingSession();
  const rejected = await saveConfig(
    s,
    {luuCauHinhGia: async () => ({ok: false, loi: 'KHU_VUC_KHONG_TON_TAI'})},
    {activeOrg: owner, event, khuVucId: 11, formValues: validValues()},
  );
  assert.deepEqual([rejected.status, rejected.loi], ['rejected', 'KHU_VUC_KHONG_TON_TAI']);

  const err = Object.assign(new Error('Không đủ quyền'), {code: '42501'});
  const failed = await saveConfig(
    s,
    {luuCauHinhGia: async () => Promise.reject(err)},
    {activeOrg: owner, event, khuVucId: 11, formValues: validValues()},
  );
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.error, {message: 'Không đủ quyền', code: '42501'});
  assert.equal(s.busy, false, 'khoa duoc nha sau loi');
});

test('chay ngay tra ket qua tung khu va khoa thao tac khi dang gui', async () => {
  const gate = deferred();
  let calls = 0;
  const theoKhu = [
    {khuVucId: 1, suatDienId: 1, ketQua: 'DA_LUU', deXuatId: 9, giaDeXuat: 1, giaHienTai: 2, loaiCanhBao: 'BINH_THUONG', deXuatHetHan: []},
    {khuVucId: 2, suatDienId: 1, ketQua: 'BO_QUA', lyDoBoQua: ['KHONG_DU_DU_LIEU']},
    {khuVucId: 3, suatDienId: 1, ketQua: 'BI_CHAN', maChan: 'NGOAI_KHUNG_GIA', nhatKyId: 4, deXuatHetHan: []},
    {khuVucId: 4, suatDienId: 1, ketQua: 'LOI', loi: 'x'},
  ];
  const services = {
    chayDinhGiaNgay: async (id) => {
      calls += 1;
      assert.equal(id, 7);
      await gate.promise;
      return {nguon: 'THAT', luuTru: null, suKienId: 7, hetHan: {deXuatHetHan: [1, 2], soLuong: 2}, theoKhu};
    },
    luuCauHinhGia: async () => assert.fail('khong duoc goi khi dang khoa'),
  };
  const s = createPricingSession();
  const first = runPricingNow(s, services, {activeOrg: owner, event});
  assert.equal(s.busy, true);
  assert.equal((await runPricingNow(s, services, {activeOrg: owner, event})).status, 'busy');
  assert.equal(
    (await saveConfig(s, services, {activeOrg: owner, event, khuVucId: 11, formValues: validValues()})).status,
    'busy',
  );
  gate.resolve();
  const out = await first;
  assert.equal(calls, 1);
  assert.equal(out.status, 'done');
  assert.deepEqual(out.summary.counts, {DA_LUU: 1, BO_QUA: 1, BI_CHAN: 1, LOI: 1});
  assert.equal(out.summary.soDeXuatHetHan, 2);
  assert.equal(out.result.theoKhu.length, 4);
  assert.equal(s.busy, false);
  assert.deepEqual(summarizeRun({theoKhu: [], hetHan: {soLuong: 0, deXuatHetHan: []}}).tong, 0);
});

test('simulator chi chay khi co co mo phong va chap nhan dung 3 kich ban', async () => {
  const seen = [];
  const services = {moPhongNhuCau: async (id, k) => (seen.push([id, k]), {ketQua: 'DA_MO_PHONG', kichBan: k})};
  const s = createPricingSession();
  const live = {activeOrg: owner, event, rows: [row()]};

  assert.equal(isSimulationEnabled(event, [row()]), false);
  assert.equal((await runSimulation(s, services, {...live, kichBan: 'ban_deu'})).status, 'not_available');
  assert.deepEqual(seen, []);

  for (const flagged of [
    {...live, event: {...event, moPhong: true}},
    {...live, rows: [row({mo_phong: true})]},
  ]) {
    assert.equal(isSimulationEnabled(flagged.event, flagged.rows), true);
    for (const k of ['ban_nhanh', 'ban_cham', 'ban_deu']) {
      const out = await runSimulation(s, services, {...flagged, kichBan: k});
      assert.equal(out.status, 'done');
      assert.equal(out.result.kichBan, k);
    }
    assert.equal((await runSimulation(s, services, {...flagged, kichBan: 'ban_la'})).status, 'invalid_scenario');
  }
  assert.equal(seen.length, 6);
  assert.deepEqual(seen[0], [7, 'ban_nhanh']);
});

test('nhan mo phong va canh bao luu tru duoc nhan dien', () => {
  assert.equal(isSimulatedView({meta: {nguon: 'MO_PHONG'}, rows: [], event}), true);
  assert.equal(isSimulatedView({meta: {nguon: 'THAT'}, rows: [row({mo_phong: true})], event}), true);
  assert.equal(isSimulatedView({meta: {nguon: 'THAT'}, rows: [row()], event: {...event, moPhong: true}}), true);
  assert.equal(isSimulatedView({meta: {nguon: 'THAT'}, rows: [row()], event}), false);
});

test('doi su kien/to chuc: phan hoi cu bi bo qua va khoa duoc nha', async () => {
  const old = deferred();
  const s = createPricingSession();
  const pending = loadMetrics(s, {laySoLieuDinhGia: () => old.promise}, {activeOrg: owner, event});
  const pendingRun = runPricingNow(s, {chayDinhGiaNgay: () => old.promise}, {activeOrg: owner, event});
  assert.equal(s.busy, true);

  s.reset(); // đổi tổ chức / sự kiện / đóng panel
  assert.equal(s.busy, false);

  const fresh = await loadMetrics(s, {laySoLieuDinhGia: async () => ({hang: [row({su_kien_id: 8})], nguon: 'THAT', luuTru: null})}, {
    activeOrg: owner,
    event: {id: 8, organizationId: 'org-1'},
  });
  assert.equal(fresh.status, 'ok');

  old.resolve({hang: [row()], nguon: 'THAT', luuTru: null, theoKhu: [], hetHan: {soLuong: 0, deXuatHetHan: []}});
  assert.equal((await pending).status, 'stale');
  assert.equal((await pendingRun).status, 'stale');
  assert.equal(s.busy, false, 'phan hoi cu khong dong khoa cua phien moi');

  // Lỗi muộn của phiên cũ cũng bị bỏ qua.
  const late = deferred();
  const lateLoad = runGuarded(s, () => late.promise, {exclusive: false, channel: 'load'});
  s.reset();
  late.reject(new Error('muộn'));
  assert.equal((await lateLoad).status, 'stale');
});

test('yeu cau nap moi hon thay the yeu cau cu cung phien (thu lai)', async () => {
  const a = deferred();
  const b = deferred();
  const s = createPricingSession();
  const first = loadMetrics(s, {laySoLieuDinhGia: () => a.promise}, {activeOrg: owner, event});
  const second = loadMetrics(s, {laySoLieuDinhGia: () => b.promise}, {activeOrg: owner, event});
  b.resolve({hang: [row({gia_hien_hanh: 2})], nguon: 'THAT', luuTru: null});
  a.resolve({hang: [row({gia_hien_hanh: 1})], nguon: 'THAT', luuTru: null});
  assert.equal((await first).status, 'stale');
  const out = await second;
  assert.equal(out.status, 'ok');
  assert.equal(out.rows[0].gia_hien_hanh, 2);
});

test('nap cau hinh hien co, goi y tu gia hien hanh va chon suat/khu', () => {
  const existing = row({
    co_quy_tac: true,
    kich_hoat: true,
    gia_goc: 100,
    gia_san: 80,
    gia_tran: 150,
    buoc_nhay: 5,
    bien_do: 0.1,
    nguong_thap: 0.3,
    nguong_cao: 0.8,
    trong_so_lap_day: 0.5,
    trong_so_toc_do: 0.3,
    trong_so_thoi_gian: 0.2,
  });
  const v = buildFormValues(existing);
  assert.equal(v.giaGoc, '100');
  assert.equal(v.trongSoTocDoBan, '0.3');
  assert.equal(v.trangThaiKichHoat, true);

  const suggested = buildFormValues(row({gia_hien_hanh: 200000}));
  assert.equal(suggested.giaGoc, '200000');
  assert.equal(suggested.trangThaiKichHoat, false);

  const rows = [row(), row({khu_vuc_id: 12}), row({suat_dien_id: 2, khu_vuc_id: 21})];
  assert.equal(groupBySuat(rows).length, 2);
  assert.deepEqual(resolveSelection(rows, {suatDienId: 2, khuVucId: 21}), {suatDienId: 2, khuVucId: 21});
  assert.deepEqual(resolveSelection(rows, {suatDienId: 2, khuVucId: 99}), {suatDienId: 2, khuVucId: 21});
  assert.deepEqual(resolveSelection(rows, {suatDienId: 99, khuVucId: 1}), {suatDienId: 1, khuVucId: 11});
  assert.deepEqual(resolveSelection([], null), {suatDienId: null, khuVucId: null});
});

// ---------------------------------------------------------------------------
// Modal: bẫy focus + nền inert (DOM giả tối thiểu)
// ---------------------------------------------------------------------------

function makeDom() {
  const listeners = new Map();
  const doc = {
    activeElement: null,
    body: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    fire(type, event) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
    listenerCount: (type) => listeners.get(type)?.size ?? 0,
  };
  class El {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.ownerDocument = doc;
      this.attrs = new Map(Object.entries(attrs));
      this.children = [];
      this.parentElement = null;
      this.disabled = attrs.disabled === true;
      this.hidden = false;
      this.inert = false;
      this.isConnected = true;
    }
    append(...kids) {
      for (const k of kids) {
        k.parentElement = this;
        this.children.push(k);
      }
      return this;
    }
    hasAttribute(n) {
      return this.attrs.has(n);
    }
    getAttribute(n) {
      return this.attrs.has(n) ? this.attrs.get(n) : null;
    }
    setAttribute(n, v) {
      this.attrs.set(n, String(v));
    }
    removeAttribute(n) {
      this.attrs.delete(n);
    }
    descendants() {
      return this.children.flatMap((c) => [c, ...c.descendants()]);
    }
    contains(other) {
      return other === this || this.descendants().includes(other);
    }
    closest() {
      for (let n = this; n; n = n.parentElement) {
        if (n.hidden || n.attrs.has('hidden') || n.inert || n.attrs.has('inert')) return n;
      }
      return null;
    }
    querySelectorAll() {
      return this.descendants().filter(
        (e) => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) || e.attrs.has('tabindex'),
      );
    }
    focus() {
      if (this.closest()) return; // inert/hidden không nhận focus
      doc.activeElement = this;
      doc.fire('focusin', {target: this});
    }
  }
  const body = new El('body');
  doc.body = body;
  return {doc, El, body};
}

function makeModalFixture() {
  const {doc, El, body} = makeDom();
  const topbar = new El('header').append(new El('button'));
  const main = new El('main').append(new El('button'), new El('a', {href: '#'}));
  const opener = main.children[0];
  const first = new El('button');
  const disabled = new El('button', {disabled: true});
  const hiddenInput = new El('input', {type: 'hidden'});
  const middle = new El('input');
  const negative = new El('button', {tabindex: '-1'});
  const last = new El('select');
  const dialog = new El('div', {tabindex: '-1', role: 'dialog'}).append(first, disabled, hiddenInput, middle, negative, last);
  const overlay = new El('div').append(dialog);
  body.append(topbar, main, overlay);
  opener.focus();
  return {doc, body, topbar, main, opener, overlay, dialog, first, middle, last, disabled, negative};
}

test('getFocusableElements bỏ qua disabled, hidden, inert và tabindex âm', () => {
  const f = makeModalFixture();
  assert.deepEqual(getFocusableElements(f.dialog), [f.first, f.middle, f.last]);
  f.middle.hidden = true;
  assert.deepEqual(getFocusableElements(f.dialog), [f.first, f.last]);
  f.last.inert = true;
  assert.deepEqual(getFocusableElements(f.dialog), [f.first]);
});

test('resolveDialogKeyDown: Tab cuối -> đầu, Shift+Tab đầu/gốc -> cuối, Escape -> close', () => {
  const f = makeModalFixture();
  const focusables = getFocusableElements(f.dialog);
  const base = {dialogElement: f.dialog, focusables};
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'Tab', activeElement: f.last}), {action: 'wrap', target: f.first});
  assert.deepEqual(
    resolveDialogKeyDown({...base, key: 'Tab', shiftKey: true, activeElement: f.first}),
    {action: 'wrap', target: f.last},
  );
  assert.deepEqual(
    resolveDialogKeyDown({...base, key: 'Tab', shiftKey: true, activeElement: f.dialog}),
    {action: 'wrap', target: f.last},
  );
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'Tab', activeElement: f.dialog}), {action: 'wrap', target: f.first});
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'Tab', activeElement: f.opener}), {action: 'wrap', target: f.first});
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'Tab', activeElement: f.middle}), {action: 'none'});
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'Tab', shiftKey: true, activeElement: f.middle}), {action: 'none'});
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'Escape', activeElement: f.middle}), {action: 'close'});
  assert.deepEqual(resolveDialogKeyDown({...base, key: 'a', activeElement: f.middle}), {action: 'none'});
  assert.deepEqual(
    resolveDialogKeyDown({key: 'Tab', activeElement: f.dialog, dialogElement: f.dialog, focusables: []}),
    {action: 'wrap', target: f.dialog},
  );
});

test('createDialogFocusScope: nền inert, focus vào dialog, kéo focus thoát ra, cleanup khôi phục', () => {
  const f = makeModalFixture();
  f.topbar.setAttribute('aria-hidden', 'false'); // trạng thái cũ phải được khôi phục
  const scope = createDialogFocusScope({dialog: f.dialog, overlay: f.overlay, ownerDocument: f.doc});

  assert.equal(scope.opener, f.opener);
  assert.equal(f.doc.activeElement, f.first);
  for (const bg of [f.topbar, f.main]) {
    assert.equal(bg.inert, true);
    assert.equal(bg.getAttribute('inert'), '');
    assert.equal(bg.getAttribute('aria-hidden'), 'true');
  }
  assert.equal(f.overlay.inert, false);
  assert.equal(f.overlay.hasAttribute('aria-hidden'), false);

  // Nền không thể nhận focus khi đang mở.
  f.opener.focus();
  assert.equal(f.doc.activeElement, f.first);
  f.topbar.children[0].focus();
  assert.equal(f.doc.activeElement, f.first);

  // Focus thoát ra ngoài (nền không inert) bị kéo lại.
  const stray = f.doc.body.children[0].children[0];
  f.doc.activeElement = stray;
  f.doc.fire('focusin', {target: stray});
  assert.equal(f.doc.activeElement, f.first);

  scope.cleanup();
  assert.equal(f.topbar.inert, false);
  assert.equal(f.topbar.hasAttribute('inert'), false);
  assert.equal(f.topbar.getAttribute('aria-hidden'), 'false');
  assert.equal(f.main.inert, false);
  assert.equal(f.main.hasAttribute('aria-hidden'), false);
  assert.equal(f.doc.activeElement, f.opener);
  assert.equal(f.doc.listenerCount('focusin'), 0);
  scope.cleanup(); // idempotent
  assert.equal(f.doc.activeElement, f.opener);
});

test('createDialogFocusScope: nền đã inert do chủ sở hữu (React) không bị khôi phục lại khi cleanup', () => {
  const f = makeModalFixture();
  // React commit: nền được đánh inert/aria-hidden trước khi scope chạy.
  f.main.inert = true;
  f.main.setAttribute('inert', '');
  f.main.setAttribute('aria-hidden', 'true');
  const scope = createDialogFocusScope({dialog: f.dialog, overlay: f.overlay, ownerDocument: f.doc});
  assert.equal(f.topbar.inert, true); // nhánh khác vẫn do scope quản lý
  // React unmount: chủ sở hữu gỡ inert trước khi cleanup chạy.
  f.main.inert = false;
  f.main.removeAttribute('inert');
  f.main.removeAttribute('aria-hidden');
  scope.cleanup();
  assert.equal(f.main.inert, false);
  assert.equal(f.main.hasAttribute('inert'), false);
  assert.equal(f.main.hasAttribute('aria-hidden'), false);
  assert.equal(f.topbar.inert, false);
  assert.equal(f.topbar.hasAttribute('aria-hidden'), false);
});

test('createDialogFocusScope: backgroundElements tường minh và dialog không có control thì focus dialog', () => {
  const {doc, El, body} = makeDom();
  const bg = new El('main').append(new El('button'));
  const dialog = new El('div', {tabindex: '-1'});
  const overlay = new El('div').append(dialog);
  body.append(bg, overlay);
  bg.children[0].focus();
  const opener = doc.activeElement;
  const scope = createDialogFocusScope({dialog, overlay, ownerDocument: doc, backgroundElements: [bg]});
  assert.equal(bg.inert, true);
  assert.equal(doc.activeElement, dialog);
  scope.cleanup();
  assert.equal(bg.inert, false);
  assert.equal(doc.activeElement, opener);
});
