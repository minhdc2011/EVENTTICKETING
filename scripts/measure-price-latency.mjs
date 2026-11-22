#!/usr/bin/env node
/**
 * Đo độ trễ từ lúc BTC gọi duyet_de_xuat_gia đến lúc một client khán giả (khóa anon, đăng ký bằng ĐÚNG hàm
 * subscribeToPriceUpdatesWithClient của giao diện) nhận sự kiện giá mới qua Realtime. Phục vụ AC-T4-03.1 (≤ 5 giây).
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... [RUNS=12] node scripts/measure-price-latency.mjs
 *
 * Mỗi lần đo dùng một khu riêng với một đề xuất PENDING mới (fixture tạo bằng service_role). Đồng hồ: performance.now()
 * của cùng một tiến trình (không lệch đồng hồ). Độ trễ = (nhận sự kiện) - (ngay trước lời gọi RPC), nên đã gồm thời gian
 * RPC chạy. Đây là đo ở tầng dịch vụ Realtime, KHÔNG phải thời gian vẽ lại DOM trên trình duyệt.
 * Mỗi lần duyệt ghi một dòng NHAT_KY_GIA bất biến: chỉ chạy trên Supabase cục bộ hoặc môi trường dùng một lần, rồi `db:reset`.
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {subscribeToPriceUpdatesWithClient} from '../src/domain/priceRealtime.js';

const {SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey} = process.env;
for (const [k, v] of Object.entries({SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey})) {
  if (!v) { console.error(`Missing environment variable: ${k}`); process.exit(2); }
}
const RUNS = Number(process.env.RUNS ?? 12);
const opts = {auth: {persistSession: false, autoRefreshToken: false}};
const admin = createClient(url, serviceKey, opts);
const runId = randomBytes(4).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({data, error}, what) => { if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`); return data; };
const H = 3600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

async function main() {
  const password = randomBytes(18).toString('hex');
  const email = `lat-${runId}-owner@example.test`;
  const {data: u, error: ue} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (ue) throw new Error(`createUser: ${ue.message}`);
  const ownerId = u.user.id;
  must(await admin.rpc('gan_loai_tai_khoan', {p_email: email, p_loai: 'ORGANIZER'}), 'gan_loai_tai_khoan');
  const orgId = must(await admin.from('TO_CHUC').insert({TenToChuc: `LAT ${runId}`, Slug: `lat-${runId}`}).select('ToChucID').single(), 'TO_CHUC').ToChucID;
  must(await admin.from('THANH_VIEN_TO_CHUC').insert({ToChucID: orgId, NguoiDungID: ownerId, VaiTro: 'CHU_SO_HUU'}), 'THANH_VIEN');
  const ownerAuth = createClient(url, anonKey, opts);
  const {data: sess, error: se} = await ownerAuth.auth.signInWithPassword({email, password});
  if (se) throw new Error(`signIn: ${se.message}`);
  const token = sess.session.access_token;
  const owner = createClient(url, anonKey, {...opts, accessToken: async () => token});

  const eventId = must(await admin.from('SU_KIEN').insert({
    TenSuKien: `LAT ${runId}`, Slug: `lat-${runId}-e`, ToChucID: orgId, ThoiGianBatDau: iso(10 * 24 * H), ThoiGianKetThuc: iso(10 * 24 * H + 3 * H),
    ThoiGianMoBanVe: iso(-H), ThoiGianDongBanVe: iso(5 * 24 * H), DiaDiem: 'lat', TenSanVanDong: 'lat', TrangThaiCongBo: 'BAN_NHAP',
  }).select('SuKienID').single(), 'SU_KIEN').SuKienID;
  const showId = must(await admin.from('SUAT_DIEN').insert({
    SuKienID: eventId, Slug: `lat-${runId}-s`, TenSuatDien: `LAT ${runId}`, ThoiGianBatDau: iso(10 * 24 * H), ThoiGianKetThuc: iso(10 * 24 * H + 3 * H),
    ThoiGianMoBanVe: iso(-H), ThoiGianDongBanVe: iso(5 * 24 * H), TrangThai: 'DANG_MO_BAN',
  }).select('SuatDienID').single(), 'SUAT_DIEN').SuatDienID;

  const zones = [];
  for (let i = 0; i < RUNS; i++) {
    const zoneId = must(await admin.from('KHU_VUC').insert({
      SuKienID: eventId, SuatDienID: showId, MaKhuVuc: `LAT${runId}${i}`, TenKhuVuc: `LAT ${i}`, LoaiKhuVuc: 'GHE_NGOI',
      GiaVeNiemYet: 500000, MauSacHex: '#888888', TongSoGhe: 8,
    }).select('KhuVucID').single(), 'KHU_VUC').KhuVucID;
    const ruleId = must(await admin.from('QUY_TAC_GIA').insert({KhuVucID: zoneId, GiaGoc: 500000, GiaSan: 300000, GiaTran: 800000}).select('QuyTacGiaID').single(), 'QUY_TAC_GIA').QuyTacGiaID;
    const deXuatId = must(await admin.from('DE_XUAT_GIA').insert({
      QuyTacGiaID: ruleId, KhuVucID: zoneId, TyLeLapDay: 0.5, TocDoBanThucTe: 10, TocDoBanKyVong: 8, SoGioConLai: 48,
      GiaHienTai: 500000, GiaTinhToanTho: 600000, GiaDeXuat: 600000, TrangThaiDuyet: 'PENDING',
    }).select('DeXuatID').single(), 'DE_XUAT_GIA').DeXuatID;
    zones.push({zoneId, deXuatId});
  }
  // Công bố sau khi có suất và khu hợp lệ (trigger kiểm tra); Realtime chỉ gửi cho anon khi RLS cho đọc (sự kiện công khai).
  must(await owner.from('SU_KIEN').update({TrangThaiCongBo: 'CONG_KHAI'}).eq('SuKienID', eventId).select(), 'công bố');

  // Hai khán giả anon, dùng đúng hàm đăng ký của giao diện.
  const waiters = new Map(); // key `${zoneId}` -> [resolve, resolve]
  const status = [];
  const audiences = [0, 1].map((n) => {
    const client = createClient(url, anonKey, opts);
    const stop = subscribeToPriceUpdatesWithClient({
      supabase: client,
      scope: {suKienId: eventId, suatDienId: showId},
      listener: (ev) => { const w = waiters.get(`${ev.khuVucId}:${n}`); if (w) { w(performance.now(), ev.gia); waiters.delete(`${ev.khuVucId}:${n}`); } },
      onConnectionStatus: (s) => status.push(`a${n}:${s}`),
    });
    return {client, stop};
  });
  // Chờ SUBSCRIBED cho cả hai.
  for (let i = 0; i < 60 && !(status.filter((s) => /CONNECTED|SUBSCRIBED/i.test(s)).length >= 2); i++) await sleep(250);
  await sleep(1500);

  const runs = [];
  for (let i = 0; i < zones.length; i++) {
    const {zoneId, deXuatId} = zones[i];
    const p = [0, 1].map((n) => new Promise((resolve) => { waiters.set(`${zoneId}:${n}`, (t, gia) => resolve({t, gia}));
      setTimeout(() => { if (waiters.delete(`${zoneId}:${n}`)) resolve(null); }, 15000); }));
    const t0 = performance.now();
    const rpc = await owner.rpc('duyet_de_xuat_gia', {p_de_xuat_id: deXuatId, p_ghi_chu: 'latency', p_gia_dieu_chinh: null});
    const tRpc = performance.now();
    const got = await Promise.all(p);
    runs.push({
      lan: i + 1, rpcOk: !rpc.error, rpcLoi: rpc.error ? `${rpc.error.code} ${rpc.error.message}` : null, rpcMs: Math.round(tRpc - t0),
      khanGia: got.map((g) => (g ? {msTuLucGoiRpc: Math.round(g.t - t0), gia: g.gia} : null)),
    });
    await sleep(1000);
  }
  audiences.forEach((a) => a.stop());
  await sleep(500);
  return {orgId, eventId, status: status.slice(0, 6), runs, ownerId, zones: zones.map((z) => z.zoneId), showId};
}

let fatal = null; let out = {};
try { out = await main(); } catch (e) { fatal = String(e.message ?? e); }
const all = (out.runs ?? []).flatMap((r) => r.khanGia).filter(Boolean).map((g) => g.msTuLucGoiRpc).sort((a, b) => a - b);
const pct = (q) => (all.length ? all[Math.min(all.length - 1, Math.ceil(q * all.length) - 1)] : null);
const thieu = (out.runs ?? []).reduce((n, r) => n + r.khanGia.filter((g) => !g).length, 0);
console.log(JSON.stringify({runId, fatal, soLanDuyet: out.runs?.length ?? 0, soLuotNhan: all.length, soLuotKhongNhanTrong15s: thieu,
  msTrungVi: pct(0.5), msP95: pct(0.95), msLonNhat: all.at(-1) ?? null, msNhoNhat: all[0] ?? null, trangThaiKetNoi: out.status, chiTiet: out.runs}, null, 2));
process.exit(0);
