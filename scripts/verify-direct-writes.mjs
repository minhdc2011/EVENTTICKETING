#!/usr/bin/env node
/**
 * Kiểm tra ghi trực tiếp qua REST (PostgREST) của từng vai trò vào các bảng Sprint 2 và bảng giá/ghế.
 * Mục đích: bằng chứng cho AC-T4-03.4, AC-T4-05.1 (không có đường ghi vòng qua RPC) và AC-T2-02.6.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-direct-writes.mjs
 *
 * Chỉ chạy trên Supabase cục bộ hoặc môi trường dùng một lần. Fixture tạo bằng service_role, mọi ghi thử
 * dùng khóa anon + JWT của từng vai trò. Dữ liệu được xóa theo ID đã tạo, NHƯNG khi chủ sở hữu ghi CAU_HINH_SU_KIEN
 * trực tiếp thì trigger ghi audit và chặn service_role xóa dòng đó, nên tổ chức/sự kiện fixture sẽ còn lại và được
 * báo ở cleanupErrors. Chạy `npm run db:reset` sau đó. Phân loại: GIU_CHO bị trigger chặn trước RLS với anon/buyer
 * (23514) vẫn tính là KHÔNG ghi được; kiểm tra cột rỗng ở kết quả để chắc không có ALLOWED. In JSON ra stdout, mã thoát 0
 * kể cả khi phát hiện đường ghi mở (đó là phát hiện, không phải lỗi script); 2 nếu thiếu biến môi trường.
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';

const {SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey} = process.env;
for (const [k, v] of Object.entries({SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey})) {
  if (!v) { console.error(`Missing environment variable: ${k}`); process.exit(2); }
}
const opts = {auth: {persistSession: false, autoRefreshToken: false}};
const admin = createClient(url, serviceKey, opts);
const runId = randomBytes(4).toString('hex');
const must = ({data, error}, what) => { if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`); return data; };
const created = {users: [], org: null, members: [], event: null, show: null, zone: null, rule: null};
const results = [];

async function user(label, loai) {
  const password = randomBytes(18).toString('hex');
  const email = `dw-${runId}-${label}@example.test`;
  const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  created.users.push(data.user.id);
  if (loai) must(await admin.rpc('gan_loai_tai_khoan', {p_email: email, p_loai: loai}), 'gan_loai_tai_khoan');
  return {id: data.user.id, email, password};
}
async function clientFor(u) {
  if (!u) return createClient(url, anonKey, opts);
  const c = createClient(url, anonKey, opts);
  const {data, error} = await c.auth.signInWithPassword({email: u.email, password: u.password});
  if (error) throw new Error(`signIn: ${error.message}`);
  const token = data.session.access_token;
  return createClient(url, anonKey, {...opts, accessToken: async () => token});
}

/** Chạy một thao tác ghi; ALLOWED nếu có dòng bị ảnh hưởng hoặc chèn thành công, BLOCKED kèm mã lỗi nếu bị chặn. */
async function attempt(role, target, op, run) {
  let outcome; let detail = '';
  try {
    const {data, error, status} = await run();
    if (error && ['PGRST204', '23502', '22P02', '42703', '23514'].includes(String(error.code))) { outcome = 'PAYLOAD_LOI'; detail = `${error.code} ${error.message}`.slice(0, 120); }
    else if (error) { outcome = 'BLOCKED'; detail = `${error.code ?? status} ${error.message}`.slice(0, 120); }
    else if (Array.isArray(data) && data.length === 0) { outcome = 'BLOCKED'; detail = `0 dòng bị ảnh hưởng (RLS lọc), HTTP ${status}`; }
    else { outcome = 'ALLOWED'; detail = `HTTP ${status}`; }
  } catch (e) { outcome = 'ERROR'; detail = String(e.message).slice(0, 120); }
  results.push({role, target, op, outcome, detail});
}

async function main() {
  const owner = await user('owner', 'ORGANIZER');
  const editor = await user('editor', 'ORGANIZER');
  const buyer = await user('buyer', null);
  const org = must(await admin.from('TO_CHUC').insert({TenToChuc: `DW ${runId}`, Slug: `dw-${runId}`}).select('ToChucID').single(), 'TO_CHUC');
  created.org = org.ToChucID;
  for (const [u, role] of [[owner, 'CHU_SO_HUU'], [editor, 'BIEN_TAP']]) {
    const m = must(await admin.from('THANH_VIEN_TO_CHUC').insert({ToChucID: created.org, NguoiDungID: u.id, VaiTro: role}).select('ID').single(), 'THANH_VIEN');
    created.members.push(m.ID);
  }
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const H = 3600_000;
  created.event = must(await admin.from('SU_KIEN').insert({
    TenSuKien: `DW ${runId}`, Slug: `dw-${runId}-e`, ToChucID: created.org, ThoiGianBatDau: iso(2 * H), ThoiGianKetThuc: iso(4 * H),
    ThoiGianMoBanVe: iso(-H), ThoiGianDongBanVe: iso(H), DiaDiem: 'dw', TenSanVanDong: 'dw', TrangThaiCongBo: 'BAN_NHAP',
  }).select('SuKienID').single(), 'SU_KIEN').SuKienID;
  created.show = must(await admin.from('SUAT_DIEN').insert({
    SuKienID: created.event, Slug: `dw-${runId}-s`, TenSuatDien: `DW ${runId}`, ThoiGianBatDau: iso(2 * H), ThoiGianKetThuc: iso(4 * H),
    ThoiGianMoBanVe: iso(-H), ThoiGianDongBanVe: iso(H), TrangThai: 'BAN_NHAP',
  }).select('SuatDienID').single(), 'SUAT_DIEN').SuatDienID;
  created.zone = must(await admin.from('KHU_VUC').insert({
    SuKienID: created.event, SuatDienID: created.show, MaKhuVuc: `DW${runId}`, TenKhuVuc: `DW ${runId}`, LoaiKhuVuc: 'GHE_NGOI',
    GiaVeNiemYet: 500000, MauSacHex: '#888888', TongSoGhe: 4,
  }).select('KhuVucID').single(), 'KHU_VUC').KhuVucID;
  created.rule = must(await admin.from('QUY_TAC_GIA').insert({KhuVucID: created.zone, GiaGoc: 500000, GiaSan: 300000, GiaTran: 800000}).select('QuyTacGiaID').single(), 'QUY_TAC_GIA').QuyTacGiaID;

  const roles = [['anon', null], ['buyer(authenticated, không thuộc tổ chức)', buyer], ['editor BIEN_TAP', editor], ['owner CHU_SO_HUU', owner]];
  const zoneId = created.zone; const eventId = created.event;
  for (const [name, u] of roles) {
    const c = await clientFor(u);
    await attempt(name, 'QUY_TAC_GIA', 'INSERT', () => c.from('QUY_TAC_GIA').insert({KhuVucID: zoneId, GiaGoc: 1, GiaSan: 1, GiaTran: 1}).select());
    await attempt(name, 'QUY_TAC_GIA', 'UPDATE', () => c.from('QUY_TAC_GIA').update({GiaTran: 999999}).eq('QuyTacGiaID', created.rule).select());
    await attempt(name, 'DE_XUAT_GIA', 'INSERT', () => c.from('DE_XUAT_GIA').insert({QuyTacGiaID: created.rule, KhuVucID: zoneId, TyLeLapDay: 0.5, TocDoBanThucTe: 1, TocDoBanKyVong: 1, SoGioConLai: 10, GiaHienTai: 500000, GiaTinhToanTho: 600000, GiaDeXuat: 600000, TrangThaiDuyet: 'PENDING'}).select());
    await attempt(name, 'NHAT_KY_GIA', 'INSERT', () => c.from('NHAT_KY_GIA').insert({KhuVucID: zoneId, LoaiBienDong: 'DUYET_DE_XUAT_AI', GiaCu: 500000, GiaMoi: 600000, TyLeThayDoiPhanTram: 20, LyDoThayDoi: 'dw'}).select());
    await attempt(name, 'NHAT_KY_CAU_HINH_MUA_VE', 'INSERT', () => c.from('NHAT_KY_CAU_HINH_MUA_VE').insert({SuKienID: eventId, NguoiThucHienID: '00000000-0000-4000-8000-000000000001', VaiTroToChuc: 'CHU_SO_HUU', SoVeToiDaCu: 4, SoVeToiDaMoi: 20, YeuCauOtpCu: false, YeuCauOtpMoi: true}).select());
    await attempt(name, 'CAU_HINH_SU_KIEN', 'INSERT (giới hạn 20, bật OTP)', () => c.from('CAU_HINH_SU_KIEN').insert({SuKienID: eventId, SoVeToiDaMoiDon: 20, YeuCauXacMinhOTP: true}).select());
    await attempt(name, 'CAU_HINH_SU_KIEN', 'UPDATE (giới hạn 20)', () => c.from('CAU_HINH_SU_KIEN').update({SoVeToiDaMoiDon: 20}).eq('SuKienID', eventId).select());
    await attempt(name, 'GIU_CHO', 'INSERT', () => c.from('GIU_CHO').insert({SuKienID: eventId, SuatDienID: created.show, PhienNguoiDung: '00000000-0000-4000-8000-000000000001'}).select());
    await attempt(name, 'GHE', 'INSERT', () => c.from('GHE').insert({KhuVucID: zoneId, SoHang: 'A', SoGhe: 1, MaGheDayDu: `DW-${runId}-X`}).select());
    await attempt(name, 'KHU_VUC.GiaVeNiemYet', 'UPDATE trực tiếp (500000 → 123000)', () => c.from('KHU_VUC').update({GiaVeNiemYet: 123000}).eq('KhuVucID', zoneId).select());
    // Hoàn lại để lần thử sau của vai trò khác bắt đầu từ cùng điểm.
    await admin.from('KHU_VUC').update({GiaVeNiemYet: 500000}).eq('KhuVucID', zoneId);
    await admin.from('CAU_HINH_SU_KIEN').delete().eq('SuKienID', eventId);
  }
}

const cleanupErrors = [];
async function cleanup() {
  const del = async (tbl, col, val) => { if (val == null) return; const {error} = await admin.from(tbl).delete().eq(col, val); if (error) cleanupErrors.push(`${tbl}: ${error.code} ${error.message}`); };
  await del('DE_XUAT_GIA', 'KhuVucID', created.zone);
  await del('QUY_TAC_GIA', 'KhuVucID', created.zone);
  await del('GHE', 'KhuVucID', created.zone);
  await del('KHU_VUC', 'KhuVucID', created.zone);
  await del('CAU_HINH_SU_KIEN', 'SuKienID', created.event);
  await del('SUAT_DIEN', 'SuatDienID', created.show);
  await del('SU_KIEN', 'SuKienID', created.event);
  for (const id of created.members) await del('THANH_VIEN_TO_CHUC', 'ID', id);
  await del('TO_CHUC', 'ToChucID', created.org);
  for (const id of created.users) { const {error} = await admin.auth.admin.deleteUser(id); if (error) cleanupErrors.push(`auth ${id}: ${error.message}`); }
}

let fatal = null;
try { await main(); } catch (e) { fatal = String(e.message ?? e); }
await cleanup();
console.log(JSON.stringify({runId, fatal, results, cleanupErrors}, null, 2));
process.exitCode = fatal ? 1 : 0;
