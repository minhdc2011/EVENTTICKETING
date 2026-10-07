import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageOrganizationEvents,
  filterEventsByOrganization,
  getActiveOrgStorageKey,
  isOrganizerEditorRole,
  loadSavedActiveOrganizationId,
  mapAuthError,
  mapDatabaseError,
  resolveActiveOrganizationId,
  saveActiveOrganizationId,
  validateEventDraftInput,
  validateOrganizationInput,
  validateFullEventAggregate,
  evaluatePublishReadiness,
  VALID_CATEGORIES,
  VALID_LOCATION_MODES,
  isValidHttpsUrl,
  isValidEmail,
  isValidPhone,
} from '../src/domain/organizerValidation.js';


import {buildPublicPath, deduplicateSlug, resolvePublicRoute, navigatePublicRoute} from '../src/domain/publicRoute.js';


test('validateOrganizationInput validates names and slugs correctly', () => {
  // Valid organization input
  const valid = validateOrganizationInput('  FTU Entertainment Lab  ', '  ftu-entertainment-lab  ');
  assert.equal(valid.trimmedName, 'FTU Entertainment Lab');
  assert.equal(valid.trimmedSlug, 'ftu-entertainment-lab');

  // Name too short (< 3 chars)
  assert.throws(
    () => validateOrganizationInput('AB', 'ab-corp'),
    /Tên tổ chức phải có tối thiểu 3 ký tự/,
  );

  // Invalid slug with spaces or uppercase
  assert.throws(
    () => validateOrganizationInput('Valid Name', 'Invalid Slug!'),
    /Slug tổ chức chỉ được chứa chữ thường/,
  );
  assert.throws(
    () => validateOrganizationInput('Valid Name', 'slug with space'),
    /Slug tổ chức chỉ được chứa chữ thường/,
  );
});

test('validateEventDraftInput enforces event validation rules and relational date invariants', () => {
  const baseValidInput = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Youth Acoustic Fest 2026',
    slug: 'youth-acoustic-fest-2026',
    description: 'Đêm nhạc sống động dành cho sinh viên.',
    category: 'AM_NHAC',
    venueName: 'Cung Điền Kinh',
    address: 'Trần Hữu Dực, Hà Nội',
    startsAt: '2026-11-20T19:30:00.000Z',
    endsAt: '2026-11-20T22:30:00.000Z',
    saleStartsAt: '2026-10-15T09:00:00.000Z',
    saleEndsAt: '2026-11-20T18:00:00.000Z',
    price: 250000,
    capacity: 500,
  };

  // Valid draft passes without throwing
  assert.doesNotThrow(() => validateEventDraftInput(baseValidInput));

  // Event name too short (< 5 chars)
  assert.throws(
    () => validateEventDraftInput({...baseValidInput, name: 'Live'}),
    /Tên sự kiện phải có tối thiểu 5 ký tự/,
  );

  // Invalid slug
  assert.throws(
    () => validateEventDraftInput({...baseValidInput, slug: 'Live Fest 2026'}),
    /Slug sự kiện chỉ được chứa chữ thường/,
  );

  // Invalid category
  assert.throws(
    () => validateEventDraftInput({...baseValidInput, category: 'UNKNOWN_CAT'}),
    /Thể loại sự kiện không hợp lệ/,
  );

  // endsAt <= startsAt
  assert.throws(
    () => validateEventDraftInput({
      ...baseValidInput,
      endsAt: '2026-11-20T19:00:00.000Z',
    }),
    /Thời gian kết thúc sự kiện phải sau thời gian bắt đầu/,
  );

  // saleStartsAt >= startsAt
  assert.throws(
    () => validateEventDraftInput({
      ...baseValidInput,
      saleStartsAt: '2026-11-21T09:00:00.000Z',
    }),
    /Thời gian mở bán vé phải trước thời gian bắt đầu sự kiện/,
  );

  // saleEndsAt <= saleStartsAt
  assert.throws(
    () => validateEventDraftInput({
      ...baseValidInput,
      saleEndsAt: '2026-10-14T09:00:00.000Z',
    }),
    /Thời gian đóng bán vé phải sau thời gian mở bán/,
  );

  // saleEndsAt > startsAt
  assert.throws(
    () => validateEventDraftInput({
      ...baseValidInput,
      saleEndsAt: '2026-11-20T20:00:00.000Z',
    }),
    /Thời gian đóng bán vé không được muộn hơn thời gian bắt đầu/,
  );

  // Negative price
  assert.throws(
    () => validateEventDraftInput({...baseValidInput, price: -50000}),
    /Giá vé không được nhỏ hơn 0/,
  );

  // Zero or negative capacity
  assert.throws(
    () => validateEventDraftInput({...baseValidInput, capacity: 0}),
    /Sức chứa sự kiện phải có tối thiểu 1 vé/,
  );
});

test('isOrganizerEditorRole strictly gates editor permissions against viewer/scanner roles', () => {
  // Editors / Owners / Admins can edit
  assert.equal(isOrganizerEditorRole('CHU_SO_HUU'), true);
  assert.equal(isOrganizerEditorRole('QUAN_TRI'), true);
  assert.equal(isOrganizerEditorRole('BIEN_TAP'), true);

  // Viewers / Scanners cannot edit
  assert.equal(isOrganizerEditorRole('VAN_HANH'), false);
  assert.equal(isOrganizerEditorRole('SOAT_VE'), false);
  assert.equal(isOrganizerEditorRole('ANON'), false);
  assert.equal(isOrganizerEditorRole(undefined), false);
  assert.equal(isOrganizerEditorRole(''), false);
});

test('mapAuthError and mapDatabaseError translate error cases to actionable Vietnamese messages', () => {
  // Supabase Auth errors
  assert.match(
    mapAuthError({message: 'Invalid login credentials'}).message,
    /Email hoặc mật khẩu không chính xác/,
  );
  assert.match(
    mapAuthError({message: 'User already registered'}).message,
    /Email này đã được đăng ký tài khoản/,
  );
  assert.match(
    mapAuthError({message: 'Email not confirmed'}).message,
    /Tài khoản chưa được kích hoạt qua email/,
  );
  assert.match(
    mapAuthError({message: 'Password should be at least 6 characters'}).message,
    /Mật khẩu phải có tối thiểu 6 ký tự/,
  );
  assert.match(
    mapAuthError({message: 'Email rate limit exceeded'}).message,
    /Bạn đã thao tác quá nhiều lần trong thời gian ngắn/,
  );
  assert.match(
    mapAuthError({message: 'Failed to fetch'}).message,
    /Không thể kết nối đến máy chủ xác thực/,
  );

  // Postgres Database error codes
  assert.match(
    mapDatabaseError({code: '42501'}).message,
    /Bạn không có quyền thực hiện thao tác này/,
  );
  assert.match(
    mapDatabaseError({code: '23514'}).message,
    /Sự kiện chưa có suất diễn và phân khu hợp lệ để công bố/,
  );
  assert.match(
    mapDatabaseError({code: '23505'}).message,
    /Tên hoặc slug đã được sử dụng/,
  );
  assert.match(
    mapDatabaseError({code: '22023', message: 'Dữ liệu không hợp lệ'}).message,
    /Dữ liệu không hợp lệ/,
  );

  // Auth message routed through mapDatabaseError
  assert.match(
    mapDatabaseError({message: 'Invalid login credentials'}).message,
    /Email hoặc mật khẩu không chính xác/,
  );
});

test('public route builder and resolver preserve organizer and marketplace query state', () => {
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'organizer'), '/EVENTTICKETING/?route=/organizer');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'organizer/login'), '/EVENTTICKETING/?route=/organizer/login');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'events/acoustic-live'), '/EVENTTICKETING/?route=/events/acoustic-live');

  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/organizer'), {
    kind: 'organizer',
    page: 'dashboard',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/organizer/login'), {
    kind: 'organizer',
    page: 'login',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/events/acoustic-live'), {
    kind: 'detail',
    eventSlug: 'acoustic-live',
  });
});

test('route builder and slug normalizer prevent doubled slugs on organizer public links and resolve cleanly', () => {
  const normalSlug = 'uat-acoustic-night-2026';
  const doubledSlug = 'uat-acoustic-night-2026uat-acoustic-night-2026';

  // 1. Deduplication of doubled slugs
  assert.equal(deduplicateSlug(normalSlug), normalSlug);
  assert.equal(deduplicateSlug(doubledSlug), normalSlug);
  assert.equal(deduplicateSlug('super-concert-2026'), 'super-concert-2026');

  // 2. Organizer public link for uat-acoustic-night-2026 is exactly /?route=/events/uat-acoustic-night-2026
  assert.equal(buildPublicPath('/', `events/${normalSlug}`), '/?route=/events/uat-acoustic-night-2026');
  assert.equal(buildPublicPath('/', `events/${doubledSlug}`), '/?route=/events/uat-acoustic-night-2026');
  assert.notEqual(
    buildPublicPath('/', `events/${doubledSlug}`),
    '/?route=/events/uat-acoustic-night-2026uat-acoustic-night-2026',
  );

  // 3. GitHub Pages compatibility
  assert.equal(
    buildPublicPath('/EVENTTICKETING/', `events/${normalSlug}`),
    '/EVENTTICKETING/?route=/events/uat-acoustic-night-2026',
  );
  assert.equal(
    buildPublicPath('/EVENTTICKETING/', `events/${doubledSlug}`),
    '/EVENTTICKETING/?route=/events/uat-acoustic-night-2026',
  );

  // 4. Resolve public route cleanly for normal, doubled and show routes
  assert.deepEqual(resolvePublicRoute('/', 'fallback', '', `?route=/events/${normalSlug}`), {
    kind: 'detail',
    eventSlug: normalSlug,
  });
  assert.deepEqual(resolvePublicRoute('/', 'fallback', '', `?route=/events/${doubledSlug}`), {
    kind: 'detail',
    eventSlug: normalSlug,
  });
  assert.deepEqual(resolvePublicRoute('/', 'fallback', '', '?route=/events/super-concert-2026/shows/dem-chinh'), {
    kind: 'detail',
    eventSlug: 'super-concert-2026',
    showSlug: 'dem-chinh',
  });
});

test('filterEventsByOrganization isolates events strictly by organizationId', () => {
  const orgAId = '11111111-1111-1111-1111-111111111111';
  const orgBId = '22222222-2222-2222-2222-222222222222';

  const mixedEvents = [
    {id: 101, name: 'Event A1', organizationId: orgAId, status: 'BAN_NHAP'},
    {id: 102, name: 'Event A2', organizationId: orgAId, status: 'CONG_KHAI'},
    {id: 201, name: 'Event B1', organizationId: orgBId, status: 'BAN_NHAP'},
  ];

  // Org A selection
  const orgAEvents = filterEventsByOrganization(mixedEvents, orgAId);
  assert.equal(orgAEvents.length, 2);
  assert.deepEqual(orgAEvents.map((e) => e.id), [101, 102]);

  // Org B selection
  const orgBEvents = filterEventsByOrganization(mixedEvents, orgBId);
  assert.equal(orgBEvents.length, 1);
  assert.deepEqual(orgBEvents.map((e) => e.id), [201]);

  // Unknown organizationId
  assert.deepEqual(filterEventsByOrganization(mixedEvents, '99999999-9999-9999-9999-999999999999'), []);

  // Missing or null organizationId
  assert.deepEqual(filterEventsByOrganization(mixedEvents, null), []);
  assert.deepEqual(filterEventsByOrganization(mixedEvents, undefined), []);
  assert.deepEqual(filterEventsByOrganization([], orgAId), []);
});

test('canManageOrganizationEvents enforces per-org permission switching for dual-membership users', () => {
  const membershipOrgA = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    organizationName: 'Alpha Media',
    role: 'CHU_SO_HUU',
  };
  const membershipOrgB = {
    organizationId: '22222222-2222-2222-2222-222222222222',
    organizationName: 'Beta Productions',
    role: 'SOAT_VE',
  };

  // Switching active context to Org A grants write/publish controls
  assert.equal(canManageOrganizationEvents(membershipOrgA), true);

  // Switching active context to Org B disables write/publish controls
  assert.equal(canManageOrganizationEvents(membershipOrgB), false);

  // Null or undefined membership returns false safely
  assert.equal(canManageOrganizationEvents(null), false);
  assert.equal(canManageOrganizationEvents(undefined), false);

  // Other editor and non-editor roles
  assert.equal(canManageOrganizationEvents({role: 'QUAN_TRI'}), true);
  assert.equal(canManageOrganizationEvents({role: 'BIEN_TAP'}), true);
  assert.equal(canManageOrganizationEvents({role: 'VAN_HANH'}), false);
});

test('getActiveOrgStorageKey scopes key by authenticated userId and returns null for invalid input', () => {
  assert.equal(getActiveOrgStorageKey('user-123'), 'eventticketing:organizer-active-org:user-123');
  assert.equal(
    getActiveOrgStorageKey('00000000-0000-0000-0000-000000000001'),
    'eventticketing:organizer-active-org:00000000-0000-0000-0000-000000000001',
  );
  assert.equal(getActiveOrgStorageKey(''), null);
  assert.equal(getActiveOrgStorageKey(null), null);
  assert.equal(getActiveOrgStorageKey(undefined), null);
  assert.equal(getActiveOrgStorageKey(123), null);
});

test('resolveActiveOrganizationId preserves valid selection, falls back safely, and handles empty state', () => {
  const memberships = [
    {organizationId: 'org-alpha', organizationName: 'Alpha Media'},
    {organizationId: 'org-beta', organizationName: 'Beta Productions'},
  ];

  // Candidate is valid and in list -> preserves selection
  assert.equal(resolveActiveOrganizationId(memberships, 'org-beta'), 'org-beta');
  assert.equal(resolveActiveOrganizationId(memberships, 'org-alpha'), 'org-alpha');

  // Candidate is invalid or revoked -> falls back to first valid membership
  assert.equal(resolveActiveOrganizationId(memberships, 'org-revoked'), 'org-alpha');
  assert.equal(resolveActiveOrganizationId(memberships, null), 'org-alpha');
  assert.equal(resolveActiveOrganizationId(memberships, undefined), 'org-alpha');
  assert.equal(resolveActiveOrganizationId(memberships, ''), 'org-alpha');

  // Empty or invalid memberships array -> returns null safely
  assert.equal(resolveActiveOrganizationId([], 'org-beta'), null);
  assert.equal(resolveActiveOrganizationId(null, 'org-beta'), null);
  assert.equal(resolveActiveOrganizationId(undefined, 'org-beta'), null);
});

test('per-user active org persistence maintains selection across reload (F5) and never leaks across user sessions', () => {
  const memoryStore = new Map();
  const mockStorage = {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
    setItem: (k, v) => memoryStore.set(k, String(v)),
    removeItem: (k) => memoryStore.delete(k),
  };

  const userA = 'user-alpha-uuid';
  const userB = 'user-beta-uuid';

  const userAMemberships = [
    {organizationId: 'org-a1', organizationName: 'Org A1'},
    {organizationId: 'org-a2', organizationName: 'Org A2'},
  ];

  const userBMemberships = [
    {organizationId: 'org-b1', organizationName: 'Org B1'},
    {organizationId: 'org-b2', organizationName: 'Org B2'},
  ];

  // 1. User A selects Org A2 and it is saved
  saveActiveOrganizationId(userA, 'org-a2', mockStorage);
  assert.equal(loadSavedActiveOrganizationId(userA, mockStorage), 'org-a2');

  // 2. User A simulates F5 reload: stored org is restored because it still exists in userAMemberships
  const restoredUserAOrg = resolveActiveOrganizationId(
    userAMemberships,
    loadSavedActiveOrganizationId(userA, mockStorage),
  );
  assert.equal(restoredUserAOrg, 'org-a2');

  // 3. User B logs in: User B's storage is empty and MUST NOT see User A's selection
  assert.equal(loadSavedActiveOrganizationId(userB, mockStorage), null);
  const resolvedUserBOrg = resolveActiveOrganizationId(
    userBMemberships,
    loadSavedActiveOrganizationId(userB, mockStorage),
  );
  assert.equal(resolvedUserBOrg, 'org-b1'); // Falls back to User B's first membership, never leaks User A's org

  // 4. User B selects Org B2
  saveActiveOrganizationId(userB, 'org-b2', mockStorage);
  assert.equal(loadSavedActiveOrganizationId(userB, mockStorage), 'org-b2');
  assert.equal(loadSavedActiveOrganizationId(userA, mockStorage), 'org-a2'); // User A unchanged

  // 5. User A's membership in Org A2 is revoked -> resolving falls back safely to first valid membership
  const updatedUserAMemberships = [{organizationId: 'org-a1', organizationName: 'Org A1'}];
  const fallbackUserAOrg = resolveActiveOrganizationId(
    updatedUserAMemberships,
    loadSavedActiveOrganizationId(userA, mockStorage),
  );
  assert.equal(fallbackUserAOrg, 'org-a1');
});

test('validateFullEventAggregate enforces permissive draft vs strict publish invariants', () => {
  const minimalDraft = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Hanoi Indie Music Night',
    slug: 'hanoi-indie-music-night',
    category: 'AM_NHAC',
    locationMode: 'OFFLINE',
    shows: [],
  };

  // Permissive save-draft allows minimal draft without media or shows
  assert.doesNotThrow(() => validateFullEventAggregate(minimalDraft, {isPublishing: false}));

  // But fails if event name < 5 chars
  assert.throws(
    () => validateFullEventAggregate({...minimalDraft, name: 'Gig'}, {isPublishing: false}),
    /Tên sự kiện phải có tối thiểu 5 ký tự/,
  );

  // Or invalid slug
  assert.throws(
    () => validateFullEventAggregate({...minimalDraft, slug: 'Invalid Slug!'}, {isPublishing: false}),
    /Slug sự kiện chỉ được chứa chữ thường/,
  );

  // Strict publish mode requires full readiness
  assert.throws(
    () => validateFullEventAggregate(minimalDraft, {isPublishing: true}),
    /Mô tả chi tiết sự kiện phải có tối thiểu 20 ký tự khi công bố/,
  );

  assert.throws(
    () =>
      validateFullEventAggregate(
        {
          ...minimalDraft,
          description: 'Mô tả chi tiết sự kiện đã đạt trên hai mươi ký tự hợp lệ.',
        },
        {isPublishing: true},
      ),
    /Sự kiện trực tiếp bắt buộc phải có tên địa điểm/,
  );

  const fullEvent = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Hanoi Indie Music Night 2026',
    slug: 'hanoi-indie-music-night-2026',
    category: 'AM_NHAC',
    description: 'Đêm diễn âm nhạc độc lập quy tụ các nghệ sĩ trẻ triển vọng.',
    locationMode: 'OFFLINE',
    venueName: 'Hanoi Opera House',
    address: '1 Tràng Tiền, Hoàn Kiếm, Hà Nội',
    bannerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200',
    contactEmail: 'contact@hanoilive.vn',
    contactHotline: '0912345678',
    refundPolicy: 'Vé không được hoàn hủy sau khi thanh toán thành công trừ khi sự kiện bị hủy.',
    shows: [
      {
        slug: 'dem-1',
        name: 'Đêm diễn 1',
        startsAt: '2026-11-20T19:30:00.000Z',
        endsAt: '2026-11-20T22:30:00.000Z',
        doorsOpenAt: '2026-11-20T18:30:00.000Z',
        saleStartsAt: '2026-10-15T09:00:00.000Z',
        saleEndsAt: '2026-11-20T18:00:00.000Z',
        ticketTiers: [
          {
            code: 'GA_TIER',
            name: 'Vé GA',
            type: 'DUNG_STAND',
            price: 250000,
            capacity: 300,
            minPerOrder: 1,
            maxPerOrder: 4,
          },
          {
            code: 'VIP_TIER',
            name: 'Vé VIP',
            type: 'GHE_NGOI',
            price: 600000,
            capacity: 100,
            minPerOrder: 1,
            maxPerOrder: 2,
          },
        ],
      },
      {
        slug: 'dem-2',
        name: 'Đêm diễn 2',
        startsAt: '2026-11-21T19:30:00.000Z',
        endsAt: '2026-11-21T22:30:00.000Z',
        saleStartsAt: '2026-10-15T09:00:00.000Z',
        saleEndsAt: '2026-11-21T18:00:00.000Z',
        ticketTiers: [
          {
            code: 'GA_TIER_2',
            name: 'Vé GA Đêm 2',
            type: 'DUNG_STAND',
            price: 250000,
            capacity: 300,
            minPerOrder: 1,
            maxPerOrder: 4,
          },
        ],
      },
    ],
  };

  // Full aggregate passes strictly
  assert.doesNotThrow(() => validateFullEventAggregate(fullEvent, {isPublishing: true}));

  // Violating door time > startsAt
  const invalidDoors = JSON.parse(JSON.stringify(fullEvent));
  invalidDoors.shows[0].doorsOpenAt = '2026-11-20T20:00:00.000Z';
  assert.throws(
    () => validateFullEventAggregate(invalidDoors, {isPublishing: true}),
    /Thời gian mở cửa của suất diễn "Đêm diễn 1" phải trước hoặc trùng giờ bắt đầu/,
  );

  // Violating tier price < 0
  const invalidTierPrice = JSON.parse(JSON.stringify(fullEvent));
  invalidTierPrice.shows[0].ticketTiers[0].price = -1000;
  assert.throws(
    () => validateFullEventAggregate(invalidTierPrice, {isPublishing: true}),
    /Giá vé của hạng "Vé GA" không được nhỏ hơn 0/,
  );

  // Violating minPerOrder > maxPerOrder
  const invalidOrderLimit = JSON.parse(JSON.stringify(fullEvent));
  invalidOrderLimit.shows[0].ticketTiers[0].minPerOrder = 5;
  invalidOrderLimit.shows[0].ticketTiers[0].maxPerOrder = 2;
  assert.throws(
    () => validateFullEventAggregate(invalidOrderLimit, {isPublishing: true}),
    /Giới hạn số vé mỗi đơn của hạng "Vé GA" không hợp lệ/,
  );
});

test('evaluatePublishReadiness accurately flags pre-flight blockers and recommendations', () => {
  const incompleteDraft = {
    name: 'Draft',
    slug: 'draft',
    category: 'AM_NHAC',
    locationMode: 'OFFLINE',
    shows: [],
  };

  const evalIncomplete = evaluatePublishReadiness(incompleteDraft);
  assert.equal(evalIncomplete.isReady, false);
  assert.ok(evalIncomplete.blockers.length >= 4);
  assert.ok(evalIncomplete.blockers.some((b) => b.field === 'bannerUrl'));
  assert.ok(evalIncomplete.blockers.some((b) => b.field === 'contactEmail'));
  assert.ok(evalIncomplete.blockers.some((b) => b.field === 'shows'));

  const completeEvent = {
    name: 'Full Concert Festival 2026',
    slug: 'full-concert-festival-2026',
    category: 'AM_NHAC',
    description: 'Mô tả chi tiết sự kiện đã đạt trên 20 ký tự theo chuẩn nghiệp vụ.',
    locationMode: 'OFFLINE',
    venueName: 'Trung tâm Triển lãm',
    address: '91 Trần Hưng Đạo, Hà Nội',
    bannerUrl: 'https://cdn.example.com/banner.jpg',
    contactEmail: 'organizer@example.com',
    contactHotline: '0901234567',
    refundPolicy: 'Chính sách hoàn hủy vé tối thiểu mười ký tự trở lên.',
    shows: [
      {
        slug: 'dem-1',
        name: 'Đêm diễn duy nhất',
        startsAt: '2026-12-01T19:00:00.000Z',
        endsAt: '2026-12-01T22:00:00.000Z',
        saleStartsAt: '2026-11-01T09:00:00.000Z',
        saleEndsAt: '2026-12-01T18:00:00.000Z',
        ticketTiers: [
          {
            code: 'TIER_1',
            name: 'Hạng vé 1',
            price: 200000,
            capacity: 500,
          },
          {
            code: 'TIER_2',
            name: 'Hạng vé 2',
            price: 500000,
            capacity: 200,
          },
        ],
      },
    ],
  };

  const evalComplete = evaluatePublishReadiness(completeEvent);
  assert.equal(evalComplete.isReady, true);
  assert.equal(evalComplete.blockers.length, 0);
  assert.ok(evalComplete.warnings.some((w) => w.field === 'posterUrl'));
});

test('helper validators verify HTTPS URLs, emails, and Vietnamese phone numbers', () => {
  // HTTPS URLs
  assert.equal(isValidHttpsUrl('https://example.com/image.jpg'), true);
  assert.equal(isValidHttpsUrl('http://insecure.com/image.jpg'), false);
  assert.equal(isValidHttpsUrl('not-a-url'), false);
  assert.equal(isValidHttpsUrl(''), false);

  // Emails
  assert.equal(isValidEmail('organizer@example.com'), true);
  assert.equal(isValidEmail('user.name+tag@sub.domain.vn'), true);
  assert.equal(isValidEmail('invalid-email'), false);
  assert.equal(isValidEmail('missing@dot'), false);

  // Phone numbers (Vietnam)
  assert.equal(isValidPhone('0912345678'), true);
  assert.equal(isValidPhone('0389876543'), true);
  assert.equal(isValidPhone('+84912345678'), true);
  assert.equal(isValidPhone('12345'), false);
  assert.equal(isValidPhone('abcdefghij'), false);
});


