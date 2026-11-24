#!/usr/bin/env node
/**
 * Kiểm chứng OTP THẬT qua Supabase Auth (GoTrue) cục bộ: email OTP gửi thật tới hộp thư Inbucket/Mailpit của
 * Supabase CLI, người mua nhập mã đọc từ email, rồi gọi da_xac_minh_otp(), tao_giu_cho_theo_suat và xac_nhan_thanh_toan (luồng 24/11/2026: giữ chỗ trước, OTP xác nhận thanh toán sau).
 * Phục vụ AC-T2-01.1, .2, .3 (phần Auth có khóa hay không), .4, .5 (60 giây, mã mới vô hiệu mã cũ), .7.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... [MAIL_URL=http://127.0.0.1:54324 (bắt buộc khi chạy cục bộ; bỏ trống ở hosted)] \
 *     node scripts/verify-otp-local.mjs
 *
 * Mất khoảng 8 phút vì phải chờ cửa sổ 60 giây và hiệu lực 300 giây thật. KHÔNG bao giờ in mã OTP hay token:
 * mã chỉ nằm trong bộ nhớ. Chỉ chạy trên Supabase cục bộ (cần hộp thư đọc được qua HTTP). Fixture dùng email
 * @example.test; sự kiện/tổ chức fixture không xóa được vì cấu hình mua vé có audit bất biến → chạy `npm run db:reset` sau.
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';

const {SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey} = process.env;
// Có MAIL_URL (Mailpit/Inbucket cục bộ): gửi OTP thật qua Auth và đọc email. Không có: lấy mã bằng Admin API generateLink
// (không gửi email), dùng cho Supabase hosted nơi email mặc định chỉ gửi tới thành viên nhóm. Khi đó các kiểm tra phụ thuộc
// việc gửi email thật (mẫu thư, giới hạn 60 giây giữa hai lần gửi) được đánh dấu CHUA_CHAY.
const mailUrl = process.env.MAIL_URL ? process.env.MAIL_URL.replace(/\/+$/, '') : null;
const modeMail = mailUrl !== null;
for (const [k, v] of Object.entries({SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey})) {
  if (!v) { console.error(`Missing environment variable: ${k}`); process.exit(2); }
}
const opts = {auth: {persistSession: false, autoRefreshToken: false}};
const admin = createClient(url, serviceKey, opts);
const runId = randomBytes(4).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({data, error}, what) => { if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`); return data; };
const log = []; // {id, ac, mo_ta, ket_qua, chi_tiet}
const note = (id, ac, moTa, ketQua, chiTiet = '') => { log.push({id, ac, moTa, ketQua, chiTiet: String(chiTiet).slice(0, 200)}); console.error(`[${ketQua}] ${id} ${moTa} ${chiTiet}`); };
const errText = (e) => `${e?.status ?? ''} ${e?.code ?? e?.name ?? ''} ${e?.message ?? ''}`.trim();
const decodeJwt = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));

async function latestMail(to, afterMs) {
  if (!modeMail) {
    const {data, error} = await admin.auth.admin.generateLink({type: 'magiclink', email: to});
    if (error) return null;
    return {id: 'generateLink', subject: '(generateLink, không gửi email)', text: String(data?.properties?.email_otp ?? '')};
  }
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${mailUrl}/api/v1/messages`)).json();
    const msgs = (list.messages ?? []).filter((m) => (m.To ?? []).some((x) => x.Address === to) && new Date(m.Created).getTime() >= afterMs - 2000);
    msgs.sort((a, b) => new Date(b.Created) - new Date(a.Created));
    if (msgs[0]) {
      const full = await (await fetch(`${mailUrl}/api/v1/message/${msgs[0].ID}`)).json();
      return {id: msgs[0].ID, subject: full.Subject ?? '', text: `${full.Text ?? ''}\n${full.HTML ?? ''}`};
    }
    await sleep(500);
  }
  return null;
}
const codeOf = (mail) => (mail?.text.match(/\b(\d{6})\b/) ?? [])[1] ?? null;

const created = {users: [], org: null, members: [], events: [], shows: [], zones: []};
async function createUser(label, loai) {
  const password = randomBytes(18).toString('hex');
  const email = `otp-${runId}-${label}@example.test`;
  const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (error) throw new Error(`createUser: ${error.message}`);
  created.users.push(data.user.id);
  if (loai) must(await admin.rpc('gan_loai_tai_khoan', {p_email: email, p_loai: loai}), 'gan_loai_tai_khoan');
  return {id: data.user.id, email, password};
}
async function signedIn(u) {
  const c = createClient(url, anonKey, opts);
  const {data, error} = await c.auth.signInWithPassword({email: u.email, password: u.password});
  if (error) throw new Error(`signIn: ${error.message}`);
  return {c, session: data.session};
}

async function main() {
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const H = 3600_000;
  const owner = await createUser('owner', 'ORGANIZER');
  const buyer = await createUser('buyer', null);
  created.org = must(await admin.from('TO_CHUC').insert({TenToChuc: `OTP ${runId}`, Slug: `otp-${runId}`}).select('ToChucID').single(), 'TO_CHUC').ToChucID;
  created.members.push(must(await admin.from('THANH_VIEN_TO_CHUC').insert({ToChucID: created.org, NguoiDungID: owner.id, VaiTro: 'CHU_SO_HUU'}).select('ID').single(), 'THANH_VIEN').ID);
  const {c: ownerClient} = await signedIn(owner);

  async function makeEvent(tag, otp) {
    const ev = must(await admin.from('SU_KIEN').insert({
      TenSuKien: `OTP ${tag} ${runId}`, Slug: `otp-${runId}-${tag}`, ToChucID: created.org, ThoiGianBatDau: iso(10 * 24 * H), ThoiGianKetThuc: iso(10 * 24 * H + 3 * H),
      ThoiGianMoBanVe: iso(-H), ThoiGianDongBanVe: iso(5 * 24 * H), DiaDiem: 'otp', TenSanVanDong: 'otp', TrangThaiCongBo: 'BAN_NHAP',
    }).select('SuKienID').single(), 'SU_KIEN').SuKienID;
    created.events.push(ev);
    const show = must(await admin.from('SUAT_DIEN').insert({
      SuKienID: ev, Slug: `otp-${runId}-${tag}-s`, TenSuatDien: `OTP ${tag}`, ThoiGianBatDau: iso(10 * 24 * H), ThoiGianKetThuc: iso(10 * 24 * H + 3 * H),
      ThoiGianMoBanVe: iso(-H), ThoiGianDongBanVe: iso(5 * 24 * H), TrangThai: 'DANG_MO_BAN',
    }).select('SuatDienID').single(), 'SUAT_DIEN').SuatDienID;
    created.shows.push(show);
    const zoneCode = `Z${tag}${runId.slice(0, 4)}`; // ngắn: vé đứng tự sinh mã `MaKhuVuc-<uuid 36>` vào cột 50 ký tự
    must(await admin.from('KHU_VUC').insert({SuKienID: ev, SuatDienID: show, MaKhuVuc: zoneCode, TenKhuVuc: zoneCode, LoaiKhuVuc: 'DUNG_STAND', GiaVeNiemYet: 200000, MauSacHex: '#112233', TongSoGhe: 50}).select('KhuVucID').single(), 'KHU_VUC');
    must(await ownerClient.from('SU_KIEN').update({TrangThaiCongBo: 'CONG_KHAI'}).eq('SuKienID', ev).select(), 'công bố sự kiện');
    must(await ownerClient.rpc('luu_cau_hinh_mua_ve', {p_su_kien_id: ev, p_so_ve_toi_da: 4, p_yeu_cau_otp: otp}), 'luu_cau_hinh_mua_ve');
    return {ev, show, zoneCode};
  }
  const on = await makeEvent('on', true);
  const off = await makeEvent('off', false);
  const hold = async (c, e) => {
    const phien = crypto.randomUUID();
    const r = await c.rpc('tao_giu_cho_theo_suat', {p_suat_dien_id: e.show, p_phien_id: phien, p_items: [{zoneCode: e.zoneCode, quantity: 1}]});
    return {...r, phien};
  };
  // Luồng mới (24/11/2026): giữ chỗ chỉ cần đăng nhập; OTP được kiểm ở bước xác nhận thanh toán.
  const confirmPay = async (c, h) => c.rpc('xac_nhan_thanh_toan', {p_giu_cho_id: h.data?.holdId, p_phien_id: h.phien});

  // S1 — đăng nhập mật khẩu, chưa OTP
  const {c: pw, session: pwSession} = await signedIn(buyer);
  const amrPw = (decodeJwt(pwSession.access_token).amr ?? []).map((a) => a.method).join(',');
  const dx0 = await pw.rpc('da_xac_minh_otp');
  note('S1a', 'AC-T2-01.7', `phiên mật khẩu: amr=[${amrPw}], da_xac_minh_otp()`, dx0.data === false ? 'DAT' : 'KHONG_DAT', `data=${dx0.data} ${dx0.error ? errText(dx0.error) : ''}`);
  const h1 = await hold(pw, on);
  note('S1b', 'AC-T2-01.7', 'giữ chỗ sự kiện BẬT OTP chỉ cần đăng nhập (chưa cần OTP)', !h1.error ? 'DAT' : 'KHONG_DAT', h1.error ? `${h1.error.code} ${h1.error.message}` : 'thành công');
  const c1 = h1.error ? {error: {code: 'KHONG_CO_GIU_CHO', message: ''}} : await confirmPay(pw, h1);
  note('S1b2', 'AC-T2-01.7', 'xác nhận thanh toán sự kiện BẬT OTP khi chưa OTP phải bị từ chối 42501', c1.error?.code === '42501' ? 'DAT' : 'KHONG_DAT', c1.error ? `${c1.error.code} ${c1.error.message}` : 'thành công ngoài mong đợi');
  const h1off = await hold(pw, off);
  note('S1c', 'AC-T2-01.8', 'giữ chỗ sự kiện TẮT OTP không cần OTP', !h1off.error ? 'DAT' : 'KHONG_DAT', h1off.error ? `${h1off.error.code} ${h1off.error.message}` : 'thành công');
  const anon = createClient(url, anonKey, opts);
  const h1anon = await hold(anon, off);
  note('S1d', 'AC-T2-01.7', 'giữ chỗ không đăng nhập bị từ chối (28000, hoặc 42501 vì anon không có EXECUTE)', ['28000', '42501'].includes(h1anon.error?.code) ? 'DAT' : 'KHONG_DAT', h1anon.error ? `${h1anon.error.code} ${h1anon.error.message}` : 'thành công ngoài mong đợi');

  // S2 — gửi OTP lần 1, email thật
  const auth = createClient(url, anonKey, opts).auth;
  const t0 = Date.now();
  const s1 = modeMail ? await auth.signInWithOtp({email: buyer.email, options: {shouldCreateUser: false}}) : {error: null};
  note('S2a', 'AC-T2-01.1', modeMail ? 'gửi OTP (signInWithOtp)' : 'tạo mã OTP bằng Admin API (KHÔNG gửi email)', s1.error ? 'KHONG_DAT' : 'DAT', s1.error ? errText(s1.error) : 'đã gửi');
  const mailA = await latestMail(buyer.email, t0);
  const codeA = codeOf(mailA);
  note('S2b', 'AC-T2-01.1', modeMail ? 'email có mã 6 số hiển thị cho người dùng (mẫu magic_link có {{ .Token }})' : 'Auth tạo mã 6 số (generateLink); mẫu thư KHÔNG kiểm được', !codeA ? 'KHONG_DAT' : (modeMail ? 'DAT' : 'CHUA_CHAY'), `tiêu đề="${mailA?.subject ?? ''}"; độ dài mã=${codeA?.length ?? 0} (mã không ghi)`);
  const tSend = Date.now() - t0;

  // S3 — gửi lại ngay (dưới 60 giây)
  if (modeMail) {
    const s2 = await auth.signInWithOtp({email: buyer.email, options: {shouldCreateUser: false}});
    note('S3', 'AC-T2-01.5', 'gửi lại ngay (< 60 giây) phải bị từ chối', s2.error ? 'DAT' : 'KHONG_DAT', s2.error ? errText(s2.error) : 'được gửi ngoài mong đợi');
  } else {
    note('S3', 'AC-T2-01.5', 'gửi lại ngay (< 60 giây) phải bị từ chối', 'CHUA_CHAY', 'hosted: email mặc định chỉ gửi tới địa chỉ thuộc nhóm; cần một hộp thư thật');
  }

  // S4 — sai mã nhiều lần, rồi xem mã đúng còn dùng được không (Auth có khóa không)
  const wrong = [];
  for (let i = 0; i < 6; i++) { const r = await createClient(url, anonKey, opts).auth.verifyOtp({email: buyer.email, token: '000000', type: 'email'}); wrong.push(r.error ? errText(r.error) : 'OK?!'); }
  note('S4a', 'AC-T2-01.2', 'sai mã: Auth trả lỗi gì (không có "số lần còn lại")', wrong.every((w) => w !== 'OK?!') ? 'DAT' : 'KHONG_DAT', wrong[0]);

  // S5 — sau ≥ 62 giây gửi mã B; mã A phải bị vô hiệu
  const wait1 = modeMail ? Math.max(0, 62_000 - (Date.now() - t0)) : 0;
  console.error(`chờ ${Math.round(wait1 / 1000)}s để qua cửa sổ 60 giây`); await sleep(wait1);
  const tB = Date.now();
  const sB = modeMail ? await auth.signInWithOtp({email: buyer.email, options: {shouldCreateUser: false}}) : {error: null};
  note('S5a', 'AC-T2-01.5', modeMail ? 'gửi lại sau 62 giây thành công' : 'tạo mã mới bằng Admin API (KHÔNG gửi email; không kiểm khoảng chờ 60 giây)', sB.error ? 'KHONG_DAT' : 'DAT', sB.error ? errText(sB.error) : 'đã gửi');
  const mailB = await latestMail(buyer.email, tB);
  const codeB = codeOf(mailB);
  const oldTry = await createClient(url, anonKey, opts).auth.verifyOtp({email: buyer.email, token: codeA ?? '000000', type: 'email'});
  note('S5b', 'AC-T2-01.5', 'mã cũ (A) bị vô hiệu sau khi có mã mới (B)', oldTry.error ? 'DAT' : 'KHONG_DAT', oldTry.error ? errText(oldTry.error) : 'mã cũ vẫn dùng được!');
  note('S4b', 'AC-T2-01.3', 'sau 6 lần sai, mã đúng mới vẫn dùng được (Auth KHÔNG khóa 15 phút)', 'GHI_NHAN', 'kết quả ở S6a');

  // S6 — mã đúng B
  const authB = createClient(url, anonKey, opts);
  const vB = await authB.auth.verifyOtp({email: buyer.email, token: codeB ?? '000000', type: 'email'});
  note('S6a', 'AC-T2-01.1', 'nhập đúng mã B còn hạn', vB.error ? 'KHONG_DAT' : 'DAT', vB.error ? errText(vB.error) : 'xác minh thành công sau 6 lần sai trước đó');
  if (!vB.error) {
    const amr = (decodeJwt(vB.data.session.access_token).amr ?? []).map((a) => a.method);
    const dx = await authB.rpc('da_xac_minh_otp');
    note('S6b', 'AC-T2-01.1', `JWT sau OTP có amr=[${amr}] và da_xac_minh_otp() = true`, amr.includes('otp') && dx.data === true ? 'DAT' : 'KHONG_DAT', `da_xac_minh_otp=${dx.data}`);
    const h2 = await hold(authB, on);
    note('S6c', 'AC-T2-01.1/.7', 'giữ chỗ sự kiện BẬT OTP sau khi xác minh thành công', !h2.error ? 'DAT' : 'KHONG_DAT', h2.error ? `${h2.error.code} ${h2.error.message}` : 'thành công');
    const c2 = h2.error ? {error: {code: 'KHONG_CO_GIU_CHO', message: ''}} : await confirmPay(authB, h2);
    note('S6d', 'AC-T2-01.1/.7', 'xác nhận thanh toán sự kiện BẬT OTP sau khi xác minh OTP thật thành công', !c2.error && c2.data?.status === 'CONVERTED' ? 'DAT' : 'KHONG_DAT', c2.error ? `${c2.error.code} ${c2.error.message}` : `status=${c2.data?.status}`);
  }

  // S7 — hết hạn 300 giây
  const wait2 = modeMail ? Math.max(0, 62_000 - (Date.now() - tB)) : 0;
  await sleep(wait2);
  const tC = Date.now();
  const sC = modeMail ? await auth.signInWithOtp({email: buyer.email, options: {shouldCreateUser: false}}) : {error: null};
  const mailC = await latestMail(buyer.email, tC);
  const codeC = codeOf(mailC);
  note('S7a', 'AC-T2-01.4', modeMail ? 'gửi mã C để thử hết hạn' : 'tạo mã C bằng Admin API để thử hết hạn', sC.error || !codeC ? 'KHONG_DAT' : 'DAT', sC.error ? errText(sC.error) : 'đã gửi');
  const early = Math.max(0, 295_000 - (Date.now() - tC));
  console.error(`chờ ${Math.round(early / 1000)}s trước mốc 300s`); await sleep(early);
  // thử ở 295s (còn hạn) KHÔNG dùng mã vì dùng sẽ tiêu thụ; chỉ thử sau 301s.
  const late = Math.max(0, 301_000 - (Date.now() - tC));
  await sleep(late);
  const elapsed = Math.round((Date.now() - tC) / 1000);
  const vC = await createClient(url, anonKey, opts).auth.verifyOtp({email: buyer.email, token: codeC ?? '000000', type: 'email'});
  note('S7b', 'AC-T2-01.4', `nhập đúng mã C sau ${elapsed}s (> 300s) phải bị từ chối`, vC.error ? 'DAT' : 'KHONG_DAT', vC.error ? errText(vC.error) : 'mã hết hạn vẫn dùng được!');
  return {tSendMs: tSend};
}

async function cleanup() {
  const errors = [];
  const del = async (t, col, val) => { if (val == null) return; const {error} = await admin.from(t).delete().eq(col, val); if (error) errors.push(`${t}: ${error.code} ${error.message}`); };
  for (const id of created.events) { await del('GIU_CHO', 'SuKienID', id); await del('KHU_VUC', 'SuKienID', id); await del('CAU_HINH_SU_KIEN', 'SuKienID', id); }
  for (const id of created.shows) await del('SUAT_DIEN', 'SuatDienID', id);
  for (const id of created.events) await del('SU_KIEN', 'SuKienID', id);
  for (const id of created.members) await del('THANH_VIEN_TO_CHUC', 'ID', id);
  await del('TO_CHUC', 'ToChucID', created.org);
  for (const id of created.users) { const {error} = await admin.auth.admin.deleteUser(id); if (error) errors.push(`auth ${id}: ${error.message}`); }
  return errors;
}

let fatal = null; let extra = {};
try { extra = await main(); } catch (e) { fatal = String(e.message ?? e); }
const cleanupErrors = await cleanup();
console.log(JSON.stringify({runId, fatal, ...extra, log, cleanupErrors}, null, 2));
process.exitCode = fatal || log.some((l) => l.ketQua === 'KHONG_DAT') ? 1 : 0;
