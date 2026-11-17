#!/usr/bin/env node
/**
 * Executes supabase/migrations/20261111090000_server_side_seat_generation.sql for real, on an
 * in-process Postgres (PGlite), against a minimal stand-in of the tables it touches.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node scripts/db/verify-seat-generation-pglite.mjs
 *
 * What it proves: the SQL parses and runs (twice: idempotent), seat codes match the JS reference scheme,
 * gaps are filled, capacity changes add/trim only free seats (sold, held and hold-detail seats survive),
 * the 50,000-seat cap rejects the WHOLE save atomically, authorisation (42501) and that
 * authenticated/anon can no longer write GHE directly.
 *
 * What it does NOT prove: behaviour against the real Supabase schema, the real luu_su_kien_toan_dien body
 * (replaced here by a stand-in), RLS interplay with other tables, or pg_cron. Run
 * supabase/tests/server_side_seat_generation.sql (pgTAP) on a staging database for that.
 */
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(path.join(REPO, 'supabase/migrations/20261111090000_server_side_seat_generation.sql'), 'utf8');
const {rowLabel} = await import(pathToFileURL(path.join(REPO, 'src/domain/seatGeneration.js')).href);

const db = new PGlite();
let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' ' + extra : ''));
  ok ? (pass += 1) : (fail += 1);
};

// ---- minimal stand-in for the schema the migration depends on (names/columns copied from the real migrations)
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE "SU_KIEN" ("SuKienID" SERIAL PRIMARY KEY, "ToChucID" UUID);
  CREATE TABLE "KHU_VUC" (
    "KhuVucID" SERIAL PRIMARY KEY, "SuKienID" INT NOT NULL, "SuatDienID" INT,
    "MaKhuVuc" VARCHAR(50) NOT NULL, "LoaiKhuVuc" VARCHAR(20) NOT NULL DEFAULT 'DUNG_STAND',
    "TongSoGhe" INT NOT NULL DEFAULT 0, CONSTRAINT uk_sukien_makhu UNIQUE ("SuKienID", "MaKhuVuc"));
  CREATE TABLE "GHE" (
    "GheID" SERIAL PRIMARY KEY, "KhuVucID" INT NOT NULL REFERENCES "KHU_VUC"("KhuVucID") ON DELETE CASCADE,
    "SoHang" VARCHAR(20) NOT NULL, "SoGhe" VARCHAR(20) NOT NULL, "MaGheDayDu" VARCHAR(50) NOT NULL,
    "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'TRONG', "ToaDoX" INT, "ToaDoY" INT,
    CONSTRAINT "uk_khuvuc_maghe" UNIQUE ("KhuVucID", "MaGheDayDu"));
  CREATE TABLE "CHI_TIET_GIU_CHO" ("ID" BIGSERIAL PRIMARY KEY, "GiuChoID" UUID, "KhuVucID" INT, "GheID" INT REFERENCES "GHE"("GheID") ON DELETE CASCADE);

  -- permission model: the previous (FOR ALL) state that the migration must remove
  ALTER TABLE "GHE" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Members read show seats" ON "GHE" FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Editors manage show seats" ON "GHE" FOR ALL TO authenticated USING (true) WITH CHECK (true);
  GRANT SELECT, INSERT, UPDATE, DELETE ON "GHE", "KHU_VUC", "SU_KIEN", "CHI_TIET_GIU_CHO" TO authenticated;

  CREATE FUNCTION public.co_quyen_bien_tap_to_chuc(p UUID) RETURNS BOOLEAN LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(current_setting('test.can_edit', true), '0') = '1' $$;

  -- stand-in for the ORIGINAL save RPC: upserts the event + zones from the payload, returns eventId
  CREATE FUNCTION public.luu_su_kien_toan_dien(p_payload JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE v_id INT := NULLIF(p_payload->>'eventId','')::INT; z JSONB;
  BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Can dang nhap de quan ly su kien' USING ERRCODE = '42501'; END IF;
    IF v_id IS NULL THEN INSERT INTO "SU_KIEN"("ToChucID") VALUES ('44444444-0000-0000-0000-000000000001') RETURNING "SuKienID" INTO v_id; END IF;
    FOR z IN SELECT value FROM jsonb_array_elements(p_payload->'zones') LOOP
      INSERT INTO "KHU_VUC"("SuKienID","MaKhuVuc","LoaiKhuVuc","TongSoGhe") VALUES (v_id, z->>'code', z->>'type', (z->>'cap')::INT)
      ON CONFLICT ("SuKienID","MaKhuVuc") DO UPDATE SET "LoaiKhuVuc"=EXCLUDED."LoaiKhuVuc", "TongSoGhe"=EXCLUDED."TongSoGhe";
    END LOOP;
    RETURN jsonb_build_object('eventId', v_id, 'slug', 'x', 'status', 'BAN_NHAP');
  END $$;
  GRANT EXECUTE ON FUNCTION public.luu_su_kien_toan_dien(JSONB) TO authenticated, service_role;
`);

// ---- apply the migration under test, twice (must be replayable)
await db.exec(migration);
check('migration applies', true);
await db.exec(migration);
check('migration is idempotent (applies a second time without error)', true);

const asEditor = async () => { await db.exec(`SET request.jwt.claim.sub = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; SET test.can_edit = '1'`); };
const save = async (zones, eventId) =>
  (await db.query(`SELECT public.luu_su_kien_toan_dien($1::jsonb) AS r`, [JSON.stringify({eventId, zones})])).rows[0].r;
const count = async (event, code) =>
  (await db.query(`SELECT COUNT(*)::int n FROM "GHE" g JOIN "KHU_VUC" k ON k."KhuVucID"=g."KhuVucID" WHERE k."SuKienID"=$1 AND k."MaKhuVuc"=$2`, [event, code])).rows[0].n;
const codes = async (event, code) =>
  (await db.query(`SELECT g."MaGheDayDu" c FROM "GHE" g JOIN "KHU_VUC" k ON k."KhuVucID"=g."KhuVucID" WHERE k."SuKienID"=$1 AND k."MaKhuVuc"=$2 ORDER BY g."GheID"`, [event, code])).rows.map((r) => r.c);

// 1. row labels equal the JS reference scheme
const labels = (await db.query(`SELECT i, public.nhan_hang_ghe(i) AS l FROM generate_series(0, 1500) i`)).rows;
check('nhan_hang_ghe equals JS rowLabel for 0..1500', labels.every((r) => r.l === rowLabel(r.i)));

// 2. save generates seats in the same call
await asEditor();
const r1 = await save([{code: 'SEAT', type: 'GHE_NGOI', cap: 25}, {code: 'GA', type: 'DUNG_STAND', cap: 100}]);
const ev = r1.eventId;
check('save result carries seat summary', r1.seats && r1.seats.inserted === 25, JSON.stringify(r1.seats));
check('seated zone has exactly its capacity', (await count(ev, 'SEAT')) === 25);
check('standing zone has no seats', (await count(ev, 'GA')) === 0);
const c1 = await codes(ev, 'SEAT');
check('codes SEAT-A-01 .. SEAT-C-05, nothing beyond', c1[0] === 'SEAT-A-01' && c1.at(-1) === 'SEAT-C-05' && !c1.includes('SEAT-C-06') && c1.includes('SEAT-B-10'));
check('all seats start TRONG', (await db.query(`SELECT COUNT(*)::int n FROM "GHE" WHERE "TrangThai"<>'TRONG'`)).rows[0].n === 0);

// 3. idempotent re-save
const r2 = await save([{code: 'SEAT', type: 'GHE_NGOI', cap: 25}], ev);
check('re-saving adds nothing', (await count(ev, 'SEAT')) === 25 && r2.seats.inserted === 0 && r2.seats.removed === 0, JSON.stringify(r2.seats));

// 4. raise capacity
await save([{code: 'SEAT', type: 'GHE_NGOI', cap: 31}], ev);
check('capacity 25 -> 31 adds exactly 6', (await count(ev, 'SEAT')) === 31);

// 5. gap filling
await db.exec(`DELETE FROM "GHE" WHERE "MaGheDayDu"='SEAT-A-05'`);
await save([{code: 'SEAT', type: 'GHE_NGOI', cap: 31}], ev);
check('a deleted seat code is regenerated (gaps filled first), total back to 31', (await count(ev, 'SEAT')) === 31 && (await codes(ev, 'SEAT')).includes('SEAT-A-05'));

// 6. reduce capacity: sold, held and hold-detail seats survive
await db.exec(`UPDATE "GHE" SET "TrangThai"='DA_BAN' WHERE "MaGheDayDu"='SEAT-D-01'`);
await db.exec(`UPDATE "GHE" SET "TrangThai"='DANG_GIU' WHERE "MaGheDayDu"='SEAT-A-02'`);
await db.exec(`INSERT INTO "CHI_TIET_GIU_CHO"("GiuChoID","KhuVucID","GheID") SELECT gen_random_uuid(), "KhuVucID", "GheID" FROM "GHE" WHERE "MaGheDayDu"='SEAT-C-10'`);
const before = await count(ev, 'SEAT');
const r3 = await save([{code: 'SEAT', type: 'GHE_NGOI', cap: 5}], ev);
const left = await codes(ev, 'SEAT');
check('reduction 31 -> 5 trims 26 free seats', before === 31 && left.length === 5 && r3.seats.removed === 26, `left=${left.join(',')} summary=${JSON.stringify(r3.seats)}`);
check('sold seat SEAT-D-01 untouched', left.includes('SEAT-D-01') && (await db.query(`SELECT "TrangThai" t FROM "GHE" WHERE "MaGheDayDu"='SEAT-D-01'`)).rows[0].t === 'DA_BAN');
check('held seat SEAT-A-02 untouched', left.includes('SEAT-A-02') && (await db.query(`SELECT "TrangThai" t FROM "GHE" WHERE "MaGheDayDu"='SEAT-A-02'`)).rows[0].t === 'DANG_GIU');
check('seat referenced by a hold detail (SEAT-C-10) untouched', left.includes('SEAT-C-10'));

// 7. when protected seats exceed the new capacity nothing protected is removed
await db.exec(`UPDATE "GHE" SET "TrangThai"='DA_BAN' WHERE "KhuVucID" IN (SELECT "KhuVucID" FROM "KHU_VUC" WHERE "MaKhuVuc"='SEAT')`);
await save([{code: 'SEAT', type: 'GHE_NGOI', cap: 1}], ev);
check('all seats sold + capacity 1 -> nothing deleted', (await count(ev, 'SEAT')) === 5);

// 8. 50,000 cap rejects the whole save and leaves no event behind
const eventsBefore = (await db.query(`SELECT COUNT(*)::int n FROM "SU_KIEN"`)).rows[0].n;
let capErr = null;
try { await save([{code: 'HUGE', type: 'GHE_NGOI', cap: 60000}]); } catch (e) { capErr = e; }
const eventsAfter = (await db.query(`SELECT COUNT(*)::int n FROM "SU_KIEN"`)).rows[0].n;
check('> 50,000 seats raises 22023', capErr && String(capErr.code) === '22023', capErr ? `${capErr.code} ${capErr.message}` : 'no error');
check('rejected save left no event/zone/seat behind (atomic)', eventsAfter === eventsBefore && (await db.query(`SELECT COUNT(*)::int n FROM "KHU_VUC" WHERE "MaKhuVuc"='HUGE'`)).rows[0].n === 0);
const exact = await save([{code: 'EXACT', type: 'GHE_NGOI', cap: 50000}]).then(() => null, (e) => e);
check('exactly 50,000 seats is accepted', exact === null);
if (exact === null) check('50,000 seats actually created', (await db.query(`SELECT COUNT(*)::int n FROM "GHE" g JOIN "KHU_VUC" k USING("KhuVucID") WHERE k."MaKhuVuc"='EXACT'`)).rows[0].n === 50000);

// 9. authorisation
await db.exec(`SET test.can_edit = '0'`);
let noEdit = null;
try { await db.query(`SELECT public.dong_bo_ghe_su_kien($1)`, [ev]); } catch (e) { noEdit = e; }
check('member without edit rights cannot generate seats (42501)', noEdit && String(noEdit.code) === '42501', noEdit?.message);
await db.exec(`RESET request.jwt.claim.sub`);
let anonErr = null;
try { await db.query(`SELECT public.dong_bo_ghe_su_kien($1)`, [ev]); } catch (e) { anonErr = e; }
check('no auth.uid() is rejected (42501)', anonErr && String(anonErr.code) === '42501', anonErr?.message);

// 10. privilege model: the migration's own assertion passed, and direct writes are really gone
await asEditor();
await db.exec(`SET ROLE authenticated`);
const tryWrite = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return e; } };
const upd = await tryWrite(`UPDATE "GHE" SET "TrangThai"='DA_BAN' WHERE "MaGheDayDu"='SEAT-A-01'`);
const ins = await tryWrite(`INSERT INTO "GHE"("KhuVucID","SoHang","SoGhe","MaGheDayDu") VALUES (1,'Z','99','Z-99')`);
const del = await tryWrite(`DELETE FROM "GHE" WHERE "MaGheDayDu"='SEAT-A-01'`);
const sel = await tryWrite(`SELECT COUNT(*) FROM "GHE"`);
await db.exec(`RESET ROLE`);
check('authenticated cannot UPDATE GHE', upd && String(upd.code) === '42501', upd?.message);
check('authenticated cannot INSERT GHE', ins && String(ins.code) === '42501', ins?.message);
check('authenticated cannot DELETE GHE', del && String(del.code) === '42501', del?.message);
check('authenticated can still SELECT GHE', sel === null);
const pol = (await db.query(`SELECT policyname FROM pg_policies WHERE tablename='GHE' ORDER BY 1`)).rows.map((r) => r.policyname);
check('"Editors manage show seats" is gone, read policy kept', !pol.includes('Editors manage show seats') && pol.includes('Members read show seats'), pol.join('|'));

// 11. core is not directly callable by authenticated
await db.exec(`SET ROLE authenticated`);
const core = await tryWrite(`SELECT public.luu_su_kien_toan_dien_core('{}'::jsonb)`);
await db.exec(`RESET ROLE`);
check('internal core function is not callable by authenticated', core && String(core.code) === '42501', core?.message);
await db.exec(`SET ROLE anon`);
const anonSave = await tryWrite(`SELECT public.luu_su_kien_toan_dien('{}'::jsonb)`);
await db.exec(`RESET ROLE`);
check('anon cannot call the save RPC', anonSave && String(anonSave.code) === '42501', anonSave?.message);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
