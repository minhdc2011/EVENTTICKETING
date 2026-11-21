#!/usr/bin/env node
/**
 * Account ticket-limit concurrency check: ONE account, TWO real Auth sessions, two parallel
 * `tao_giu_cho_theo_suat` calls on DIFFERENT seats (3 + 3 > 4, each call valid on its own).
 * Expected: exactly one call succeeds, the other fails with 22023 / VUOT_GIOI_HAN_VE, and the
 * database holds at most 4 ACTIVE, unexpired tickets for that account and event.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/concurrency-limit.mjs
 *
 * STATUS: written, NOT executed. Run only against a local / staging Supabase, never production.
 *
 * Only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are read from the environment. The service role
 * prepares, observes and cleans fixtures only; both hold calls use the buyer's own user JWT.
 * All data is run-unique and removed in `finally` by the IDs recorded at creation time.
 * No pricing or immutable audit tables and no CAU_HINH_SU_KIEN rows are written (defaults: limit 4, OTP off).
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes, randomUUID} from 'node:crypto';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) {
    console.error(`Missing environment variable: ${name}`);
    process.exit(2);
  }
}

const runId = randomUUID().slice(0, 8); // run-unique suffix for slugs, emails and seat codes
const LIMIT = 4;
const authOptions = {persistSession: false, autoRefreshToken: false};
const admin = createClient(url, serviceKey, {auth: authOptions});

const created = {
  userIds: [],
  orgId: null,
  memberId: null,
  eventId: null,
  showId: null,
  zoneId: null,
  seatIds: [],
  holdIds: [],
  configCreated: false,
};

const must = ({data, error}, what) => {
  if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`.trim());
  return data;
};

async function createUser(label) {
  const password = randomBytes(24).toString('hex');
  const email = `cl-${runId}-${label}@example.test`;
  const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  created.userIds.push(data.user.id);
  return {id: data.user.id, email, password};
}

// A fresh client signs in (real Auth session); the returned client acts only with that user's JWT.
async function openSession(user, label) {
  const authClient = createClient(url, serviceKey, {auth: authOptions});
  const {data, error} = await authClient.auth.signInWithPassword({email: user.email, password: user.password});
  if (error || !data.session) throw new Error(`signIn(${label}): ${error?.message ?? 'no session'}`);
  const token = data.session.access_token;
  return createClient(url, serviceKey, {accessToken: async () => token, auth: authOptions});
}

const report = {
  runId,
  expected: {successes: 1, failures: 1, failureCode: '22023', failureMessage: 'VUOT_GIOI_HAN_VE', totalActiveMax: LIMIT},
  actual: null,
  calls: [],
  totalActive: null,
  pass: false,
  setupError: null,
  cleanup: {ok: false, leftovers: [], errors: []},
};

try {
  // --- Fixture (service_role) -------------------------------------------------------------
  const buyer = await createUser('buyer');
  const organizer = await createUser('org');
  must(await admin.rpc('gan_loai_tai_khoan', {p_email: organizer.email, p_loai: 'ORGANIZER'}), 'gan_loai_tai_khoan');

  const org = must(
    await admin.from('TO_CHUC').insert({TenToChuc: `CL ${runId}`, Slug: `cl-${runId}-org`}).select('ToChucID').single(),
    'insert TO_CHUC',
  );
  created.orgId = org.ToChucID;
  const member = must(
    await admin
      .from('THANH_VIEN_TO_CHUC')
      .insert({ToChucID: created.orgId, NguoiDungID: organizer.id, VaiTro: 'CHU_SO_HUU'})
      .select('ID')
      .single(),
    'insert THANH_VIEN_TO_CHUC',
  );
  created.memberId = member.ID;

  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  const HOUR = 3600_000;
  // Inserted as BAN_NHAP: a service_role UPDATE to CONG_KHAI would fail the publish trigger (42501).
  const event = must(
    await admin
      .from('SU_KIEN')
      .insert({
        TenSuKien: `CL ${runId}`,
        Slug: `cl-${runId}-event`,
        ToChucID: created.orgId,
        ThoiGianBatDau: iso(2 * HOUR),
        ThoiGianKetThuc: iso(4 * HOUR),
        ThoiGianMoBanVe: iso(-HOUR),
        ThoiGianDongBanVe: iso(HOUR),
        DiaDiem: 'Concurrency test',
        TenSanVanDong: 'Concurrency test',
        TrangThaiCongBo: 'BAN_NHAP',
      })
      .select('SuKienID')
      .single(),
    'insert SU_KIEN',
  );
  created.eventId = event.SuKienID;

  const show = must(
    await admin
      .from('SUAT_DIEN')
      .insert({
        SuKienID: created.eventId,
        Slug: `cl-${runId}-show`,
        TenSuatDien: `CL ${runId}`,
        ThoiGianBatDau: iso(2 * HOUR),
        ThoiGianKetThuc: iso(4 * HOUR),
        ThoiGianMoBanVe: iso(-HOUR),
        ThoiGianDongBanVe: iso(HOUR),
        TrangThai: 'BAN_NHAP',
      })
      .select('SuatDienID')
      .single(),
    'insert SUAT_DIEN',
  );
  created.showId = show.SuatDienID;

  const zoneCode = `CL${runId}`;
  const zone = must(
    await admin
      .from('KHU_VUC')
      .insert({
        SuKienID: created.eventId,
        SuatDienID: created.showId,
        MaKhuVuc: zoneCode,
        TenKhuVuc: `CL ${runId}`,
        LoaiKhuVuc: 'GHE_NGOI',
        GiaVeNiemYet: 0,
        MauSacHex: '#888888',
        TongSoGhe: 8,
      })
      .select('KhuVucID')
      .single(),
    'insert KHU_VUC',
  );
  created.zoneId = zone.KhuVucID;

  const seatCodes = Array.from({length: 8}, (_, i) => `CL${runId}-A-${String(i + 1).padStart(2, '0')}`);
  const seats = must(
    await admin
      .from('GHE')
      .insert(seatCodes.map((code, i) => ({
        KhuVucID: created.zoneId,
        SoHang: 'A',
        SoGhe: String(i + 1),
        MaGheDayDu: code,
        TrangThai: 'TRONG',
      })))
      .select('GheID'),
    'insert GHE',
  );
  created.seatIds.push(...seats.map((s) => s.GheID));

  // --- Publish through the organizer's real session (trigger requires editor rights) -------
  const orgClient = await openSession(organizer, 'organizer');
  must(await orgClient.rpc('cong_bo_su_kien', {p_su_kien_id: created.eventId}), 'cong_bo_su_kien');

  // --- Race: same account, two sessions, disjoint seats ------------------------------------
  const clientA = await openSession(buyer, 'buyer-A');
  const clientB = await openSession(buyer, 'buyer-B');
  const itemsFor = (codes) => codes.map((ticketCode) => ({ticketCode, zoneCode}));
  const requests = [
    {client: clientA, phienId: randomUUID(), items: itemsFor(seatCodes.slice(0, 3))},
    {client: clientB, phienId: randomUUID(), items: itemsFor(seatCodes.slice(3, 6))},
  ];

  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const pending = requests.map(async (r) => {
    await barrier;
    return r.client.rpc('tao_giu_cho_theo_suat', {
      p_suat_dien_id: created.showId,
      p_phien_id: r.phienId,
      p_items: r.items,
    });
  });
  release();
  const settled = await Promise.allSettled(pending);

  report.calls = settled.map((s, i) => {
    if (s.status === 'rejected') {
      return {call: i, ok: false, code: null, message: String(s.reason?.message ?? s.reason)};
    }
    const {data, error} = s.value;
    if (!error && data?.holdId) created.holdIds.push(data.holdId);
    return {call: i, ok: !error, code: error?.code ?? null, message: error?.message ?? null};
  });

  // --- Observe from the database ----------------------------------------------------------
  const rows = must(
    await admin
      .from('GIU_CHO')
      .select('GiuChoID, HetHanLuc, CHI_TIET_GIU_CHO(SoLuong)')
      .eq('NguoiDungID', buyer.id)
      .eq('SuKienID', created.eventId)
      .eq('TrangThai', 'ACTIVE')
      .gt('HetHanLuc', new Date().toISOString()),
    'select GIU_CHO',
  );
  for (const r of rows) if (!created.holdIds.includes(r.GiuChoID)) created.holdIds.push(r.GiuChoID);
  report.totalActive = rows.reduce(
    (sum, r) => sum + (r.CHI_TIET_GIU_CHO ?? []).reduce((s, d) => s + Number(d.SoLuong ?? 0), 0),
    0,
  );

  const winners = report.calls.filter((c) => c.ok);
  const losers = report.calls.filter((c) => !c.ok);
  const winnerCount = winners.length === 1 ? requests[winners[0].call].items.length : null;
  report.actual = {successes: winners.length, failures: losers.length, failureCodes: losers.map((l) => l.code)};
  report.pass =
    winners.length === 1 &&
    losers.length === 1 &&
    losers[0].code === '22023' &&
    String(losers[0].message ?? '').includes('VUOT_GIOI_HAN_VE') &&
    winnerCount !== null &&
    report.totalActive === winnerCount &&
    report.totalActive <= LIMIT;
} catch (err) {
  report.setupError = String(err?.message ?? err);
} finally {
  // --- Cleanup: relational order, by recorded IDs only; each step isolated -----------------
  const errors = report.cleanup.errors;
  const step = async (label, fn) => {
    try {
      const {error} = await fn();
      if (error) errors.push(`${label}: ${error.code ?? ''} ${error.message}`.trim());
    } catch (e) {
      errors.push(`${label}: ${e?.message ?? e}`);
    }
  };
  const c = created;

  if (c.eventId !== null) {
    await step('CHI_TIET_GIU_CHO', async () => {
      const {data, error} = await admin.from('GIU_CHO').select('GiuChoID').eq('SuKienID', c.eventId);
      if (error) return {error};
      const ids = [...new Set([...c.holdIds, ...(data ?? []).map((r) => r.GiuChoID)])];
      return ids.length ? admin.from('CHI_TIET_GIU_CHO').delete().in('GiuChoID', ids) : {error: null};
    });
    await step('GIU_CHO', () => admin.from('GIU_CHO').delete().eq('SuKienID', c.eventId));
  }
  if (c.zoneId !== null) await step('GHE', () => admin.from('GHE').delete().eq('KhuVucID', c.zoneId));
  if (c.zoneId !== null) await step('KHU_VUC', () => admin.from('KHU_VUC').delete().eq('KhuVucID', c.zoneId));
  if (c.showId !== null) await step('SUAT_DIEN', () => admin.from('SUAT_DIEN').delete().eq('SuatDienID', c.showId));
  if (c.configCreated && c.eventId !== null) {
    await step('CAU_HINH_SU_KIEN', () => admin.from('CAU_HINH_SU_KIEN').delete().eq('SuKienID', c.eventId));
  }
  if (c.eventId !== null) await step('SU_KIEN', () => admin.from('SU_KIEN').delete().eq('SuKienID', c.eventId));
  if (c.memberId !== null) await step('THANH_VIEN_TO_CHUC', () => admin.from('THANH_VIEN_TO_CHUC').delete().eq('ID', c.memberId));
  if (c.orgId !== null) await step('TO_CHUC', () => admin.from('TO_CHUC').delete().eq('ToChucID', c.orgId));
  for (const id of c.userIds) {
    await step(`auth user ${id}`, async () => {
      const {error} = await admin.auth.admin.deleteUser(id);
      return {error};
    });
  }

  // Leftover check by the same recorded IDs.
  const leftovers = report.cleanup.leftovers;
  const exists = async (label, query) => {
    try {
      const {data, error} = await query;
      if (error) errors.push(`verify ${label}: ${error.code ?? ''} ${error.message}`.trim());
      else if (data && data.length) leftovers.push(`${label}(${data.length})`);
    } catch (e) {
      errors.push(`verify ${label}: ${e?.message ?? e}`);
    }
  };
  if (c.eventId !== null) {
    await exists('GIU_CHO', admin.from('GIU_CHO').select('GiuChoID').eq('SuKienID', c.eventId));
    await exists('SU_KIEN', admin.from('SU_KIEN').select('SuKienID').eq('SuKienID', c.eventId));
  }
  if (c.holdIds.length) {
    await exists('CHI_TIET_GIU_CHO', admin.from('CHI_TIET_GIU_CHO').select('GiuChoID').in('GiuChoID', c.holdIds));
  }
  if (c.zoneId !== null) {
    await exists('CHI_TIET_GIU_CHO', admin.from('CHI_TIET_GIU_CHO').select('ID').eq('KhuVucID', c.zoneId));
    await exists('GHE', admin.from('GHE').select('GheID').eq('KhuVucID', c.zoneId));
    await exists('KHU_VUC', admin.from('KHU_VUC').select('KhuVucID').eq('KhuVucID', c.zoneId));
  }
  if (c.showId !== null) await exists('SUAT_DIEN', admin.from('SUAT_DIEN').select('SuatDienID').eq('SuatDienID', c.showId));
  if (c.memberId !== null) await exists('THANH_VIEN_TO_CHUC', admin.from('THANH_VIEN_TO_CHUC').select('ID').eq('ID', c.memberId));
  if (c.orgId !== null) await exists('TO_CHUC', admin.from('TO_CHUC').select('ToChucID').eq('ToChucID', c.orgId));
  if (c.userIds.length) {
    await exists('HO_SO_NGUOI_DUNG', admin.from('HO_SO_NGUOI_DUNG').select('NguoiDungID').in('NguoiDungID', c.userIds));
    for (const id of c.userIds) {
      try {
        const {data, error} = await admin.auth.admin.getUserById(id);
        if (data?.user) leftovers.push(`auth.users(${id})`);
        else if (error && error.status !== 404 && !/not found/i.test(error.message ?? '')) {
          errors.push(`verify auth user ${id}: ${error.message}`);
        }
      } catch (e) {
        errors.push(`verify auth user: ${e?.message ?? e}`);
      }
    }
  }
  report.cleanup.ok = errors.length === 0 && leftovers.length === 0;

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass && report.cleanup.ok ? 0 : 1;
}
