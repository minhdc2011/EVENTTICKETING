#!/usr/bin/env node
/**
 * Two-organizer approval race: TWO organizer accounts (CHU_SO_HUU + QUAN_TRI of the same
 * organization), TWO real Auth sessions, two parallel `duyet_de_xuat_gia` calls on the SAME
 * PENDING price proposal, released by a barrier.
 * Expected: exactly one call succeeds; the other fails with SQLSTATE 40001 (the loser sees a
 * non-PENDING proposal, normally DE_XUAT_DA_XU_LY; GIA_DA_THAY_DOI / DE_XUAT_XUNG_DOT are also
 * 40001 and accepted by code, but the message is recorded in the report). The database must show
 * the proposal APPROVED by the winner, the zone price equal to the proposed price and exactly
 * one NHAT_KY_GIA row for the proposal written by the winner.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/concurrency-approve.mjs
 *
 * STATUS: run once against a local Supabase (22/11/2026): one approval won, the other got 40001
 * DE_XUAT_DA_XU_LY. Run only against a local Supabase that can be reset (`npm run db:reset`), never production.
 *
 * Only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are read from the environment. The service role
 * prepares, observes and cleans fixtures only; the approvals use each organizer's own user JWT
 * (the RPC rejects service_role with 42501). Fixture rows are inserted directly (no config or
 * proposal-creating RPC) so no extra audit rows are written.
 *
 * CLEANUP IS HONEST, NOT FORCED: NHAT_KY_GIA is an immutable audit table (a trigger blocks
 * DELETE) with ON DELETE RESTRICT foreign keys to KHU_VUC, DE_XUAT_GIA and the acting profile.
 * After a successful approval those rows (and what they reference) cannot be removed, so
 * `cleanup.ok` will be false and `leftovers` / `errors` say exactly what remains. This script
 * never disables triggers, never bulk-deletes and only deletes by IDs recorded at creation time.
 * Exit code: 0 if the race verdict passes (leftover fixtures are expected and only reported: run
 * `npm run db:reset` afterwards); 1 if the verdict fails; 2 for missing environment.
 */
import {createClient as realCreateClient} from '@supabase/supabase-js';
import {randomBytes, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

export const SKIPPED = [
  'Không xóa NHAT_KY_GIA bất biến và các dòng FK RESTRICT liên quan (quyết định: giữ nguyên dấu vết audit; chạy trên DB cục bộ rồi npm run db:reset)',
];

const PRICE_LISTED = 500000;
const PRICE_PROPOSED = 600000;
const authOptions = {persistSession: false, autoRefreshToken: false};

/** Names of required variables that are unset or empty. */
export function missingEnv(env) {
  return REQUIRED_ENV.filter((name) => !env?.[name]);
}

const errText = (error) => `${error?.code ?? ''} ${error?.message ?? error ?? ''}`.trim();

/**
 * Fire the approval RPC from every client at once. All calls wait on one shared barrier that is
 * released only after every call has been scheduled; results are collected with allSettled.
 * clients: [{userId, client}], args: {deXuatId}
 */
export async function raceApprovals(clients, args) {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const pending = clients.map(async ({client}) => {
    await barrier;
    return client.rpc('duyet_de_xuat_gia', {
      p_de_xuat_id: args.deXuatId,
      p_ghi_chu: 'concurrency-approve',
      p_gia_dieu_chinh: null,
    });
  });
  release();
  const settled = await Promise.allSettled(pending);
  return settled.map((s, i) => {
    const userId = clients[i].userId;
    if (s.status === 'rejected') {
      return {call: i, userId, ok: false, code: null, message: `rejected: ${String(s.reason?.message ?? s.reason)}`, result: null, rejected: true};
    }
    const {data, error} = s.value ?? {};
    return {call: i, userId, ok: !error, code: error?.code ?? null, message: error?.message ?? null, result: error ? null : data ?? null, rejected: false};
  });
}

/**
 * Pure verdict. calls: raceApprovals output; observed: {trangThai, nguoiDuyetId, gia, giaCu?, nhatKy[]};
 * expected: {giaCu, giaDeXuat}. Returns {pass, winnerId, failures[]}.
 */
export function evaluate({calls, observed, expected}) {
  const failures = [];
  const list = Array.isArray(calls) ? calls : [];
  const winners = list.filter((c) => c.ok);
  const losers = list.filter((c) => !c.ok);
  const winnerId = winners.length === 1 ? winners[0].userId ?? null : null;

  if (list.length !== 2) failures.push(`expected 2 calls, got ${list.length}`);
  if (list.some((c) => c.rejected)) failures.push('a call was rejected (transport/exception), not a database result');
  if (winners.length !== 1) failures.push(`expected exactly 1 success, got ${winners.length}`);
  if (losers.length !== 1) failures.push(`expected exactly 1 failure, got ${losers.length}`);
  for (const l of losers) {
    if (l.code !== '40001') failures.push(`loser code ${l.code ?? 'null'} is not 40001`);
  }
  if (!observed) {
    failures.push('no database observation');
  } else {
    if (observed.trangThai !== 'APPROVED') failures.push(`proposal status ${observed.trangThai} is not APPROVED`);
    if (winnerId === null || observed.nguoiDuyetId !== winnerId) failures.push('NguoiDuyetID is not the winner');
    if (Number(observed.gia) !== Number(expected?.giaDeXuat)) failures.push(`zone price ${observed.gia} is not ${expected?.giaDeXuat}`);
    const log = Array.isArray(observed.nhatKy) ? observed.nhatKy : [];
    if (log.length !== 1) {
      failures.push(`expected exactly 1 NHAT_KY_GIA row, got ${log.length}`);
    } else {
      const row = log[0];
      if (winnerId === null || row.NguoiThucHienID !== winnerId) failures.push('NHAT_KY_GIA actor is not the winner');
      if (Number(row.GiaCu) !== Number(expected?.giaCu)) failures.push(`NHAT_KY_GIA GiaCu ${row.GiaCu} is wrong`);
      if (Number(row.GiaMoi) !== Number(expected?.giaDeXuat)) failures.push(`NHAT_KY_GIA GiaMoi ${row.GiaMoi} is wrong`);
      if (row.LoaiBienDong !== 'DUYET_DE_XUAT_AI') failures.push(`NHAT_KY_GIA LoaiBienDong ${row.LoaiBienDong} is wrong`);
    }
  }
  return {pass: failures.length === 0, winnerId, failures};
}

/**
 * Run the whole check. `createClient` is injected (supabase-js signature) so tests can pass a fake.
 * Throws BEFORE creating any client when a required variable is missing.
 */
export async function runConcurrencyApprove({env, createClient, log = () => {}}) {
  const missing = missingEnv(env);
  if (missing.length) throw new Error(`Missing environment variable: ${missing[0]}`);

  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const runId = randomUUID().slice(0, 8);
  const admin = createClient(url, serviceKey, {auth: authOptions});

  const created = {
    userIds: [],
    orgId: null,
    memberIds: [],
    eventId: null,
    showId: null,
    zoneId: null,
    ruleId: null,
    proposalId: null,
  };
  const expected = {successes: 1, failures: 1, failureCode: '40001', giaCu: PRICE_LISTED, giaDeXuat: PRICE_PROPOSED};
  const report = {
    runId,
    expected,
    calls: [],
    winnerId: null,
    observed: null,
    pass: false,
    failures: [],
    setupError: null,
    cleanup: {ok: false, leftovers: [], errors: []},
    skipped: SKIPPED,
    verified: 'RESULT_OF_THIS_RUN_ONLY',
  };

  const must = ({data, error}, what) => {
    if (error) throw new Error(`${what}: ${errText(error)}`);
    return data;
  };

  async function createUser(label) {
    const password = randomBytes(24).toString('hex');
    const email = `ca-${runId}-${label}@example.test`;
    const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
    if (error) throw new Error(`createUser(${label}): ${error.message}`);
    created.userIds.push(data.user.id);
    return {id: data.user.id, email, password};
  }

  async function openSession(user, label) {
    const authClient = createClient(url, serviceKey, {auth: authOptions});
    const {data, error} = await authClient.auth.signInWithPassword({email: user.email, password: user.password});
    if (error || !data?.session) throw new Error(`signIn(${label}): ${error?.message ?? 'no session'}`);
    const token = data.session.access_token;
    return createClient(url, serviceKey, {accessToken: async () => token, auth: authOptions});
  }

  try {
    // --- Fixture (service_role) -----------------------------------------------------------
    const owner = await createUser('owner');
    const manager = await createUser('manager');
    for (const u of [owner, manager]) {
      must(await admin.rpc('gan_loai_tai_khoan', {p_email: u.email, p_loai: 'ORGANIZER'}), 'gan_loai_tai_khoan');
    }

    const org = must(
      await admin.from('TO_CHUC').insert({TenToChuc: `CA ${runId}`, Slug: `ca-${runId}-org`}).select('ToChucID').single(),
      'insert TO_CHUC',
    );
    created.orgId = org.ToChucID;
    for (const [u, role] of [[owner, 'CHU_SO_HUU'], [manager, 'QUAN_TRI']]) {
      const member = must(
        await admin
          .from('THANH_VIEN_TO_CHUC')
          .insert({ToChucID: created.orgId, NguoiDungID: u.id, VaiTro: role})
          .select('ID')
          .single(),
        `insert THANH_VIEN_TO_CHUC(${role})`,
      );
      created.memberIds.push(member.ID);
    }

    const now = Date.now();
    const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
    const HOUR = 3600_000;
    // BAN_NHAP on purpose: the RPC does not need a published event.
    const event = must(
      await admin
        .from('SU_KIEN')
        .insert({
          TenSuKien: `CA ${runId}`,
          Slug: `ca-${runId}-event`,
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
          Slug: `ca-${runId}-show`,
          TenSuatDien: `CA ${runId}`,
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

    const zone = must(
      await admin
        .from('KHU_VUC')
        .insert({
          SuKienID: created.eventId,
          SuatDienID: created.showId,
          MaKhuVuc: `CA${runId}`,
          TenKhuVuc: `CA ${runId}`,
          LoaiKhuVuc: 'GHE_NGOI',
          GiaVeNiemYet: PRICE_LISTED,
          MauSacHex: '#888888',
          TongSoGhe: 8,
        })
        .select('KhuVucID')
        .single(),
      'insert KHU_VUC',
    );
    created.zoneId = zone.KhuVucID;

    const rule = must(
      await admin
        .from('QUY_TAC_GIA')
        .insert({KhuVucID: created.zoneId, GiaGoc: PRICE_LISTED, GiaSan: 300000, GiaTran: 800000})
        .select('QuyTacGiaID')
        .single(),
      'insert QUY_TAC_GIA',
    );
    created.ruleId = rule.QuyTacGiaID;

    // ThoiGianDeXuat keeps its default now(): the proposal TTL is 120 minutes.
    const proposal = must(
      await admin
        .from('DE_XUAT_GIA')
        .insert({
          QuyTacGiaID: created.ruleId,
          KhuVucID: created.zoneId,
          TyLeLapDay: 0.5,
          TocDoBanThucTe: 10,
          TocDoBanKyVong: 8,
          SoGioConLai: 48,
          GiaHienTai: PRICE_LISTED,
          GiaTinhToanTho: PRICE_PROPOSED,
          GiaDeXuat: PRICE_PROPOSED,
          TrangThaiDuyet: 'PENDING',
        })
        .select('DeXuatID')
        .single(),
      'insert DE_XUAT_GIA',
    );
    created.proposalId = proposal.DeXuatID;

    // --- Two real sessions, then the race -----------------------------------------------
    const clientOwner = await openSession(owner, 'owner');
    const clientManager = await openSession(manager, 'manager');
    log('race: releasing barrier');
    const calls = await raceApprovals(
      [{userId: owner.id, client: clientOwner}, {userId: manager.id, client: clientManager}],
      {deXuatId: created.proposalId},
    );
    report.calls = calls.map(({call, userId, ok, code, message}) => ({call, userId, ok, code, message}));

    // --- Observe from the database (service_role, read only) ------------------------------
    const proposalRows = must(
      await admin.from('DE_XUAT_GIA').select('DeXuatID, TrangThaiDuyet, NguoiDuyetID, GiaDeXuat').eq('DeXuatID', created.proposalId),
      'select DE_XUAT_GIA',
    );
    const zoneRows = must(
      await admin.from('KHU_VUC').select('KhuVucID, GiaVeNiemYet').eq('KhuVucID', created.zoneId),
      'select KHU_VUC',
    );
    const logRows = must(
      await admin
        .from('NHAT_KY_GIA')
        .select('NhatKyGiaID, DeXuatID, LoaiBienDong, GiaCu, GiaMoi, NguoiThucHienID')
        .eq('DeXuatID', created.proposalId),
      'select NHAT_KY_GIA',
    );
    report.observed = {
      trangThai: proposalRows?.[0]?.TrangThaiDuyet ?? null,
      nguoiDuyetId: proposalRows?.[0]?.NguoiDuyetID ?? null,
      gia: zoneRows?.[0]?.GiaVeNiemYet ?? null,
      nhatKy: logRows ?? [],
    };

    const verdict = evaluate({calls, observed: report.observed, expected});
    report.winnerId = verdict.winnerId;
    report.failures = verdict.failures;
    report.pass = verdict.pass;
  } catch (err) {
    report.setupError = String(err?.message ?? err);
  } finally {
    // --- Cleanup: by recorded IDs only; every step isolated ------------------------------
    const errors = report.cleanup.errors;
    const leftovers = report.cleanup.leftovers;
    const c = created;
    const step = async (label, fn) => {
      try {
        const {error} = await fn();
        if (error) errors.push(`${label}: ${errText(error)}`);
      } catch (e) {
        errors.push(`${label}: ${e?.message ?? e}`);
      }
    };
    const exists = async (label, query) => {
      try {
        const {data, error} = await query;
        if (error) errors.push(`verify ${label}: ${errText(error)}`);
        else if (data && data.length) leftovers.push(`${label}(${data.length})`);
      } catch (e) {
        errors.push(`verify ${label}: ${e?.message ?? e}`);
      }
    };

    if (c.proposalId !== null) await step('DE_XUAT_GIA', () => admin.from('DE_XUAT_GIA').delete().eq('DeXuatID', c.proposalId));
    if (c.ruleId !== null) await step('QUY_TAC_GIA', () => admin.from('QUY_TAC_GIA').delete().eq('QuyTacGiaID', c.ruleId));
    if (c.zoneId !== null) await step('KHU_VUC', () => admin.from('KHU_VUC').delete().eq('KhuVucID', c.zoneId));
    if (c.showId !== null) await step('SUAT_DIEN', () => admin.from('SUAT_DIEN').delete().eq('SuatDienID', c.showId));
    if (c.eventId !== null) await step('SU_KIEN', () => admin.from('SU_KIEN').delete().eq('SuKienID', c.eventId));
    if (c.memberIds.length) await step('THANH_VIEN_TO_CHUC', () => admin.from('THANH_VIEN_TO_CHUC').delete().in('ID', c.memberIds));
    if (c.orgId !== null) await step('TO_CHUC', () => admin.from('TO_CHUC').delete().eq('ToChucID', c.orgId));
    for (const id of c.userIds) {
      await step(`auth user ${id}`, async () => {
        const {error} = await admin.auth.admin.deleteUser(id);
        return {error};
      });
    }

    // Leftover check by the same recorded IDs (only those exist; never a null ID).
    if (c.proposalId !== null) {
      await exists('NHAT_KY_GIA', admin.from('NHAT_KY_GIA').select('NhatKyGiaID').eq('DeXuatID', c.proposalId));
      await exists('DE_XUAT_GIA', admin.from('DE_XUAT_GIA').select('DeXuatID').eq('DeXuatID', c.proposalId));
    }
    if (c.ruleId !== null) await exists('QUY_TAC_GIA', admin.from('QUY_TAC_GIA').select('QuyTacGiaID').eq('QuyTacGiaID', c.ruleId));
    if (c.zoneId !== null) await exists('KHU_VUC', admin.from('KHU_VUC').select('KhuVucID').eq('KhuVucID', c.zoneId));
    if (c.showId !== null) await exists('SUAT_DIEN', admin.from('SUAT_DIEN').select('SuatDienID').eq('SuatDienID', c.showId));
    if (c.eventId !== null) await exists('SU_KIEN', admin.from('SU_KIEN').select('SuKienID').eq('SuKienID', c.eventId));
    if (c.memberIds.length) await exists('THANH_VIEN_TO_CHUC', admin.from('THANH_VIEN_TO_CHUC').select('ID').in('ID', c.memberIds));
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
          errors.push(`verify auth user ${id}: ${e?.message ?? e}`);
        }
      }
    }
    report.cleanup.ok = errors.length === 0 && leftovers.length === 0;
  }
  return report;
}

async function main() {
  const missing = missingEnv({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (missing.length) {
    console.error(`Missing environment variable: ${missing[0]}`);
    process.exit(2);
  }
  const report = await runConcurrencyApprove({
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    createClient: realCreateClient,
    log: (m) => console.error(m),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exitCode = 1;
  });
}
