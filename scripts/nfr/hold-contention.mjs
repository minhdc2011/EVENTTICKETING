#!/usr/bin/env node
/**
 * NFR-02 contention test: N concurrent sessions try to hold the SAME seat through
 * `tao_giu_cho_theo_suat`. Expected: exactly 1 succeeds, N-1 are rejected, and the seat
 * ends up with exactly one ACTIVE hold detail.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SHOW_ID=1 ZONE_CODE=VVIP SEAT_CODE=VVIP-A-03 \
 *   node scripts/nfr/hold-contention.mjs --sessions 20
 *
 * SAFETY: run only against a staging / local Supabase, NEVER production. The script refuses to run
 * unless ALLOW_NON_PRODUCTION=yes is set, to force a conscious decision. It uses ONE seat that you
 * name, and releases every hold it created in a `finally` block (cleanup uses the service role).
 *
 * STATUS: written, NOT yet executed (no Supabase staging/local was available when authored).
 */
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SHOW_ID', 'ZONE_CODE', 'SEAT_CODE'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(2);
}
if (process.env.ALLOW_NON_PRODUCTION !== 'yes') {
  console.error('Refusing to run: set ALLOW_NON_PRODUCTION=yes to confirm this is NOT a production project.');
  process.exit(2);
}

const sessionsFlag = process.argv.indexOf('--sessions');
const sessions = sessionsFlag >= 0 ? Number(process.argv[sessionsFlag + 1]) : 20;
const {SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SHOW_ID, ZONE_CODE, SEAT_CODE} = process.env;

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});

const sessionIds = Array.from({length: sessions}, () => randomUUID());
const created = [];

async function seatState() {
  const {data, error} = await admin.from('GHE').select('GheID, TrangThai').eq('MaGheDayDu', SEAT_CODE);
  if (error) throw error;
  return data;
}

try {
  const before = await seatState();
  if (before.length !== 1 || before[0].TrangThai !== 'TRONG') {
    throw new Error(`Seat ${SEAT_CODE} must exist exactly once and be TRONG before the test (found ${JSON.stringify(before)})`);
  }

  const startedAt = Date.now();
  const results = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const {data, error} = await anon.rpc('tao_giu_cho_theo_suat', {
        p_suat_dien_id: Number(SHOW_ID),
        p_phien_id: sessionId,
        p_items: [{ticketCode: SEAT_CODE, zoneCode: ZONE_CODE}],
      });
      if (!error && data?.holdId) created.push(data.holdId);
      return {sessionId, ok: !error, holdId: data?.holdId ?? null, error: error ? `${error.code ?? ''} ${error.message}` : null};
    }),
  );
  const elapsedMs = Date.now() - startedAt;

  const winners = results.filter((r) => r.ok);
  const losers = results.filter((r) => !r.ok);

  const {data: details, error: detailError} = await admin
    .from('CHI_TIET_GIU_CHO')
    .select('GiuChoID, GHE!inner(MaGheDayDu), GIU_CHO!inner(TrangThai, HetHanLuc)')
    .eq('GHE.MaGheDayDu', SEAT_CODE)
    .eq('GIU_CHO.TrangThai', 'ACTIVE');
  if (detailError) throw detailError;

  const report = {
    metric: 'single-seat-hold-contention',
    sessions,
    elapsedMs,
    succeeded: winners.length,
    rejected: losers.length,
    activeHoldDetailsForSeat: details.length,
    expectation: {succeeded: 1, rejected: sessions - 1, activeHoldDetailsForSeat: 1},
    pass: winners.length === 1 && losers.length === sessions - 1 && details.length === 1,
    sampleRejectionMessages: [...new Set(losers.map((l) => l.error))].slice(0, 3),
    measuredAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
} finally {
  // Cleanup: release everything this run created and restore the seat.
  for (const holdId of created) {
    await admin.from('GIU_CHO').update({TrangThai: 'RELEASED'}).eq('GiuChoID', holdId);
  }
  await admin.from('GHE').update({TrangThai: 'TRONG'}).eq('MaGheDayDu', SEAT_CODE).eq('TrangThai', 'DANG_GIU');
}
