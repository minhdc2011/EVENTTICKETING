import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'concurrency-limit.mjs');

test('scripts/concurrency-limit.mjs satisfies static security and behavior invariants', async () => {
  const src = await readFile(SCRIPT_PATH, 'utf8');

  // Only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are read from process.env.
  const staticEnvReads = [...src.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(staticEnvReads)].sort(),
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'],
    'Only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY may be read from process.env',
  );
  assert.doesNotMatch(src, /dotenv/i, 'Must not import or load dotenv');
  assert.doesNotMatch(src, /\bfs\b|node:fs|readFile/i, 'Must not read .env or other files from disk');
  assert.doesNotMatch(src, /['"`][^'"`\n]*\.env\b|env-file/i, 'Must not reference .env files');
  assert.doesNotMatch(src, /VITE_/, 'Must not read VITE_ env keys');
  assert.doesNotMatch(
    src,
    /NHAT_KY_GIA|NHAT_KY_DINH_GIA|QUY_TAC_GIA|DE_XUAT_GIA/,
    'Must not touch pricing or immutable audit tables',
  );

  // No hardcoded JWT- or Supabase key-looking literals.
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}\./, 'Must not contain JWT-like literals');
  assert.doesNotMatch(src, /\bsb_[A-Za-z0-9_-]{8,}/, 'Must not contain sb_ key-like literals');
  assert.doesNotMatch(src, /\bsbp_[A-Za-z0-9_-]{8,}/, 'Must not contain sbp_ key-like literals');

  // Real auth sessions, hold RPC, limit error, and finally cleanup.
  assert.match(src, /signInWithPassword/, 'Must sign in real Auth sessions');
  assert.match(src, /tao_giu_cho_theo_suat/, 'Must call tao_giu_cho_theo_suat RPC');
  assert.match(src, /VUOT_GIOI_HAN_VE/, 'Must check VUOT_GIOI_HAN_VE error message');
  assert.match(src, /\b22023\b/, 'Must check SQLSTATE 22023');
  assert.match(src, /\bfinally\s*\{/, 'Must clean up fixtures inside a finally block');
});

test('scripts/concurrency-limit.mjs exits non-zero and names missing env vars without network calls', () => {
  const baseEnv = {...process.env};
  delete baseEnv.SUPABASE_URL;
  delete baseEnv.SUPABASE_SERVICE_ROLE_KEY;

  const bothMissing = spawnSync(process.execPath, [SCRIPT_PATH], {
    env: baseEnv,
    encoding: 'utf8',
  });
  assert.notEqual(bothMissing.status, 0, 'Must exit non-zero when env vars are missing');
  assert.match(bothMissing.stderr, /SUPABASE_URL/, 'stderr must name missing SUPABASE_URL');

  const keyMissing = spawnSync(process.execPath, [SCRIPT_PATH], {
    env: {...baseEnv, SUPABASE_URL: 'https://example.invalid'},
    encoding: 'utf8',
  });
  assert.notEqual(keyMissing.status, 0, 'Must exit non-zero when SUPABASE_SERVICE_ROLE_KEY is missing');
  assert.match(
    keyMissing.stderr,
    /SUPABASE_SERVICE_ROLE_KEY/,
    'stderr must name missing SUPABASE_SERVICE_ROLE_KEY',
  );
});
