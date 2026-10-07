import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import type * as React from 'react';
import {buildPublicPath, deduplicateSlug, navigatePublicRoute} from '../domain/publicRoute';
import {
  canManageOrganizationEvents,
  createOrganization,
  filterEventsByOrganization,
  getOrganizerSession,
  isOrganizerAccount,
  isOrganizerEditorRole,
  loadOrganizerWorkspace,
  loadSavedActiveOrganizationId,
  publishEvent,
  resolveActiveOrganizationId,
  saveActiveOrganizationId,
  signInOrganizer,
  signOutOrganizer,
  signUpOrganizer,
  subscribeOrganizerAuth,
  saveFullEventDraft,
  loadEventForEditing,
  evaluatePublishReadiness,
  VALID_CATEGORIES,
  VALID_LOCATION_MODES,
  type FullEventAggregateInput,
  type FullEventShowInput,
  type FullEventTierInput,
  type OrganizerEvent,
  type OrganizerMembership,
  type OrganizerSession,
  type PublishReadinessResult,
} from '../services/organizerService';

const money = new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND', maximumFractionDigits: 0});
const date = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const toSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const roleLabels: Record<string, string> = {
  CHU_SO_HUU: 'Chủ sở hữu',
  QUAN_TRI: 'Quản trị viên',
  BIEN_TAP: 'Biên tập viên',
  VAN_HANH: 'Vận hành (Chỉ xem)',
  SOAT_VE: 'Soát vé (Chỉ xem)',
};

const categoryLabels: Record<string, string> = {
  AM_NHAC: 'Âm nhạc / Ca nhạc',
  SAN_KHAU: 'Sân khấu / Kịch nói',
  THE_THAO: 'Thể thao / Giải đấu',
  HOI_THAO: 'Hội thảo / Tọa đàm',
  WORKSHOP: 'Workshop / Đào tạo',
  TRIEN_LAM: 'Triển lãm / Hội chợ',
  GIAI_TRI: 'Giải trí / Lễ hội',
  CONG_DONG: 'Cộng đồng / Thiện nguyện',
  THAM_QUAN: 'Tham quan / Trải nghiệm',
  KHAC: 'Khác',
};

const locationModeLabels: Record<string, string> = {
  OFFLINE: 'Trực tiếp tại địa điểm (Offline)',
  ONLINE: 'Trực tuyến (Online)',
  HYBRID: 'Kết hợp trực tiếp & trực tuyến (Hybrid)',
  TBA: 'Địa điểm sẽ thông báo sau (TBA)',
};

const WIZARD_STEP_TITLES = [
  'Thông tin cơ bản',
  'Địa điểm & Suất diễn',
  'Phân khu & Hạng vé',
  'Hình ảnh & Truyền thông',
  'Quy định & Liên hệ',
  'Kiểm tra & Xuất bản',
];

function getDefaultDraftDates() {
  const now = new Date();
  const addDays = (d: Date, days: number, hours = 19, minutes = 0) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    next.setHours(hours, minutes, 0, 0);
    return next;
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const format = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    startsAt: format(addDays(now, 15, 19, 0)),
    endsAt: format(addDays(now, 15, 22, 30)),
    saleStartsAt: format(addDays(now, 1, 9, 0)),
    saleEndsAt: format(addDays(now, 14, 23, 59)),
  };
}

function createDefaultAggregate(
  orgId: string,
  userEmail?: string,
  defaultDates = getDefaultDraftDates(),
): FullEventAggregateInput {
  return {
    organizationId: orgId,
    name: '',
    slug: '',
    category: 'AM_NHAC',
    slogan: '',
    description: '',
    locationMode: 'OFFLINE',
    venueName: '',
    address: '',
    onlineLink: '',
    onlineInstructions: '',
    bannerUrl: '',
    posterUrl: '',
    trailerUrl: '',
    seatingMapUrl: '',
    ageRestriction: '14+',
    refundPolicy: 'Vé đã mua không được hoàn hoặc hủy trừ trường hợp sự kiện bị hủy bỏ bởi Ban tổ chức.',
    termsAndConditions:
      'Khán giả vui lòng mang theo giấy tờ tùy thân và mã vé điện tử khi đến check-in. Nghiêm cấm mang theo vũ khí, chất dễ cháy nổ.',
    contactEmail: userEmail || '',
    contactHotline: '',
    fanpageUrl: '',
    permitNumber: '',
    shows: [
      {
        slug: 'suat-1',
        name: 'Suất diễn 1',
        startsAt: defaultDates.startsAt,
        endsAt: defaultDates.endsAt,
        doorsOpenAt: defaultDates.startsAt,
        saleStartsAt: defaultDates.saleStartsAt,
        saleEndsAt: defaultDates.saleEndsAt,
        ticketTiers: [
          {
            code: 'GENERAL_ADMISSION',
            name: 'Vé tiêu chuẩn',
            type: 'DUNG_STAND',
            price: 250000,
            capacity: 500,
            color: '#84CC16',
            benefits: 'Quyền vào cửa tiêu chuẩn.',
            minPerOrder: 1,
            maxPerOrder: 4,
          },
        ],
      },
    ],
  };
}

export function OrganizerPortal({page}: {page: string}) {
  const [session, setSession] = useState<OrganizerSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const activeSession = await getOrganizerSession();
      setSession(activeSession);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Organizer Studio | EventTicketing';
    void refreshSession();
    const unsubscribe = subscribeOrganizerAuth((newSession) => {
      setSession(newSession);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [refreshSession]);

  if (loading) {
    return (
      <OrganizerFrame>
        <div className="organizer-empty">Đang xác thực phiên làm việc…</div>
      </OrganizerFrame>
    );
  }

  if (!session || page === 'login') {
    return (
      <OrganizerAuth
        session={session}
        onChanged={refreshSession}
        onLoginSuccess={() => navigatePublicRoute('organizer')}
      />
    );
  }

  if (!isOrganizerAccount(session.accountKind)) {
    return (
      <OrganizerAccessDenied
        session={session}
        onSignOut={async () => {
          await signOutOrganizer();
          await refreshSession();
          navigatePublicRoute('organizer/login');
        }}
      />
    );
  }

  return <OrganizerDashboard session={session} />;
}

function OrganizerFrame({children}: {children: React.ReactNode}) {
  return (
    <div className="organizer-shell">
      <header className="organizer-topbar">
        <a
          className="marketplace-logo"
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              navigatePublicRoute('events');
            }
          }}
        >
          EV<span>ENT</span>
        </a>
        <span>ORGANIZER STUDIO</span>
        <a
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              navigatePublicRoute('events');
            }
          }}
        >
          ← Về trang bán vé
        </a>
      </header>
      {children}
    </div>
  );
}

function OrganizerAccessDenied({
  session,
  onSignOut,
}: {
  session: OrganizerSession;
  onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganizerFrame>
      <main className="organizer-auth" style={{maxWidth: '680px', margin: '40px auto', display: 'flex', justifyContent: 'center'}}>
        <div className="organizer-auth-card" style={{width: '100%', textAlign: 'left', padding: '36px 32px'}}>
          <div style={{display: 'inline-block', padding: '4px 10px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderRadius: '4px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '16px'}}>
            TRUY CẬP BỊ TỪ CHỐI · TÀI KHOẢN KHÁN GIẢ (USER)
          </div>
          <h1 style={{fontSize: '24px', lineHeight: 1.3, marginBottom: '12px', color: '#fff'}}>
            Không có quyền truy cập Studio Ban tổ chức
          </h1>
          <p style={{color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px'}}>
            Tài khoản <strong style={{color: '#f1f5f9'}}>{session.email}</strong> hiện là <strong>Khán giả / Người mua vé (USER)</strong>. Studio Ban tổ chức yêu cầu tài khoản được cấp quyền Ban tổ chức (ORGANIZER).
          </p>
          <div style={{background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '16px', marginBottom: '24px'}}>
            <p style={{margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5}}>
              🔒 <strong>Chính sách phân quyền hệ thống:</strong> Nhằm bảo đảm an toàn thương mại cho các sự kiện trên nền tảng, tài khoản khán giả không thể tự nâng cấp lên Ban tổ chức. Quyền Ban tổ chức cần được Quản trị viên hệ thống phê duyệt và kích hoạt.
            </p>
          </div>
          <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
            <button
              type="button"
              className="organizer-primary"
              onClick={() => navigatePublicRoute('events')}
              style={{flex: 1, minWidth: '180px'}}
            >
              ← Về trang bán vé
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              style={{
                flex: 1,
                minWidth: '180px',
                minHeight: '44px',
                background: 'transparent',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {busy ? 'Đang xử lý…' : 'Đăng xuất tài khoản này'}
            </button>
          </div>
        </div>
      </main>
    </OrganizerFrame>
  );
}

function OrganizerAuth({
  session,
  onChanged,
  onLoginSuccess,
}: {
  session: OrganizerSession | null;
  onChanged: () => Promise<void>;
  onLoginSuccess: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get('email'));
      const password = String(form.get('password'));
      if (mode === 'login') {
        await signInOrganizer(email, password);
        await onChanged();
        onLoginSuccess();
      } else {
        const result = await signUpOrganizer(email, password);
        await onChanged();
        if (result.hasSession) {
          setMessage('Đăng ký và đăng nhập thành công!');
          onLoginSuccess();
        } else {
          setMessage('Tài khoản đã được tạo thành công! Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập.');
          setMode('login');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xác thực.');
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    if (!isOrganizerAccount(session.accountKind)) {
      return (
        <OrganizerAccessDenied
          session={session}
          onSignOut={async () => {
            await signOutOrganizer();
            await onChanged();
          }}
        />
      );
    }
    return (
      <OrganizerFrame>
        <div className="organizer-auth-card">
          <p>PHIÊN ĐĂNG NHẬP</p>
          <h1>Bạn đã đăng nhập.</h1>
          <button className="organizer-primary" onClick={onLoginSuccess}>
            Mở dashboard →
          </button>
        </div>
      </OrganizerFrame>
    );
  }

  return (
    <OrganizerFrame>
      <main className="organizer-auth">
        <div>
          <p>CỔNG BAN TỔ CHỨC</p>
          <h1>
            Biến ý tưởng
            <br />
            thành sự kiện.
          </h1>
          <span>Tạo lịch diễn, phân khu hạng vé và công bố lên marketplace trong cùng một luồng.</span>
        </div>
        <form onSubmit={submit}>
          <div className="organizer-auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => {
                setMode('login');
                setMessage('');
              }}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'is-active' : ''}
              onClick={() => {
                setMode('signup');
                setMessage('');
              }}
            >
              Tạo tài khoản
            </button>
          </div>
          <label>
            Email
            <input name="email" type="email" required placeholder="ban.to.chuc@example.com" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" required minLength={6} placeholder="Tối thiểu 6 ký tự" />
          </label>
          {mode === 'signup' && (
            <div style={{background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#fde047', marginBottom: '14px', lineHeight: 1.4}}>
              ⚠️ <strong>Lưu ý:</strong> Để đảm bảo an toàn cho các sự kiện thương mại, tài khoản đăng ký mới mặc định ở trạng thái Khán giả. Quyền Ban tổ chức cần được Quản trị viên phê duyệt trước khi có thể tạo tổ chức và sự kiện.
            </div>
          )}
          {message && <p className="organizer-message">{message}</p>}
          <button className="organizer-primary" disabled={busy}>
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập vào Studio' : 'Tạo tài khoản BTC'}
          </button>
          <small>Quyền xem và sửa sự kiện được phân tách an toàn theo tổ chức bằng Supabase RLS.</small>
        </form>
      </main>
    </OrganizerFrame>
  );
}

function OrganizerDashboard({session}: {session: OrganizerSession}) {
  const [memberships, setMemberships] = useState<OrganizerMembership[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() =>
    loadSavedActiveOrganizationId(session.userId),
  );
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [busyOrg, setBusyOrg] = useState(false);
  const [wizardAggregate, setWizardAggregate] = useState<FullEventAggregateInput | null>(null);

  const defaultDates = useMemo(() => getDefaultDraftDates(), []);

  const refresh = useCallback(async () => {
    setState('loading');
    try {
      const data = await loadOrganizerWorkspace();
      setMemberships(data.memberships);
      setEvents(data.events);
      setState('ready');
    } catch (error) {
      console.error(error);
      setState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (memberships.length > 0) {
      setSelectedOrgId((current) => {
        const stored = loadSavedActiveOrganizationId(session.userId);
        const candidate = current || stored;
        const resolved = resolveActiveOrganizationId(memberships, candidate);
        if (resolved) {
          saveActiveOrganizationId(session.userId, resolved);
        }
        return resolved;
      });
    } else {
      setSelectedOrgId(null);
      saveActiveOrganizationId(session.userId, null);
    }
  }, [memberships, session.userId]);

  const handleSelectOrg = useCallback(
    (orgId: string) => {
      const resolved = resolveActiveOrganizationId(memberships, orgId);
      setSelectedOrgId(resolved);
      if (resolved) {
        saveActiveOrganizationId(session.userId, resolved);
      }
    },
    [memberships, session.userId],
  );

  async function logout() {
    try {
      await signOutOrganizer();
    } catch (e) {
      console.warn('Đăng xuất hoàn tất:', e);
    }
    navigatePublicRoute('organizer/login');
  }

  const activeOrg = useMemo(
    () => memberships.find((m) => m.organizationId === selectedOrgId) || memberships[0] || null,
    [memberships, selectedOrgId],
  );
  const canEdit = canManageOrganizationEvents(activeOrg);
  const orgEvents = useMemo(
    () => filterEventsByOrganization(events, activeOrg?.organizationId),
    [events, activeOrg?.organizationId],
  );

  async function addOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyOrg(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const created = await createOrganization(String(data.get('name')), String(data.get('slug')));
      setMessage('Tạo tổ chức thành công.');
      await refresh();
      if (created?.organizationId) {
        handleSelectOrg(created.organizationId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo tổ chức.');
    } finally {
      setBusyOrg(false);
    }
  }

  function handleStartCreate() {
    if (!activeOrg || !canEdit) return;
    setMessage('');
    setWizardAggregate(createDefaultAggregate(activeOrg.organizationId, session.email, defaultDates));
  }

  async function handleStartEdit(eventId: number) {
    if (!activeOrg || !canEdit) return;
    setMessage('Đang nạp dữ liệu sự kiện…');
    try {
      const aggregate = await loadEventForEditing(eventId);
      setWizardAggregate(aggregate);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải sự kiện để chỉnh sửa.');
    }
  }

  async function publish(id: number) {
    if (!canEdit || !activeOrg) {
      setMessage('Tài khoản của bạn chỉ có quyền xem, không thể công bố sự kiện.');
      return;
    }
    const target = orgEvents.find((e) => e.id === id);
    if (!target) {
      setMessage('Sự kiện không thuộc tổ chức đang chọn.');
      return;
    }
    setPublishingId(id);
    setMessage('');
    try {
      await publishEvent(id);
      setMessage('Công bố sự kiện thành công! Sự kiện đã xuất hiện trên marketplace.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể công bố sự kiện.');
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <OrganizerFrame>
      <div className="organizer-layout">
        <aside>
          <p>KHÔNG GIAN LÀM VIỆC</p>
          {memberships.length > 1 ? (
            <label style={{marginTop: '10px'}}>
              <span style={{fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em'}}>
                Tổ chức đang chọn
              </span>
              <select
                value={activeOrg?.organizationId || ''}
                onChange={(e) => handleSelectOrg(e.target.value)}
                style={{
                  minHeight: '36px',
                  background: '#070908',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,.14)',
                  padding: '4px 8px',
                  marginTop: '4px',
                  width: '100%',
                }}
              >
                {memberships.map((m) => (
                  <option key={m.organizationId} value={m.organizationId}>
                    {m.organizationName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <h2>{activeOrg?.organizationName || 'Chưa có tổ chức'}</h2>
          )}
          {activeOrg && (
            <span className="organizer-role-badge">
              Vai trò: {roleLabels[activeOrg.role] || activeOrg.role}
            </span>
          )}
          <nav>
            <a className="is-active" href="#overview">
              Tổng quan
            </a>
            <a href="#events">Sự kiện</a>
          </nav>
          <div>
            <span>{session.email}</span>
            <button onClick={logout}>Đăng xuất</button>
          </div>
        </aside>

        <main className="organizer-main">
          <header>
            <div>
              <p>PRODUCT FOUNDATION</p>
              <h1>Trung tâm Ban tổ chức</h1>
            </div>
            <button
              className="organizer-primary"
              onClick={handleStartCreate}
              disabled={!memberships.length || !canEdit || !activeOrg}
              title={
                !memberships.length
                  ? 'Vui lòng tạo tổ chức trước'
                  : !canEdit
                  ? 'Chỉ chủ sở hữu, quản trị viên hoặc biên tập viên mới có thể tạo sự kiện'
                  : undefined
              }
            >
              + Tạo sự kiện
            </button>
          </header>

          {message && <p className="organizer-message">{message}</p>}
          {state === 'error' && (
            <div className="organizer-empty">Không thể tải workspace. Kiểm tra migration và quyền RLS.</div>
          )}
          {state === 'loading' && <div className="organizer-empty">Đang tải dữ liệu tổ chức…</div>}

          {state === 'ready' && !memberships.length && (
            <form className="organizer-onboarding" onSubmit={addOrg}>
              <p>BƯỚC KHỞI TẠO</p>
              <h2>Tạo tổ chức đầu tiên</h2>
              <label>
                Tên tổ chức
                <input
                  name="name"
                  required
                  minLength={3}
                  placeholder="Ví dụ: FTU Entertainment Lab"
                  onBlur={(e) => {
                    const slugInput = e.currentTarget.form?.elements.namedItem('slug') as HTMLInputElement;
                    if (slugInput && !slugInput.value) slugInput.value = toSlug(e.currentTarget.value);
                  }}
                />
              </label>
              <label>
                Slug
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="ftu-entertainment-lab"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <button className="organizer-primary" disabled={busyOrg}>
                {busyOrg ? 'Đang tạo tổ chức…' : 'Tạo tổ chức'}
              </button>
            </form>
          )}

          {state === 'ready' && memberships.length > 0 && (
            <>
              <section className="organizer-stats">
                <div>
                  <span>Sự kiện</span>
                  <strong>{orgEvents.length}</strong>
                  <small>Tổng trong tổ chức</small>
                </div>
                <div>
                  <span>Đã công bố</span>
                  <strong>{orgEvents.filter((e) => e.status === 'CONG_KHAI').length}</strong>
                  <small>Hiện trên marketplace</small>
                </div>
                <div>
                  <span>Bản nháp</span>
                  <strong>{orgEvents.filter((e) => e.status === 'BAN_NHAP').length}</strong>
                  <small>Chưa hiển thị công khai</small>
                </div>
              </section>

              <section id="events" className="organizer-events">
                <div>
                  <p>SỰ KIỆN CỦA TỔ CHỨC</p>
                  <h2>Quản lý xuất bản</h2>
                </div>
                {orgEvents.length === 0 ? (
                  <div className="organizer-empty">Chưa có sự kiện. Hãy tạo bản nháp đầu tiên.</div>
                ) : (
                  orgEvents.map((item) => (
                    <article key={item.id}>
                      <div>
                        <span className={`organizer-status organizer-status--${item.status.toLowerCase()}`}>
                          {item.status === 'CONG_KHAI' ? 'Đã công bố' : 'Bản nháp'}
                        </span>
                        <h3>{item.name}</h3>
                        <p>
                          {date.format(new Date(item.startsAt))} · {item.showCount} suất diễn
                        </p>
                      </div>
                      <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item.id)}
                            style={{
                              background: '#1e293b',
                              color: '#f8fafc',
                              border: '1px solid rgba(255,255,255,.15)',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            Chỉnh sửa
                          </button>
                        )}
                        <a
                          href={buildPublicPath(
                            window.location.pathname,
                            `events/${deduplicateSlug(item.slug)}${item.status !== 'CONG_KHAI' ? '?preview=1' : ''}`,
                          )}
                          onClick={(e) => {
                            if (!e.metaKey && !e.ctrlKey) {
                              e.preventDefault();
                              navigatePublicRoute(
                                `events/${deduplicateSlug(item.slug)}${
                                  item.status !== 'CONG_KHAI' ? '?preview=1' : ''
                                }`,
                              );
                            }
                          }}
                          style={{
                            color: '#84cc16',
                            textDecoration: 'none',
                            fontSize: '13px',
                            padding: '6px 10px',
                            border: '1px solid rgba(132,204,22,.3)',
                            borderRadius: '4px',
                          }}
                        >
                          {item.status === 'CONG_KHAI' ? 'Mở trang công khai ↗' : 'Xem trước ↗'}
                        </a>
                        {item.status !== 'CONG_KHAI' && (
                          <button
                            onClick={() => publish(item.id)}
                            disabled={publishingId === item.id || !canEdit}
                            title={
                              !canEdit
                                ? 'Chỉ chủ sở hữu, quản trị viên hoặc biên tập viên mới có thể công bố'
                                : undefined
                            }
                          >
                            {publishingId === item.id ? 'Đang công bố…' : 'Công bố'}
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </section>
            </>
          )}

          {wizardAggregate && (
            <OrganizerEventWizard
              initialAggregate={wizardAggregate}
              canEdit={canEdit}
              onClose={() => setWizardAggregate(null)}
              onSaved={async (_res, isPublished) => {
                await refresh();
                if (isPublished) {
                  setMessage('Sự kiện đã được công bố thành công lên marketplace!');
                }
              }}
            />
          )}
        </main>
      </div>
    </OrganizerFrame>
  );
}

function OrganizerEventWizard({
  initialAggregate,
  canEdit,
  onClose,
  onSaved,
}: {
  initialAggregate: FullEventAggregateInput;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (result: {eventId: number; slug: string; status: string}, isPublished?: boolean) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FullEventAggregateInput>(initialAggregate);
  const [selectedShowIdx, setSelectedShowIdx] = useState(0);
  const [busyDraft, setBusyDraft] = useState(false);
  const [busyPublish, setBusyPublish] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error' | 'info'; text: string} | null>(null);

  const readiness = useMemo<PublishReadinessResult>(() => evaluatePublishReadiness(formData), [formData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function updateField<K extends keyof FullEventAggregateInput>(key: K, value: FullEventAggregateInput[K]) {
    setFormData((prev) => ({...prev, [key]: value}));
  }

  function addShow() {
    const newIdx = formData.shows.length + 1;
    const lastShow = formData.shows[formData.shows.length - 1];
    let startsAt = getDefaultDraftDates().startsAt;
    let endsAt = getDefaultDraftDates().endsAt;
    let saleStartsAt = getDefaultDraftDates().saleStartsAt;
    let saleEndsAt = getDefaultDraftDates().saleEndsAt;

    if (lastShow) {
      try {
        const prevStart = new Date(lastShow.startsAt);
        const prevEnd = new Date(lastShow.endsAt);
        prevStart.setDate(prevStart.getDate() + 1);
        prevEnd.setDate(prevEnd.getDate() + 1);
        const pad = (n: number) => String(n).padStart(2, '0');
        startsAt = `${prevStart.getFullYear()}-${pad(prevStart.getMonth() + 1)}-${pad(prevStart.getDate())}T${pad(
          prevStart.getHours(),
        )}:${pad(prevStart.getMinutes())}`;
        endsAt = `${prevEnd.getFullYear()}-${pad(prevEnd.getMonth() + 1)}-${pad(prevEnd.getDate())}T${pad(
          prevEnd.getHours(),
        )}:${pad(prevEnd.getMinutes())}`;
        saleStartsAt = lastShow.saleStartsAt;
        saleEndsAt = lastShow.saleEndsAt;
      } catch {
        // fallback
      }
    }

    const clonedTiers: FullEventTierInput[] =
      lastShow && lastShow.ticketTiers.length
        ? lastShow.ticketTiers.map((t, tIdx) => ({
            code: `${t.code}_S${newIdx}`,
            name: t.name,
            type: t.type,
            price: t.price,
            capacity: t.capacity,
            color: t.color,
            benefits: t.benefits,
            minPerOrder: t.minPerOrder,
            maxPerOrder: t.maxPerOrder,
          }))
        : [
            {
              code: `TIER_${newIdx}`,
              name: 'Vé tiêu chuẩn',
              type: 'DUNG_STAND',
              price: 250000,
              capacity: 300,
              color: '#84CC16',
              benefits: 'Quyền vào cửa tiêu chuẩn.',
              minPerOrder: 1,
              maxPerOrder: 4,
            },
          ];

    const newShow: FullEventShowInput = {
      slug: `suat-${newIdx}`,
      name: `Suất diễn ${newIdx}`,
      startsAt,
      endsAt,
      doorsOpenAt: startsAt,
      saleStartsAt,
      saleEndsAt,
      ticketTiers: clonedTiers,
    };

    setFormData((prev) => ({
      ...prev,
      shows: [...prev.shows, newShow],
    }));
    setSelectedShowIdx(formData.shows.length);
  }

  function removeShow(index: number) {
    if (formData.shows.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      shows: prev.shows.filter((_, i) => i !== index),
    }));
    if (selectedShowIdx >= index && selectedShowIdx > 0) {
      setSelectedShowIdx(selectedShowIdx - 1);
    }
  }

  function updateShow(index: number, patch: Partial<FullEventShowInput>) {
    setFormData((prev) => {
      const shows = [...prev.shows];
      shows[index] = {...shows[index], ...patch};
      return {...prev, shows};
    });
  }

  function addTier(showIndex: number) {
    const currentShow = formData.shows[showIndex];
    if (!currentShow) return;
    const tierNum = currentShow.ticketTiers.length + 1;
    const newTier: FullEventTierInput = {
      code: `TIER_${tierNum}`,
      name: `Hạng vé ${tierNum}`,
      type: 'DUNG_STAND',
      price: 200000,
      capacity: 200,
      color: '#3B82F6',
      benefits: 'Quyền lợi hạng vé tiêu chuẩn.',
      minPerOrder: 1,
      maxPerOrder: 4,
    };
    updateShow(showIndex, {ticketTiers: [...currentShow.ticketTiers, newTier]});
  }

  function removeTier(showIndex: number, tierIndex: number) {
    const currentShow = formData.shows[showIndex];
    if (!currentShow || currentShow.ticketTiers.length <= 1) return;
    updateShow(showIndex, {
      ticketTiers: currentShow.ticketTiers.filter((_, i) => i !== tierIndex),
    });
  }

  function updateTier(showIndex: number, tierIndex: number, patch: Partial<FullEventTierInput>) {
    const currentShow = formData.shows[showIndex];
    if (!currentShow) return;
    const tiers = [...currentShow.ticketTiers];
    tiers[tierIndex] = {...tiers[tierIndex], ...patch};
    updateShow(showIndex, {ticketTiers: tiers});
  }

  function cloneTiersToAllShows(sourceShowIdx: number) {
    const sourceShow = formData.shows[sourceShowIdx];
    if (!sourceShow) return;
    setFormData((prev) => ({
      ...prev,
      shows: prev.shows.map((s, idx) => {
        if (idx === sourceShowIdx) return s;
        return {
          ...s,
          ticketTiers: sourceShow.ticketTiers.map((t, tIdx) => ({
            ...t,
            code: `${t.code}_S${idx + 1}`,
          })),
        };
      }),
    }));
    setFeedback({
      type: 'info',
      text: `Đã sao chép ${sourceShow.ticketTiers.length} hạng vé từ ${sourceShow.name} sang tất cả các suất diễn khác.`,
    });
  }

  async function handleSaveDraft() {
    setBusyDraft(true);
    setFeedback(null);
    try {
      const result = await saveFullEventDraft(formData);
      setFormData((prev) => ({
        ...prev,
        eventId: result.eventId,
        slug: result.slug,
      }));
      setFeedback({
        type: 'success',
        text: `Đã lưu bản nháp thành công! (Mã sự kiện: #${result.eventId})`,
      });
      await onSaved(result, false);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Không thể lưu bản nháp.',
      });
    } finally {
      setBusyDraft(false);
    }
  }

  async function handlePublish() {
    if (!readiness.isReady) {
      setFeedback({
        type: 'error',
        text: `Sự kiện còn ${readiness.blockers.length} tiêu chí bắt buộc chưa đạt. Vui lòng kiểm tra lại Bước 6.`,
      });
      setStep(6);
      return;
    }
    setBusyPublish(true);
    setFeedback(null);
    try {
      const draftRes = await saveFullEventDraft(formData);
      await publishEvent(draftRes.eventId);
      setFeedback({
        type: 'success',
        text: 'Xuất sắc! Sự kiện đã được công bố chính thức lên Marketplace.',
      });
      await onSaved(draftRes, true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Không thể công bố sự kiện.',
      });
    } finally {
      setBusyPublish(false);
    }
  }

  const currentShow = formData.shows[selectedShowIdx] || formData.shows[0];

  return (
    <div className="wizard-modal-backdrop" role="dialog" aria-modal="true">
      <div className="wizard-modal-window">
        {/* Wizard Top Header */}
        <header className="wizard-modal-header">
          <div>
            <span className="wizard-header-tag">
              {formData.eventId ? `CHỈNH SỬA SỰ KIỆN #${formData.eventId}` : 'TẠO SỰ KIỆN MỚI'}
            </span>
            <h2>{formData.name || 'Sự kiện chưa đặt tên'}</h2>
          </div>
          <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
            <button
              type="button"
              className="wizard-header-save-btn"
              onClick={handleSaveDraft}
              disabled={busyDraft || busyPublish || !canEdit}
            >
              {busyDraft ? 'Đang lưu…' : '💾 Lưu bản nháp'}
            </button>
            <button type="button" className="wizard-modal-close" onClick={onClose} aria-label="Đóng">
              ×
            </button>
          </div>
        </header>

        {/* 6-step progress bar */}
        <nav className="wizard-step-bar" aria-label="Các bước tạo sự kiện">
          {WIZARD_STEP_TITLES.map((title, idx) => {
            const stepNum = idx + 1;
            const isActive = step === stepNum;
            const isCompleted = step > stepNum;
            return (
              <button
                key={stepNum}
                type="button"
                className={`wizard-step-item ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`}
                onClick={() => setStep(stepNum)}
              >
                <span className="wizard-step-circle">{stepNum}</span>
                <span className="wizard-step-label">{title}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className={`wizard-alert wizard-alert--${feedback.type}`} role="alert">
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} aria-label="Bỏ qua">
              ×
            </button>
          </div>
        )}

        {/* Step Contents */}
        <div className="wizard-modal-content">
          {step === 1 && (
            <div className="wizard-form-section">
              <div className="wizard-section-intro">
                <h3>Bước 1: Thông tin chung & Nhận diện</h3>
                <p>Thiết lập tên sự kiện, đường dẫn slug thân thiện và mô tả chi tiết nội dung.</p>
              </div>

              <div className="wizard-grid-2">
                <label className="wizard-label">
                  Tên sự kiện <span className="req">*</span>
                  <input
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    onBlur={(e) => {
                      if (!formData.slug && e.target.value) {
                        updateField('slug', toSlug(e.target.value));
                      }
                    }}
                    placeholder="Ví dụ: Hanoi Indie Music Festival 2026"
                    required
                  />
                  <small>Tối thiểu 5 ký tự. Sẽ hiển thị ở tiêu đề lớn.</small>
                </label>

                <label className="wizard-label">
                  Đường dẫn (Slug) <span className="req">*</span>
                  <input
                    value={formData.slug}
                    onChange={(e) => updateField('slug', toSlug(e.target.value))}
                    placeholder="hanoi-indie-music-festival-2026"
                    required
                  />
                  <small>Dùng cho URL: /events/{formData.slug || 'slug-su-kien'}</small>
                </label>
              </div>

              <div className="wizard-grid-2">
                <label className="wizard-label">
                  Thể loại sự kiện <span className="req">*</span>
                  <select
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value)}
                  >
                    {VALID_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabels[cat] || cat}
                      </option>
                    ))}
                  </select>
                  <small>Phân loại giúp khán giả dễ dàng tìm kiếm trên marketplace.</small>
                </label>

                <label className="wizard-label">
                  Slogan / Thông điệp ngắn
                  <input
                    value={formData.slogan || ''}
                    onChange={(e) => updateField('slogan', e.target.value)}
                    placeholder="Ví dụ: Một đêm nhạc thăng hoa của những tâm hồn tự do"
                  />
                  <small>Dòng thông điệp hiển thị dưới tiêu đề (tùy chọn).</small>
                </label>
              </div>

              <label className="wizard-label">
                Mô tả chi tiết sự kiện
                <textarea
                  rows={6}
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Giới thiệu nội dung sự kiện, danh sách nghệ sĩ/diễn giả khách mời, lịch trình chi tiết và các trải nghiệm đặc biệt…"
                />
                <small>Khuyến nghị tối thiểu 20 ký tự để được duyệt công bố.</small>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-form-section">
              <div className="wizard-section-intro">
                <h3>Bước 2: Địa điểm & Lịch trình Suất diễn</h3>
                <p>Hỗ trợ sự kiện trực tiếp, trực tuyến, hoặc kết hợp với nhiều suất diễn riêng biệt.</p>
              </div>

              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '12.5px',
                  color: '#fde68a',
                  lineHeight: '1.45',
                }}
              >
                ⚠️ <strong>Lưu ý bảo vệ thương mại:</strong> Sau khi sự kiện được công bố và phát sinh lượt mua hoặc giữ chỗ, thời gian bắt đầu của suất diễn sẽ bị khóa chặt ở tầng backend. Hệ thống sẽ từ chối lưu thay đổi nếu cố tình dời lịch diễn đã bán vé.
              </div>

              <label className="wizard-label">
                Hình thức tổ chức <span className="req">*</span>
                <select
                  value={formData.locationMode}
                  onChange={(e) => updateField('locationMode', e.target.value as any)}
                >
                  {VALID_LOCATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {locationModeLabels[mode] || mode}
                    </option>
                  ))}
                </select>
              </label>

              {(formData.locationMode === 'OFFLINE' || formData.locationMode === 'HYBRID') && (
                <div className="wizard-grid-2">
                  <label className="wizard-label">
                    Tên địa điểm / Nhà hát / Sân vận động <span className="req">*</span>
                    <input
                      value={formData.venueName || ''}
                      onChange={(e) => updateField('venueName', e.target.value)}
                      placeholder="Ví dụ: Trung tâm Triển lãm Quốc tế I.C.E Hà Nội"
                      required
                    />
                  </label>
                  <label className="wizard-label">
                    Địa chỉ chi tiết <span className="req">*</span>
                    <input
                      value={formData.address || ''}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="Ví dụ: 91 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội"
                      required
                    />
                  </label>
                </div>
              )}

              {(formData.locationMode === 'ONLINE' || formData.locationMode === 'HYBRID') && (
                <div className="wizard-grid-2">
                  <label className="wizard-label">
                    Đường dẫn trực tuyến (URL) <span className="req">*</span>
                    <input
                      value={formData.onlineLink || ''}
                      onChange={(e) => updateField('onlineLink', e.target.value)}
                      placeholder="https://zoom.us/j/123456789 hoặc link livestream"
                      required
                    />
                  </label>
                  <label className="wizard-label">
                    Hướng dẫn tham gia trực tuyến
                    <input
                      value={formData.onlineInstructions || ''}
                      onChange={(e) => updateField('onlineInstructions', e.target.value)}
                      placeholder="Passcode phòng họp hoặc quy định mở camera"
                    />
                  </label>
                </div>
              )}

              {/* Show List Editor */}
              <div className="wizard-shows-block">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                  <div>
                    <h4 style={{margin: 0, color: '#f8fafc'}}>Danh sách suất diễn ({formData.shows.length})</h4>
                    <small style={{color: '#94a3b8'}}>Mỗi suất diễn có khung thời gian và giá vé riêng biệt.</small>
                  </div>
                  <button type="button" className="wizard-secondary-btn" onClick={addShow}>
                    + Thêm suất diễn
                  </button>
                </div>

                {formData.shows.map((show, idx) => (
                  <div key={idx} className="wizard-card-item">
                    <div className="wizard-card-header">
                      <strong>
                        Suất #{idx + 1}: {show.name}
                      </strong>
                      {formData.shows.length > 1 && (
                        <button
                          type="button"
                          className="wizard-delete-btn"
                          onClick={() => removeShow(idx)}
                          title="Xóa suất diễn này"
                        >
                          Xóa suất diễn
                        </button>
                      )}
                    </div>

                    <div className="wizard-grid-2">
                      <label className="wizard-label">
                        Tên suất diễn <span className="req">*</span>
                        <input
                          value={show.name}
                          onChange={(e) => updateShow(idx, {name: e.target.value})}
                          placeholder="Ví dụ: Đêm diễn 1 / Buổi sáng"
                          required
                        />
                      </label>
                      <label className="wizard-label">
                        Slug suất diễn <span className="req">*</span>
                        <input
                          value={show.slug}
                          onChange={(e) => updateShow(idx, {slug: toSlug(e.target.value)})}
                          placeholder="dem-1"
                          required
                        />
                      </label>
                    </div>

                    <div className="wizard-grid-2">
                      <label className="wizard-label">
                        Giờ bắt đầu biểu diễn <span className="req">*</span>
                        <input
                          type="datetime-local"
                          value={show.startsAt ? show.startsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {startsAt: e.target.value})}
                          required
                        />
                      </label>
                      <label className="wizard-label">
                        Giờ kết thúc biểu diễn <span className="req">*</span>
                        <input
                          type="datetime-local"
                          value={show.endsAt ? show.endsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {endsAt: e.target.value})}
                          required
                        />
                      </label>
                    </div>

                    <div className="wizard-grid-3">
                      <label className="wizard-label">
                        Giờ mở cửa đón khách (Doors Open)
                        <input
                          type="datetime-local"
                          value={show.doorsOpenAt ? show.doorsOpenAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {doorsOpenAt: e.target.value || undefined})}
                        />
                        <small>Trước hoặc bằng giờ bắt đầu.</small>
                      </label>
                      <label className="wizard-label">
                        Thời gian mở bán vé <span className="req">*</span>
                        <input
                          type="datetime-local"
                          value={show.saleStartsAt ? show.saleStartsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {saleStartsAt: e.target.value})}
                          required
                        />
                      </label>
                      <label className="wizard-label">
                        Thời gian đóng bán vé
                        <input
                          type="datetime-local"
                          value={show.saleEndsAt ? show.saleEndsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {saleEndsAt: e.target.value || undefined})}
                        />
                        <small>Trước giờ diễn.</small>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-form-section">
              <div className="wizard-section-intro">
                <h3>Bước 3: Phân khu & Hạng vé</h3>
                <p>Cấu hình các hạng vé (VIP, GA, Early Bird), giá tiền, sức chứa và giới hạn số vé mỗi đơn.</p>
              </div>

              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '12.5px',
                  color: '#fde68a',
                  lineHeight: '1.45',
                }}
              >
                ⚠️ <strong>Lưu ý bảo vệ thương mại:</strong> Sau khi sự kiện được công bố và có vé đang giữ chỗ hoặc đã thanh toán, các trường thương mại cốt lõi sẽ bị khóa backend: giá vé không thể sửa đổi, sức chứa không thể giảm dưới số vé đã cấp, và không thể xóa phân khu/suất diễn đang có vé giữ hoặc vé bán.
              </div>

              {formData.shows.length > 1 && (
                <div style={{marginBottom: '16px'}}>
                  <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}>
                    {formData.shows.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedShowIdx(idx)}
                        style={{
                          background: selectedShowIdx === idx ? '#84cc16' : '#1e293b',
                          color: selectedShowIdx === idx ? '#000' : '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: selectedShowIdx === idx ? 'bold' : 'normal',
                          fontSize: '13px',
                        }}
                      >
                        Suất #{idx + 1}: {s.name} ({s.ticketTiers.length} hạng vé)
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="wizard-secondary-btn"
                    onClick={() => cloneTiersToAllShows(selectedShowIdx)}
                  >
                    ⚡ Sao chép phân khu của {currentShow.name} sang tất cả các suất diễn
                  </button>
                </div>
              )}

              <div className="wizard-tiers-block">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                  <div>
                    <h4 style={{margin: 0, color: '#f8fafc'}}>
                      Hạng vé của {currentShow.name} ({currentShow.ticketTiers.length})
                    </h4>
                    <small style={{color: '#94a3b8'}}>Tổng sức chứa suất này: {currentShow.ticketTiers.reduce((acc, t) => acc + (Number(t.capacity) || 0), 0)} vé</small>
                  </div>
                  <button type="button" className="wizard-secondary-btn" onClick={() => addTier(selectedShowIdx)}>
                    + Thêm hạng vé
                  </button>
                </div>

                {currentShow.ticketTiers.map((tier, tIdx) => (
                  <div key={tIdx} className="wizard-card-item">
                    <div className="wizard-card-header">
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            backgroundColor: tier.color || '#84CC16',
                          }}
                        />
                        <strong>
                          Hạng #{tIdx + 1}: {tier.name}
                        </strong>
                      </div>
                      {currentShow.ticketTiers.length > 1 && (
                        <button
                          type="button"
                          className="wizard-delete-btn"
                          onClick={() => removeTier(selectedShowIdx, tIdx)}
                          title="Xóa hạng vé này"
                        >
                          Xóa hạng vé
                        </button>
                      )}
                    </div>

                    <div className="wizard-grid-3">
                      <label className="wizard-label">
                        Tên hạng vé <span className="req">*</span>
                        <input
                          value={tier.name}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {name: e.target.value})}
                          placeholder="Ví dụ: VIP Khán đài A / Vé GA"
                          required
                        />
                      </label>
                      <label className="wizard-label">
                        Mã phân khu <span className="req">*</span>
                        <input
                          value={tier.code}
                          onChange={(e) =>
                            updateTier(selectedShowIdx, tIdx, {
                              code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                            })
                          }
                          placeholder="VIP_A"
                          required
                        />
                      </label>
                      <label className="wizard-label">
                        Loại vé <span className="req">*</span>
                        <select
                          value={tier.type || 'DUNG_STAND'}
                          onChange={(e) =>
                            updateTier(selectedShowIdx, tIdx, {type: e.target.value as any})
                          }
                        >
                          <option value="DUNG_STAND">Vé đứng (Standing / GA)</option>
                          <option value="GHE_NGOI">Vé ghế ngồi (Seated)</option>
                        </select>
                      </label>
                    </div>

                    <div className="wizard-grid-3">
                      <label className="wizard-label">
                        Giá vé niêm yết (VNĐ) <span className="req">*</span>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={tier.price}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {price: Number(e.target.value)})}
                          required
                        />
                        <small>{money.format(tier.price || 0)}</small>
                      </label>
                      <label className="wizard-label">
                        Số lượng vé phát hành (Sức chứa) <span className="req">*</span>
                        <input
                          type="number"
                          min="1"
                          value={tier.capacity}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {capacity: Number(e.target.value)})}
                          required
                        />
                      </label>
                      <label className="wizard-label">
                        Màu sắc nhận diện
                        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                          <input
                            type="color"
                            value={tier.color || '#84CC16'}
                            onChange={(e) => updateTier(selectedShowIdx, tIdx, {color: e.target.value})}
                            style={{width: '42px', height: '36px', padding: 0, cursor: 'pointer', background: 'none'}}
                          />
                          <input
                            value={tier.color || '#84CC16'}
                            onChange={(e) => updateTier(selectedShowIdx, tIdx, {color: e.target.value})}
                            placeholder="#84CC16"
                          />
                        </div>
                      </label>
                    </div>

                    <div className="wizard-grid-3">
                      <label className="wizard-label">
                        Tối thiểu mỗi đơn
                        <input
                          type="number"
                          min="1"
                          value={tier.minPerOrder || 1}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {minPerOrder: Number(e.target.value)})}
                        />
                      </label>
                      <label className="wizard-label">
                        Tối đa mỗi đơn
                        <input
                          type="number"
                          min="1"
                          value={tier.maxPerOrder || 4}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {maxPerOrder: Number(e.target.value)})}
                        />
                      </label>
                      <label className="wizard-label">
                        Quyền lợi đi kèm
                        <input
                          value={tier.benefits || ''}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {benefits: e.target.value})}
                          placeholder="Ví dụ: Tặng áo festival, lối check-in riêng"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="wizard-form-section">
              <div className="wizard-section-intro">
                <h3>Bước 4: Hình ảnh & Truyền thông</h3>
                <p>Cung cấp ảnh bìa sự kiện, ảnh đại diện, sơ đồ phân khu và trailer giới thiệu.</p>
              </div>

              <label className="wizard-label">
                Ảnh bìa sự kiện (Desktop Banner 16:9 / 3:1) <span className="req">*</span>
                <input
                  value={formData.bannerUrl || ''}
                  onChange={(e) => updateField('bannerUrl', e.target.value)}
                  placeholder="https://example.com/banner.jpg"
                />
                <small>Bắt buộc phải là liên kết HTTPS hợp lệ để được công bố.</small>
              </label>
              {formData.bannerUrl && (
                <div className="wizard-preview-box">
                  <img
                    src={formData.bannerUrl}
                    alt="Banner xem trước"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                    onLoad={(e) => (e.currentTarget.style.display = 'block')}
                    style={{maxHeight: '180px', width: '100%', objectFit: 'cover', borderRadius: '4px'}}
                  />
                </div>
              )}

              <div className="wizard-grid-2">
                <div>
                  <label className="wizard-label">
                    Ảnh đại diện / Poster đứng (Mobile Poster 2:3)
                    <input
                      value={formData.posterUrl || ''}
                      onChange={(e) => updateField('posterUrl', e.target.value)}
                      placeholder="https://example.com/poster.jpg"
                    />
                    <small>Tối ưu hiển thị trên ứng dụng di động và danh mục marketplace.</small>
                  </label>
                  {formData.posterUrl && (
                    <div className="wizard-preview-box" style={{width: '120px'}}>
                      <img
                        src={formData.posterUrl}
                        alt="Poster xem trước"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        onLoad={(e) => (e.currentTarget.style.display = 'block')}
                        style={{maxHeight: '160px', width: '100%', objectFit: 'cover', borderRadius: '4px'}}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="wizard-label">
                    Sơ đồ khán đài / Sơ đồ phân khu tĩnh (URL)
                    <input
                      value={formData.seatingMapUrl || ''}
                      onChange={(e) => updateField('seatingMapUrl', e.target.value)}
                      placeholder="https://example.com/seating-map.png"
                    />
                    <small>Ảnh minh họa vị trí các khán đài để khán giả chọn vé.</small>
                  </label>
                  {formData.seatingMapUrl && (
                    <div className="wizard-preview-box">
                      <img
                        src={formData.seatingMapUrl}
                        alt="Sơ đồ khán đài"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        onLoad={(e) => (e.currentTarget.style.display = 'block')}
                        style={{maxHeight: '160px', width: '100%', objectFit: 'contain', borderRadius: '4px'}}
                      />
                    </div>
                  )}
                </div>
              </div>

              <label className="wizard-label">
                Video giới thiệu sự kiện (YouTube Trailer URL)
                <input
                  value={formData.trailerUrl || ''}
                  onChange={(e) => updateField('trailerUrl', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <small>Khán giả có thể xem trực tiếp video teaser trước khi mua vé.</small>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="wizard-form-section">
              <div className="wizard-section-intro">
                <h3>Bước 5: Quy định & Thông tin Liên hệ</h3>
                <p>Thiết lập chính sách độ tuổi, hoàn hủy vé và thông tin hỗ trợ người tham dự.</p>
              </div>

              <div className="wizard-grid-2">
                <label className="wizard-label">
                  Quy định độ tuổi
                  <select
                    value={formData.ageRestriction || '14+'}
                    onChange={(e) => updateField('ageRestriction', e.target.value)}
                  >
                    <option value="Tất cả độ tuổi">Tất cả độ tuổi</option>
                    <option value="12+">12+ (Trẻ em cần người giám hộ)</option>
                    <option value="14+">14+ (Khuyến nghị)</option>
                    <option value="16+">16+</option>
                    <option value="18+">18+ (Có kiểm tra CCCD)</option>
                  </select>
                </label>

                <label className="wizard-label">
                  Số giấy phép biểu diễn / Văn bản chấp thuận
                  <input
                    value={formData.permitNumber || ''}
                    onChange={(e) => updateField('permitNumber', e.target.value)}
                    placeholder="Ví dụ: 124/GP-SVHTT ngày 15/09/2026"
                  />
                  <small>Cần thiết cho các sự kiện biểu diễn văn hóa nghệ thuật.</small>
                </label>
              </div>

              <div className="wizard-grid-2">
                <label className="wizard-label">
                  Email hỗ trợ khán giả <span className="req">*</span>
                  <input
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => updateField('contactEmail', e.target.value)}
                    placeholder="support@eventname.vn"
                    required
                  />
                  <small>Bắt buộc để giải đáp thắc mắc về đơn hàng và vé.</small>
                </label>

                <label className="wizard-label">
                  Hotline hỗ trợ <span className="req">*</span>
                  <input
                    value={formData.contactHotline || ''}
                    onChange={(e) => updateField('contactHotline', e.target.value)}
                    placeholder="0912345678 hoặc 1900 xxxx"
                    required
                  />
                  <small>Số điện thoại hỗ trợ khán giả tại Việt Nam.</small>
                </label>
              </div>

              <label className="wizard-label">
                Kênh thông tin chính thức (Fanpage / Website)
                <input
                  value={formData.fanpageUrl || ''}
                  onChange={(e) => updateField('fanpageUrl', e.target.value)}
                  placeholder="https://facebook.com/eventfanpage"
                />
              </label>

              <label className="wizard-label">
                Chính sách hoàn / hủy vé <span className="req">*</span>
                <textarea
                  rows={3}
                  value={formData.refundPolicy || ''}
                  onChange={(e) => updateField('refundPolicy', e.target.value)}
                  placeholder="Nêu rõ điều kiện hoàn vé (ví dụ: Vé đã mua không được hoàn trả sau khi thanh toán; hoặc hoàn 100% nếu sự kiện bị hoãn/hủy)."
                  required
                />
                <small>Tối thiểu 10 ký tự.</small>
              </label>

              <label className="wizard-label">
                Quy định tham gia sự kiện
                <textarea
                  rows={4}
                  value={formData.termsAndConditions || ''}
                  onChange={(e) => updateField('termsAndConditions', e.target.value)}
                  placeholder="Danh sách vật dụng cấm mang vào sân khấu, quy định về trang phục, chụp ảnh chuyên nghiệp và an ninh check-in…"
                />
              </label>
            </div>
          )}

          {step === 6 && (
            <div className="wizard-form-section">
              <div className="wizard-section-intro">
                <h3>Bước 6: Kiểm tra trước xuất bản (Pre-flight Checklist)</h3>
                <p>Kiểm tra tính sẵn sàng trước khi sự kiện chính thức xuất hiện trên marketplace.</p>
              </div>

              {/* Summary Stats */}
              <div className="wizard-summary-stats">
                <div className="wizard-summary-stat">
                  <span>Số suất diễn</span>
                  <strong>{formData.shows.length}</strong>
                </div>
                <div className="wizard-summary-stat">
                  <span>Tổng số vé</span>
                  <strong>
                    {formData.shows.reduce(
                      (acc, s) => acc + s.ticketTiers.reduce((tAcc, t) => tAcc + (Number(t.capacity) || 0), 0),
                      0,
                    )}
                  </strong>
                </div>
                <div className="wizard-summary-stat">
                  <span>Hình thức</span>
                  <strong>{locationModeLabels[formData.locationMode] || formData.locationMode}</strong>
                </div>
                <div className="wizard-summary-stat">
                  <span>Trạng thái kiểm tra</span>
                  <strong style={{color: readiness.isReady ? '#84cc16' : '#ef4444'}}>
                    {readiness.isReady ? '✓ Sẵn sàng công bố' : `✕ Còn ${readiness.blockers.length} tiêu chí`}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '12.5px',
                  color: '#bfdbfe',
                  lineHeight: '1.5',
                }}
              >
                🔒 <strong>Chính sách lưu dữ liệu & Khóa thương mại:</strong>
                <p style={{margin: '4px 0 0', color: '#93c5fd'}}>
                  Ở trạng thái bản nháp (Draft), hệ thống cho phép chỉnh sửa và xóa linh hoạt. Tuy nhiên, một khi sự kiện đã xuất bản (Published) và phát sinh giao dịch hoặc giữ chỗ thành công, các trường thương mại (giờ bắt đầu suất diễn, giá vé, sức chứa tối thiểu, và xóa phân khu có giao dịch) sẽ bị khóa chặt bởi các quy tắc an toàn backend. Không phải mọi trường dữ liệu đều có thể lưu đè sau khi đã mở bán.
                </p>
              </div>

              {/* Traffic Light Checklist */}
              <div className="wizard-checklist-container">
                <h4 style={{margin: '0 0 12px', color: '#f8fafc'}}>Bảng tiêu chí sẵn sàng xuất bản:</h4>

                {/* Blockers */}
                {readiness.blockers.map((blocker, bIdx) => (
                  <div key={bIdx} className="checklist-item checklist-item--blocker">
                    <span className="checklist-icon">✕</span>
                    <div>
                      <strong>Bắt buộc để công bố:</strong>
                      <p>{blocker.message}</p>
                    </div>
                  </div>
                ))}

                {/* Warnings */}
                {readiness.warnings.map((warn, wIdx) => (
                  <div key={wIdx} className="checklist-item checklist-item--warning">
                    <span className="checklist-icon">⚠</span>
                    <div>
                      <strong>Khuyến nghị hoàn thiện:</strong>
                      <p>{warn.message}</p>
                    </div>
                  </div>
                ))}

                {/* Passes */}
                {readiness.isReady && (
                  <div className="checklist-item checklist-item--pass">
                    <span className="checklist-icon">✓</span>
                    <div>
                      <strong>Tất cả tiêu chí bắt buộc đã hoàn tất!</strong>
                      <p>Sự kiện đã đầy đủ thông tin địa điểm, suất diễn, phân khu vé và phương thức liên hệ.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation */}
        <footer className="wizard-modal-footer">
          <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
            <button
              type="button"
              className="wizard-secondary-btn"
              onClick={handleSaveDraft}
              disabled={busyDraft || busyPublish || !canEdit}
            >
              {busyDraft ? 'Đang lưu…' : '💾 Lưu bản nháp'}
            </button>
            {formData.slug && (
              <a
                href={buildPublicPath(window.location.pathname, `events/${deduplicateSlug(formData.slug)}?preview=1`)}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#84cc16',
                  fontSize: '13px',
                  textDecoration: 'none',
                  padding: '6px 12px',
                  border: '1px solid rgba(132,204,22,.3)',
                  borderRadius: '4px',
                }}
              >
                Xem trước sự kiện ↗
              </a>
            )}
            <span style={{fontSize: '11px', color: '#64748b', marginLeft: '4px'}}>
              * Khi đã có vé bán/giữ, các trường thương mại (giá, giờ diễn, xóa hạng vé) sẽ bị khóa backend.
            </span>
          </div>

          <div style={{display: 'flex', gap: '10px'}}>
            {step > 1 && (
              <button
                type="button"
                className="wizard-secondary-btn"
                onClick={() => setStep(step - 1)}
                disabled={busyDraft || busyPublish}
              >
                ← Quay lại
              </button>
            )}

            {step < 6 ? (
              <button
                type="button"
                className="organizer-primary"
                onClick={() => setStep(step + 1)}
                disabled={busyDraft || busyPublish}
              >
                Tiếp theo →
              </button>
            ) : (
              <button
                type="button"
                className="organizer-primary"
                onClick={handlePublish}
                disabled={!readiness.isReady || busyPublish || busyDraft || !canEdit}
                style={{
                  backgroundColor: readiness.isReady ? '#84cc16' : '#334155',
                  color: readiness.isReady ? '#000' : '#94a3b8',
                  cursor: readiness.isReady ? 'pointer' : 'not-allowed',
                }}
                title={!readiness.isReady ? 'Cần khắc phục tất cả blocker trước khi công bố' : undefined}
              >
                {busyPublish ? 'Đang công bố sự kiện…' : '🚀 Công bố sự kiện ngay'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
