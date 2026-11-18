import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const MIGRATION_URL = new URL('../supabase/migrations/20261112110000_sprint2_pricing_security.sql', import.meta.url);
const PRICING_TABLES = ['QUY_TAC_GIA', 'DE_XUAT_GIA', 'NHAT_KY_GIA'];

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

test('sprint2 pricing security migration locks down all 3 tables with RLS, privileges, and SELECT-only policies', async () => {
  const rawSql = await readFile(MIGRATION_URL, 'utf8');
  const sql = stripSqlComments(rawSql);

  for (const table of PRICING_TABLES) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE public\\."${table}" ENABLE ROW LEVEL SECURITY;`),
      `${table} must have ENABLE ROW LEVEL SECURITY`,
    );

    assert.match(
      sql,
      new RegExp(`REVOKE INSERT,\\s*UPDATE,\\s*DELETE,\\s*TRUNCATE ON public\\."${table}" FROM PUBLIC,\\s*anon,\\s*authenticated;`),
      `${table} must revoke INSERT, UPDATE, DELETE, TRUNCATE from PUBLIC, anon, authenticated`,
    );

    assert.match(
      sql,
      new RegExp(`REVOKE SELECT ON public\\."${table}" FROM PUBLIC,\\s*anon;`),
      `${table} must revoke SELECT from PUBLIC, anon`,
    );

    assert.match(
      sql,
      new RegExp(`GRANT SELECT ON public\\."${table}" TO authenticated;`),
      `${table} must grant SELECT to authenticated`,
    );

    const policyMatch = sql.match(
      new RegExp(
        `DROP POLICY IF EXISTS ("[^"]+") ON public\\."${table}";\\s*CREATE POLICY \\1\\s+ON public\\."${table}"\\s+FOR SELECT\\s+TO authenticated\\s+USING\\s*\\(([\\s\\S]*?)\\);`,
      ),
    );
    assert.ok(policyMatch, `${table} must have an idempotent FOR SELECT TO authenticated policy`);

    const policyBody = policyMatch[2];
    assert.match(policyBody, /FROM public\."KHU_VUC" kv/);
    assert.match(policyBody, /JOIN public\."SUAT_DIEN" sd ON sd\."SuatDienID" = kv\."SuatDienID"/);
    assert.match(policyBody, /JOIN public\."SU_KIEN" sk ON sk\."SuKienID" = sd\."SuKienID"/);
    assert.match(
      policyBody,
      new RegExp(`kv\\."KhuVucID"\\s*=\\s*"${table}"\\."KhuVucID"`),
      `${table} policy must qualify "${table}"."KhuVucID"`,
    );
    assert.match(
      policyBody,
      /public\.la_thanh_vien_to_chuc\(sk\."ToChucID"\)/,
      `${table} policy must call public.la_thanh_vien_to_chuc(sk."ToChucID")`,
    );
  }

  assert.doesNotMatch(
    sql,
    /FOR\s+(ALL|INSERT|UPDATE|DELETE)\b/i,
    'Migration must only define FOR SELECT policies',
  );
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i, 'Migration must never drop tables');
  assert.doesNotMatch(
    sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.la_thanh_vien_to_chuc/i,
    'Migration must not redefine public.la_thanh_vien_to_chuc',
  );
  assert.doesNotMatch(sql, /co_quyen_bien_tap_to_chuc/i, 'Policies must use la_thanh_vien_to_chuc, not editor helper');
  assert.doesNotMatch(sql, /TrangThaiCongBo/i, 'Pricing tables must not expose a public-event branch');
});

test('sprint2 pricing security migration protects NHAT_KY_GIA with an unconditional immutability trigger', async () => {
  const rawSql = await readFile(MIGRATION_URL, 'utf8');
  const sql = stripSqlComments(rawSql);

  const fnMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.chan_sua_xoa_nhat_ky_gia\(\)([\s\S]*?)\$\$;/,
  );
  assert.ok(fnMatch, 'Must define public.chan_sua_xoa_nhat_ky_gia()');

  const fnDef = fnMatch[1];
  assert.match(fnDef, /RETURNS TRIGGER/i);
  assert.match(fnDef, /LANGUAGE plpgsql/i);
  assert.match(fnDef, /SET search_path = public/i);
  assert.doesNotMatch(fnDef, /SECURITY DEFINER/i, 'Trigger function must stay SECURITY INVOKER');
  assert.match(fnDef, /RAISE EXCEPTION\b/i);
  assert.match(fnDef, /TG_OP/);
  assert.match(fnDef, /ERRCODE\s*=\s*'[0-9A-Z]{5}'/);
  assert.doesNotMatch(
    fnDef,
    /(service_role|current_user|session_user|auth\.role)/i,
    'Trigger function must not have any role bypass branch',
  );

  assert.match(
    sql,
    /DROP TRIGGER IF EXISTS chan_sua_xoa_nhat_ky_gia ON public\."NHAT_KY_GIA";\s*CREATE TRIGGER chan_sua_xoa_nhat_ky_gia\s+BEFORE UPDATE OR DELETE ON public\."NHAT_KY_GIA"\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.chan_sua_xoa_nhat_ky_gia\(\);/,
    'Must idempotently create BEFORE UPDATE OR DELETE trigger on public."NHAT_KY_GIA"',
  );

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.chan_sua_xoa_nhat_ky_gia\(\) FROM PUBLIC,\s*anon,\s*authenticated;/,
    'Must revoke ALL on trigger function from PUBLIC, anon, authenticated',
  );
  assert.doesNotMatch(
    sql,
    /GRANT\s+(EXECUTE|ALL)\s+ON\s+FUNCTION\s+public\.chan_sua_xoa_nhat_ky_gia/i,
    'Must not grant EXECUTE on trigger function',
  );
});

test('sprint2 pricing security pgTAP test is plain SQL with matching plan count', async () => {
  const pgtap = await readFile(new URL('../supabase/tests/sprint2_pricing_security.sql', import.meta.url), 'utf8');
  const planMatch = pgtap.match(/SELECT plan\((\d+)\);/);
  assert.ok(planMatch, 'pgTAP file must declare SELECT plan(N)');
  const planned = Number(planMatch[1]);

  const assertions = pgtap.match(/SELECT (is|throws_ok|has_trigger|function_returns)\(/g) ?? [];
  assert.equal(assertions.length, planned, `pgTAP plan(${planned}) must match actual assertion count (${assertions.length})`);
  assert.doesNotMatch(pgtap, /\\gset/, 'pgTAP file must be plain SQL without psql meta-commands');
  assert.doesNotMatch(
    pgtap,
    /has_function_privilege\(\s*'public'/i,
    "pgTAP must not pass 'public' to has_function_privilege (PUBLIC is an ACL entry, not a role)",
  );
  assert.match(
    pgtap,
    /aclexplode\(COALESCE\([^)]*proacl, acldefault\('f'/,
    'pgTAP must inspect pg_proc.proacl with acldefault fallback for PUBLIC EXECUTE',
  );
  assert.match(pgtap, /grantee = 0/, 'pgTAP must check PUBLIC ACL grantee = 0');
  assert.match(pgtap, /privilege_type = 'EXECUTE'/, 'pgTAP must check EXECUTE privilege_type');
  assert.match(pgtap, /BEGIN;/);
  assert.match(pgtap, /SELECT \* FROM finish\(\);/);
  assert.match(pgtap, /ROLLBACK;/);
});
