-- Dau van tay cau truc schema public (cot, rang buoc, chi muc, policy, trigger, ham, quyen, RLS, publication) de so sanh hai CSDL.
-- Chay bang: supabase db query --remote=<ref> --read-only -f docs/sprint2-supabase/fingerprint-cau-truc.sql -o json (hoac psql), roi sap xep va so dong bang comm/diff.
-- Bo cac dong lien quan pg_all_foreign_keys, tap_funky (pgTAP) va messages_YYYY_MM_DD (Realtime) khi so sanh.
WITH cols AS (
  SELECT 'COL '||table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' def='||coalesce(regexp_replace(column_default,'\s+',' ','g'),'') AS l
  FROM information_schema.columns WHERE table_schema='public'),
cons AS (
  SELECT 'CON '||c.conrelid::regclass::text||' '||c.conname||' '||c.contype::text AS l FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
idx AS (SELECT 'IDX '||tablename||' '||indexname AS l FROM pg_indexes WHERE schemaname='public'),
pol AS (SELECT 'POL '||tablename||' '||policyname||' '||cmd||' '||roles::text||' '||md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) AS l FROM pg_policies WHERE schemaname='public'),
trg AS (SELECT 'TRG '||c.relname||' '||t.tgname AS l FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
fn AS (SELECT 'FN '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') secdef='||p.prosecdef||' cfg='||coalesce(array_to_string(p.proconfig,','),'')||' body='||md5(regexp_replace(p.prosrc,'\s+','','g')) AS l FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')),
fpriv AS (SELECT 'FPRIV '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||r||'='||has_function_privilege(r,p.oid,'EXECUTE') AS l FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, (VALUES ('anon'),('authenticated'),('service_role')) v(r) WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')),
tpriv AS (SELECT 'TPRIV '||c.relname||' '||r||' '||string_agg(pr,',' ORDER BY pr) AS l FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, (VALUES ('anon'),('authenticated'),('service_role')) v(r), (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) q(pr) WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege(r,c.oid,pr) GROUP BY c.relname,r),
rls AS (SELECT 'RLS '||c.relname||' '||c.relrowsecurity AS l FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
pub AS (SELECT 'PUB '||pubname||' '||tablename AS l FROM pg_publication_tables)
SELECT l FROM (SELECT * FROM cols UNION ALL SELECT * FROM cons UNION ALL SELECT * FROM idx UNION ALL SELECT * FROM pol UNION ALL SELECT * FROM trg UNION ALL SELECT * FROM fn UNION ALL SELECT * FROM fpriv UNION ALL SELECT * FROM tpriv UNION ALL SELECT * FROM rls UNION ALL SELECT * FROM pub) x ORDER BY l;
