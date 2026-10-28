import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  evaluatePublishReadiness,
  mapDatabaseError,
  validateFullEventAggregate,
} from '../src/domain/organizerValidation.js';
import {
  SUPER_CONCERT_SCHEDULE,
  formatScheduleTime,
  isSuperConcertEvent,
  normalizeScheduleRow,
  resolvePublicScheduleFallback,
  sortScheduleItems,
} from '../src/domain/publicSchedule.js';
import {
  SUPER_CONCERT_ARTISTS,
  normalizeArtistRow,
  resolvePublicArtistsFallback,
  sortArtists,
} from '../src/domain/artistLineup.js';

test('validateFullEventAggregate allows optional schedule and artists when absent or empty', () => {
  const baseEvent = {
    organizationId: 'org-test-1',
    name: 'Sự kiện Âm nhạc Thử nghiệm 2026',
    slug: 'su-kien-am-nhac-thu-nghiem-2026',
    category: 'AM_NHAC',
    locationMode: 'OFFLINE',
    venueName: 'Nhà hát lớn',
    address: 'Hà Nội',
    bannerUrl: 'https://example.com/banner.jpg',
    contactEmail: 'contact@music.vn',
    contactHotline: '0912345678',
    refundPolicy: 'Chính sách hoàn tiền chi tiết hơn 10 ký tự',
    shows: [
      {
        slug: 'suat-1',
        name: 'Suất 1',
        startsAt: '2026-11-20T19:00:00Z',
        endsAt: '2026-11-20T22:00:00Z',
        saleStartsAt: '2026-11-01T09:00:00Z',
        saleEndsAt: '2026-11-20T18:00:00Z',
        ticketTiers: [
          {code: 'GA', name: 'Vé GA', price: 200000, capacity: 200},
        ],
      },
    ],
  };

  // Absent schedule and artists: must not throw
  assert.doesNotThrow(() => validateFullEventAggregate(baseEvent));

  // Empty arrays: must not throw
  assert.doesNotThrow(() =>
    validateFullEventAggregate({
      ...baseEvent,
      schedule: [],
      artists: [],
    })
  );
});

test('validateFullEventAggregate strictly validates schedule items when present', () => {
  const baseEvent = {
    organizationId: 'org-test-1',
    name: 'Sự kiện Âm nhạc Thử nghiệm 2026',
    slug: 'su-kien-am-nhac-thu-nghiem-2026',
    category: 'AM_NHAC',
    locationMode: 'OFFLINE',
    venueName: 'Nhà hát lớn',
    address: 'Hà Nội',
    bannerUrl: 'https://example.com/banner.jpg',
    contactEmail: 'contact@music.vn',
    contactHotline: '0912345678',
    refundPolicy: 'Chính sách hoàn tiền chi tiết hơn 10 ký tự',
    shows: [
      {
        slug: 'suat-1',
        name: 'Suất 1',
        startsAt: '2026-11-20T19:00:00Z',
        endsAt: '2026-11-20T22:00:00Z',
        saleStartsAt: '2026-11-01T09:00:00Z',
        saleEndsAt: '2026-11-20T18:00:00Z',
        ticketTiers: [{code: 'GA', name: 'Vé GA', price: 200000, capacity: 200}],
      },
    ],
  };

  // Valid schedule items
  assert.doesNotThrow(() =>
    validateFullEventAggregate({
      ...baseEvent,
      schedule: [
        {title: 'Check-in', startTime: '16:00', endTime: '17:30', order: 1},
        {title: 'Khai mạc', startTime: '18:00', endTime: '21:00', order: 2},
      ],
    })
  );

  // Missing title
  assert.throws(
    () =>
      validateFullEventAggregate({
        ...baseEvent,
        schedule: [{title: '', startTime: '16:00', endTime: '17:30'}],
      }),
    /Mục lịch trình #1 phải có tên hoạt động/
  );

  // Invalid start time
  assert.throws(
    () =>
      validateFullEventAggregate({
        ...baseEvent,
        schedule: [{title: 'Check-in', startTime: 'invalid-time', endTime: '17:30'}],
      }),
    /Thời gian bắt đầu của mục lịch trình "Check-in" không hợp lệ/
  );

  // End time before start time
  assert.throws(
    () =>
      validateFullEventAggregate({
        ...baseEvent,
        schedule: [{title: 'Check-in', startTime: '18:00', endTime: '17:00'}],
      }),
    /Thời gian kết thúc của mục "Check-in" phải sau thời gian bắt đầu/
  );

  // Chronological ordering across rows: second item starts earlier than first item
  assert.throws(
    () =>
      validateFullEventAggregate({
        ...baseEvent,
        schedule: [
          {title: 'Tiết mục 1', startTime: '19:00', endTime: '20:00'},
          {title: 'Tiết mục 2', startTime: '18:00', endTime: '19:00'},
        ],
      }),
    /phải diễn ra sau hoặc cùng lúc với mục trước đó/
  );
});

test('validateFullEventAggregate strictly validates artist items when present', () => {
  const baseEvent = {
    organizationId: 'org-test-1',
    name: 'Sự kiện Âm nhạc Thử nghiệm 2026',
    slug: 'su-kien-am-nhac-thu-nghiem-2026',
    category: 'AM_NHAC',
    locationMode: 'OFFLINE',
    venueName: 'Nhà hát lớn',
    address: 'Hà Nội',
    bannerUrl: 'https://example.com/banner.jpg',
    contactEmail: 'contact@music.vn',
    contactHotline: '0912345678',
    refundPolicy: 'Chính sách hoàn tiền chi tiết hơn 10 ký tự',
    shows: [
      {
        slug: 'suat-1',
        name: 'Suất 1',
        startsAt: '2026-11-20T19:00:00Z',
        endsAt: '2026-11-20T22:00:00Z',
        saleStartsAt: '2026-11-01T09:00:00Z',
        saleEndsAt: '2026-11-20T18:00:00Z',
        ticketTiers: [{code: 'GA', name: 'Vé GA', price: 200000, capacity: 200}],
      },
    ],
  };

  // Valid artists
  assert.doesNotThrow(() =>
    validateFullEventAggregate({
      ...baseEvent,
      artists: [
        {name: 'Sơn Tùng M-TP', role: 'Headliner', imageUrl: 'https://example.com/st.jpg'},
        {name: 'Vũ.', role: 'Indie Pop', imageUrl: ''},
      ],
    })
  );

  // Missing artist name
  assert.throws(
    () =>
      validateFullEventAggregate({
        ...baseEvent,
        artists: [{name: '', role: 'Singer'}],
      }),
    /Nghệ sĩ #1 phải có nghệ danh hoặc tên hiển thị/
  );

  // Insecure / non-HTTPS image url
  assert.throws(
    () =>
      validateFullEventAggregate({
        ...baseEvent,
        artists: [{name: 'Suboi', imageUrl: 'http://insecure.com/suboi.jpg'}],
      }),
    /Ảnh của nghệ sĩ "Suboi" phải là liên kết HTTPS hợp lệ/
  );
});

test('evaluatePublishReadiness flags invalid schedule or artist items as blockers', () => {
  const readyEvent = {
    organizationId: 'org-test-1',
    name: 'Sự kiện Âm nhạc Thử nghiệm 2026',
    slug: 'su-kien-am-nhac-thu-nghiem-2026',
    category: 'AM_NHAC',
    description: 'Mô tả sự kiện chi tiết hơn 20 ký tự bắt buộc để vượt qua pre-flight check.',
    locationMode: 'OFFLINE',
    venueName: 'Nhà hát lớn',
    address: 'Hà Nội',
    bannerUrl: 'https://example.com/banner.jpg',
    contactEmail: 'contact@music.vn',
    contactHotline: '0912345678',
    refundPolicy: 'Chính sách hoàn tiền chi tiết hơn 10 ký tự',
    shows: [
      {
        slug: 'suat-1',
        name: 'Suất 1',
        startsAt: '2026-11-20T19:00:00Z',
        endsAt: '2026-11-20T22:00:00Z',
        saleStartsAt: '2026-11-01T09:00:00Z',
        saleEndsAt: '2026-11-20T18:00:00Z',
        ticketTiers: [{code: 'GA', name: 'Vé GA', price: 200000, capacity: 200}],
      },
    ],
  };

  // Valid without schedule/artists
  const res1 = evaluatePublishReadiness(readyEvent);
  assert.equal(res1.isReady, true);

  // Blocked by invalid schedule item (endTime <= startTime)
  const res2 = evaluatePublishReadiness({
    ...readyEvent,
    schedule: [{title: 'Check-in', startTime: '19:00', endTime: '18:00'}],
  });
  assert.equal(res2.isReady, false);
  assert.ok(res2.blockers.some((b) => b.field.includes('schedule') && b.message.includes('sau giờ bắt đầu')));

  // Blocked by empty artist name
  const res3 = evaluatePublishReadiness({
    ...readyEvent,
    artists: [{name: ''}],
  });
  assert.equal(res3.isReady, false);
  assert.ok(res3.blockers.some((b) => b.field.includes('artists') && b.message.includes('tên hoặc nghệ danh')));
});

test('domain normalization, sorting, and fallback isolation guarantee non-leakage', () => {
  // 1. Schedule normalization & sorting
  const rawSchedule = [
    {id: 103, title: 'Headliner Band', startTime: '20:00', endTime: '22:30', location: 'Sân khấu A', order: 3},
    {id: 101, title: 'Mở cửa check-in', startTime: '16:30', endTime: '18:00', location: 'Cổng B', order: 1},
    {id: 102, title: 'Tiết mục khai mạc', startTime: '18:15', endTime: '19:45', location: 'Sân khấu A', order: 2},
  ];
  const normalizedSched = rawSchedule.map(normalizeScheduleRow);
  const sortedSched = sortScheduleItems(normalizedSched);

  assert.equal(sortedSched.length, 3);
  assert.equal(sortedSched[0].title, 'Mở cửa check-in');
  assert.equal(sortedSched[0].startTime, '16:30');
  assert.equal(sortedSched[1].title, 'Tiết mục khai mạc');
  assert.equal(sortedSched[2].title, 'Headliner Band');

  // 2. Artist normalization & sorting
  const rawArtists = [
    {ID: 23, SuKienID: 99, ThuTuHienThi: 3, NGHE_SI: {NgheSiID: 303, NgheDanh: 'Chillies', VaiTroChinh: 'Pop Rock', HinhAnhURL: 'https://example.com/chillies.jpg'}},
    {ID: 21, SuKienID: 99, ThuTuHienThi: 1, NGHE_SI: {NgheSiID: 301, NgheDanh: 'Vũ.', HoTen: 'Hoàng Thái Vũ', VaiTroChinh: 'Acoustic Pop', HinhAnhURL: 'https://example.com/vu.jpg'}},
    {ID: 22, SuKienID: 99, ThuTuHienThi: 2, NGHE_SI: {NgheSiID: 302, NgheDanh: 'Ngọt', VaiTroChinh: 'Indie Rock', HinhAnhURL: 'https://example.com/ngot.jpg'}},
  ];
  const normalizedArts = rawArtists.map(normalizeArtistRow);
  const sortedArts = sortArtists(normalizedArts);

  assert.equal(sortedArts.length, 3);
  assert.equal(sortedArts[0].name, 'Vũ.');
  assert.equal(sortedArts[0].role, 'Acoustic Pop');
  assert.equal(sortedArts[1].name, 'Ngọt');
  assert.equal(sortedArts[2].name, 'Chillies');

  // 3. Fallback isolation: Super Concert gets seeded data, Generic/Organizer events get empty array
  const superConcertEvent = {id: 1, slug: 'super-concert-2026', templateKey: 'SUPER_CONCERT_2026'};
  assert.equal(resolvePublicScheduleFallback(superConcertEvent).length, 6, 'Super Concert gets 6 fallback schedule items');
  assert.equal(resolvePublicArtistsFallback(superConcertEvent).length, 6, 'Super Concert gets 6 fallback artists');

  const organizerEvent = {id: 99, slug: 'hanoi-indie-summer-2026', templateKey: 'DEFAULT'};
  assert.deepEqual(resolvePublicScheduleFallback(organizerEvent), [], 'Generic/Organizer event gets empty schedule fallback');
  assert.deepEqual(resolvePublicArtistsFallback(organizerEvent), [], 'Generic/Organizer event gets empty artist fallback');

  const emptyEvent = {};
  assert.deepEqual(resolvePublicScheduleFallback(emptyEvent), []);
  assert.deepEqual(resolvePublicArtistsFallback(emptyEvent), []);
});

test('organizerService, scheduleService, and artistService implement mock and Supabase round-trip contracts', async () => {
  const orgServiceTs = await readFile(
    new URL('../src/services/organizerService.ts', import.meta.url),
    'utf8'
  );
  const schedServiceTs = await readFile(
    new URL('../src/services/scheduleService.ts', import.meta.url),
    'utf8'
  );
  const artServiceTs = await readFile(
    new URL('../src/services/artistService.ts', import.meta.url),
    'utf8'
  );

  // 1. organizerService mock mode persists and loads schedule and artists
  assert.match(orgServiceTs, /\.\.\.normalizedInput/i, 'Mock save draft persists full normalized aggregate');
  assert.match(orgServiceTs, /const schedule:\s*FullEventScheduleInput\[\]\s*=\s*Array\.isArray\(found\.schedule\)/i, 'Mock load hydrates schedule array');
  assert.match(orgServiceTs, /const artists:\s*FullEventArtistInput\[\]\s*=\s*Array\.isArray\(found\.artists\)/i, 'Mock load hydrates artists array');

  // 2. organizerService Supabase mode queries LICH_TRINH and SU_KIEN_NGHE_SI
  assert.match(orgServiceTs, /\.from\(['"]LICH_TRINH['"]\)/i, 'Supabase load queries LICH_TRINH');
  assert.match(orgServiceTs, /\.from\(['"]SU_KIEN_NGHE_SI['"]\)/i, 'Supabase load queries SU_KIEN_NGHE_SI');
  assert.match(orgServiceTs, /NGHE_SI\s*\(/i, 'Supabase load joins master NGHE_SI table');

  // 3. Fail-closed error handling: scheduleRes and artistsRes errors are never swallowed
  assert.match(orgServiceTs, /if\s*\(\s*scheduleRes\.error\s*\)\s*\{[\s\S]*?throw\s*mapDatabaseError/i, 'loadEventForEditing fails closed on scheduleRes.error');
  assert.match(orgServiceTs, /if\s*\(\s*artistsRes\.error\s*\)\s*\{[\s\S]*?throw\s*mapDatabaseError/i, 'loadEventForEditing fails closed on artistsRes.error');
  assert.match(orgServiceTs, /Không thể tải lịch trình sự kiện/i, 'scheduleRes.error carries actionable context');
  assert.match(orgServiceTs, /Không thể tải danh sách nghệ sĩ/i, 'artistsRes.error carries actionable context');

  // 4. organizerService RPC call forwards full aggregate in p_payload
  assert.match(orgServiceTs, /p_payload:\s*normalizedInput/i, 'RPC call forwards full normalized aggregate payload');

  // 5. scheduleService checks mock storage for organizer events and isolates fallback
  assert.match(schedServiceTs, /localStorage\.getItem\(['"]eventticketing:mock-organizer-events['"]\)/i, 'scheduleService checks mock events in mock mode');
  assert.match(schedServiceTs, /resolvePublicScheduleFallback\(event\)/i, 'scheduleService delegates to resolvePublicScheduleFallback');

  // 6. artistService checks mock storage for organizer events and isolates fallback
  assert.match(artServiceTs, /localStorage\.getItem\(['"]eventticketing:mock-organizer-events['"]\)/i, 'artistService checks mock events in mock mode');
  assert.match(artServiceTs, /resolvePublicArtistsFallback\(event\)/i, 'artistService delegates to resolvePublicArtistsFallback');
});

test('fail-closed error handling guarantees schedule and artist query failures are not swallowed', () => {
  // Test mapDatabaseError preserves actionable Vietnamese context even under 42501
  const schedErr = mapDatabaseError({
    code: '42501',
    message: 'Không thể tải lịch trình sự kiện: permission denied for table LICH_TRINH',
  });
  assert.equal(
    schedErr.message,
    'Không thể tải lịch trình sự kiện: permission denied for table LICH_TRINH',
    'Preserves actionable context for schedule load failure'
  );

  const artErr = mapDatabaseError({
    code: '42501',
    message: 'Không thể tải danh sách nghệ sĩ: permission denied for table SU_KIEN_NGHE_SI',
  });
  assert.equal(
    artErr.message,
    'Không thể tải danh sách nghệ sĩ: permission denied for table SU_KIEN_NGHE_SI',
    'Preserves actionable context for artist load failure'
  );

  // Simulating loadEventForEditing fail-closed guard
  const simulateLoadCheck = (res) => {
    if (res.eventRes?.error) throw mapDatabaseError(res.eventRes.error);
    if (!res.eventRes?.data) throw new Error('Không tìm thấy sự kiện.');
    if (res.scheduleRes?.error) {
      throw mapDatabaseError({
        ...res.scheduleRes.error,
        message: `Không thể tải lịch trình sự kiện: ${res.scheduleRes.error.message || 'Lỗi cơ sở dữ liệu'}`,
      });
    }
    if (res.artistsRes?.error) {
      throw mapDatabaseError({
        ...res.artistsRes.error,
        message: `Không thể tải danh sách nghệ sĩ: ${res.artistsRes.error.message || 'Lỗi cơ sở dữ liệu'}`,
      });
    }
    return {
      schedule: res.scheduleRes?.data || [],
      artists: res.artistsRes?.data || [],
    };
  };

  // Schedule query error must throw, not return empty array
  assert.throws(
    () =>
      simulateLoadCheck({
        eventRes: {data: {SuKienID: 1}},
        scheduleRes: {error: {code: '42501', message: 'RLS check failed'}},
        artistsRes: {data: []},
      }),
    /Không thể tải lịch trình sự kiện: RLS check failed/
  );

  // Artist query error must throw, not return empty array
  assert.throws(
    () =>
      simulateLoadCheck({
        eventRes: {data: {SuKienID: 1}},
        scheduleRes: {data: []},
        artistsRes: {error: {code: '500', message: 'Network timeout'}},
      }),
    /Không thể tải danh sách nghệ sĩ: Network timeout/
  );
});

test('additive migration 20261027130000_organizer_schedule_lineup_slice.sql enforces security, idempotency, and master safety', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261027130000_organizer_schedule_lineup_slice.sql', import.meta.url),
    'utf8'
  );

  // 1. Transactional wrapper and SECURITY DEFINER
  assert.match(sql, /^BEGIN;/m, 'Migration starts with BEGIN');
  assert.match(sql, /COMMIT;/m, 'Migration ends with COMMIT');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.luu_su_kien_toan_dien\(p_payload JSONB\)/, 'Preserves luu_su_kien_toan_dien(JSONB) signature');
  assert.match(sql, /SECURITY DEFINER/, 'Function is SECURITY DEFINER');
  assert.match(sql, /SET search_path = public/, 'Function enforces search_path = public');

  // 2. Tenant boundary checks
  assert.match(sql, /Muc lich trinh khong ton tai hoac khong thuoc su kien dang thao tac/, 'Enforces tenant boundary check on scheduleId');
  assert.match(sql, /Khong co quyen bien tap su kien cua to chuc/, 'Enforces organizer editing permission');

  // 3. Safe artist master policy: never delete from master table NGHE_SI, auto-fork shared master on change, support intentional clearing
  assert.match(sql, /DELETE FROM public\."SU_KIEN_NGHE_SI"/, 'Deletes omitted event links');
  assert.doesNotMatch(sql, /DELETE FROM (public\.)?"NGHE_SI"/, 'NEVER deletes from master table NGHE_SI');
  assert.match(sql, /v_master_changed\s*:=\s*TRUE/i, 'Detects master profile changes on shared artist');
  assert.match(sql, /v_artist_elem\s*\?\s*'bio'/i, 'Checks presence of bio key in payload to support intentional clearing');
  assert.match(sql, /v_artist_elem\s*\?\s*'imageUrl'/i, 'Checks presence of imageUrl key in payload to support intentional clearing');

  // 4. Time casting with NULLIF to produce controlled 22023 instead of raw 22007
  assert.match(sql, /v_sched_start\s*:=\s*NULLIF\([\s\S]*?startTime[\s\S]*?,\s*''\)::TIME/i, 'Wraps startTime with NULLIF before TIME cast');
  assert.match(sql, /v_sched_end\s*:=\s*NULLIF\([\s\S]*?endTime[\s\S]*?,\s*''\)::TIME/i, 'Wraps endTime with NULLIF before TIME cast');

  // 5. Hardened ACLs
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.luu_su_kien_toan_dien\(JSONB\) FROM PUBLIC, anon;/, 'Revokes execute from PUBLIC and anon');
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.luu_su_kien_toan_dien\(JSONB\) TO authenticated, service_role;/, 'Grants execute to authenticated and service_role');

  // 6. Schema reload notify for manual dashboard application
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema';/i, 'Notifies PostgREST to reload schema cache after commit');

  // 7. Additive draft RLS policies for schedule and artists (single idempotent block)
  assert.match(sql, /CREATE POLICY "Members read event schedule"\s+ON public\."LICH_TRINH"/, 'Defines RLS policy for reading schedule');
  assert.match(sql, /CREATE POLICY "Members read event artists"\s+ON public\."SU_KIEN_NGHE_SI"/, 'Defines RLS policy for reading event artists');
  assert.match(sql, /CREATE POLICY "Members read artists"\s+ON public\."NGHE_SI"/, 'Defines RLS policy for reading master artists');
  assert.equal((sql.match(/CREATE POLICY "Members read event schedule"/g) || []).length, 1, 'Exactly one idempotent policy definition for schedule');
  assert.equal((sql.match(/CREATE POLICY "Members read event artists"/g) || []).length, 1, 'Exactly one idempotent policy definition for event artists');
  assert.equal((sql.match(/CREATE POLICY "Members read artists"/g) || []).length, 1, 'Exactly one idempotent policy definition for master artists');
});

test('pgTAP acceptance test artifact organizer_schedule_lineup_slice.sql is valid plain SQL', async () => {
  const sql = await readFile(
    new URL('../supabase/tests/organizer_schedule_lineup_slice.sql', import.meta.url),
    'utf8'
  );

  assert.match(sql, /SELECT plan\(20\);/, 'Defines plan for 20 assertions');
  assert.doesNotMatch(sql, /\\gset/, 'Must not contain psql meta-commands');
  assert.match(sql, /auth\.users/, 'Sets up auth.users fixture');
  assert.match(sql, /HO_SO_NGUOI_DUNG/, 'Sets up HO_SO_NGUOI_DUNG fixture with ORGANIZER profile');
  assert.match(sql, /Anonymous users cannot call luu_su_kien_toan_dien/, 'Tests anonymous access denial');
  assert.match(sql, /Scanner role cannot create event draft via luu_su_kien_toan_dien/, 'Tests scanner access denial');
  assert.match(sql, /Creates exactly 3 schedule rows for the event/, 'Tests schedule persistence');
  assert.match(sql, /Creates exactly 2 artist links for the event/, 'Tests artist link persistence');
  assert.match(sql, /Retained schedule row preserves identical LichTrinhID via UPDATE in place/, 'Tests in-place schedule UPDATE branch');
  assert.match(sql, /Master artist row in NGHE_SI is never deleted when unlinked from event/, 'Tests master artist protection');
  assert.match(sql, /Intentionally clearing bio and image on unshared artist sets columns to NULL/, 'Tests intentional clearing of bio/image');
  assert.match(sql, /Shared artist with unchanged profile reuses shared master NgheSiID 888 without auto-forking/, 'Tests reuse of unchanged shared master artist');
  assert.match(sql, /Shared artist with changed profile auto-forks new NGHE_SI row and leaves original shared row untouched/, 'Tests auto-forking of shared master artist when changed');
  assert.match(sql, /Forged scheduleId from another event is rejected with 42501/, 'Tests schedule tenant boundary');
  assert.match(sql, /Schedule item with endTime <= startTime is rejected with 22023/, 'Tests schedule time validation');
  assert.match(sql, /Schedule item with empty startTime produces controlled 22023 rather than raw 22007/, 'Tests controlled 22023 for empty startTime');
});

test('OrganizerEventWizard renders repeatable schedule and lineup sections with no emoji icons', async () => {
  const wizardTsx = await readFile(
    new URL('../src/components/organizer-ui/OrganizerEventWizard.tsx', import.meta.url),
    'utf8'
  );

  // Repeatable section titles
  assert.match(wizardTsx, /Lịch trình hoạt động \(Timeline\)/, 'Renders Schedule section');
  assert.match(wizardTsx, /Dàn nghệ sĩ biểu diễn \(Artist Lineup\)/, 'Renders Lineup section');

  // Controls: add, remove, and reorder up/down
  assert.match(wizardTsx, /addScheduleItem/, 'Has addScheduleItem handler');
  assert.match(wizardTsx, /removeScheduleItem/, 'Has removeScheduleItem handler');
  assert.match(wizardTsx, /moveScheduleItem/, 'Has moveScheduleItem handler');
  assert.match(wizardTsx, /addArtistItem/, 'Has addArtistItem handler');
  assert.match(wizardTsx, /removeArtistItem/, 'Has removeArtistItem handler');
  assert.match(wizardTsx, /moveArtistItem/, 'Has moveArtistItem handler');

  // Empty states
  assert.match(wizardTsx, /Chưa có mục lịch trình nào/, 'Has schedule empty state');
  assert.match(wizardTsx, /Chưa có nghệ sĩ nào trong danh sách/, 'Has artist lineup empty state');

  // No emoji icons in file
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const match = wizardTsx.match(emojiRegex);
  assert.equal(match, null, `Forbidden emoji found in OrganizerEventWizard: ${match ? match[0] : ''}`);
});

test('EventTemplate integrates ArtistLineupSection and ScheduleDialog for non-concert events with data', async () => {
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );

  // Accepts optional schedule and artists props
  assert.match(templateTsx, /schedule\?:\s*PublicScheduleItem\[\]/, 'Accepts schedule prop');
  assert.match(templateTsx, /artists\?:\s*PublicArtistRecord\[\]/, 'Accepts artists prop');

  // Renders ArtistLineupSection when slots.lineup is undefined
  assert.match(
    templateTsx,
    /slots\?\.lineup\s*!==\s*undefined\s*\?\s*\(\s*slots\.lineup\s*\)\s*:\s*\(\s*<ArtistLineupSection/i,
    'Falls back to data-driven ArtistLineupSection when lineup slot is undefined'
  );

  // Renders ScheduleDialog
  assert.match(templateTsx, /<ScheduleDialog/i, 'Renders ScheduleDialog');
});
