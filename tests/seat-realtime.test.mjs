import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_ZONE_FILTER_SIZE,
  VALID_SEAT_STATUSES,
  buildZoneInFilter,
  chunkArray,
  extractSeatRow,
  fetchShowZones,
  isSeatInShow,
  isValidSeatStatus,
  mapRealtimeSeatPayload,
  normalizeZoneId,
  subscribeToSeatUpdatesWithClient,
} from '../src/domain/seatRealtime.js';

function createMockSupabase({
  zoneRows = [
    {KhuVucID: 1, MaKhuVuc: 'VVIP'},
    {KhuVucID: 2, MaKhuVuc: 'VIP'},
  ],
  queryError = null,
  queryDelayMs = 0,
} = {}) {
  const registeredFilters = [];
  const changeHandlers = [];
  let statusHandler = null;
  let removedChannel = null;
  let channelCreated = null;
  let channelsCount = 0;

  const mockChannel = {
    on(eventType, filter, callback) {
      if (filter.table === 'GHE') {
        registeredFilters.push(filter);
        changeHandlers.push(callback);
      }
      return mockChannel;
    },
    subscribe(callback) {
      statusHandler = callback;
      return mockChannel;
    },
  };

  const supabase = {
    from(table) {
      assert.equal(table, 'KHU_VUC', 'Queries KHU_VUC table for zone resolution');
      return {
        select() {
          return {
            eq(col, val) {
              return {
                order() {
                  const exec = () => ({
                    data: queryError ? null : zoneRows,
                    error: queryError,
                  });
                  if (queryDelayMs > 0) {
                    return new Promise((resolve) =>
                      setTimeout(() => resolve(exec()), queryDelayMs),
                    );
                  }
                  return Promise.resolve(exec());
                },
              };
            },
          };
        },
      };
    },
    channel(topic) {
      channelsCount += 1;
      channelCreated = topic;
      return mockChannel;
    },
    removeChannel(ch) {
      removedChannel = ch;
      return Promise.resolve('ok');
    },
  };

  return {
    supabase,
    mockChannel,
    getChannelCreated: () => channelCreated,
    getChannelsCount: () => channelsCount,
    getRemovedChannel: () => removedChannel,
    getRegisteredFilters: () => registeredFilters,
    emitPayload: (payload, index) => {
      if (index !== undefined) {
        changeHandlers[index]?.(payload);
      } else {
        changeHandlers.forEach((fn) => fn(payload));
      }
    },
    emitStatus: (status) => statusHandler && statusHandler(status),
  };
}

test('VALID_SEAT_STATUSES and isValidSeatStatus enforce strict status taxonomy', () => {
  const expectedStatuses = ['TRONG', 'DA_BAN', 'DANG_GIU', 'KHONG_MO_BAN'];
  assert.equal(VALID_SEAT_STATUSES.size, 4);

  for (const st of expectedStatuses) {
    assert.ok(VALID_SEAT_STATUSES.has(st), `Contains status ${st}`);
    assert.equal(isValidSeatStatus(st), true, `${st} is valid status`);
  }

  assert.equal(isValidSeatStatus('INVALID'), false);
  assert.equal(isValidSeatStatus(''), false);
  assert.equal(isValidSeatStatus(null), false);
  assert.equal(isValidSeatStatus(undefined), false);
  assert.equal(isValidSeatStatus(123), false);
});

test('normalizeZoneId handles numbers and stringified integers defensively', () => {
  assert.equal(normalizeZoneId(1), 1);
  assert.equal(normalizeZoneId(42), 42);
  assert.equal(normalizeZoneId('1'), 1);
  assert.equal(normalizeZoneId('  99  '), 99);

  // Invalid IDs
  assert.equal(normalizeZoneId(0), null);
  assert.equal(normalizeZoneId(-1), null);
  assert.equal(normalizeZoneId(1.5), null);
  assert.equal(normalizeZoneId('abc'), null);
  assert.equal(normalizeZoneId(''), null);
  assert.equal(normalizeZoneId(null), null);
  assert.equal(normalizeZoneId(undefined), null);
});

test('chunkArray and buildZoneInFilter construct valid server-side in filters', () => {
  assert.equal(MAX_ZONE_FILTER_SIZE, 100);

  // Chunks array correctly
  const ids = Array.from({length: 105}, (_, i) => i + 1);
  const chunks = chunkArray(ids, 100);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[1].length, 5);

  // Builds in.(...) filter syntax
  assert.equal(buildZoneInFilter([1, 2, 3]), 'KhuVucID=in.(1,2,3)');
  assert.equal(buildZoneInFilter([42]), 'KhuVucID=in.(42)');
  assert.equal(buildZoneInFilter([]), '');
});

test('extractSeatRow unpacks nested Supabase payload.new or direct row', () => {
  const nested = {
    schema: 'public',
    table: 'GHE',
    new: {GheID: 10, KhuVucID: 1, MaGheDayDu: 'A1', TrangThai: 'TRONG'},
  };
  assert.deepEqual(extractSeatRow(nested), nested.new);

  const direct = {GheID: 10, KhuVucID: 1, MaGheDayDu: 'A1', TrangThai: 'TRONG'};
  assert.deepEqual(extractSeatRow(direct), direct);

  assert.equal(extractSeatRow(null), null);
  assert.equal(extractSeatRow(undefined), null);
  assert.equal(extractSeatRow('string'), null);
});

test('isSeatInShow checks zone membership strictly', () => {
  const allowed = new Set([1, 2, 3]);
  assert.equal(isSeatInShow(1, allowed), true);
  assert.equal(isSeatInShow('2', allowed), true);
  assert.equal(isSeatInShow(4, allowed), false);
  assert.equal(isSeatInShow('99', allowed), false);
  assert.equal(isSeatInShow(null, allowed), false);
  assert.equal(isSeatInShow(1, null), false);
});

test('mapRealtimeSeatPayload correctly delivers same-show seat updates', () => {
  const allowedZoneIds = new Set([1, 2]);
  const zoneCodesById = new Map([
    [1, 'VVIP_DIAMOND'],
    [2, 'VIP_PLATINUM'],
  ]);

  const rawPayload = {
    schema: 'public',
    table: 'GHE',
    commit_timestamp: '2026-10-27T10:00:00.000Z',
    new: {
      GheID: 5,
      KhuVucID: 1,
      MaGheDayDu: 'VVIP-A-05',
      TrangThai: 'DANG_GIU',
    },
  };

  const event = mapRealtimeSeatPayload(rawPayload, {
    allowedZoneIds,
    eventId: 'SUPER_CONCERT_2026',
    zoneCodesById,
  });

  assert.ok(event, 'Same-show payload maps to an event');
  assert.equal(event.type, 'SEAT_STATUS_CHANGED');
  assert.equal(event.eventId, 'SUPER_CONCERT_2026');
  assert.equal(event.seatId, 5);
  assert.equal(event.seatCode, 'VVIP-A-05');
  assert.equal(event.zoneCode, 'VVIP_DIAMOND');
  assert.equal(event.status, 'DANG_GIU');
  assert.equal(event.occurredAt, '2026-10-27T10:00:00.000Z');
});

test('mapRealtimeSeatPayload strictly ignores cross-show updates (client defense in depth)', () => {
  const allowedZoneIds = new Set([1, 2]); // Show A has zones 1, 2

  // Update for seat in Zone 99 (Show B)
  const crossShowPayload = {
    schema: 'public',
    table: 'GHE',
    new: {
      GheID: 101,
      KhuVucID: 99,
      MaGheDayDu: 'ZONE99-01',
      TrangThai: 'DA_BAN',
    },
  };

  const event = mapRealtimeSeatPayload(crossShowPayload, {
    allowedZoneIds,
    eventId: 'SUPER_CONCERT_2026',
  });

  assert.equal(event, null, 'Cross-show update must return null and be ignored');
});

test('mapRealtimeSeatPayload safely ignores malformed payloads', () => {
  const allowedZoneIds = new Set([1, 2]);
  const context = {allowedZoneIds, eventId: 'TEST_EVENT'};

  // 1. Missing KhuVucID
  assert.equal(
    mapRealtimeSeatPayload({new: {MaGheDayDu: 'A1', TrangThai: 'TRONG'}}, context),
    null,
  );

  // 2. Invalid KhuVucID type
  assert.equal(
    mapRealtimeSeatPayload({new: {KhuVucID: 'invalid', MaGheDayDu: 'A1', TrangThai: 'TRONG'}}, context),
    null,
  );

  // 3. Missing MaGheDayDu
  assert.equal(
    mapRealtimeSeatPayload({new: {KhuVucID: 1, TrangThai: 'TRONG'}}, context),
    null,
  );

  // 4. Empty MaGheDayDu
  assert.equal(
    mapRealtimeSeatPayload({new: {KhuVucID: 1, MaGheDayDu: '   ', TrangThai: 'TRONG'}}, context),
    null,
  );

  // 5. Invalid TrangThai
  assert.equal(
    mapRealtimeSeatPayload({new: {KhuVucID: 1, MaGheDayDu: 'A1', TrangThai: 'CORRUPTED'}}, context),
    null,
  );

  // 6. Null or primitive payload
  assert.equal(mapRealtimeSeatPayload(null, context), null);
  assert.equal(mapRealtimeSeatPayload(undefined, context), null);
  assert.equal(mapRealtimeSeatPayload('not an object', context), null);
  assert.equal(mapRealtimeSeatPayload({}, context), null);
  assert.equal(mapRealtimeSeatPayload({new: null}, context), null);
});

test('fetchShowZones resolves zones and handles legacy SuKienID fallback', async () => {
  // Case A: Modern schema with SuatDienID
  const mockModern = {
    from() {
      return {
        select() {
          return {
            eq(col, val) {
              assert.equal(col, 'SuatDienID');
              assert.equal(val, 10);
              return {
                order() {
                  return Promise.resolve({
                    data: [{KhuVucID: 1, MaKhuVuc: 'A'}, {KhuVucID: 2, MaKhuVuc: 'B'}],
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  const zonesModern = await fetchShowZones(mockModern, 10, 1);
  assert.equal(zonesModern.length, 2);
  assert.equal(zonesModern[0].KhuVucID, 1);
  assert.equal(zonesModern[0].MaKhuVuc, 'A');

  // Case B: Legacy fallback on error 42703 (undefined column)
  let fallbackInvoked = false;
  const mockLegacy = {
    from() {
      return {
        select() {
          return {
            eq(col, val) {
              if (col === 'SuatDienID') {
                return {
                  order() {
                    return Promise.resolve({
                      data: null,
                      error: {code: '42703', message: 'column SuatDienID does not exist'},
                    });
                  },
                };
              }
              if (col === 'SuKienID') {
                fallbackInvoked = true;
                assert.equal(val, 1);
                return {
                  order() {
                    return Promise.resolve({
                      data: [{KhuVucID: 9, MaKhuVuc: 'LEGACY'}],
                      error: null,
                    });
                  },
                };
              }
              throw new Error(`Unexpected col ${col}`);
            },
          };
        },
      };
    },
  };
  const zonesLegacy = await fetchShowZones(mockLegacy, 10, 1);
  assert.ok(fallbackInvoked, 'Fallback to SuKienID was executed');
  assert.equal(zonesLegacy.length, 1);
  assert.equal(zonesLegacy[0].KhuVucID, 9);
});

test('fetchShowZones propagates query errors honestly', async () => {
  const mockFailing = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve({
                    data: null,
                    error: {code: '50000', message: 'Database connection failed'},
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    () => fetchShowZones(mockFailing, 10, 1),
    (err) => Boolean(err && (err.message === 'Database connection failed' || err.code === '50000')),
    'Query error object is thrown',
  );
});

test('normal show registers an in filter containing only its zones on one channel', async () => {
  const mock = createMockSupabase({
    zoneRows: [
      {KhuVucID: 10, MaKhuVuc: 'Z10'},
      {KhuVucID: 20, MaKhuVuc: 'Z20'},
    ],
  });

  const receivedEvents = [];
  const statusHistory = [];

  const unsubscribe = subscribeToSeatUpdatesWithClient({
    supabase: mock.supabase,
    active: {eventId: 'CONCERT_1', eventDatabaseId: 1, showId: 1, showSlug: 'main'},
    listener: (e) => receivedEvents.push(e),
    onConnectionStatus: (s) => statusHistory.push(s),
  });

  // Initial status should be CONNECTING
  assert.deepEqual(statusHistory, ['CONNECTING']);

  // Wait for async zone query to resolve
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Exactly 1 channel created
  assert.equal(mock.getChannelsCount(), 1, 'Creates exactly 1 channel for the show');
  assert.ok(
    mock.getChannelCreated().startsWith('show-1-seats-'),
    'Channel is scoped to showId',
  );

  // Exactly 1 filter registered with server-side in.(10,20)
  const filters = mock.getRegisteredFilters();
  assert.equal(filters.length, 1, 'Registers 1 postgres_changes handler for <=100 zones');
  assert.equal(filters[0].filter, 'KhuVucID=in.(10,20)', 'Filter contains exactly show zones');

  mock.emitStatus('SUBSCRIBED');
  assert.deepEqual(statusHistory, ['CONNECTING', 'CONNECTED']);

  // Same-show update delivers
  mock.emitPayload({
    schema: 'public',
    table: 'GHE',
    commit_timestamp: '2026-10-27T10:30:00.000Z',
    new: {
      GheID: 101,
      KhuVucID: 10,
      MaGheDayDu: 'Z10-A-01',
      TrangThai: 'DA_BAN',
    },
  });

  assert.equal(receivedEvents.length, 1, 'Same-show update delivered');
  assert.equal(receivedEvents[0].seatCode, 'Z10-A-01');

  // Client-side cross-show guard remains active even if server sent unexpected zone
  mock.emitPayload({
    schema: 'public',
    table: 'GHE',
    new: {
      GheID: 999,
      KhuVucID: 999,
      MaGheDayDu: 'OUTSIDE-01',
      TrangThai: 'DA_BAN',
    },
  });

  assert.equal(receivedEvents.length, 1, 'Cross-show payload dropped by client defense in depth');

  unsubscribe();
  assert.ok(mock.getRemovedChannel(), 'Channel removed on unsubscribe');
});

test('101+ zones create two filtered handlers on one channel, each filter having <=100 values', async () => {
  // Generate 105 distinct zones
  const manyZones = Array.from({length: 105}, (_, i) => ({
    KhuVucID: i + 1,
    MaKhuVuc: `Z${i + 1}`,
  }));

  const mock = createMockSupabase({
    zoneRows: manyZones,
  });

  const receivedEvents = [];

  const unsubscribe = subscribeToSeatUpdatesWithClient({
    supabase: mock.supabase,
    active: {eventId: 'BIG_SHOW', eventDatabaseId: 1, showId: 5, showSlug: 'big'},
    listener: (e) => receivedEvents.push(e),
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  // Exactly ONE channel maintained
  assert.equal(mock.getChannelsCount(), 1, 'Only one channel created even with 100+ zones');

  // Exactly TWO handlers registered on the same channel
  const filters = mock.getRegisteredFilters();
  assert.equal(filters.length, 2, 'Two handlers registered for 105 zones');

  // Parse IDs from filter strings to verify count <= 100
  const match1 = filters[0].filter.match(/^KhuVucID=in\.\((.+)\)$/);
  assert.ok(match1, 'Filter 1 matches KhuVucID=in.(...) format');
  const ids1 = match1[1].split(',').map(Number);
  assert.equal(ids1.length, 100, 'Chunk 1 has exactly 100 values');
  assert.equal(ids1[0], 1);
  assert.equal(ids1[99], 100);

  const match2 = filters[1].filter.match(/^KhuVucID=in\.\((.+)\)$/);
  assert.ok(match2, 'Filter 2 matches KhuVucID=in.(...) format');
  const ids2 = match2[1].split(',').map(Number);
  assert.equal(ids2.length, 5, 'Chunk 2 has remaining 5 values (<= 100)');
  assert.equal(ids2[0], 101);
  assert.equal(ids2[4], 105);

  // Updates from second chunk (zone 105) are received
  mock.emitPayload(
    {
      new: {
        GheID: 500,
        KhuVucID: 105,
        MaGheDayDu: 'Z105-01',
        TrangThai: 'TRONG',
      },
    },
    1,
  );

  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].seatCode, 'Z105-01');

  unsubscribe();
});

test('zero valid zones creates no global/unfiltered subscription and reports CONNECTED ready state', async () => {
  const mock = createMockSupabase({
    zoneRows: [], // 0 zones
  });

  const receivedEvents = [];
  const statusHistory = [];

  const unsubscribe = subscribeToSeatUpdatesWithClient({
    supabase: mock.supabase,
    active: {eventId: 'EMPTY_SHOW', eventDatabaseId: 1, showId: 99, showSlug: 'empty'},
    listener: (e) => receivedEvents.push(e),
    onConnectionStatus: (s) => statusHistory.push(s),
  });

  assert.deepEqual(statusHistory, ['CONNECTING']);

  await new Promise((resolve) => setTimeout(resolve, 10));

  // No channel created at all
  assert.equal(mock.getChannelsCount(), 0, 'No channel created when show has 0 zones');
  assert.equal(
    mock.getRegisteredFilters().length,
    0,
    'No unfiltered or global GHE subscription registered',
  );

  // Transitions deterministically to CONNECTED ready state without error
  assert.deepEqual(
    statusHistory,
    ['CONNECTING', 'CONNECTED'],
    'Transitions to CONNECTED ready state deterministically',
  );

  unsubscribe();
  assert.equal(receivedEvents.length, 0);
});

test('cleanup-before-setup race safety: unregistering while zone query is in flight aborts cleanly', async () => {
  const mock = createMockSupabase({
    zoneRows: [{KhuVucID: 1, MaKhuVuc: 'VIP'}],
    queryDelayMs: 20, // simulate in-flight network query
  });

  const receivedEvents = [];
  const statusHistory = [];

  const unsubscribe = subscribeToSeatUpdatesWithClient({
    supabase: mock.supabase,
    active: {eventId: 'CONCERT_1', eventDatabaseId: 1, showId: 1, showSlug: 'main'},
    listener: (e) => receivedEvents.push(e),
    onConnectionStatus: (s) => statusHistory.push(s),
  });

  assert.deepEqual(statusHistory, ['CONNECTING']);

  // Cancel immediately before the query resolves!
  unsubscribe();

  // Wait for the query delay to elapse
  await new Promise((resolve) => setTimeout(resolve, 40));

  // Channel should NEVER have been created or subscribed
  assert.equal(
    mock.getChannelsCount(),
    0,
    'No channel created when cleanup is called before setup completes',
  );
  assert.equal(receivedEvents.length, 0, 'No events delivered');
  // No status transition to CONNECTED or ERROR after cancellation
  assert.deepEqual(
    statusHistory,
    ['CONNECTING'],
    'Status did not transition after cancellation',
  );
});

test('reports connection status honestly for query failure, channel error, timeout, and close', async () => {
  // Case A: Query failure
  const mockQueryFail = createMockSupabase({
    queryError: {message: 'Zone lookup failed'},
  });
  const statusFail = [];
  subscribeToSeatUpdatesWithClient({
    supabase: mockQueryFail.supabase,
    active: {eventId: 'CONCERT_1', eventDatabaseId: 1, showId: 1, showSlug: 'main'},
    listener: () => {},
    onConnectionStatus: (s) => statusFail.push(s),
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(
    statusFail,
    ['CONNECTING', 'ERROR'],
    'Query failure honestly transitions to ERROR',
  );

  // Case B: Channel error
  const mockChError = createMockSupabase();
  const statusChErr = [];
  subscribeToSeatUpdatesWithClient({
    supabase: mockChError.supabase,
    active: {eventId: 'CONCERT_1', eventDatabaseId: 1, showId: 1, showSlug: 'main'},
    listener: () => {},
    onConnectionStatus: (s) => statusChErr.push(s),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  mockChError.emitStatus('CHANNEL_ERROR');
  assert.ok(statusChErr.includes('ERROR'), 'Channel error transitions to ERROR');

  // Case C: Timed out
  const mockTimeout = createMockSupabase();
  const statusTimeout = [];
  subscribeToSeatUpdatesWithClient({
    supabase: mockTimeout.supabase,
    active: {eventId: 'CONCERT_1', eventDatabaseId: 1, showId: 1, showSlug: 'main'},
    listener: () => {},
    onConnectionStatus: (s) => statusTimeout.push(s),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  mockTimeout.emitStatus('TIMED_OUT');
  assert.ok(statusTimeout.includes('ERROR'), 'Timeout transitions to ERROR');

  // Case D: Server closed
  const mockClosed = createMockSupabase();
  const statusClosed = [];
  subscribeToSeatUpdatesWithClient({
    supabase: mockClosed.supabase,
    active: {eventId: 'CONCERT_1', eventDatabaseId: 1, showId: 1, showSlug: 'main'},
    listener: () => {},
    onConnectionStatus: (s) => statusClosed.push(s),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  mockClosed.emitStatus('SUBSCRIBED');
  mockClosed.emitStatus('CLOSED');
  assert.deepEqual(
    statusClosed,
    ['CONNECTING', 'CONNECTED', 'DISCONNECTED'],
    'Server close transitions to DISCONNECTED',
  );
});

test('seatRealtimeService.ts implements show-scoped subscription, fallback, and mock contracts', async () => {
  const serviceTs = await readFile('src/services/seatRealtimeService.ts', 'utf8');

  // 1. Imports domain helpers
  assert.match(
    serviceTs,
    /import\s*\{[^}]*subscribeToSeatUpdatesWithClient/i,
    'Imports subscribeToSeatUpdatesWithClient from domain',
  );
  assert.match(
    serviceTs,
    /import\s*\{[^}]*fetchShowZones/i,
    'Imports fetchShowZones from domain',
  );

  // 2. Mock mode handling
  assert.match(
    serviceTs,
    /if\s*\(\s*useMockData\s*\)\s*\{\s*onConnectionStatus\(['"]CONNECTED['"]\);\s*return\s*\(\)\s*=>\s*undefined;/i,
    'Preserves mock mode handling',
  );

  // 3. Supabase integration delegating with honest active context and error boundary
  assert.match(
    serviceTs,
    /subscribeToSeatUpdatesWithClient\(\{/i,
    'Delegates to scoped subscription client runner',
  );
  assert.match(
    serviceTs,
    /onConnectionStatus\(['"]ERROR['"]\)/i,
    'Catches client initialization errors and reports ERROR',
  );

  // 4. WebSocket fallback preserved
  assert.match(
    serviceTs,
    /new\s+WebSocket\(/i,
    'Maintains WebSocket fallback path when Supabase is not configured',
  );
  assert.match(
    serviceTs,
    /\/ws\/events\/\$\{eventId\}\/seats/i,
    'Maintains WebSocket endpoint format',
  );
});
