#!/usr/bin/env node
/**
 * Tạo (idempotent) hai tài khoản DEMO trên Supabase thật cho nút "Đăng nhập nhanh":
 *   buyer@demo.vn      người mua
 *   organizer@demo.vn  Ban tổ chức, được gán CHU_SO_HUU của mọi tổ chức hiện có để cấu hình các sự kiện mẫu
 * Mật khẩu lấy từ src/config/demoAccounts.ts (DEMO_PASSWORD). Chỉ chạy trên project demo/thử nghiệm, KHÔNG chạy
 * trên dữ liệu thật: mật khẩu nằm trong mã giao diện nên ai cũng biết.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-accounts.mjs
 */
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';

const {SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey} = process.env;
for (const [k, v] of Object.entries({SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey})) {
  if (!v) { console.error(`Missing environment variable: ${k}`); process.exit(2); }
}
const src = readFileSync(new URL('../src/config/demoAccounts.ts', import.meta.url), 'utf8');
const password = src.match(/DEMO_PASSWORD = '([^']+)'/)?.[1];
const emails = [...src.matchAll(/email: '([^']+)'/g)].map((m) => m[1]);
if (!password || emails.length !== 2) { console.error('Không đọc được src/config/demoAccounts.ts'); process.exit(2); }
const [buyerEmail, organizerEmail] = emails;

const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
const must = ({data, error}, what) => { if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`); return data; };

async function ensureUser(email) {
  const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (!error) return data.user.id;
  if (!/already|exists|registered/i.test(error.message)) throw new Error(`createUser(${email}): ${error.message}`);
  const list = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
  const u = list.data.users.find((x) => x.email === email);
  if (!u) throw new Error(`Không tìm thấy ${email}`);
  const {error: ue} = await admin.auth.admin.updateUserById(u.id, {password, email_confirm: true});
  if (ue) throw new Error(`updateUser(${email}): ${ue.message}`);
  return u.id;
}

const buyerId = await ensureUser(buyerEmail);
const organizerId = await ensureUser(organizerEmail);
must(await admin.rpc('gan_loai_tai_khoan', {p_email: organizerEmail, p_loai: 'ORGANIZER'}), 'gan_loai_tai_khoan');
const orgs = must(await admin.from('TO_CHUC').select('ToChucID'), 'TO_CHUC');
let moiGan = 0;
for (const {ToChucID} of orgs) {
  const {data: ex} = await admin.from('THANH_VIEN_TO_CHUC').select('ID').eq('ToChucID', ToChucID).eq('NguoiDungID', organizerId).maybeSingle();
  if (ex) continue;
  must(await admin.from('THANH_VIEN_TO_CHUC').insert({ToChucID, NguoiDungID: organizerId, VaiTro: 'CHU_SO_HUU'}), 'THANH_VIEN_TO_CHUC');
  moiGan += 1;
}
console.log(JSON.stringify({buyer: buyerEmail, buyerId, organizer: organizerEmail, organizerId, toChuc: orgs.length, moiGan}, null, 2));
