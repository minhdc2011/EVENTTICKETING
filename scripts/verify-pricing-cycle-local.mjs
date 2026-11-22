#!/usr/bin/env node
/**
 * Chạy chu kỳ định giá tự động THẬT (scripts/run-pricing-cycle.mjs --nhanh) trên CSDL Supabase cục bộ với dữ liệu bán ghế
 * thật, rồi đối chiếu từng đề xuất được lưu với kết quả của engine (src/domain/pricingEngine.js) tính lại từ chính các dòng
 * lay_so_lieu_dinh_gia mà chu kỳ đọc. Phục vụ AC-T4-02.1/.2/.3 ở tầng tích hợp CSDL → engine → RPC → PriceGuard.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-pricing-cycle-local.mjs
 *
 * Giới hạn trung thực: đối chiếu này kiểm đường ống (đọc đúng số liệu, lưu đúng giá, đúng loại cảnh báo), KHÔNG thay cho 4 ví dụ
 * chuẩn trong tests/pricing-engine.test.mjs (đã kiểm giá trị tính tay). Chu kỳ ghi đề xuất và dòng NHAT_KY_GIA bất biến nên chỉ
 * chạy trên DB cục bộ rồi `npm run db:reset`.
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {computePriceProposal} from '../src/domain/pricingEngine.js';
import {dauVaoEngine} from './run-pricing-cycle.mjs';

const exec = promisify(execFile);
const {SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey} = process.env;
for (const [k, v] of Object.entries({SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey})) {
  if (!v) { console.error(`Missing environment variable: ${k}`); process.exit(2); }
}
const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
const runId = randomBytes(4).toString('hex');
const must = ({data, error}, what) => { if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`); return data; };
const H = 3600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

async function main() {
  const password = randomBytes(18).toString('hex');
  const email = `pc-${runId}-owner@example.test`;
  const {data: u, error: ue} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (ue) throw new Error(`createUser: ${ue.message}`);
  must(await admin.rpc('gan_loai_tai_khoan', {p_email: email, p_loai: 'ORGANIZER'}), 'gan_loai_tai_khoan');
  const orgId = must(await admin.from('TO_CHUC').insert({TenToChuc: `PC ${runId}`, Slug: `pc-${runId}`}).select('ToChucID').single(), 'TO_CHUC').ToChucID;
  must(await admin.from('THANH_VIEN_TO_CHUC').insert({ToChucID: orgId, NguoiDungID: u.user.id, VaiTro: 'CHU_SO_HUU'}), 'THANH_VIEN');
  const ownerAuth = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data: sess, error: se} = await createClient(url, process.env.SUPABASE_ANON_KEY ?? serviceKey, {auth: {persistSession: false}}).auth.signInWithPassword({email, password});
  if (se) throw new Error(`signIn: ${se.message}`);
  const token = sess.session.access_token;
  const owner = createClient(url, process.env.SUPABASE_ANON_KEY ?? serviceKey, {auth: {persistSession: false}, accessToken: async () => token});
  void ownerAuth;

  const eventId = must(await admin.from('SU_KIEN').insert({
    TenSuKien: `PC ${runId}`, Slug: `pc-${runId}-e`, ToChucID: orgId, ThoiGianBatDau: iso(4 * 24 * H), ThoiGianKetThuc: iso(4 * 24 * H + 3 * H),
    ThoiGianMoBanVe: iso(-2 * 24 * H), ThoiGianDongBanVe: iso(3 * 24 * H), DiaDiem: 'pc', TenSanVanDong: 'pc', TrangThaiCongBo: 'BAN_NHAP',
  }).select('SuKienID').single(), 'SU_KIEN').SuKienID;
  const showId = must(await admin.from('SUAT_DIEN').insert({
    SuKienID: eventId, Slug: `pc-${runId}-s`, TenSuatDien: `PC ${runId}`, ThoiGianBatDau: iso(4 * 24 * H), ThoiGianKetThuc: iso(4 * 24 * H + 3 * H),
    ThoiGianMoBanVe: iso(-2 * 24 * H), ThoiGianDongBanVe: iso(3 * 24 * H), TrangThai: 'DANG_MO_BAN',
  }).select('SuatDienID').single(), 'SUAT_DIEN').SuatDienID;

  // Ba khu, mỗi khu 20 ghế, tỷ lệ bán khác nhau: gần đầy, rất vắng, vừa phải.
  const plan = [{ten: 'GAN_DAY', ban: 18}, {ten: 'VANG', ban: 1}, {ten: 'VUA', ban: 10}];
  const zones = [];
  for (const p of plan) {
    const zoneId = must(await admin.from('KHU_VUC').insert({
      SuKienID: eventId, SuatDienID: showId, MaKhuVuc: `${p.ten}${runId.slice(0, 3)}`, TenKhuVuc: p.ten, LoaiKhuVuc: 'GHE_NGOI',
      GiaVeNiemYet: 500000, MauSacHex: '#888888', TongSoGhe: 20,
    }).select('KhuVucID').single(), 'KHU_VUC').KhuVucID;
    must(await admin.from('QUY_TAC_GIA').insert({KhuVucID: zoneId, GiaGoc: 500000, GiaSan: 300000, GiaTran: 800000}).select('QuyTacGiaID').single(), 'QUY_TAC_GIA');
    const seats = Array.from({length: 20}, (_, i) => ({KhuVucID: zoneId, SoHang: 'A', SoGhe: String(i + 1).padStart(2, '0'), MaGheDayDu: `${p.ten}${runId.slice(0, 3)}-A-${String(i + 1).padStart(2, '0')}`, TrangThai: 'TRONG'}));
    must(await admin.from('GHE').insert(seats).select('GheID'), 'GHE');
    // Đánh dấu đã bán bằng UPDATE để trigger ghi NgayCapNhatTrangThai (nguồn tốc độ bán).
    const sold = seats.slice(0, p.ban).map((s) => s.MaGheDayDu);
    if (sold.length) must(await admin.from('GHE').update({TrangThai: 'DA_BAN'}).eq('KhuVucID', zoneId).in('MaGheDayDu', sold).select('GheID'), 'bán ghế');
    zones.push({zoneId, ten: p.ten, ban: p.ban});
  }
  must(await owner.from('SU_KIEN').update({TrangThaiCongBo: 'CONG_KHAI'}).eq('SuKienID', eventId).select(), 'công bố');

  // Đọc số liệu như chu kỳ sẽ đọc, TRƯỚC khi chạy (chu kỳ không đổi số liệu bán).
  const rows = must(await admin.rpc('lay_so_lieu_dinh_gia', {p_su_kien_id: eventId}), 'lay_so_lieu_dinh_gia');
  const truoc = new Map(rows.map((r) => [r.khu_vuc_id, r]));

  const {stdout, stderr} = await exec(process.execPath, ['scripts/run-pricing-cycle.mjs', '--su-kien', String(eventId), '--nhanh'], {env: {...process.env}, maxBuffer: 4_000_000}).catch((e) => ({stdout: e.stdout ?? '', stderr: `${e.stderr ?? ''} (mã thoát ${e.code})`}));
  const proposals = must(await admin.from('DE_XUAT_GIA').select('KhuVucID, GiaHienTai, GiaTinhToanTho, GiaDeXuat, LoaiCanhBao, CoCanhBaoVuotKhung, TrangThaiDuyet, TyLeLapDay').in('KhuVucID', zones.map((z) => z.zoneId)), 'DE_XUAT_GIA');
  const byZone = new Map(proposals.map((p) => [p.KhuVucID, p]));

  const doiChieu = zones.map((z) => {
    const row = truoc.get(z.zoneId);
    const eng = computePriceProposal(dauVaoEngine(row));
    const saved = byZone.get(z.zoneId) ?? null;
    return {
      khu: z.ten, daBan: z.ban, tyLeLapDay: row ? Number((row.n_sold + row.n_hold) / row.n_total) : null,
      engine: {shouldPropose: eng.shouldPropose, proposedPrice: eng.proposedPrice, alertType: eng.alertType, skipReasons: eng.skipReasons ?? []},
      daLuu: saved ? {giaDeXuat: Number(saved.GiaDeXuat), loaiCanhBao: saved.LoaiCanhBao, trangThai: saved.TrangThaiDuyet} : null,
      khop: eng.shouldPropose ? !!saved && Number(saved.GiaDeXuat) === eng.proposedPrice : !saved,
    };
  });
  return {eventId, baoCaoChuKy: stdout.split('\n').slice(-25), stderr: stderr.slice(0, 400), doiChieu};
}

let fatal = null; let out = {};
try { out = await main(); } catch (e) { fatal = String(e.message ?? e); }
console.log(JSON.stringify({runId, fatal, ...out}, null, 2));
process.exitCode = fatal ? 1 : 0;
