#!/usr/bin/env node
/**
 * Replays the REAL supabase/migrations/*.sql on in-process Postgres (PGlite) with stand-ins only for the
 * hosted pieces (auth schema, roles, pg_cron, realtime publication), then drives the REAL
 * `luu_su_kien_toan_dien` (wrapped by migration 20261111090000) end to end.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node scripts/db/verify-real-save-rpc-pglite.mjs
 *
 * Proves: the whole migration chain applies in order; the wrapper + renamed core keep the save contract
 * (event, shows, zones) and generate seats in the same call; capacity changes through the real save RPC
 * add/trim only free seats; the commercial lock of the real core still wins; > 50,000 seats rolls back the
 * whole save; non-editors are refused; editors cannot write GHE directly.
 *
 * Does NOT prove: Supabase-hosted behaviour (real auth, Realtime, pg_cron), concurrency (PGlite is
 * single-connection), or the seed migration 20261104100000 (needs a service context; skipped here).
 */
import {PGlite} from '@electric-sql/pglite';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(REPO, 'supabase/migrations');
const SKIP = new Set(['20261104100000_seed_ticketgo_and_ticketmaster_events.sql']);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && !SKIP.has(f)).sort();

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' ' + extra : ''));
  ok ? (pass += 1) : (fail += 1);
};
const tryRun = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

async function freshDatabase(announce) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA extensions;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text);
    CREATE FUNCTION cron.schedule(a text, b text, c text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE FUNCTION cron.unschedule(a bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    -- Supabase grants full table privileges to the API roles by default; without this the checks below
    -- would pass trivially ("permission denied" because nothing was ever granted).
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `);
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8')
      .replace(/CREATE EXTENSION IF NOT EXISTS pg_cron[^;]*;/gi, '-- pg_cron stubbed')
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto[^;]*;/gi, '-- pgcrypto builtin');
    const err = await tryRun(() => db.exec(sql));
    if (announce) check(`migration ${f} applies`, !err, err ? String(err.message).slice(0, 200) : '');
    if (err) { console.log(String(err.message)); process.exit(1); }
  }
  return db;
}

const db = await freshDatabase(true);

// ---- fixtures: an organization with an owner (can edit), a ticket scanner (cannot edit) and an outsider
const OWNER = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCANNER = '33333333-cccc-cccc-cccc-cccccccccccc';
const OUTSIDER = '99999999-9999-9999-9999-999999999999';
const ORG = '44444444-0000-0000-0000-000000000001';
await db.exec(`
  INSERT INTO auth.users (id, email) VALUES ('${OWNER}','owner@test'), ('${SCANNER}','scan@test'), ('${OUTSIDER}','out@test');
  INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID","HoTen","LoaiTaiKhoan") VALUES
    ('${OWNER}','Owner','ORGANIZER'), ('${SCANNER}','Scanner','ORGANIZER'), ('${OUTSIDER}','Outsider','ORGANIZER')
  ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan"='ORGANIZER';
  INSERT INTO public."TO_CHUC" ("ToChucID","TenToChuc","Slug") VALUES ('${ORG}','Org Seat Gen','org-seat-gen');
  INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID","NguoiDungID","VaiTro") VALUES
    ('${ORG}','${OWNER}','CHU_SO_HUU'), ('${ORG}','${SCANNER}','SOAT_VE');
`);

const as = async (uid) => db.exec(`SET request.jwt.claim.sub = '${uid}'; SET request.jwt.claim.role = 'authenticated'`);
const BASE = Date.now();
// fixed instants: re-saving must send identical show times, otherwise the commercial lock trips on the time change
const day = (n) => new Date(BASE + n * 86400000).toISOString();
const payload = (over = {}, tiers) => ({
  organizationId: ORG, name: 'Seat Generation Night 2026', slug: 'seat-generation-night-2026', category: 'AM_NHAC',
  locationMode: 'OFFLINE', venueName: 'Cung Test', address: 'Ha Noi',
  shows: [{
    slug: 'dem-1', name: 'Dem 1', startsAt: day(10), endsAt: day(10.2), saleStartsAt: day(1), saleEndsAt: day(9),
    ticketTiers: tiers ?? [
      {code: 'SEAT', name: 'Ghe ngoi', price: 300000, capacity: 25, type: 'GHE_NGOI'},
      {code: 'GA', name: 'Dung', price: 150000, capacity: 100, type: 'DUNG_STAND'},
    ],
  }],
  ...over,
});
const save = async (p) => (await db.query(`SELECT public.luu_su_kien_toan_dien($1::jsonb) AS r`, [JSON.stringify(p)])).rows[0].r;
const seatCount = async (code) =>
  (await db.query(`SELECT COUNT(*)::int n FROM public."GHE" g JOIN public."KHU_VUC" k USING ("KhuVucID") WHERE k."MaKhuVuc"=$1`, [code])).rows[0].n;
const seatCodes = async (code) =>
  (await db.query(`SELECT g."MaGheDayDu" c FROM public."GHE" g JOIN public."KHU_VUC" k USING ("KhuVucID") WHERE k."MaKhuVuc"=$1 ORDER BY g."GheID"`, [code])).rows.map((r) => r.c);

check('real functions present (wrapper + renamed core + sync + label helper)',
  (await db.query(`SELECT COUNT(*)::int n FROM pg_proc WHERE proname IN ('luu_su_kien_toan_dien','luu_su_kien_toan_dien_core','dong_bo_ghe_su_kien','nhan_hang_ghe')`)).rows[0].n === 4);

// 1. the real save contract is intact and seats are generated in the same call
await as(OWNER);
const first = await save(payload());
const eventId = first.eventId;
check('real save returns eventId/slug/status plus a seats summary', Number.isInteger(eventId) && first.slug === 'seat-generation-night-2026' && first.status === 'BAN_NHAP' && first.seats?.inserted === 25, JSON.stringify(first));
check('draft event, 1 show and 2 zones were stored by the real core',
  (await db.query(`SELECT (SELECT COUNT(*) FROM public."SU_KIEN" WHERE "SuKienID"=$1)::int e, (SELECT COUNT(*) FROM public."SUAT_DIEN" WHERE "SuKienID"=$1)::int s, (SELECT COUNT(*) FROM public."KHU_VUC" WHERE "SuKienID"=$1)::int z`, [eventId])).rows[0].e === 1
  && (await db.query(`SELECT COUNT(*)::int z FROM public."KHU_VUC" WHERE "SuKienID"=$1`, [eventId])).rows[0].z === 2);
check('seated zone has exactly its capacity, standing zone has none', (await seatCount('SEAT')) === 25 && (await seatCount('GA')) === 0);
const codes = await seatCodes('SEAT');
check('codes follow SEAT-A-01..SEAT-C-05', codes[0] === 'SEAT-A-01' && codes.at(-1) === 'SEAT-C-05' && codes.length === 25);

// 3. capacity increase through the real save path (ids needed by the real core)
const zoneId = (await db.query(`SELECT "KhuVucID" id FROM public."KHU_VUC" WHERE "MaKhuVuc"='SEAT'`)).rows[0].id;
const tier = (cap) => [
  {tierId: zoneId, code: 'SEAT', name: 'Ghe ngoi', price: 300000, capacity: cap, type: 'GHE_NGOI'},
  {code: 'GA', name: 'Dung', price: 150000, capacity: 100, type: 'DUNG_STAND'},
];
const gaId = (await db.query(`SELECT "KhuVucID" id FROM public."KHU_VUC" WHERE "MaKhuVuc"='GA'`)).rows[0].id;
const tiers = (cap) => [tier(cap)[0], {...tier(cap)[1], tierId: gaId}];
const showId = (await db.query(`SELECT "SuatDienID" id FROM public."SUAT_DIEN" WHERE "SuKienID"=$1`, [eventId])).rows[0].id;
const withTiers = (cap) => {
  const p = payload({eventId}, tiers(cap));
  p.shows[0].showId = showId;
  return p;
};
// 2. re-saving the same aggregate (real core upserts by ids) is idempotent for seats
const again = await save(withTiers(25));
check('re-save does not duplicate seats', (await seatCount('SEAT')) === 25 && again.seats.inserted === 0, JSON.stringify(again.seats));

const up = await save(withTiers(31));
check('capacity 25 -> 31 through the real save adds exactly 6', (await seatCount('SEAT')) === 31 && up.seats.inserted === 6, JSON.stringify(up.seats));

// 4. free-seat capacity reduction through the real save trims only free seats
const down = await save(withTiers(20));
check('capacity 31 -> 20 (no sales yet) trims 11 free seats', (await seatCount('SEAT')) === 20 && down.seats.removed === 11, JSON.stringify(down.seats));

// 5. DRAFT (not published): the commercial lock does not apply, but a sold seat must survive a capacity cut
await db.exec(`SET request.jwt.claim.sub = ''`);
await db.exec(`UPDATE public."GHE" SET "TrangThai"='DA_BAN' WHERE "MaGheDayDu"='SEAT-A-01'`);
await db.exec(`UPDATE public."GHE" SET "TrangThai"='DANG_GIU' WHERE "MaGheDayDu"='SEAT-A-02'`);
await as(OWNER);
const cut = await save(withTiers(5));
const afterCut = await seatCodes('SEAT');
check('draft: capacity cut to 5 keeps the sold and the held seat', afterCut.includes('SEAT-A-01') && afterCut.includes('SEAT-A-02') && afterCut.length === 5, afterCut.join(','));
check('draft: the cut removed only free seats (15 of 20)', cut.seats.removed === 15, JSON.stringify(cut.seats));
const statuses = (await db.query(`SELECT "MaGheDayDu" c, "TrangThai" t FROM public."GHE" WHERE "MaGheDayDu" IN ('SEAT-A-01','SEAT-A-02')`)).rows;
check('draft: sold/held statuses unchanged', statuses.find((r) => r.c === 'SEAT-A-01')?.t === 'DA_BAN' && statuses.find((r) => r.c === 'SEAT-A-02')?.t === 'DANG_GIU');

// 5b. PUBLISHED: the real commercial lock refuses a capacity reduction once seats are sold/held
const pub = await tryRun(() => db.query(`SELECT public.cong_bo_su_kien($1)`, [eventId]));
if (pub) {
  console.log('NOTE - could not publish in this harness, skipping the published-lock check:', String(pub.message).slice(0, 140));
} else {
  const lock = await tryRun(() => save(withTiers(2)));
  check('published: real commercial lock refuses a capacity cut after a sale (22023)', lock && String(lock.code) === '22023', lock ? lock.message : 'save succeeded - no lock');
  check('published: seats unchanged after the refused save', (await seatCount('SEAT')) === 5);
}

// 6. 50,000-seat cap through the real save rolls the whole save back
const eventsBefore = (await db.query(`SELECT COUNT(*)::int n FROM public."SU_KIEN"`)).rows[0].n;
const huge = await tryRun(() => save(payload({name: 'Too Many Seats 2026', slug: 'too-many-seats-2026'},
  [{code: 'HUGE', name: 'Qua nhieu', price: 100000, capacity: 60000, type: 'GHE_NGOI'}])));
check('60,000 seats refused with 22023', huge && String(huge.code) === '22023', huge?.message);
check('refused save left no event, zone or seat (atomic)',
  (await db.query(`SELECT COUNT(*)::int n FROM public."SU_KIEN"`)).rows[0].n === eventsBefore && (await seatCount('HUGE')) === 0);

// 7. authorisation through the real wrapper
await as(SCANNER);
const scan = await tryRun(() => save(payload({eventId})));
check('SOAT_VE member cannot save (42501)', scan && String(scan.code) === '42501', scan?.message);
const scanSync = await tryRun(() => db.query(`SELECT public.dong_bo_ghe_su_kien($1)`, [eventId]));
check('SOAT_VE member cannot trigger seat generation (42501)', scanSync && String(scanSync.code) === '42501', scanSync?.message);
await as(OUTSIDER);
const out = await tryRun(() => save(payload({eventId})));
check('outsider cannot save (42501)', out && String(out.code) === '42501', out?.message);

// 8. privileges as the real authenticated/anon roles
await as(OWNER);
await db.exec(`SET ROLE authenticated`);
const direct = await tryRun(() => db.exec(`UPDATE public."GHE" SET "TrangThai"='DA_BAN' WHERE "MaGheDayDu"='SEAT-A-03'`));
const directIns = await tryRun(() => db.exec(`INSERT INTO public."GHE"("KhuVucID","SoHang","SoGhe","MaGheDayDu") VALUES (${zoneId},'Z','99','SEAT-Z-99')`));
const directDel = await tryRun(() => db.exec(`DELETE FROM public."GHE" WHERE "MaGheDayDu"='SEAT-A-03'`));
const core = await tryRun(() => db.exec(`SELECT public.luu_su_kien_toan_dien_core('{}'::jsonb)`));
const read = await tryRun(() => db.exec(`SELECT COUNT(*) FROM public."GHE"`));
await db.exec(`RESET ROLE`);
check('editor cannot UPDATE GHE directly', direct && String(direct.code) === '42501', direct?.message);
check('editor cannot INSERT GHE directly', directIns && String(directIns.code) === '42501', directIns?.message);
check('editor cannot DELETE GHE directly', directDel && String(directDel.code) === '42501', directDel?.message);
check('internal core is not callable by authenticated', core && String(core.code) === '42501', core?.message);
check('editor can still read seats', read === null, read?.message);
await db.exec(`SET ROLE anon`);
const anonSave = await tryRun(() => db.exec(`SELECT public.luu_su_kien_toan_dien('{}'::jsonb)`));
await db.exec(`RESET ROLE`);
check('anon cannot call the save RPC', anonSave && String(anonSave.code) === '42501', anonSave?.message);

// 9. every write policy left on GHE (none may be open to authenticated/anon/public)
const writePolicies = (await db.query(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='GHE' AND cmd IN ('ALL','INSERT','UPDATE','DELETE')`)).rows;
check('no write policy remains on GHE', writePolicies.length === 0, JSON.stringify(writePolicies));

// ---------------------------------------------------------------------------------------------
// 10. Run the real pgTAP file (supabase/tests/server_side_seat_generation.sql) through a tiny pgTAP shim.
//     The shim only implements what that file uses; it is NOT real pgTAP, but the file is unmodified.
// ---------------------------------------------------------------------------------------------
const tapDb = await freshDatabase(false);
await tapDb.exec(`
  CREATE OR REPLACE FUNCTION plan(n int) RETURNS text LANGUAGE sql AS $$ SELECT '1..' || n $$;
  CREATE OR REPLACE FUNCTION finish() RETURNS SETOF text LANGUAGE sql AS $$ SELECT 'done'::text $$;
  CREATE OR REPLACE FUNCTION tap_line(ok boolean, d text) RETURNS text LANGUAGE sql AS $$ SELECT (CASE WHEN ok THEN 'ok - ' ELSE 'not ok - ' END) || COALESCE(d, '') $$;
  CREATE OR REPLACE FUNCTION ok(c boolean, d text DEFAULT '') RETURNS text LANGUAGE sql AS $$ SELECT tap_line(COALESCE(c, false), d) $$;
  CREATE OR REPLACE FUNCTION is(a anyelement, b anyelement, d text DEFAULT '') RETURNS text LANGUAGE sql AS $$
    SELECT tap_line(a IS NOT DISTINCT FROM b, d || CASE WHEN a IS NOT DISTINCT FROM b THEN '' ELSE ' [got ' || COALESCE(a::text, 'NULL') || ' expected ' || COALESCE(b::text, 'NULL') || ']' END) $$;
  CREATE OR REPLACE FUNCTION cmp_ok(a anyelement, op text, b anyelement, d text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
  DECLARE r boolean;
  BEGIN EXECUTE format('SELECT %L::%s %s %L::%s', a, pg_typeof(a), op, b, pg_typeof(b)) INTO r; RETURN tap_line(r, d); END $$;
  CREATE OR REPLACE FUNCTION lives_ok(q text, d text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
  BEGIN EXECUTE q; RETURN tap_line(true, d);
  EXCEPTION WHEN OTHERS THEN RETURN tap_line(false, d || ' [' || SQLERRM || ']'); END $$;
  CREATE OR REPLACE FUNCTION throws_ok(q text, code text, msg text DEFAULT NULL, d text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
  BEGIN EXECUTE q; RETURN tap_line(false, d || ' [no exception]');
  EXCEPTION WHEN OTHERS THEN
    RETURN tap_line(SQLSTATE = code AND (msg IS NULL OR SQLERRM = msg),
      d || CASE WHEN SQLSTATE = code AND (msg IS NULL OR SQLERRM = msg) THEN '' ELSE ' [got ' || SQLSTATE || ' ' || SQLERRM || ']' END);
  END $$;
`);
await tapDb.exec(`
  INSERT INTO auth.users (id, email) VALUES ('${OWNER}','owner@test'), ('${SCANNER}','scan@test'), ('${OUTSIDER}','out@test');
  INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID","HoTen","LoaiTaiKhoan") VALUES
    ('${OWNER}','Owner','ORGANIZER'), ('${SCANNER}','Scanner','ORGANIZER'), ('${OUTSIDER}','Outsider','ORGANIZER')
  ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan"='ORGANIZER';
`);
const tap = readFileSync(path.join(REPO, 'supabase/tests/server_side_seat_generation.sql'), 'utf8');
const tapResults = await tapDb.exec(tap);
const lines = tapResults
  .flatMap((r) => r.rows.map((row) => Object.values(row)[0]))
  .filter((v) => typeof v === 'string' && /^(ok|not ok) - /.test(v));
for (const line of lines) check(`pgTAP: ${line.replace(/^(ok|not ok) - /, '')}`, line.startsWith('ok'));
check('pgTAP file ran all 27 assertions', lines.length === 27, `(${lines.length})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
