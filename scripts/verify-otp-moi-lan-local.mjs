#!/usr/bin/env node
/**
 * Kiểm chứng OTP THẬT (Supabase Auth cục bộ + Mailpit): mỗi lần thanh toán cần một OTP mới.
 * Hai giữ chỗ A, B của cùng người mua; thanh toán A bằng OTP thứ nhất; dùng lại OTP đó cho B bị từ chối (42501);
 * gửi và nhập OTP thứ hai (sau 60 giây) thì thanh toán B thành công. Mất khoảng 80 giây. Không in mã OTP/token.
 *
 * Điều kiện: `npm run db:start`, sự kiện 1 cục bộ bật OTP:
 *   docker exec supabase_db_EVENTTICKETING psql -U postgres -c 'UPDATE "CAU_HINH_SU_KIEN" SET "YeuCauXacMinhOTP"=TRUE WHERE "SuKienID"=1'
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... MAIL_URL=http://127.0.0.1:54324 node scripts/verify-otp-moi-lan-local.mjs
 * Chạy `npm run db:reset` sau khi xong (người dùng/giữ chỗ fixture).
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes, randomUUID} from 'node:crypto';

const {SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, MAIL_URL: mailRaw} = process.env;
for (const [k, v] of Object.entries({SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, MAIL_URL: mailRaw})) {
  if (!v) { console.error(`Thiếu biến môi trường: ${k}`); process.exit(2); }
}
const mailUrl = mailRaw.replace(/\/+$/, '');
const opts = {auth: {persistSession: false, autoRefreshToken: false}};
const admin = createClient(url, serviceKey, opts);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (x ? ' ' + x : '')); };

async function maOtpMoi(to, afterMs) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${mailUrl}/api/v1/messages`)).json();
    const msgs = (list.messages ?? []).filter((m) => (m.To ?? []).some((x) => x.Address === to) && new Date(m.Created).getTime() >= afterMs - 2000);
    msgs.sort((a, b) => new Date(b.Created) - new Date(a.Created));
    if (msgs[0]) {
      const full = await (await fetch(`${mailUrl}/api/v1/message/${msgs[0].ID}`)).json();
      return (`${full.Text ?? ''}\n${full.HTML ?? ''}`.match(/\b(\d{6})\b/) ?? [])[1] ?? null;
    }
    await sleep(500);
  }
  return null;
}

const runId = randomBytes(4).toString('hex');
const email = `otp-moi-${runId}@example.test`;
const password = randomBytes(18).toString('hex');
const created = await admin.auth.admin.createUser({email, password, email_confirm: true});
if (created.error) { console.error('Không tạo được người dùng:', created.error.message); process.exit(2); }
await admin.from('HO_SO_NGUOI_DUNG').upsert({NguoiDungID: created.data.user.id, HoTen: 'OTP moi lan', LoaiTaiKhoan: 'USER'});

const client = createClient(url, anonKey, opts);
const dn = await client.auth.signInWithPassword({email, password});
if (dn.error) { console.error('Đăng nhập lỗi:', dn.error.message); process.exit(2); }
const phien = randomUUID();
const giu = async (code) => (await client.rpc('tao_giu_cho_theo_suat', {p_suat_dien_id: 1, p_phien_id: phien, p_items: [{ticketCode: code, zoneCode: 'ZONE_CD_UP'}]}));
const holdA = await giu('CD-J-03');
const holdB = await giu('CD-J-04');
ok('tạo được hai giữ chỗ A, B', !!holdA.data?.holdId && !!holdB.data?.holdId, holdA.error?.message || holdB.error?.message || '');
const xacNhan = (c, h) => c.rpc('xac_nhan_thanh_toan', {p_giu_cho_id: h.data.holdId, p_phien_id: phien});

const truocOtp = await xacNhan(client, holdA);
ok('chưa có OTP: thanh toán A bị từ chối (42501)', truocOtp.error?.code === '42501', truocOtp.error?.code);

async function dangNhapBangOtp() {
  const bat = Date.now();
  const gui = await client.auth.signInWithOtp({email, options: {shouldCreateUser: false}});
  if (gui.error) throw new Error('Gửi OTP lỗi: ' + gui.error.message);
  const ma = await maOtpMoi(email, bat);
  if (!ma) throw new Error('Không đọc được OTP từ hộp thư');
  const xm = await client.auth.verifyOtp({email, token: ma, type: 'email'});
  if (xm.error) throw new Error('Xác minh OTP lỗi: ' + xm.error.message);
}

await dangNhapBangOtp();
const thanhToanA = await xacNhan(client, holdA);
ok('OTP thứ nhất: thanh toán A thành công', thanhToanA.data?.status === 'CONVERTED', thanhToanA.error?.message || '');
const dungLai = await xacNhan(client, holdB);
ok('dùng lại OTP thứ nhất cho B: bị từ chối (42501)', dungLai.error?.code === '42501', dungLai.error?.code || 'ĐÃ THANH TOÁN?!');

console.log('Chờ 65 giây (giới hạn gửi lại OTP của Auth)...');
await sleep(65000);
await dangNhapBangOtp();
const thanhToanB = await xacNhan(client, holdB);
ok('OTP thứ hai (mới): thanh toán B thành công', thanhToanB.data?.status === 'CONVERTED', thanhToanB.error?.message || '');

console.log(fail ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
process.exit(fail ? 1 : 0);
