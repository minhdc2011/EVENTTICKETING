import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  ACCOUNT_KINDS,
  canManageOrganizationEvents,
  evaluatePublishReadiness,
  isOrganizerAccount,
  isOrganizerEditorRole,
  mapAuthError,
  mapDatabaseError,
  validateEventDraftInput,
  validateFullEventAggregate,
  validateOrganizationInput,
} from '../src/domain/organizerValidation.js';
import {buildPublicPath, resolvePublicRoute} from '../src/domain/publicRoute.js';

test('isOrganizerAccount and ACCOUNT_KINDS enforce strict account classification', () => {
  assert.equal(ACCOUNT_KINDS.USER, 'USER');
  assert.equal(ACCOUNT_KINDS.ORGANIZER, 'ORGANIZER');
  assert.equal(ACCOUNT_KINDS.ADMIN, 'ADMIN');

  // Organizers and Admins are recognized
  assert.equal(isOrganizerAccount('ORGANIZER'), true);
  assert.equal(isOrganizerAccount('organizer'), true);
  assert.equal(isOrganizerAccount('ADMIN'), true);
  assert.equal(isOrganizerAccount('admin'), true);

  // Pure buyers, non-organizers, and invalid inputs are denied
  assert.equal(isOrganizerAccount('USER'), false);
  assert.equal(isOrganizerAccount('user'), false);
  assert.equal(isOrganizerAccount('SCANNER'), false);
  assert.equal(isOrganizerAccount('BUYER'), false);
  assert.equal(isOrganizerAccount(''), false);
  assert.equal(isOrganizerAccount(null), false);
  assert.equal(isOrganizerAccount(undefined), false);
});

test('mapDatabaseError correctly passes through descriptive account boundary messages', () => {
  // Explicit 42501 error message from organizer boundary RPC
  const errOrgOnly = mapDatabaseError({
    code: '42501',
    message: 'Chi tai khoan Ban to chuc moi co the tao to chuc',
  });
  assert.equal(errOrgOnly.message, 'Chi tai khoan Ban to chuc moi co the tao to chuc');

  // Explicit 42501 error message from self-promotion trigger
  const errNoSelfPromote = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tu y thay doi loai tai khoan',
  });
  assert.equal(errNoSelfPromote.message, 'Khong co quyen tu y thay doi loai tai khoan');

  // Explicit 42501 error message for unauthenticated organization creation
  const errUnauthOrg = mapDatabaseError({
    code: '42501',
    message: 'Can dang nhap de tao to chuc',
  });
  assert.equal(errUnauthOrg.message, 'Can dang nhap de tao to chuc');

  // Explicit 42501 error messages for editor delegation
  const errEventCreate = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tao su kien cho to chuc nay',
  });
  assert.equal(errEventCreate.message, 'Khong co quyen tao su kien cho to chuc nay');

  const errEventEdit = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen bien tap su kien cua to chuc',
  });
  assert.equal(errEventEdit.message, 'Khong co quyen bien tap su kien cua to chuc');

  const errEventPublish = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen cong bo su kien',
  });
  assert.equal(errEventPublish.message, 'Khong co quyen cong bo su kien');

  // Explicit 42501 error messages for anti-disclosure protection
  const errRoleDisclosure = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen xem loai tai khoan cua nguoi dung khac',
  });
  assert.equal(errRoleDisclosure.message, 'Khong co quyen xem loai tai khoan cua nguoi dung khac');

  const errPermDisclosure = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen kiem tra phan quyen cua nguoi dung khac',
  });
  assert.equal(errPermDisclosure.message, 'Khong co quyen kiem tra phan quyen cua nguoi dung khac');

  // Generic 42501 falls back to standard Vietnamese error
  const errGeneric = mapDatabaseError({code: '42501'});
  assert.equal(errGeneric.message, 'Bạn không có quyền thực hiện thao tác này.');
});

test('capability matrix: buyer/USER authentication and public event access invariants', () => {
  // 1. Account classification: USER is purely buyer-oriented
  const buyerAccountKind = ACCOUNT_KINDS.USER;
  assert.equal(isOrganizerAccount(buyerAccountKind), false);
  assert.equal(isOrganizerEditorRole(buyerAccountKind), false);

  // 2. Route resolution: Buyer authentication entry points are cleanly distinguished
  const loginRoute = resolvePublicRoute('/login', 'sample-event');
  assert.deepEqual(loginRoute, {kind: 'account', page: 'login'});

  const registerRoute = resolvePublicRoute('/register', 'sample-event');
  assert.deepEqual(registerRoute, {kind: 'account', page: 'register'});

  const accountRoute = resolvePublicRoute('/account', 'sample-event');
  assert.deepEqual(accountRoute, {kind: 'account', page: 'overview'});

  // 3. Buyer event access: Buyers can reach catalog and event details without organizer permissions
  const catalogRoute = resolvePublicRoute('/events', 'sample-event');
  assert.deepEqual(catalogRoute, {kind: 'catalog'});

  const eventDetailRoute = resolvePublicRoute('/events/rock-concert-2026', 'sample-event');
  assert.deepEqual(eventDetailRoute, {kind: 'detail', eventSlug: 'rock-concert-2026'});

  // 4. Public links generated stably
  assert.equal(buildPublicPath('/', 'login'), '/?route=/login');
  assert.equal(buildPublicPath('/', 'register'), '/?route=/register');
  assert.equal(buildPublicPath('/', 'events'), '/?route=/events');

  // 5. Auth error mapping for buyer operations
  const invalidCreds = mapAuthError({message: 'Invalid login credentials'});
  assert.match(invalidCreds.message, /Email hoặc mật khẩu không chính xác/);

  const existingEmail = mapAuthError({message: 'User already registered'});
  assert.match(existingEmail.message, /Email này đã được đăng ký tài khoản/);
});

test('capability matrix: explicit denial of organizer operations for USER accounts', () => {
  const buyerKind = 'USER';
  assert.equal(isOrganizerAccount(buyerKind), false);

  // 1. Organization onboarding entry point denies USER accounts
  // In the application layer, OrganizerPortal gates access via isOrganizerAccount:
  const canAccessOrganizerStudio = isOrganizerAccount(buyerKind);
  assert.equal(canAccessOrganizerStudio, false, 'USER accounts must be denied access to Organizer Studio');

  // 2. Database level explicit denial: tao_to_chuc_cua_toi raises 42501 for USER
  const orgCreationDenial = mapDatabaseError({
    code: '42501',
    message: 'Chi tai khoan Ban to chuc moi co the tao to chuc',
  });
  assert.equal(orgCreationDenial.message, 'Chi tai khoan Ban to chuc moi co the tao to chuc');

  // 3. Delegation helper denial: USER accounts cannot edit or create events
  assert.equal(canManageOrganizationEvents({role: 'USER'}), false);
  assert.equal(isOrganizerEditorRole('USER'), false);

  const eventCreationDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tao su kien cho to chuc nay',
  });
  assert.equal(eventCreationDenial.message, 'Khong co quyen tao su kien cho to chuc nay');

  const eventEditDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen bien tap su kien cua to chuc',
  });
  assert.equal(eventEditDenial.message, 'Khong co quyen bien tap su kien cua to chuc');

  const eventPublishDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen cong bo su kien',
  });
  assert.equal(eventPublishDenial.message, 'Khong co quyen cong bo su kien');

  // 4. Self-promotion prevention: Client cannot upgrade own LoaiTaiKhoan
  const selfPromoteDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tu y thay doi loai tai khoan',
  });
  assert.equal(selfPromoteDenial.message, 'Khong co quyen tu y thay doi loai tai khoan');

  // 5. Anti-disclosure protection: USER cannot probe other users' account classification
  const probeDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen xem loai tai khoan cua nguoi dung khac',
  });
  assert.equal(probeDenial.message, 'Khong co quyen xem loai tai khoan cua nguoi dung khac');
});

test('capability matrix: ORGANIZER authentication, onboarding entry point, and management capabilities', () => {
  // 1. ORGANIZER and ADMIN accounts pass account classification
  assert.equal(isOrganizerAccount(ACCOUNT_KINDS.ORGANIZER), true);
  assert.equal(isOrganizerAccount(ACCOUNT_KINDS.ADMIN), true);

  // 2. Organizer route resolution
  assert.deepEqual(resolvePublicRoute('/organizer', 'fallback'), {
    kind: 'organizer',
    page: 'dashboard',
  });
  assert.deepEqual(resolvePublicRoute('/organizer/login', 'fallback'), {
    kind: 'organizer',
    page: 'login',
  });

  // 3. Organization onboarding validation (entry point for organizers with no org)
  const validOrg = validateOrganizationInput('Gamma Entertainment', 'gamma-entertainment');
  assert.equal(validOrg.trimmedName, 'Gamma Entertainment');
  assert.equal(validOrg.trimmedSlug, 'gamma-entertainment');

  assert.throws(
    () => validateOrganizationInput('AB', 'ab-corp'),
    /Tên tổ chức phải có tối thiểu 3 ký tự/,
  );
  assert.throws(
    () => validateOrganizationInput('Valid Name', 'invalid slug with spaces'),
    /Slug tổ chức chỉ được chứa chữ thường/,
  );

  // 4. Role-based event management permissions
  // Editors/Owners/Admins can manage
  assert.equal(canManageOrganizationEvents({role: 'CHU_SO_HUU'}), true);
  assert.equal(canManageOrganizationEvents({role: 'QUAN_TRI'}), true);
  assert.equal(canManageOrganizationEvents({role: 'BIEN_TAP'}), true);

  // Read-only/Scanner roles cannot manage
  assert.equal(canManageOrganizationEvents({role: 'VAN_HANH'}), false);
  assert.equal(canManageOrganizationEvents({role: 'SOAT_VE'}), false);
  assert.equal(canManageOrganizationEvents(null), false);

  // 5. Draft event creation input validation
  const validDraftInput = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Festival Âm Nhạc 2026',
    slug: 'festival-am-nhac-2026',
    description: 'Lễ hội âm nhạc mùa hè.',
    category: 'AM_NHAC',
    venueName: 'Trung tâm Hội nghị Quốc gia',
    address: 'Đại lộ Thăng Long, Hà Nội',
    startsAt: '2026-11-20T19:30:00.000Z',
    endsAt: '2026-11-20T22:30:00.000Z',
    saleStartsAt: '2026-10-15T09:00:00.000Z',
    saleEndsAt: '2026-11-20T18:00:00.000Z',
    price: 350000,
    capacity: 1000,
  };
  assert.doesNotThrow(() => validateEventDraftInput(validDraftInput));

  // 6. Full event aggregate validation and readiness checks
  const validAggregate = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Festival Âm Nhạc 2026',
    slug: 'festival-am-nhac-2026',
    category: 'AM_NHAC',
    description: 'Mô tả chi tiết lễ hội âm nhạc đỉnh cao năm 2026 với sự góp mặt của nhiều nghệ sĩ.',
    locationMode: 'OFFLINE',
    venueName: 'Sân vận động Mỹ Đình',
    address: 'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội',
    bannerUrl: 'https://images.unsplash.com/photo-festival.jpg',
    contactEmail: 'contact@festival.vn',
    contactHotline: '0901234567',
    refundPolicy: 'Chính sách hoàn hủy chi tiết theo quy định của ban tổ chức.',
    shows: [
      {
        slug: 'suat-1',
        name: 'Đêm diễn 1',
        startsAt: '2026-11-20T19:30:00.000Z',
        endsAt: '2026-11-20T22:30:00.000Z',
        saleStartsAt: '2026-10-15T09:00:00.000Z',
        saleEndsAt: '2026-11-20T18:00:00.000Z',
        ticketTiers: [
          {
            code: 'GA',
            name: 'Vé tiêu chuẩn',
            type: 'DUNG_STAND',
            price: 350000,
            capacity: 1000,
          },
        ],
      },
    ],
  };

  assert.doesNotThrow(() => validateFullEventAggregate(validAggregate, {isPublishing: false}));
  const readiness = evaluatePublishReadiness(validAggregate);
  assert.equal(readiness.isReady, true);
  assert.equal(readiness.blockers.length, 0);
});

test('overload bug regression: clean install and corrective migration guarantee unambiguous zero-arg helpers', async () => {
  // 1. Inspect clean install migration: 20261006210000_user_organizer_boundary.sql
  const boundarySql = await readFile(
    new URL('../supabase/migrations/20261006210000_user_organizer_boundary.sql', import.meta.url),
    'utf8',
  );

  // Must drop UUID overloads before recreating to ensure no stale parameter defaults survive
  assert.match(boundarySql, /DROP FUNCTION IF EXISTS public\.lay_loai_tai_khoan\(UUID\);/);
  assert.match(boundarySql, /DROP FUNCTION IF EXISTS public\.la_ban_to_chuc\(UUID\);/);

  // Must define exact signatures without DEFAULT parameter values
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(p_user_id UUID\)/);
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(p_user_id UUID\)/);
  assert.doesNotMatch(boundarySql, /lay_loai_tai_khoan\(p_user_id UUID DEFAULT/);
  assert.doesNotMatch(boundarySql, /la_ban_to_chuc\(p_user_id UUID DEFAULT/);

  // Must define zero-argument wrappers
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(\)/);
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(\)/);

  // 2. Inspect corrective migration: 20261007090000_fix_account_role_function_overload.sql
  const correctiveSql = await readFile(
    new URL('../supabase/migrations/20261007090000_fix_account_role_function_overload.sql', import.meta.url),
    'utf8',
  );

  // Drops exact UUID overload without CASCADE
  assert.match(correctiveSql, /DROP FUNCTION IF EXISTS public\.lay_loai_tai_khoan\(UUID\);/);
  assert.match(correctiveSql, /DROP FUNCTION IF EXISTS public\.la_ban_to_chuc\(UUID\);/);
  assert.doesNotMatch(correctiveSql, /CASCADE/);

  // Re-creates UUID variants without defaults
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(p_user_id UUID\)/);
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(p_user_id UUID\)/);
  assert.doesNotMatch(correctiveSql, /UUID DEFAULT/);

  // Re-creates/reinforces zero-argument wrappers
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(\)/);
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(\)/);

  // Regression safety check: pg_proc pronargdefaults must be 0
  assert.match(correctiveSql, /pronargdefaults/);
  assert.match(correctiveSql, /must not define default arguments/);
  assert.match(correctiveSql, /PERFORM 'public\.lay_loai_tai_khoan\(\)'::regprocedure;/);
  assert.match(correctiveSql, /PERFORM 'public\.la_ban_to_chuc\(\)'::regprocedure;/);
});

test('migration 20261006210000_user_organizer_boundary.sql defines authoritative schema, backfill, and delegation', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261006210000_user_organizer_boundary.sql', import.meta.url),
    'utf8',
  );

  // 1. Column and constraint additions on HO_SO_NGUOI_DUNG
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "LoaiTaiKhoan" VARCHAR\(30\) NOT NULL DEFAULT 'USER'/);
  assert.match(sql, /CHECK \("LoaiTaiKhoan" IN \('USER', 'ORGANIZER', 'ADMIN'\)\)/);

  // 2. Safe backfill strategy
  assert.match(sql, /INSERT INTO public\."HO_SO_NGUOI_DUNG" \("NguoiDungID", "HoTen", "LoaiTaiKhoan"\)/);
  assert.match(sql, /UPDATE public\."HO_SO_NGUOI_DUNG"[^;]*SET "LoaiTaiKhoan" = 'ORGANIZER'/);
  assert.match(sql, /FROM public\."THANH_VIEN_TO_CHUC"/);

  // 3. Self-promotion prevention trigger
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.kiem_tra_khong_tu_nang_cap_loai_tai_khoan/);
  assert.match(sql, /CREATE TRIGGER "trg_kiem_tra_khong_tu_nang_cap"/);
  assert.match(sql, /BEFORE UPDATE OF "LoaiTaiKhoan" ON public\."HO_SO_NGUOI_DUNG"/);
  assert.match(sql, /Khong co quyen tu y thay doi loai tai khoan/);

  // 4. Default USER assignment on signup trigger
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_ho_so_nguoi_dung_moi/);
  assert.match(sql, /'USER'/);

  // 5. Authoritative account kind helpers with anti-disclosure protection
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan/);
  assert.match(sql, /Khong co quyen xem loai tai khoan cua nguoi dung khac/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc/);
  assert.match(sql, /Khong co quyen kiem tra phan quyen cua nguoi dung khac/);
  assert.doesNotMatch(sql, /la_ban_to_chuc\(p_user_id UUID DEFAULT/);
  assert.doesNotMatch(sql, /lay_loai_tai_khoan\(p_user_id UUID DEFAULT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.gan_loai_tai_khoan/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.gan_loai_tai_khoan\(TEXT, TEXT\) FROM authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.gan_loai_tai_khoan\(TEXT, TEXT\) TO service_role/);

  // 6. Gated editor & membership check helpers
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.la_thanh_vien_to_chuc/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.co_quyen_bien_tap_to_chuc/);

  // 7. Gated organizer onboarding RPC
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_to_chuc_cua_toi/);
  assert.match(sql, /Chi tai khoan Ban to chuc moi co the tao to chuc/);
  assert.match(sql, /public\.la_ban_to_chuc\(v_user_id\)/);

  // 8. Non-duplicative design: downstream RPC bodies are NOT duplicated in this migration
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.tao_ban_nhap_su_kien/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.luu_su_kien_toan_dien/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.cong_bo_su_kien/);

  // 9. No destructive operations
  assert.doesNotMatch(sql, /DROP TABLE/);
});

test('corrective migration removes ambiguous defaults from account-role overloads', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261007090000_fix_account_role_function_overload.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /lay_loai_tai_khoan\(p_user_id UUID\)/);
  assert.match(sql, /la_ban_to_chuc\(p_user_id UUID\)/);
  assert.doesNotMatch(sql, /UUID DEFAULT/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.lay_loai_tai_khoan\(UUID\)/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.la_ban_to_chuc\(UUID\)/);
  assert.doesNotMatch(sql, /CASCADE/);
  assert.match(sql, /pronargdefaults/);
  assert.match(sql, /must not define default arguments/);
  assert.match(sql, /PERFORM 'public\.lay_loai_tai_khoan\(\)'::regprocedure;/);
  assert.match(sql, /PERFORM 'public\.la_ban_to_chuc\(\)'::regprocedure;/);
});

test('pgTAP test file supabase/tests/account_role_boundary.sql validates delegation, anti-disclosure, RLS, and overload safety', async () => {
  const sql = await readFile(
    new URL('../supabase/tests/account_role_boundary.sql', import.meta.url),
    'utf8',
  );

  // Verify plan
  assert.match(sql, /SELECT plan\(31\);/);
  assert.doesNotMatch(sql, /\\gset/);

  // Verify zero-argument overload assertions in pgTAP
  assert.match(sql, /lay_loai_tai_khoan\(\) zero-argument wrapper exists/);
  assert.match(sql, /la_ban_to_chuc\(\) zero-argument wrapper exists/);
  assert.match(sql, /lay_loai_tai_khoan\(uuid\) defines 0 argument defaults/);
  assert.match(sql, /la_ban_to_chuc\(uuid\) defines 0 argument defaults/);
  assert.match(sql, /Zero-argument lay_loai_tai_khoan\(\) returns USER for authenticated buyer without overload ambiguity/);
  assert.match(sql, /Zero-argument la_ban_to_chuc\(\) returns false for authenticated buyer without overload ambiguity/);
  assert.match(sql, /Zero-argument lay_loai_tai_khoan\(\) returns ORGANIZER for authenticated organizer without overload ambiguity/);
  assert.match(sql, /Zero-argument la_ban_to_chuc\(\) returns true for authenticated organizer without overload ambiguity/);

  // Verify direct RPC reject assertions for USER
  assert.match(sql, /Buyer \(USER\) is denied from creating an organization via tao_to_chuc_cua_toi/);
  assert.match(sql, /Buyer \(USER\) is denied from creating event draft via tao_ban_nhap_su_kien/);
  assert.match(sql, /Buyer \(USER\) is denied from mutating event data via luu_su_kien_toan_dien/);
  assert.match(sql, /Buyer \(USER\) is denied from publishing event via cong_bo_su_kien/);

  // Verify direct table RLS prevents buyer mutation
  assert.match(sql, /Direct-table RLS blocks buyer \(USER\) from mutating organizer events/);

  // Verify self-promotion rejection
  assert.match(sql, /Buyer \(USER\) cannot self-promote by direct table UPDATE on HO_SO_NGUOI_DUNG/);

  // Verify anti-disclosure assertions
  assert.match(sql, /lay_loai_tai_khoan denies authenticated caller from probing other users/);
  assert.match(sql, /la_ban_to_chuc denies authenticated caller from probing other users/);

  // Verify ORGANIZER access
  assert.match(sql, /Organizer \(ORGANIZER\) can successfully create an organization via tao_to_chuc_cua_toi/);
  assert.match(sql, /Organizer \(ORGANIZER\) can successfully save full event draft via luu_su_kien_toan_dien/);

  // Verify backfill & admin assignment
  assert.match(sql, /Backfill strategy classifies organization members as ORGANIZER/);
  assert.match(sql, /Service role can assign account kinds via gan_loai_tai_khoan/);
});
