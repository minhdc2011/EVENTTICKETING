import {runtimeConfig} from '../config/runtime';
import {deduplicateSlug} from '../domain/publicRoute';
import type {PublicEventRecord, PublicShowRecord} from './eventService';

export type OrganizerSession = {userId: string; email: string; accountKind?: string};
export type OrganizerMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};
export type OrganizerEvent = {
  id: number;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  category: string;
  startsAt: string;
  showCount: number;
  bannerUrl?: string;
  posterUrl?: string;
};
export type CreateDraftInput = {
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  venueName: string;
  address: string;
  startsAt: string;
  endsAt: string;
  saleStartsAt: string;
  saleEndsAt: string;
  price: number;
  capacity: number;
};

export {
  ACCOUNT_KINDS,
  isOrganizerAccount,
  isOrganizerEditorRole,
  canManageOrganizationEvents,
  filterEventsByOrganization,
  getActiveOrgStorageKey,
  resolveActiveOrganizationId,
  loadSavedActiveOrganizationId,
  saveActiveOrganizationId,
  validateOrganizationInput,
  validateEventDraftInput,
  validateFullEventAggregate,
  evaluatePublishReadiness,
  VALID_CATEGORIES,
  VALID_LOCATION_MODES,
  isValidUrl,
  isValidHttpsUrl,
  isValidEmail,
  isValidPhone,
  mapAuthError,
  mapDatabaseError,
} from '../domain/organizerValidation';

export type {
  FullEventAggregateInput,
  FullEventShowInput,
  FullEventTierInput,
  PublishReadinessResult,
} from '../domain/organizerValidation';

import {
  isOrganizerAccount,
  validateEventDraftInput,
  validateFullEventAggregate,
  validateOrganizationInput,
  mapAuthError,
  mapDatabaseError,
  type FullEventAggregateInput,
  type FullEventShowInput,
} from '../domain/organizerValidation';

const MOCK_SESSION = 'eventticketing:mock-organizer-session';
const MOCK_ACCOUNT_KIND = 'eventticketing:mock-account-kind';
const MOCK_EVENTS = 'eventticketing:mock-organizer-events';
const MOCK_ORGS = 'eventticketing:mock-organizer-orgs';
const mockDefaultOrg: OrganizerMembership = {
  organizationId: 'mock-org-1',
  organizationName: 'FTU Events Lab',
  organizationSlug: 'ftu-events-lab',
  role: 'CHU_SO_HUU',
};

export async function getOrganizerSession(): Promise<OrganizerSession | null> {
  if (runtimeConfig.useMockData) {
    let email = localStorage.getItem(MOCK_SESSION);
    let storedKind = localStorage.getItem(MOCK_ACCOUNT_KIND);
    if (!email) {
      const buyerRaw = localStorage.getItem('eventticketing:mock-buyer-session');
      if (buyerRaw) {
        try {
          const parsed = JSON.parse(buyerRaw);
          email = parsed.email || null;
          storedKind = parsed.accountKind || storedKind || 'USER';
        } catch {
          email = buyerRaw;
        }
      }
    }
    if (!email) return null;
    const accountKind = storedKind || (email.toLowerCase().includes('buyer') ? 'USER' : 'ORGANIZER');
    return {userId: 'mock-user', email, accountKind};
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {data} = await requireSupabaseClient().auth.getSession();
  if (!data.session?.user) return null;

  let accountKind = 'USER';
  try {
    const {data: profile} = await (requireSupabaseClient() as any)
      .from('HO_SO_NGUOI_DUNG')
      .select('LoaiTaiKhoan')
      .eq('NguoiDungID', data.session.user.id)
      .maybeSingle();
    if (profile?.LoaiTaiKhoan) {
      accountKind = String(profile.LoaiTaiKhoan);
    }
  } catch (err) {
    console.warn('Không thể nạp loại tài khoản:', err);
  }

  return {
    userId: data.session.user.id,
    email: data.session.user.email || '',
    accountKind,
  };
}

export function subscribeOrganizerAuth(callback: (session: OrganizerSession | null) => void): () => void {
  if (runtimeConfig.useMockData) {
    const handler = (e: StorageEvent) => {
      if (
        e.key === MOCK_SESSION ||
        e.key === MOCK_ACCOUNT_KIND ||
        e.key === 'eventticketing:mock-buyer-session'
      ) {
        void getOrganizerSession().then(callback);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
  let unsubscribed = false;
  let cleanup: (() => void) | undefined;
  void import('./supabaseClient').then(({requireSupabaseClient}) => {
    if (unsubscribed) return;
    const {data} = requireSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        callback(null);
      } else {
        void getOrganizerSession().then((s) => {
          if (!unsubscribed) callback(s);
        });
      }
    });
    cleanup = () => data.subscription.unsubscribe();
  });
  return () => {
    unsubscribed = true;
    if (cleanup) cleanup();
  };
}

export async function signInOrganizer(email: string, password: string): Promise<void> {
  if (runtimeConfig.useMockData) {
    if (!email.includes('@') || password.length < 6) throw new Error('Email hoặc mật khẩu chưa hợp lệ.');
    localStorage.setItem(MOCK_SESSION, email);
    return;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {error} = await requireSupabaseClient().auth.signInWithPassword({email, password});
  if (error) throw mapAuthError(error);
}

export async function signUpOrganizer(
  email: string,
  password: string,
): Promise<{userId?: string; email?: string; hasSession: boolean}> {
  if (runtimeConfig.useMockData) {
    if (!email.includes('@') || password.length < 6) throw new Error('Email hoặc mật khẩu chưa hợp lệ.');
    localStorage.setItem(MOCK_SESSION, email);
    if (!localStorage.getItem(MOCK_ORGS)) {
      localStorage.setItem(MOCK_ORGS, JSON.stringify([]));
    }
    return {userId: 'mock-user', email, hasSession: true};
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {data, error} = await requireSupabaseClient().auth.signUp({email, password});
  if (error) throw mapAuthError(error);
  return {
    userId: data.user?.id,
    email: data.user?.email || email,
    hasSession: Boolean(data.session?.user),
  };
}

export async function signOutOrganizer(): Promise<void> {
  if (runtimeConfig.useMockData) {
    localStorage.removeItem(MOCK_SESSION);
    localStorage.removeItem('eventticketing:mock-buyer-session');
    return;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {error} = await requireSupabaseClient().auth.signOut();
  if (error) throw mapAuthError(error);
}

export async function loadOrganizerWorkspace(): Promise<{
  memberships: OrganizerMembership[];
  events: OrganizerEvent[];
}> {
  if (runtimeConfig.useMockData) {
    let orgs: OrganizerMembership[] = [];
    const storedOrgs = localStorage.getItem(MOCK_ORGS);
    if (storedOrgs !== null) {
      try {
        orgs = JSON.parse(storedOrgs);
      } catch {
        orgs = [mockDefaultOrg];
      }
    } else {
      orgs = [mockDefaultOrg];
    }
    const stored = JSON.parse(localStorage.getItem(MOCK_EVENTS) || '[]') as OrganizerEvent[];
    return {memberships: orgs, events: stored};
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient() as any;
  const {data: memberRows, error: memberError} = await supabase
    .from('THANH_VIEN_TO_CHUC')
    .select('ToChucID, VaiTro, TO_CHUC(TenToChuc, Slug)');
  if (memberError) throw mapDatabaseError(memberError);

  const memberships: OrganizerMembership[] = (memberRows || []).map((row: any) => {
    const toChuc = Array.isArray(row.TO_CHUC) ? row.TO_CHUC[0] : row.TO_CHUC;
    return {
      organizationId: String(row.ToChucID),
      organizationName: String(toChuc?.TenToChuc || 'Tổ chức'),
      organizationSlug: String(toChuc?.Slug || ''),
      role: String(row.VaiTro),
    };
  });
  if (!memberships.length) return {memberships: [], events: []};

  const {data: eventRows, error: eventError} = await supabase
    .from('SU_KIEN')
    .select(
      'SuKienID, ToChucID, TenSuKien, Slug, TrangThaiCongBo, TheLoai, ThoiGianBatDau, BannerURL, PosterURL, SUAT_DIEN(SuatDienID)',
    )
    .in('ToChucID', memberships.map((item: OrganizerMembership) => item.organizationId))
    .order('NgayCapNhat', {ascending: false});
  if (eventError) throw mapDatabaseError(eventError);

  return {
    memberships,
    events: (eventRows || []).map((row: any) => ({
      id: Number(row.SuKienID),
      organizationId: String(row.ToChucID),
      name: String(row.TenSuKien),
      slug: deduplicateSlug(String(row.Slug)),
      status: String(row.TrangThaiCongBo),
      category: String(row.TheLoai || 'KHAC'),
      startsAt: String(row.ThoiGianBatDau),
      showCount: Array.isArray(row.SUAT_DIEN) ? row.SUAT_DIEN.length : row.SUAT_DIEN ? 1 : 0,
      bannerUrl: row.BannerURL ? String(row.BannerURL) : undefined,
      posterUrl: row.PosterURL ? String(row.PosterURL) : undefined,
    })),
  };
}

export async function createOrganization(
  name: string,
  slug: string,
): Promise<{organizationId: string; name: string; slug: string; role: string}> {
  const {trimmedName, trimmedSlug} = validateOrganizationInput(name, slug);
  if (runtimeConfig.useMockData) {
    const session = await getOrganizerSession();
    if (!session) {
      throw new Error('Cần đăng nhập để tạo tổ chức.');
    }
    if (!isOrganizerAccount(session.accountKind)) {
      throw new Error('Chỉ tài khoản Ban tổ chức mới có thể tạo tổ chức.');
    }
    let orgs: OrganizerMembership[] = [];
    try {
      const stored = localStorage.getItem(MOCK_ORGS);
      if (stored !== null) orgs = JSON.parse(stored);
      else orgs = [mockDefaultOrg];
    } catch {
      orgs = [mockDefaultOrg];
    }
    const newOrg: OrganizerMembership = {
      organizationId: `mock-org-${Date.now()}`,
      organizationName: trimmedName,
      organizationSlug: trimmedSlug,
      role: 'CHU_SO_HUU',
    };
    orgs.unshift(newOrg);
    localStorage.setItem(MOCK_ORGS, JSON.stringify(orgs));
    return {
      organizationId: newOrg.organizationId,
      name: newOrg.organizationName,
      slug: newOrg.organizationSlug,
      role: newOrg.role,
    };
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {data, error} = await (requireSupabaseClient() as any).rpc('tao_to_chuc_cua_toi', {
    p_ten_to_chuc: trimmedName,
    p_slug: trimmedSlug,
  });
  if (error) throw mapDatabaseError(error);
  return data;
}

export async function createEventDraft(input: CreateDraftInput): Promise<void> {
  validateEventDraftInput(input);
  if (runtimeConfig.useMockData) {
    const session = await getOrganizerSession();
    if (!session) {
      throw new Error('Cần đăng nhập để tạo sự kiện.');
    }
    if (!isOrganizerAccount(session.accountKind)) {
      throw new Error('Chỉ tài khoản Ban tổ chức mới có thể tạo sự kiện.');
    }
    const rows = JSON.parse(localStorage.getItem(MOCK_EVENTS) || '[]') as any[];
    const cleanSlug = deduplicateSlug(input.slug).trim().toLowerCase();
    rows.unshift({
      id: Date.now(),
      organizationId: input.organizationId,
      name: input.name.trim(),
      slug: cleanSlug,
      status: 'BAN_NHAP',
      category: input.category.toUpperCase(),
      description: input.description.trim(),
      venueName: input.venueName.trim(),
      address: input.address.trim(),
      startsAt: new Date(input.startsAt).toISOString(),
      endsAt: new Date(input.endsAt).toISOString(),
      saleStartsAt: new Date(input.saleStartsAt).toISOString(),
      saleEndsAt: new Date(input.saleEndsAt).toISOString(),
      price: input.price,
      capacity: input.capacity,
      showCount: 1,
    });
    localStorage.setItem(MOCK_EVENTS, JSON.stringify(rows));
    return;
  }

  const {requireSupabaseClient} = await import('./supabaseClient');
  const cleanSlug = deduplicateSlug(input.slug).trim().toLowerCase();
  const {error} = await (requireSupabaseClient() as any).rpc('tao_ban_nhap_su_kien', {
    p_to_chuc_id: input.organizationId,
    p_ten_su_kien: input.name.trim(),
    p_slug: cleanSlug,
    p_mo_ta: input.description.trim(),
    p_the_loai: input.category.toUpperCase(),
    p_ten_dia_diem: input.venueName.trim(),
    p_dia_chi: input.address.trim(),
    p_bat_dau: new Date(input.startsAt).toISOString(),
    p_ket_thuc: new Date(input.endsAt).toISOString(),
    p_mo_ban: new Date(input.saleStartsAt).toISOString(),
    p_dong_ban: new Date(input.saleEndsAt).toISOString(),
    p_gia_ve: input.price,
    p_suc_chua: input.capacity,
  });
  if (error) throw mapDatabaseError(error);
}

export async function saveFullEventDraft(
  input: FullEventAggregateInput,
): Promise<{eventId: number; slug: string; status: string}> {
  validateFullEventAggregate(input, {isPublishing: false});
  const cleanSlug = deduplicateSlug(input.slug).trim().toLowerCase();
  const normalizedInput: FullEventAggregateInput = {...input, slug: cleanSlug};

  if (runtimeConfig.useMockData) {
    const session = await getOrganizerSession();
    if (!session) {
      throw new Error('Cần đăng nhập để tạo hoặc sửa sự kiện.');
    }
    if (!isOrganizerAccount(session.accountKind)) {
      throw new Error('Chỉ tài khoản Ban tổ chức mới có thể tạo hoặc sửa sự kiện.');
    }
    const rows = JSON.parse(localStorage.getItem(MOCK_EVENTS) || '[]') as any[];
    const now = new Date().toISOString();
    let eventId = normalizedInput.eventId;
    let status = 'BAN_NHAP';

    const shows = normalizedInput.shows || [];
    const firstShow = shows[0];
    const startsAt = firstShow ? firstShow.startsAt : new Date().toISOString();
    const endsAt = firstShow ? firstShow.endsAt : new Date().toISOString();
    const saleStartsAt = firstShow ? firstShow.saleStartsAt : new Date().toISOString();
    const saleEndsAt = firstShow?.saleEndsAt;
    const totalCapacity = shows.reduce(
      (sum, s) => sum + (s.ticketTiers || []).reduce((tSum, t) => tSum + (Number(t.capacity) || 0), 0),
      0,
    );
    const minPrice = shows.reduce((min, s) => {
      const tierPrices = (s.ticketTiers || []).map((t) => Number(t.price) || 0);
      return tierPrices.length ? Math.min(min, ...tierPrices) : min;
    }, 0);

    if (eventId) {
      const existingIdx = rows.findIndex((r) => r.id === eventId);
      if (existingIdx >= 0) {
        status = rows[existingIdx].status || 'BAN_NHAP';
        rows[existingIdx] = {
          ...rows[existingIdx],
          ...normalizedInput,
          id: eventId,
          slug: cleanSlug,
          status,
          startsAt,
          endsAt,
          saleStartsAt,
          saleEndsAt,
          capacity: totalCapacity || 100,
          price: minPrice,
          showCount: shows.length || 1,
          updatedAt: now,
        };
      } else {
        rows.unshift({
          ...normalizedInput,
          id: eventId,
          slug: cleanSlug,
          status: 'BAN_NHAP',
          startsAt,
          endsAt,
          saleStartsAt,
          saleEndsAt,
          capacity: totalCapacity || 100,
          price: minPrice,
          showCount: shows.length || 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      eventId = Date.now();
      rows.unshift({
        ...normalizedInput,
        id: eventId,
        slug: cleanSlug,
        status: 'BAN_NHAP',
        startsAt,
        endsAt,
        saleStartsAt,
        saleEndsAt,
        capacity: totalCapacity || 100,
        price: minPrice,
        showCount: shows.length || 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    localStorage.setItem(MOCK_EVENTS, JSON.stringify(rows));
    return {eventId, slug: cleanSlug, status};
  }

  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient() as any;
  const {data, error} = await supabase.rpc('luu_su_kien_toan_dien', {
    p_payload: normalizedInput,
  });
  if (error) throw mapDatabaseError(error);
  return {
    eventId: Number(data.eventId),
    slug: String(data.slug),
    status: String(data.status || 'BAN_NHAP'),
  };
}

export async function loadEventForEditing(eventId: number): Promise<FullEventAggregateInput> {
  if (runtimeConfig.useMockData) {
    const rows = JSON.parse(localStorage.getItem(MOCK_EVENTS) || '[]') as any[];
    const found = rows.find((r) => r.id === eventId);
    if (!found) throw new Error('Không tìm thấy sự kiện để chỉnh sửa.');

    const shows: FullEventShowInput[] =
      Array.isArray(found.shows) && found.shows.length > 0
        ? found.shows
        : [
            {
              showId: found.id + 100,
              slug: 'suat-1',
              name: 'Suất diễn 1',
              startsAt: found.startsAt || new Date().toISOString(),
              endsAt: found.endsAt || new Date().toISOString(),
              saleStartsAt: found.saleStartsAt || new Date().toISOString(),
              saleEndsAt: found.saleEndsAt,
              ticketTiers: [
                {
                  tierId: found.id + 200,
                  code: 'GENERAL_ADMISSION',
                  name: 'Vé tiêu chuẩn',
                  type: 'DUNG_STAND',
                  price: Number(found.price || 0),
                  capacity: Number(found.capacity || 100),
                  color: '#84CC16',
                  benefits: 'Quyền vào cửa tiêu chuẩn.',
                  minPerOrder: 1,
                  maxPerOrder: 4,
                },
              ],
            },
          ];

    return {
      eventId: found.id,
      organizationId: found.organizationId,
      name: found.name,
      slug: found.slug,
      category: found.category || 'KHAC',
      slogan: found.slogan || '',
      description: found.description || '',
      locationMode: found.locationMode || 'OFFLINE',
      venueName: found.venueName || '',
      address: found.address || '',
      onlineLink: found.onlineLink || '',
      onlineInstructions: found.onlineInstructions || '',
      bannerUrl: found.bannerUrl || '',
      posterUrl: found.posterUrl || '',
      trailerUrl: found.trailerUrl || '',
      seatingMapUrl: found.seatingMapUrl || '',
      ageRestriction: found.ageRestriction || '14+',
      refundPolicy: found.refundPolicy || '',
      termsAndConditions: found.termsAndConditions || '',
      contactEmail: found.contactEmail || '',
      contactHotline: found.contactHotline || '',
      fanpageUrl: found.fanpageUrl || '',
      permitNumber: found.permitNumber || '',
      shows,
    };
  }

  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient() as any;
  const {data: eventRow, error: eventErr} = await supabase
    .from('SU_KIEN')
    .select('*, SUAT_DIEN(*, KHU_VUC(*))')
    .eq('SuKienID', eventId)
    .single();

  if (eventErr) throw mapDatabaseError(eventErr);
  if (!eventRow) throw new Error('Không tìm thấy sự kiện.');

  const showRows = Array.isArray(eventRow.SUAT_DIEN) ? eventRow.SUAT_DIEN : [];
  const shows: FullEventShowInput[] = showRows.map((s: any) => {
    const tierRows = Array.isArray(s.KHU_VUC) ? s.KHU_VUC : [];
    return {
      showId: Number(s.SuatDienID),
      slug: String(s.Slug),
      name: String(s.TenSuatDien),
      startsAt: String(s.ThoiGianBatDau),
      endsAt: String(s.ThoiGianKetThuc),
      doorsOpenAt: s.ThoiGianMoCua ? String(s.ThoiGianMoCua) : undefined,
      saleStartsAt: String(s.ThoiGianMoBanVe),
      saleEndsAt: s.ThoiGianDongBanVe ? String(s.ThoiGianDongBanVe) : undefined,
      ticketTiers: tierRows.map((t: any) => ({
        tierId: Number(t.KhuVucID),
        code: String(t.MaKhuVuc),
        name: String(t.TenKhuVuc),
        type: t.LoaiKhuVuc === 'GHE_NGOI' ? 'GHE_NGOI' : 'DUNG_STAND',
        price: Number(t.GiaVeNiemYet || 0),
        capacity: Number(t.TongSoGhe || 1),
        color: String(t.MauSacHex || '#84CC16'),
        benefits: t.MoTaQuyenLoi ? String(t.MoTaQuyenLoi) : undefined,
        minPerOrder: Number(t.SoVeToiThieuMoiDon || 1),
        maxPerOrder: Number(t.SoVeToiDaMoiDon || 4),
      })),
    };
  });

  return {
    eventId: Number(eventRow.SuKienID),
    organizationId: String(eventRow.ToChucID),
    name: String(eventRow.TenSuKien),
    slug: deduplicateSlug(String(eventRow.Slug)),
    category: String(eventRow.TheLoai || 'KHAC'),
    slogan: eventRow.Slogan ? String(eventRow.Slogan) : '',
    description: eventRow.MoTaChiTiet ? String(eventRow.MoTaChiTiet) : '',
    locationMode: (eventRow.LoaiHinhSuKien || 'OFFLINE') as any,
    venueName: eventRow.TenSanVanDong ? String(eventRow.TenSanVanDong) : '',
    address: eventRow.DiaDiem ? String(eventRow.DiaDiem) : '',
    onlineLink: eventRow.DuongDanTrucTuyen ? String(eventRow.DuongDanTrucTuyen) : '',
    onlineInstructions: eventRow.HuongDanThamGiaTrucTuyen ? String(eventRow.HuongDanThamGiaTrucTuyen) : '',
    bannerUrl: eventRow.BannerURL ? String(eventRow.BannerURL) : '',
    posterUrl: eventRow.PosterURL ? String(eventRow.PosterURL) : '',
    trailerUrl: eventRow.TrailerURL ? String(eventRow.TrailerURL) : '',
    seatingMapUrl: eventRow.SoDoTongQuanURL ? String(eventRow.SoDoTongQuanURL) : '',
    ageRestriction: eventRow.QuyDinhDoTuoi ? String(eventRow.QuyDinhDoTuoi) : '14+',
    refundPolicy: eventRow.ChinhSachHoanHuy ? String(eventRow.ChinhSachHoanHuy) : '',
    termsAndConditions: eventRow.QuyDinhThamGia ? String(eventRow.QuyDinhThamGia) : '',
    contactEmail: eventRow.EmailLienHe ? String(eventRow.EmailLienHe) : '',
    contactHotline: eventRow.HotlineLienHe ? String(eventRow.HotlineLienHe) : '',
    fanpageUrl: eventRow.FanpageURL ? String(eventRow.FanpageURL) : '',
    permitNumber: eventRow.SoGiayPhepBieuDien ? String(eventRow.SoGiayPhepBieuDien) : '',
    shows,
  };
}

export async function loadEventForPreview(
  slug: string,
  requestedShowSlug?: string,
): Promise<PublicEventRecord> {
  const normalizedSlug = deduplicateSlug(slug);

  if (runtimeConfig.useMockData) {
    const rows = JSON.parse(localStorage.getItem(MOCK_EVENTS) || '[]') as any[];
    const found = rows.find(
      (r) => r.slug === normalizedSlug || deduplicateSlug(r.slug) === normalizedSlug,
    );
    if (!found) throw new Error('Không tìm thấy bản nháp sự kiện để xem trước.');

    const aggregate = await loadEventForEditing(found.id);
    const shows: PublicShowRecord[] = aggregate.shows.map((s, idx) => ({
      id: s.showId || found.id + 100 + idx,
      slug: s.slug,
      name: s.name,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      saleStartsAt: s.saleStartsAt,
      saleEndsAt: s.saleEndsAt,
      timezone: 'Asia/Ho_Chi_Minh',
      databaseSaleStatus: 'SAP_MO_BAN',
    }));
    const selectedShow = shows.find((s) => s.slug === requestedShowSlug) || shows[0];

    return {
      id: found.id,
      code: found.slug.toUpperCase().replaceAll('-', '_'),
      slug: normalizedSlug,
      name: aggregate.name,
      slogan: aggregate.slogan || undefined,
      description: aggregate.description || undefined,
      templateKey: 'DEFAULT',
      category: aggregate.category,
      bannerUrl: aggregate.bannerUrl || undefined,
      posterUrl: aggregate.posterUrl || undefined,
      trailerUrl: aggregate.trailerUrl || undefined,
      seatingMapUrl: aggregate.seatingMapUrl || undefined,
      ageRestriction: aggregate.ageRestriction || '14+',
      refundPolicy: aggregate.refundPolicy || undefined,
      termsAndConditions: aggregate.termsAndConditions || undefined,
      contactEmail: aggregate.contactEmail || undefined,
      contactHotline: aggregate.contactHotline || undefined,
      fanpageUrl: aggregate.fanpageUrl || undefined,
      permitNumber: aggregate.permitNumber || undefined,
      locationMode: aggregate.locationMode,
      onlineLink: aggregate.onlineLink || undefined,
      onlineInstructions: aggregate.onlineInstructions || undefined,
      startsAt: selectedShow.startsAt,
      endsAt: selectedShow.endsAt,
      saleStartsAt: selectedShow.saleStartsAt,
      saleEndsAt: selectedShow.saleEndsAt,
      venueName: aggregate.venueName || 'Địa điểm tổ chức',
      address: aggregate.address || '',
      capacity: aggregate.shows.reduce(
        (sum, s) => sum + s.ticketTiers.reduce((tSum, t) => tSum + (Number(t.capacity) || 0), 0),
        0,
      ) || 100,
      databaseSaleStatus: 'SAP_MO_BAN',
      publicationStatus: (found.status || 'BAN_NHAP') as any,
      selectedShow,
      shows,
    };
  }

  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient() as any;
  const {data: eventRow, error: eventErr} = await supabase
    .from('SU_KIEN')
    .select('*, SUAT_DIEN(*)')
    .eq('Slug', normalizedSlug)
    .single();

  if (eventErr) throw mapDatabaseError(eventErr);
  if (!eventRow) throw new Error('Không tìm thấy sự kiện để xem trước.');

  const showRows = Array.isArray(eventRow.SUAT_DIEN) ? eventRow.SUAT_DIEN : [];
  const shows: PublicShowRecord[] = showRows.map((s: any) => ({
    id: Number(s.SuatDienID),
    slug: String(s.Slug),
    name: String(s.TenSuatDien),
    startsAt: String(s.ThoiGianBatDau),
    endsAt: String(s.ThoiGianKetThuc),
    saleStartsAt: String(s.ThoiGianMoBanVe),
    saleEndsAt: s.ThoiGianDongBanVe ? String(s.ThoiGianDongBanVe) : undefined,
    timezone: String(s.MuiGio || 'Asia/Ho_Chi_Minh'),
    databaseSaleStatus: String(s.TrangThai || 'SAP_MO_BAN'),
  }));
  const selectedShow = shows.find((s) => s.slug === requestedShowSlug) || shows[0];

  return {
    id: Number(eventRow.SuKienID),
    code: String(eventRow.Slug),
    slug: normalizedSlug,
    name: String(eventRow.TenSuKien),
    slogan: eventRow.Slogan ? String(eventRow.Slogan) : undefined,
    description: eventRow.MoTaChiTiet ? String(eventRow.MoTaChiTiet) : undefined,
    templateKey: eventRow.TemplateKey === 'SUPER_CONCERT_2026' ? 'SUPER_CONCERT_2026' : 'DEFAULT',
    category: String(eventRow.TheLoai || 'KHAC'),
    bannerUrl: eventRow.BannerURL ? String(eventRow.BannerURL) : undefined,
    posterUrl: eventRow.PosterURL ? String(eventRow.PosterURL) : undefined,
    trailerUrl: eventRow.TrailerURL ? String(eventRow.TrailerURL) : undefined,
    seatingMapUrl: eventRow.SoDoTongQuanURL ? String(eventRow.SoDoTongQuanURL) : undefined,
    ageRestriction: eventRow.QuyDinhDoTuoi ? String(eventRow.QuyDinhDoTuoi) : undefined,
    refundPolicy: eventRow.ChinhSachHoanHuy ? String(eventRow.ChinhSachHoanHuy) : undefined,
    termsAndConditions: eventRow.QuyDinhThamGia ? String(eventRow.QuyDinhThamGia) : undefined,
    contactEmail: eventRow.EmailLienHe ? String(eventRow.EmailLienHe) : undefined,
    contactHotline: eventRow.HotlineLienHe ? String(eventRow.HotlineLienHe) : undefined,
    fanpageUrl: eventRow.FanpageURL ? String(eventRow.FanpageURL) : undefined,
    permitNumber: eventRow.SoGiayPhepBieuDien ? String(eventRow.SoGiayPhepBieuDien) : undefined,
    locationMode: eventRow.LoaiHinhSuKien ? String(eventRow.LoaiHinhSuKien) : undefined,
    onlineLink: eventRow.DuongDanTrucTuyen ? String(eventRow.DuongDanTrucTuyen) : undefined,
    onlineInstructions: eventRow.HuongDanThamGiaTrucTuyen ? String(eventRow.HuongDanThamGiaTrucTuyen) : undefined,
    startsAt: selectedShow?.startsAt || String(eventRow.ThoiGianBatDau),
    endsAt: selectedShow?.endsAt || String(eventRow.ThoiGianKetThuc),
    saleStartsAt: selectedShow?.saleStartsAt || String(eventRow.ThoiGianMoBanVe),
    saleEndsAt: selectedShow?.saleEndsAt || (eventRow.ThoiGianDongBanVe ? String(eventRow.ThoiGianDongBanVe) : undefined),
    venueName: String(eventRow.TenSanVanDong || 'Địa điểm tổ chức'),
    address: String(eventRow.DiaDiem || ''),
    capacity: Number(eventRow.SucChua || 100),
    databaseSaleStatus: selectedShow?.databaseSaleStatus || 'SAP_MO_BAN',
    publicationStatus: eventRow.TrangThaiCongBo as any,
    selectedShow,
    shows,
  };
}

export async function publishEvent(eventId: number): Promise<void> {
  if (runtimeConfig.useMockData) {
    const rows = JSON.parse(localStorage.getItem(MOCK_EVENTS) || '[]') as any[];
    const target = rows.find((r) => r.id === eventId);
    if (!target) throw new Error('Không tìm thấy sự kiện để công bố.');
    if (target.capacity < 1) throw new Error('Sự kiện chưa có phân khu bán vé hợp lệ.');
    localStorage.setItem(
      MOCK_EVENTS,
      JSON.stringify(rows.map((row) => (row.id === eventId ? {...row, status: 'CONG_KHAI'} : row))),
    );
    return;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {error} = await (requireSupabaseClient() as any).rpc('cong_bo_su_kien', {p_su_kien_id: eventId});
  if (error) throw mapDatabaseError(error);
}
