import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  REQUIRED_ENV,
  SKIPPED,
  evaluate,
  missingEnv,
  raceApprovals,
  runConcurrencyApprove,
} from '../scripts/concurrency-approve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'concurrency-approve.mjs');

/**
 * In-memory fake Supabase client factory supporting the exact query/auth/RPC surface
 * used by scripts/concurrency-approve.mjs. No network calls.
 */
function createFakeSupabase(options = {}) {
  const state = {
    seq: 1,
    users: new Map(), // id -> {id, email, password, loaiTaiKhoan}
    tokens: new Map(), // token -> userId
    tables: {
      HO_SO_NGUOI_DUNG: [],
      TO_CHUC: [],
      THANH_VIEN_TO_CHUC: [],
      SU_KIEN: [],
      SUAT_DIEN: [],
      KHU_VUC: [],
      QUY_TAC_GIA: [],
      DE_XUAT_GIA: [],
      NHAT_KY_GIA: [],
    },
    inFlightRpc: 0,
    maxInFlightRpc: 0,
    createClientCalls: 0,
    filterCalls: [], // {op, table, col, val}
    deleteUserCalls: [],
    getUserByIdCalls: [],
    rpcCalls: [],
  };

  let barrierReached;
  const bothInFlight = new Promise((resolve) => {
    barrierReached = resolve;
  });

  const pkFor = {
    TO_CHUC: 'ToChucID',
    THANH_VIEN_TO_CHUC: 'ID',
    SU_KIEN: 'SuKienID',
    SUAT_DIEN: 'SuatDienID',
    KHU_VUC: 'KhuVucID',
    QUY_TAC_GIA: 'QuyTacGiaID',
    DE_XUAT_GIA: 'DeXuatID',
    NHAT_KY_GIA: 'NhatKyGiaID',
    HO_SO_NGUOI_DUNG: 'NguoiDungID',
  };

  function matchRows(table, filters) {
    const rows = state.tables[table] ?? [];
    return rows.filter((row) =>
      filters.every((f) =>
        f.type === 'eq' ? row[f.col] === f.val : f.vals.includes(row[f.col]),
      ),
    );
  }

  function hasAuditBlockForProposal(proposalId) {
    return state.tables.NHAT_KY_GIA.some((r) => r.DeXuatID === proposalId);
  }

  function hasAuditBlockForZone(zoneId) {
    return state.tables.NHAT_KY_GIA.some((r) => r.KhuVucID === zoneId);
  }

  function hasAuditBlockForUser(userId) {
    return (
      state.tables.NHAT_KY_GIA.some((r) => r.NguoiThucHienID === userId) ||
      state.tables.DE_XUAT_GIA.some((r) => r.NguoiDuyetID === userId)
    );
  }

  function defaultDelete(table, filters) {
    const rows = state.tables[table] ?? [];
    const targets = matchRows(table, filters);

    if (options.simulateRestrict) {
      if (table === 'NHAT_KY_GIA' && targets.length) {
        return {error: {code: '42501', message: 'NHAT_KY_GIA la nhat ky bat bien'}};
      }
      if (
        table === 'DE_XUAT_GIA' &&
        targets.some((r) => hasAuditBlockForProposal(r.DeXuatID))
      ) {
        return {
          error: {
            code: '23503',
            message: 'update or delete on table "DE_XUAT_GIA" violates foreign key constraint on "NHAT_KY_GIA"',
          },
        };
      }
      if (
        table === 'QUY_TAC_GIA' &&
        targets.some((r) =>
          state.tables.DE_XUAT_GIA.some(
            (d) => d.QuyTacGiaID === r.QuyTacGiaID && hasAuditBlockForProposal(d.DeXuatID),
          ),
        )
      ) {
        return {
          error: {
            code: '23503',
            message: 'delete on table "QUY_TAC_GIA" violates foreign key constraint via DE_XUAT_GIA',
          },
        };
      }
      if (
        table === 'KHU_VUC' &&
        targets.some((r) => hasAuditBlockForZone(r.KhuVucID))
      ) {
        return {
          error: {
            code: '23503',
            message: 'update or delete on table "KHU_VUC" violates foreign key constraint on "NHAT_KY_GIA"',
          },
        };
      }
      if (
        table === 'SUAT_DIEN' &&
        targets.some((r) =>
          state.tables.KHU_VUC.some(
            (k) => k.SuatDienID === r.SuatDienID && hasAuditBlockForZone(k.KhuVucID),
          ),
        )
      ) {
        return {
          error: {
            code: '23503',
            message: 'delete on table "SUAT_DIEN" violates foreign key constraint via KHU_VUC',
          },
        };
      }
      if (
        table === 'SU_KIEN' &&
        targets.some((r) =>
          state.tables.KHU_VUC.some(
            (k) => k.SuKienID === r.SuKienID && hasAuditBlockForZone(k.KhuVucID),
          ),
        )
      ) {
        return {
          error: {
            code: '23503',
            message: 'delete on table "SU_KIEN" violates foreign key constraint via KHU_VUC',
          },
        };
      }
      if (
        table === 'TO_CHUC' &&
        targets.some((r) =>
          state.tables.SU_KIEN.some((e) => e.ToChucID === r.ToChucID),
        )
      ) {
        return {
          error: {
            code: '23503',
            message: 'delete on table "TO_CHUC" violates foreign key constraint on "SU_KIEN"',
          },
        };
      }
    }

    const targetSet = new Set(targets);
    state.tables[table] = rows.filter((r) => !targetSet.has(r));
    return {error: null};
  }

  function makeQuery(table, mode, payload) {
    const filters = [];
    const execute = async () => {
      if (mode === 'insert') {
        const pk = pkFor[table];
        const row = {...payload, [pk]: state.seq++};
        state.tables[table].push(row);
        return {data: row, error: null};
      }
      if (mode === 'select') {
        return {data: matchRows(table, filters).map((r) => ({...r})), error: null};
      }
      if (mode === 'delete') {
        if (options.onDelete) {
          const custom = await options.onDelete(table, filters, state);
          if (custom !== undefined) return custom;
        }
        return defaultDelete(table, filters);
      }
      throw new Error(`Unknown query mode: ${mode}`);
    };

    const builder = {
      eq(col, val) {
        state.filterCalls.push({op: `${mode}.eq`, table, col, val});
        filters.push({type: 'eq', col, val});
        return builder;
      },
      in(col, vals) {
        state.filterCalls.push({op: `${mode}.in`, table, col, vals});
        filters.push({type: 'in', col, vals});
        return builder;
      },
      select() {
        return builder;
      },
      single() {
        return execute();
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };
    return builder;
  }

  async function defaultApproveRpc(userId, params) {
    const proposal = state.tables.DE_XUAT_GIA.find(
      (d) => d.DeXuatID === params.p_de_xuat_id,
    );
    if (!proposal) {
      return {data: null, error: {code: '42501', message: 'Khong co quyen duyet de xuat gia'}};
    }
    if (proposal.TrangThaiDuyet !== 'PENDING') {
      return {data: null, error: {code: 'PT409', message: 'DE_XUAT_DA_XU_LY'}};
    }
    const zone = state.tables.KHU_VUC.find((k) => k.KhuVucID === proposal.KhuVucID);
    const oldPrice = zone.GiaVeNiemYet;
    const newPrice = params.p_gia_dieu_chinh ?? proposal.GiaDeXuat;

    zone.GiaVeNiemYet = options.priceAsString ? String(newPrice) : newPrice;
    proposal.TrangThaiDuyet = 'APPROVED';
    proposal.NguoiDuyetID = userId;
    const logId = state.seq++;
    state.tables.NHAT_KY_GIA.push({
      NhatKyGiaID: logId,
      KhuVucID: zone.KhuVucID,
      DeXuatID: proposal.DeXuatID,
      LoaiBienDong: 'DUYET_DE_XUAT_AI',
      GiaCu: oldPrice,
      GiaMoi: newPrice,
      NguoiThucHienID: userId,
    });
    return {
      data: {
        ketQua: 'DA_DUYET',
        deXuatId: proposal.DeXuatID,
        nhatKyGiaId: logId,
        nguoiDuyetId: userId,
        giaMoi: newPrice,
      },
      error: null,
    };
  }

  function createClient(_url, _key, opts = {}) {
    state.createClientCalls += 1;
    if (typeof opts.accessToken === 'function') {
      return {
        async rpc(fnName, params) {
          const token = await opts.accessToken();
          const userId = state.tokens.get(token);
          state.rpcCalls.push({fnName, userId, params});
          state.inFlightRpc += 1;
          state.maxInFlightRpc = Math.max(state.maxInFlightRpc, state.inFlightRpc);

          try {
            if (options.requireBarrier && state.inFlightRpc < 2) {
              await Promise.race([
                bothInFlight,
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error('RPC calls did not overlap concurrently')),
                    400,
                  ),
                ),
              ]);
            } else if (state.inFlightRpc >= 2) {
              barrierReached();
            }

            if (options.onApproveRpc) {
              return await options.onApproveRpc({userId, params, state, defaultApproveRpc});
            }
            return await defaultApproveRpc(userId, params);
          } finally {
            state.inFlightRpc -= 1;
          }
        },
      };
    }

    return {
      auth: {
        admin: {
          async createUser({email, password}) {
            if (options.onCreateUser) {
              const custom = await options.onCreateUser({email, password, state});
              if (custom) return custom;
            }
            const id = `user-${state.seq++}`;
            state.users.set(id, {id, email, password, loaiTaiKhoan: 'USER'});
            state.tables.HO_SO_NGUOI_DUNG.push({NguoiDungID: id, Email: email});
            return {data: {user: {id}}, error: null};
          },
          async deleteUser(id) {
            state.deleteUserCalls.push(id);
            if (options.simulateRestrict && hasAuditBlockForUser(id)) {
              return {error: {code: '23503', message: 'Database error deleting user (RESTRICT)'}};
            }
            state.users.delete(id);
            state.tables.HO_SO_NGUOI_DUNG = state.tables.HO_SO_NGUOI_DUNG.filter(
              (r) => r.NguoiDungID !== id,
            );
            return {error: null};
          },
          async getUserById(id) {
            state.getUserByIdCalls.push(id);
            const user = state.users.get(id) ?? null;
            if (!user) return {data: {user: null}, error: {status: 404, message: 'User not found'}};
            return {data: {user}, error: null};
          },
        },
        async signInWithPassword({email, password}) {
          const user = [...state.users.values()].find((u) => u.email === email);
          if (!user || user.password !== password) {
            return {data: {session: null}, error: {message: 'Invalid login credentials'}};
          }
          const token = `tok-${state.seq++}`;
          state.tokens.set(token, user.id);
          return {data: {session: {access_token: token}}, error: null};
        },
      },
      async rpc(fnName, params) {
        if (fnName === 'gan_loai_tai_khoan') {
          const user = [...state.users.values()].find((u) => u.email === params.p_email);
          if (!user) return {error: {message: 'User not found'}};
          user.loaiTaiKhoan = params.p_loai;
          return {error: null};
        }
        return {error: {message: `Unexpected admin rpc: ${fnName}`}};
      },
      from(table) {
        return {
          insert(payload) {
            return makeQuery(table, 'insert', payload);
          },
          select() {
            return makeQuery(table, 'select');
          },
          delete() {
            return makeQuery(table, 'delete');
          },
        };
      },
    };
  }

  return {createClient, state};
}

// ---------------------------------------------------------------------------
// (a) Static checks
// ---------------------------------------------------------------------------
test('scripts/concurrency-approve.mjs satisfies static security and contract invariants', async () => {
  const src = await readFile(SCRIPT_PATH, 'utf8');

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

  // No hardcoded JWT- or Supabase key-looking literals.
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}\./, 'Must not contain JWT-like literals');
  assert.doesNotMatch(src, /\bsb_[A-Za-z0-9_-]{8,}/, 'Must not contain sb_ key-like literals');
  assert.doesNotMatch(src, /\bsbp_[A-Za-z0-9_-]{8,}/, 'Must not contain sbp_ key-like literals');

  // Never bypass triggers or bulk-delete.
  assert.doesNotMatch(src, /\bTRUNCATE\b/i, 'Must never TRUNCATE');
  assert.doesNotMatch(src, /DISABLE\s+TRIGGER/i, 'Must never DISABLE TRIGGER');
  assert.doesNotMatch(src, /session_replication_role/i, 'Must never touch session_replication_role');

  // Real auth sessions, approval RPC, PT409 conflict, and finally cleanup.
  assert.match(src, /signInWithPassword/, 'Must sign in real Auth sessions');
  assert.match(src, /duyet_de_xuat_gia/, 'Must call duyet_de_xuat_gia RPC');
  assert.match(src, /\bPT409\b/, 'Must check SQLSTATE PT409');
  assert.match(src, /\bfinally\s*\{/, 'Must clean up fixtures inside a finally block');
});

// ---------------------------------------------------------------------------
// (b) Missing env vars via spawnSync, direct throw, and safe dynamic import
// ---------------------------------------------------------------------------
test('scripts/concurrency-approve.mjs exits non-zero, names missing env vars, and never leaks secrets', () => {
  const baseEnv = {...process.env};
  delete baseEnv.SUPABASE_URL;
  delete baseEnv.SUPABASE_SERVICE_ROLE_KEY;

  const fakeSecretKey = 'fake-service-role-secret-do-not-print-987654';
  const urlMissing = spawnSync(process.execPath, [SCRIPT_PATH], {
    env: {...baseEnv, SUPABASE_SERVICE_ROLE_KEY: fakeSecretKey},
    encoding: 'utf8',
  });
  assert.notEqual(urlMissing.status, 0, 'Must exit non-zero when SUPABASE_URL is missing');
  assert.match(urlMissing.stderr, /SUPABASE_URL/, 'stderr must name missing SUPABASE_URL');
  assert.equal(
    urlMissing.stdout.includes(fakeSecretKey) || urlMissing.stderr.includes(fakeSecretKey),
    false,
    'Must never print service role key in stdout or stderr',
  );

  const fakeUrl = 'https://secret-project.invalid';
  const keyMissing = spawnSync(process.execPath, [SCRIPT_PATH], {
    env: {...baseEnv, SUPABASE_URL: fakeUrl},
    encoding: 'utf8',
  });
  assert.notEqual(
    keyMissing.status,
    0,
    'Must exit non-zero when SUPABASE_SERVICE_ROLE_KEY is missing',
  );
  assert.match(
    keyMissing.stderr,
    /SUPABASE_SERVICE_ROLE_KEY/,
    'stderr must name missing SUPABASE_SERVICE_ROLE_KEY',
  );
});

test('importing scripts/concurrency-approve.mjs does not auto-run or call createClient, and missingEnv stops early', async () => {
  // Importing in a clean child process with no env must exit 0 with no output.
  const sub = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {REQUIRED_ENV} from ${JSON.stringify(pathToFileURL(SCRIPT_PATH).href)}; console.log(REQUIRED_ENV.length);`,
    ],
    {env: {PATH: process.env.PATH}, encoding: 'utf8'},
  );
  assert.equal(sub.status, 0, `Importing module must not run main: ${sub.stderr}`);
  assert.equal(sub.stdout.trim(), '2');

  assert.deepEqual(REQUIRED_ENV, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  assert.deepEqual(missingEnv({}), ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  assert.deepEqual(missingEnv({SUPABASE_URL: 'https://x.invalid'}), ['SUPABASE_SERVICE_ROLE_KEY']);
  assert.ok(Array.isArray(SKIPPED) && SKIPPED.length > 0);

  let createClientCalls = 0;
  await assert.rejects(
    () =>
      runConcurrencyApprove({
        env: {SUPABASE_URL: 'https://x.invalid'},
        createClient: () => {
          createClientCalls += 1;
          return {};
        },
      }),
    /Missing environment variable: SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.equal(createClientCalls, 0, 'Must fail before calling createClient');
});

// ---------------------------------------------------------------------------
// (c) True concurrent dispatch via barrier (maxInFlight === 2)
// ---------------------------------------------------------------------------
test('raceApprovals and runConcurrencyApprove dispatch both RPC calls concurrently via barrier', async () => {
  const {createClient, state} = createFakeSupabase({
    requireBarrier: true,
    priceAsString: true,
    simulateRestrict: true,
  });

  const report = await Promise.race([
    runConcurrencyApprove({
      env: {
        SUPABASE_URL: 'https://fake.supabase.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'fake-key-for-unit-test',
      },
      createClient,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Test timed out')), 1500)),
  ]);

  assert.equal(state.maxInFlightRpc, 2, 'Both duyet_de_xuat_gia calls must be in flight simultaneously');
  assert.equal(report.setupError, null);
  assert.equal(report.pass, true);
  assert.equal(report.calls.length, 2);
  assert.equal(report.calls.filter((c) => c.ok).length, 1);
  assert.equal(report.calls.filter((c) => !c.ok && c.code === 'PT409').length, 1);
  assert.ok(report.winnerId);
  assert.equal(report.observed.trangThai, 'APPROVED');
  assert.equal(report.observed.nguoiDuyetId, report.winnerId);
  assert.equal(Number(report.observed.gia), 600000);
  assert.equal(report.observed.nhatKy.length, 1);
  assert.equal(report.verified, 'RESULT_OF_THIS_RUN_ONLY');
});

test('raceApprovals directly dispatches both clients before either settles', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let releaseBoth;
  const gate = new Promise((resolve) => {
    releaseBoth = resolve;
  });

  const makeClient = (win) => ({
    async rpc(name, params) {
      assert.equal(name, 'duyet_de_xuat_gia');
      assert.equal(params.p_gia_dieu_chinh, null);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight === 2) releaseBoth();
      await Promise.race([
        gate,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sequential call detected')), 300)),
      ]);
      inFlight -= 1;
      return win
        ? {data: {ketQua: 'DA_DUYET'}, error: null}
        : {data: null, error: {code: 'PT409', message: 'DE_XUAT_DA_XU_LY'}};
    },
  });

  const calls = await raceApprovals(
    [
      {userId: 'u1', client: makeClient(true)},
      {userId: 'u2', client: makeClient(false)},
    ],
    {deXuatId: 42},
  );
  assert.equal(maxInFlight, 2);
  assert.equal(calls[0].ok, true);
  assert.equal(calls[1].code, 'PT409');
});

// ---------------------------------------------------------------------------
// (d) Abnormal outcomes must produce pass = false
// ---------------------------------------------------------------------------
test('evaluate rejects abnormal concurrency and DB outcomes', () => {
  const baseExpected = {giaCu: 500000, giaDeXuat: 600000};
  const goodObserved = {
    trangThai: 'APPROVED',
    nguoiDuyetId: 'u1',
    gia: 600000,
    nhatKy: [{NguoiThucHienID: 'u1', GiaCu: 500000, GiaMoi: 600000, LoaiBienDong: 'DUYET_DE_XUAT_AI'}],
  };
  const goodCalls = [
    {call: 0, userId: 'u1', ok: true, code: null, message: null, rejected: false},
    {call: 1, userId: 'u2', ok: false, code: 'PT409', message: 'DE_XUAT_DA_XU_LY', rejected: false},
  ];

  assert.equal(evaluate({calls: goodCalls, observed: goodObserved, expected: baseExpected}).pass, true);

  // Both succeed
  assert.equal(
    evaluate({
      calls: [
        {call: 0, userId: 'u1', ok: true, code: null, message: null, rejected: false},
        {call: 1, userId: 'u2', ok: true, code: null, message: null, rejected: false},
      ],
      observed: goodObserved,
      expected: baseExpected,
    }).pass,
    false,
  );

  // Both fail
  assert.equal(
    evaluate({
      calls: [
        {call: 0, userId: 'u1', ok: false, code: 'PT409', message: 'DE_XUAT_DA_XU_LY', rejected: false},
        {call: 1, userId: 'u2', ok: false, code: 'PT409', message: 'DE_XUAT_DA_XU_LY', rejected: false},
      ],
      observed: goodObserved,
      expected: baseExpected,
    }).pass,
    false,
  );

  // Error code other than PT409 (e.g. 42501)
  assert.equal(
    evaluate({
      calls: [
        goodCalls[0],
        {call: 1, userId: 'u2', ok: false, code: '42501', message: 'permission denied', rejected: false},
      ],
      observed: goodObserved,
      expected: baseExpected,
    }).pass,
    false,
  );

  // One call rejected (network/exception)
  assert.equal(
    evaluate({
      calls: [
        goodCalls[0],
        {call: 1, userId: 'u2', ok: false, code: null, message: 'rejected: network', rejected: true},
      ],
      observed: goodObserved,
      expected: baseExpected,
    }).pass,
    false,
  );

  // 0 NHAT_KY_GIA rows
  assert.equal(
    evaluate({
      calls: goodCalls,
      observed: {...goodObserved, nhatKy: []},
      expected: baseExpected,
    }).pass,
    false,
  );

  // 2 NHAT_KY_GIA rows
  assert.equal(
    evaluate({
      calls: goodCalls,
      observed: {...goodObserved, nhatKy: [goodObserved.nhatKy[0], goodObserved.nhatKy[0]]},
      expected: baseExpected,
    }).pass,
    false,
  );

  // NguoiDuyetID is not the winner
  assert.equal(
    evaluate({
      calls: goodCalls,
      observed: {...goodObserved, nguoiDuyetId: 'u2'},
      expected: baseExpected,
    }).pass,
    false,
  );

  // NHAT_KY_GIA actor is not the winner
  assert.equal(
    evaluate({
      calls: goodCalls,
      observed: {
        ...goodObserved,
        nhatKy: [{...goodObserved.nhatKy[0], NguoiThucHienID: 'u2'}],
      },
      expected: baseExpected,
    }).pass,
    false,
  );

  // Wrong zone price
  assert.equal(
    evaluate({
      calls: goodCalls,
      observed: {...goodObserved, gia: 500000},
      expected: baseExpected,
    }).pass,
    false,
  );
});

// ---------------------------------------------------------------------------
// (e) Setup failure cleans up partial IDs and never touches null IDs
// ---------------------------------------------------------------------------
test('setup failure on second user cleans up user 1 and never passes null/undefined IDs', async () => {
  let userCreateCount = 0;
  const {createClient, state} = createFakeSupabase({
    onCreateUser() {
      userCreateCount += 1;
      if (userCreateCount === 2) {
        return {data: {user: null}, error: {message: 'simulated createUser 2 failure'}};
      }
      return null;
    },
  });

  const report = await runConcurrencyApprove({
    env: {
      SUPABASE_URL: 'https://fake.supabase.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-key-for-unit-test',
    },
    createClient,
  });

  assert.match(report.setupError ?? '', /simulated createUser 2 failure/);
  assert.equal(report.pass, false);
  assert.equal(state.deleteUserCalls.length, 1, 'User 1 created before failure must be deleted');
  assert.equal(state.users.size, 0, 'No auth user should remain');
  assert.equal(report.cleanup.ok, true);
  assert.deepEqual(report.cleanup.errors, []);
  assert.deepEqual(report.cleanup.leftovers, []);

  // Verify no cleanup or leftover check ever passed null or undefined as an ID.
  for (const call of state.filterCalls) {
    if (call.op.endsWith('.eq')) {
      assert.notEqual(call.val, null, `null passed to ${call.op} on ${call.table}.${call.col}`);
      assert.notEqual(call.val, undefined, `undefined passed to ${call.op} on ${call.table}.${call.col}`);
    } else if (call.op.endsWith('.in')) {
      assert.ok(Array.isArray(call.vals) && call.vals.length > 0);
      for (const v of call.vals) {
        assert.notEqual(v, null);
        assert.notEqual(v, undefined);
      }
    }
  }
  for (const id of [...state.deleteUserCalls, ...state.getUserByIdCalls]) {
    assert.ok(id, 'auth admin user ID must be non-empty');
  }
});

// ---------------------------------------------------------------------------
// (f) Honest cleanup reporting: RESTRICT blocked vs full clean
// ---------------------------------------------------------------------------
test('cleanup reports honest leftovers and errors when RESTRICT blocks deletes, yet still runs independent steps', async () => {
  const {createClient, state} = createFakeSupabase({
    requireBarrier: true,
    simulateRestrict: true,
  });

  const report = await runConcurrencyApprove({
    env: {
      SUPABASE_URL: 'https://fake.supabase.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-key-for-unit-test',
    },
    createClient,
  });

  assert.equal(report.pass, true);
  assert.equal(report.cleanup.ok, false, 'cleanup.ok must be false when audit/FK blocks removal');
  assert.ok(Array.isArray(report.skipped) && report.skipped.length > 0, 'skipped must not be empty');
  assert.ok(report.cleanup.errors.some((e) => e.includes('DE_XUAT_GIA') && e.includes('23503')));
  assert.ok(report.cleanup.errors.some((e) => e.includes('KHU_VUC') && e.includes('23503')));
  assert.ok(report.cleanup.leftovers.includes('NHAT_KY_GIA(1)'));
  assert.ok(report.cleanup.leftovers.includes('DE_XUAT_GIA(1)'));
  assert.ok(report.cleanup.leftovers.includes('KHU_VUC(1)'));
  assert.ok(
    report.cleanup.leftovers.includes(`auth.users(${report.winnerId})`),
    'Winner auth user blocked by RESTRICT must appear in leftovers',
  );

  // Independent steps after blocked deletes still executed:
  const loserCall = report.calls.find((c) => c.userId !== report.winnerId);
  assert.ok(loserCall);
  assert.ok(
    state.deleteUserCalls.includes(loserCall.userId),
    'Loser auth user deletion must still be attempted',
  );
  assert.equal(
    report.cleanup.leftovers.includes(`auth.users(${loserCall.userId})`),
    false,
    'Loser auth user should have been deleted cleanly',
  );
  assert.equal(
    state.tables.THANH_VIEN_TO_CHUC.length,
    0,
    'Independent THANH_VIEN_TO_CHUC cleanup must still succeed',
  );
});

test('cleanup reports ok=true when no NHAT_KY_GIA row blocks deletion and all created rows are removed', async () => {
  const {createClient, state} = createFakeSupabase({
    requireBarrier: true,
    simulateRestrict: true,
    onApproveRpc() {
      // Neither call writes NHAT_KY_GIA, so all created fixture rows & both users can be removed.
      return {data: null, error: {code: 'PT409', message: 'DE_XUAT_XUNG_DOT'}};
    },
  });

  const report = await runConcurrencyApprove({
    env: {
      SUPABASE_URL: 'https://fake.supabase.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-key-for-unit-test',
    },
    createClient,
  });

  assert.equal(report.pass, false);
  assert.equal(report.cleanup.ok, true);
  assert.deepEqual(report.cleanup.errors, []);
  assert.deepEqual(report.cleanup.leftovers, []);
  assert.equal(state.users.size, 0);
  assert.equal(state.tables.DE_XUAT_GIA.length, 0);
  assert.equal(state.tables.KHU_VUC.length, 0);
  assert.equal(state.tables.TO_CHUC.length, 0);
});
