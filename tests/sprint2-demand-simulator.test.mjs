import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const MIGRATION_PATH = new URL('../supabase/migrations/20261113100000_sprint2_demand_simulator.sql', import.meta.url);
const PGTAP_PATH = new URL('../supabase/tests/sprint2_demand_simulator.sql', import.meta.url);

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function extractFunctionBody(sql) {
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION public\.mo_phong_nhu_cau\(([\s\S]*?)\)\s*RETURNS JSONB([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/,
  );
  assert.ok(match, 'Must define public.mo_phong_nhu_cau(...) RETURNS JSONB');
  return {
    params: match[1],
    attrs: match[2],
    body: match[3],
  };
}

test('sprint2 demand simulator migration defines mo_phong_nhu_cau with SECURITY DEFINER, VOLATILE, search_path, and strict ACL', () => {
  const rawSql = readFileSync(MIGRATION_PATH, 'utf8');
  const sql = stripSqlComments(rawSql);
  const fn = extractFunctionBody(sql);

  assert.match(fn.params, /p_su_kien_id\s+INT/i);
  assert.match(fn.params, /p_kich_ban\s+TEXT/i);
  assert.match(fn.attrs, /\bLANGUAGE\s+plpgsql\b/i);
  assert.match(fn.attrs, /\bVOLATILE\b/i);
  assert.match(fn.attrs, /\bSECURITY\s+DEFINER\b/i);
  assert.match(fn.attrs, /\bSET\s+search_path\s*=\s*public\b/i);

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.mo_phong_nhu_cau\(INT,\s*TEXT\) FROM PUBLIC,\s*anon;/,
    'Must revoke ALL on mo_phong_nhu_cau(INT, TEXT) from PUBLIC, anon',
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.mo_phong_nhu_cau\(INT,\s*TEXT\) TO authenticated,\s*service_role;/,
    'Must grant EXECUTE on mo_phong_nhu_cau(INT, TEXT) to authenticated, service_role',
  );

  assert.match(sql, /ALTER TABLE public\."MO_PHONG_GHE" ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON public\."MO_PHONG_GHE" FROM PUBLIC,\s*anon,\s*authenticated;/);
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema';/);
});

test('sprint2 demand simulator uses T2 helpers, moPhong expression, scenarios, and rejects before any write', () => {
  const rawSql = readFileSync(MIGRATION_PATH, 'utf8');
  const sql = stripSqlComments(rawSql);
  const {body} = extractFunctionBody(sql);

  assert.match(body, /public\.co_quyen_dinh_gia\(p_su_kien_id\)/, 'Must authorize via public.co_quyen_dinh_gia');
  assert.match(
    body,
    /public\.suat_dien_dang_mo_ban\(p_su_kien_id,\s*[^)]+\)/,
    'Must resolve open shows via public.suat_dien_dang_mo_ban',
  );

  assert.doesNotMatch(rawSql, /TrangThaiMoBan/, 'Must never reference legacy SU_KIEN.TrangThaiMoBan');
  assert.doesNotMatch(rawSql, /'DANG_MO_BAN'/, 'Must never hardcode DANG_MO_BAN status comparison');

  const exactFlag = body.match(/COALESCE\(ch\."TuyChonMoRong"->>'moPhong'\s*=\s*'true',\s*FALSE\)/g) ?? [];
  assert.equal(exactFlag.length, 2, 'exact AC#2 flag expression (pre-lock and under-lock)');
  assert.doesNotMatch(
    body,
    /(LOWER|UPPER|INITCAP)\s*\(\s*ch\."TuyChonMoRong"/i,
    'exact AC#2 flag expression: no case folding of moPhong',
  );
  assert.doesNotMatch(body, /'moPhong'[^;]*\b(ILIKE|~\*)/i, 'exact AC#2 flag expression: no ILIKE/~* on moPhong');

  for (const scenario of ['ban_nhanh', 'ban_cham', 'ban_deu']) {
    assert.match(body, new RegExp(`'${scenario}'`), `Must include scenario literal '${scenario}'`);
  }
  assert.match(
    sql,
    /CONSTRAINT\s+"chk_mo_phong_ghe_kich_ban"\s+CHECK\s*\("KichBan"\s+IN\s*\('ban_nhanh',\s*'ban_cham',\s*'ban_deu'\)\)/,
    'MO_PHONG_GHE must constrain KichBan to the scenario whitelist',
  );
  assert.match(
    body,
    /FROM\s*\(VALUES\s*\('ban_nhanh'[\s\S]*?'ban_cham'[\s\S]*?'ban_deu'[\s\S]*?\)\s*AS\s+t\(kich_ban,\s*fill\)/,
    'Function body must validate p_kich_ban against the scenario whitelist',
  );

  assert.match(body, /ERRCODE\s*=\s*'22023'/);
  assert.match(body, /KICH_BAN_KHONG_HOP_LE/);
  assert.match(body, /ERRCODE\s*=\s*'55000'/);
  assert.match(body, /MO_PHONG_CHUA_BAT/);
  assert.match(body, /ERRCODE\s*=\s*'42501'/);
  assert.match(body, /ERRCODE\s*=\s*'P0002'/);

  // Every RAISE and early RETURN must appear before the first INSERT, UPDATE, or DELETE in the function body.
  const writeOffsets = [
    body.search(/\bINSERT\s+INTO\b/i),
    body.search(/\bDELETE\s+FROM\b/i),
    ...[...body.matchAll(/\bUPDATE\b/gi)]
      .filter((m) => !/\bFOR(?:\s+NO\s+KEY)?\s+$/i.test(body.slice(Math.max(0, m.index - 20), m.index))
        && !/\bDO\s+$/i.test(body.slice(Math.max(0, m.index - 10), m.index)))
      .map((m) => m.index),
  ].filter((i) => i >= 0);
  const firstWrite = Math.min(...writeOffsets);
  assert.ok(Number.isFinite(firstWrite) && firstWrite > 0, 'Function body must contain writes');

  const raiseMatches = [...body.matchAll(/\bRAISE\b/gi)];
  assert.ok(raiseMatches.length >= 6, 'Expected all gate RAISE statements in function body');
  for (const m of raiseMatches) {
    assert.ok(m.index < firstWrite, `Every RAISE must sit before first write (offset ${m.index} vs ${firstWrite})`);
  }

  const returnMatches = [...body.matchAll(/\bRETURN\s+jsonb_build_object\([\s\S]*?\);/gi)];
  const earlyReturn = returnMatches.find((m) => m[0].includes("'KHONG_CO_SUAT_HOP_LE'"));
  const finalReturn = returnMatches.find((m) => m[0].includes("'DA_MO_PHONG'"));
  assert.ok(earlyReturn, 'Must have early RETURN with KHONG_CO_SUAT_HOP_LE');
  assert.ok(earlyReturn.index < firstWrite, 'Early RETURN KHONG_CO_SUAT_HOP_LE must sit before first write');
  assert.ok(finalReturn && finalReturn.index > firstWrite, 'Final RETURN DA_MO_PHONG must sit after writes');

  for (const ret of [earlyReturn[0], finalReturn[0]]) {
    assert.match(ret, /'nhan',\s*'MO_PHONG'/, 'Result payload must carry nhan: MO_PHONG');
    assert.match(ret, /'moPhong',\s*TRUE/, 'Result payload must carry moPhong: true');
  }

  const idxScenarioReject = body.indexOf("'22023'");
  const idxMissingReject = body.indexOf("'P0002'");
  const idxAuthCall = body.indexOf('co_quyen_dinh_gia');
  const idxFlagReject = body.indexOf("'55000'");

  assert.ok(idxScenarioReject >= 0 && idxScenarioReject < firstWrite, '22023 reject must sit before first write');
  assert.ok(idxMissingReject >= 0 && idxMissingReject < firstWrite, 'P0002 reject must sit before first write');
  assert.ok(idxAuthCall >= 0 && idxAuthCall < firstWrite, 'co_quyen_dinh_gia check must sit before first write');
  assert.ok(idxFlagReject >= 0 && idxFlagReject < firstWrite, '55000 reject must sit before first write');
  assert.ok(
    idxScenarioReject < idxMissingReject && idxMissingReject < idxAuthCall && idxAuthCall < idxFlagReject,
    'Gate order must be scenario -> event lookup -> co_quyen_dinh_gia -> moPhong flag',
  );
});

test('sprint2 demand simulator preserves W1 trigger, GHE write locks, ACTIVE holds, and pricing tables', () => {
  const rawSql = readFileSync(MIGRATION_PATH, 'utf8');
  const sql = stripSqlComments(rawSql);
  const {body} = extractFunctionBody(sql);

  assert.doesNotMatch(sql, /\bDISABLE\s+TRIGGER\b/i, 'Must never disable triggers');
  assert.doesNotMatch(sql, /session_replication_role/i, 'Must never change session_replication_role');
  assert.doesNotMatch(
    sql,
    /\bGRANT\s+(ALL|INSERT|UPDATE|DELETE|TRUNCATE)\b[\s\S]*?\bON\s+(?:TABLE\s+)?(?:public\.)?"?GHE"?/i,
    'Must never grant direct write privileges on GHE',
  );

  // Two-step UPDATE pattern: every timestamp UPDATE on GHE omits TrangThai from its SET list.
  const gheUpdates = [...body.matchAll(/UPDATE\s+public\."GHE"[\s\S]*?;/gi)].map((m) => m[0]);
  assert.ok(gheUpdates.length >= 4, 'Expected status and timestamp UPDATE statements for both reset and apply');

  const statusUpdates = gheUpdates.filter((stmt) => {
    const setClause = stmt.match(/\bSET\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b)/i)?.[1] ?? '';
    return /"TrangThai"\s*=/.test(setClause) && !/"NgayCapNhatTrangThai"\s*=/.test(setClause);
  });
  const timestampOnlyUpdates = gheUpdates.filter((stmt) => {
    const setClause = stmt.match(/\bSET\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b)/i)?.[1] ?? '';
    return /"NgayCapNhatTrangThai"\s*=/.test(setClause) && !/"TrangThai"\s*=/.test(setClause);
  });
  const mixedUpdates = gheUpdates.filter((stmt) => {
    const setClause = stmt.match(/\bSET\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b)/i)?.[1] ?? '';
    return /"NgayCapNhatTrangThai"\s*=/.test(setClause) && /"TrangThai"\s*=/.test(setClause);
  });

  assert.ok(statusUpdates.length >= 2, 'Must have status-only UPDATEs on GHE for reset and apply');
  assert.ok(
    timestampOnlyUpdates.length >= 2,
    'Must have two-step UPDATEs on GHE setting NgayCapNhatTrangThai without TrangThai in SET',
  );
  assert.equal(mixedUpdates.length, 0, 'No UPDATE on GHE may set both TrangThai and NgayCapNhatTrangThai');

  // ACTIVE hold guards (hold count + eligible set + restore) & SKIP LOCKED
  const activeHoldChecks = [
    ...body.matchAll(
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\."CHI_TIET_GIU_CHO"[^;)]*public\."GIU_CHO"[^;)]*"TrangThai"\s*=\s*'ACTIVE'/g,
    ),
  ];
  const activeHoldExclusions = [
    ...body.matchAll(
      /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\."CHI_TIET_GIU_CHO"[^;)]*public\."GIU_CHO"[^;)]*"TrangThai"\s*=\s*'ACTIVE'/g,
    ),
  ];
  assert.equal(
    activeHoldChecks.length,
    3,
    'Must check ACTIVE holds 3 times (hold count, eligible seat selection, and reset restore)',
  );
  assert.equal(
    activeHoldExclusions.length,
    2,
    'Must exclude ACTIVE-hold seats with NOT EXISTS in both eligible selection and reset restore',
  );
  assert.match(body, /FOR\s+UPDATE\s+OF\s+g\s+SKIP\s+LOCKED/, 'Must lock eligible seats with SKIP LOCKED');

  // Must never mutate pricing tables, listed price, or hold tables
  assert.doesNotMatch(sql, /GiaVeNiemYet/, 'Simulator must not touch GiaVeNiemYet');
  assert.doesNotMatch(sql, /\bDE_XUAT_GIA\b/, 'Simulator must not touch DE_XUAT_GIA');
  assert.doesNotMatch(sql, /\bQUY_TAC_GIA\b/, 'Simulator must not touch QUY_TAC_GIA');
  assert.doesNotMatch(sql, /\bNHAT_KY_/i, 'Simulator must not touch any NHAT_KY_* audit table');
  for (const tbl of ['GIU_CHO', 'CHI_TIET_GIU_CHO']) {
    assert.doesNotMatch(
      sql,
      new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+(?:public\\.)?"?${tbl}"?\\b`, 'i'),
      `Simulator must never write to ${tbl}`,
    );
  }

  // Verification header note
  assert.match(rawSql, /npm run check[\s\S]*does[\s\S]*NOT execute SQL/i);
  assert.match(rawSql, /\bUNVERIFIED\b/);
});

test('sprint2 demand simulator pgTAP rejects case-variant moPhong, keeps Event B untouched, and plan matches', () => {
  const pgtap = stripSqlComments(readFileSync(PGTAP_PATH, 'utf8'));

  for (const variant of ['TRUE', 'True']) {
    assert.match(
      pgtap,
      new RegExp(`"moPhong"\\s*:\\s*"${variant}"`),
      `pgTAP must set moPhong to the JSON string "${variant}"`,
    );
  }
  const flagRejects = pgtap.match(/'55000'\s*,\s*'MO_PHONG_CHUA_BAT'/g) ?? [];
  assert.ok(
    flagRejects.length >= 4,
    `Expected >= 4 throws_ok 55000 MO_PHONG_CHUA_BAT (false, "TRUE", "True", missing config); got ${flagRejects.length}`,
  );
  // Each variant UPDATE must be followed by a 55000 throws_ok before the next UPDATE of the config.
  for (const variant of ['TRUE', 'True']) {
    const m = pgtap.match(
      new RegExp(`"moPhong"\\s*:\\s*"${variant}"[\\s\\S]*?throws_ok\\([\\s\\S]*?'55000'\\s*,\\s*'MO_PHONG_CHUA_BAT'`),
    );
    assert.ok(m, `"${variant}" must be followed by throws_ok 55000 MO_PHONG_CHUA_BAT`);
    assert.ok(!/UPDATE\s+public\."CAU_HINH_SU_KIEN"/i.test(m[0].slice(10)), `"${variant}" rejection must precede any further config UPDATE`);
  }

  // Event B seats (9954xx) are never updated.
  const updates = [...pgtap.matchAll(/UPDATE\s+public\."GHE"[\s\S]*?;/gi)].map((x) => x[0]);
  for (const stmt of updates) {
    assert.doesNotMatch(stmt, /"GheID"\s*(=|IN|BETWEEN)[^;]*\b9954\d\d\b/i, 'No UPDATE on GHE may touch Event B seats (9954xx)');
  }

  const planMatch = pgtap.match(/SELECT plan\((\d+)\);/);
  assert.ok(planMatch, 'pgTAP file must declare SELECT plan(N)');
  const calls = pgtap.match(/\bSELECT\s+(is|isnt|ok|throws_ok|lives_ok|has_table|has_trigger|function_returns|results_eq)\(/g) ?? [];
  assert.equal(calls.length, Number(planMatch[1]), `plan(${planMatch[1]}) must equal assertion count (${calls.length}), comments ignored`);
});

test('sprint2 demand simulator pgTAP test is plain SQL with matching plan count', () => {
  const pgtap = readFileSync(PGTAP_PATH, 'utf8');
  const planMatch = pgtap.match(/SELECT plan\((\d+)\);/);
  assert.ok(planMatch, 'pgTAP file must declare SELECT plan(N)');
  const planned = Number(planMatch[1]);

  const assertions = pgtap.match(/SELECT (is|ok|throws_ok|lives_ok|has_table|has_trigger|function_returns)\(/g) ?? [];
  assert.equal(assertions.length, planned, `pgTAP plan(${planned}) must match actual assertion count (${assertions.length})`);
  assert.doesNotMatch(pgtap, /\\gset/, 'pgTAP file must be plain SQL without psql meta-commands');
  assert.doesNotMatch(
    pgtap,
    /has_function_privilege\(\s*'public'/i,
    "pgTAP must not pass 'public' to has_function_privilege",
  );
  assert.match(
    pgtap,
    /aclexplode\(COALESCE\([^)]*proacl,\s*acldefault\('f'/,
    'pgTAP must inspect pg_proc.proacl with acldefault fallback for PUBLIC EXECUTE',
  );
  assert.match(pgtap, /grantee = 0/);
  assert.match(pgtap, /privilege_type = 'EXECUTE'/);
  assert.match(pgtap, /BEGIN;/);
  assert.match(pgtap, /SELECT \* FROM finish\(\);/);
  assert.match(pgtap, /ROLLBACK;/);
});
