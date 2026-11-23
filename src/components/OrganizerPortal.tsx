import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import type * as React from 'react';
import {runtimeConfig} from '../config/runtime';
import {navigatePublicRoute} from '../domain/publicRoute';
import {
  canManageOrganizationEvents,
  createOrganization,
  filterEventsByOrganization,
  isOrganizerAccount,
  khoiTaoDuLieuDemoDinhGia,
  loadOrganizerWorkspace,
  loadSavedActiveOrganizationId,
  publishEvent,
  refreshOrganizerSession,
  resolveActiveOrganizationId,
  saveActiveOrganizationId,
  signOutOrganizer,
  subscribeOrganizerAuth,
  saveFullEventDraft,
  loadEventForEditing,
  type FullEventAggregateInput,
  type OrganizerEvent,
  type OrganizerMembership,
  type OrganizerSession,
} from '../services/organizerService';
import {
  OrganizerAccessDeniedView,
  OrganizerAuthView,
  OrganizerEmptyState,
  OrganizerEventCard,
  OrganizerEventWizard,
  OrganizerOnboarding,
  OrganizerPricingPanel,
  OrganizerPurchaseConfig,
  OrganizerSidebar,
  OrganizerStatsCards,
  OrganizerTopBar,
  getDefaultDraftDates,
  IconPlus,
  type OrganizerEventFilter,
} from './organizer-ui';
import {canManagePricing} from './organizer-ui/pricingFormLogic.js';
import {canManagePurchaseConfig} from '../services/purchaseConfigService';
import './organizer-ui/organizer-ui.css';
import './organizer-ui/organizer-skin.css';

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
    await refreshOrganizerSession();
  }, []);

  useEffect(() => {
    document.title = 'Organizer Studio | EventTicketing';
    const unsubscribe = subscribeOrganizerAuth((newSession) => {
      setSession(newSession);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const allowed = session && isOrganizerAccount(session.accountKind);

  if (loading) {
    return (
      <OrganizerFrame>
        <div style={{maxWidth: '680px', margin: '40px auto', padding: '0 20px'}}>
          <OrganizerEmptyState type="loading" />
        </div>
      </OrganizerFrame>
    );
  }

  if (session && !allowed) {
    return (
      <OrganizerFrame>
        <OrganizerAccessDeniedView
          session={session}
          onSignOut={async () => {
            await signOutOrganizer();
            setSession(null);
            await refreshOrganizerSession();
            navigatePublicRoute('organizer/login');
          }}
        />
      </OrganizerFrame>
    );
  }

  if (!allowed || page === 'login') {
    return (
      <OrganizerFrame>
        <OrganizerAuthView
          session={allowed ? session : null}
          onChanged={refreshSession}
          onLoginSuccess={() => navigatePublicRoute('organizer')}
        />
      </OrganizerFrame>
    );
  }

  if (!session) {
    return null;
  }

  return <OrganizerDashboard session={session} />;
}

function OrganizerFrame({
  children,
  userEmail,
  onSignOut,
  backgroundInert = false,
  overlay,
}: {
  children: React.ReactNode;
  userEmail?: string;
  onSignOut?: () => Promise<void> | void;
  backgroundInert?: boolean;
  overlay?: React.ReactNode;
}) {
  return (
    <div className="organizer-shell org-portal">
      <div
        className="org-portal-background"
        inert={backgroundInert || undefined}
        aria-hidden={backgroundInert ? true : undefined}
      >
        <OrganizerTopBar userEmail={userEmail} onSignOut={onSignOut} />
        {children}
      </div>
      {overlay}
    </div>
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
  const [messageType, setMessageType] = useState<'error' | 'status'>('status');
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [busyOrg, setBusyOrg] = useState(false);
  const [busyDemo, setBusyDemo] = useState(false);
  const [wizardAggregate, setWizardAggregate] = useState<FullEventAggregateInput | null>(null);
  const wizardOpenerRef = useRef<HTMLElement | null>(null);
  const wasWizardOpenRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<OrganizerEventFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [pricingEvent, setPricingEvent] = useState<OrganizerEvent | null>(null);
  const pricingOpenerRef = useRef<HTMLElement | null>(null);
  const wasPricingOpenRef = useRef(false);
  const [purchaseConfigEvent, setPurchaseConfigEvent] = useState<OrganizerEvent | null>(null);
  const purchaseConfigOpenerRef = useRef<HTMLElement | null>(null);
  const wasPurchaseConfigOpenRef = useRef(false);

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

  async function handleInitDemoPricing() {
    if (!runtimeConfig.useMockData || busyDemo) return;
    setBusyDemo(true);
    setMessage('');
    try {
      const meta = await khoiTaoDuLieuDemoDinhGia();
      await refresh();
      const warning = meta?.luuTru?.canhBao ? ` (${meta.luuTru.canhBao})` : '';
      setMessage(
        `[MÔ PHỎNG] Đã khởi tạo / khôi phục dữ liệu demo định giá dùng chung. Đây là dữ liệu mô phỏng, không phải dữ liệu thật.${warning}`,
      );
      setMessageType('status');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể khởi tạo dữ liệu demo định giá.');
      setMessageType('error');
    } finally {
      setBusyDemo(false);
    }
  }

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
    } else if (state === 'ready') {
      // Only forget the saved organization once the workspace has really loaded with no memberships:
      // while loading, `memberships` is still empty and would wipe the remembered choice on every page load.
      setSelectedOrgId(null);
      saveActiveOrganizationId(session.userId, null);
    }
  }, [memberships, session.userId, state]);

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
  const canPricing = canManagePricing(activeOrg, activeOrg?.organizationId);
  const isPricingOpen = Boolean(pricingEvent && canPricing);
  const isPurchaseConfigOpen = Boolean(
    purchaseConfigEvent && canManagePurchaseConfig(activeOrg, purchaseConfigEvent.organizationId),
  );
  const orgEvents = useMemo(
    () => filterEventsByOrganization(events, activeOrg?.organizationId),
    [events, activeOrg?.organizationId],
  );
  const publishedCount = useMemo(
    () => orgEvents.filter((e) => e.status === 'CONG_KHAI').length,
    [orgEvents],
  );
  const draftCount = useMemo(
    () => orgEvents.filter((e) => e.status === 'BAN_NHAP').length,
    [orgEvents],
  );
  const filteredOrgEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orgEvents.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        `#${item.id}`.includes(query)
      );
    });
  }, [orgEvents, statusFilter, searchQuery]);

  const isWizardOpen = Boolean(wizardAggregate);

  // Khôi phục focus về nút mở panel sau khi dialog/overlay đóng lại.
  useEffect(() => {
    if (wasPricingOpenRef.current && !isPricingOpen) {
      const opener = pricingOpenerRef.current;
      pricingOpenerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
    }
    wasPricingOpenRef.current = isPricingOpen;
  }, [isPricingOpen]);

  useEffect(() => {
    if (wasPurchaseConfigOpenRef.current && !isPurchaseConfigOpen) {
      const opener = purchaseConfigOpenerRef.current;
      purchaseConfigOpenerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
    }
    wasPurchaseConfigOpenRef.current = isPurchaseConfigOpen;
  }, [isPurchaseConfigOpen]);

  useEffect(() => {
    if (wasWizardOpenRef.current && !isWizardOpen) {
      const opener = wizardOpenerRef.current;
      wizardOpenerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
    }
    wasWizardOpenRef.current = isWizardOpen;
  }, [isWizardOpen]);

  // Đổi tổ chức: reset bộ lọc & đóng panel đang mở của tổ chức trước.
  useEffect(() => {
    setPricingEvent(null);
    setPurchaseConfigEvent(null);
    setStatusFilter('ALL');
    setSearchQuery('');
  }, [activeOrg?.organizationId]);

  // Nếu mất quyền hoặc sự kiện không còn thuộc tổ chức đang chọn, đóng/đặt lại panel.
  useEffect(() => {
    if (!pricingEvent) return;
    if (!canPricing) {
      setPricingEvent(null);
      return;
    }
    const matched = orgEvents.find((e) => e.id === pricingEvent.id) ?? null;
    if (!matched) {
      setPricingEvent(null);
    } else if (matched !== pricingEvent) {
      setPricingEvent(matched);
    }
  }, [pricingEvent, canPricing, orgEvents]);

  useEffect(() => {
    if (!purchaseConfigEvent) return;
    if (!canManagePurchaseConfig(activeOrg, purchaseConfigEvent.organizationId)) {
      setPurchaseConfigEvent(null);
      return;
    }
    const matched = orgEvents.find((e) => e.id === purchaseConfigEvent.id) ?? null;
    if (!matched) {
      setPurchaseConfigEvent(null);
    } else if (matched !== purchaseConfigEvent) {
      setPurchaseConfigEvent(matched);
    }
  }, [purchaseConfigEvent, activeOrg, orgEvents]);

  async function addOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyOrg(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const created = await createOrganization(String(data.get('name')), String(data.get('slug')));
      setMessage('Tạo tổ chức thành công.');
      setMessageType('status');
      await refresh();
      if (created?.organizationId) {
        handleSelectOrg(created.organizationId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo tổ chức.');
      setMessageType('error');
    } finally {
      setBusyOrg(false);
    }
  }

  function handleStartCreate() {
    if (!activeOrg || !canEdit) return;
    wizardOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMessage('');
    setWizardAggregate(createDefaultAggregate(activeOrg.organizationId, session.email, defaultDates));
  }

  async function handleStartEdit(eventId: number) {
    if (!activeOrg || !canEdit) return;
    wizardOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMessage('Đang nạp dữ liệu sự kiện…');
    setMessageType('status');
    try {
      const aggregate = await loadEventForEditing(eventId);
      setWizardAggregate(aggregate);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải sự kiện để chỉnh sửa.');
      setMessageType('error');
    }
  }

  async function publish(id: number) {
    if (!canEdit || !activeOrg) {
      setMessage('Tài khoản của bạn chỉ có quyền xem, không thể công bố sự kiện.');
      setMessageType('error');
      return;
    }
    const target = orgEvents.find((e) => e.id === id);
    if (!target) {
      setMessage('Sự kiện không thuộc tổ chức đang chọn.');
      setMessageType('error');
      return;
    }
    setPublishingId(id);
    setMessage('');
    try {
      await publishEvent(id);
      setMessage('Công bố sự kiện thành công! Sự kiện đã xuất hiện trên marketplace.');
      setMessageType('status');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể công bố sự kiện.');
      setMessageType('error');
    } finally {
      setPublishingId(null);
    }
  }

  const activeFilterTitle =
    statusFilter === 'CONG_KHAI'
      ? 'Sự kiện đã công bố'
      : statusFilter === 'BAN_NHAP'
      ? 'Sự kiện bản nháp'
      : 'Sự kiện của bạn';

  return (
    <OrganizerFrame
      userEmail={session.email}
      onSignOut={logout}
      backgroundInert={isPricingOpen || isPurchaseConfigOpen || isWizardOpen}
      overlay={
        isPricingOpen && pricingEvent ? (
          <OrganizerPricingPanel
            event={pricingEvent}
            activeOrg={activeOrg}
            onClose={() => setPricingEvent(null)}
          />
        ) : isPurchaseConfigOpen && purchaseConfigEvent ? (
          <OrganizerPurchaseConfig
            event={purchaseConfigEvent}
            activeOrg={activeOrg}
            onClose={() => setPurchaseConfigEvent(null)}
          />
        ) : wizardAggregate ? (
          <OrganizerEventWizard
            initialAggregate={wizardAggregate}
            canEdit={canEdit}
            onClose={() => setWizardAggregate(null)}
            saveDraftAction={saveFullEventDraft}
            publishEventAction={publishEvent}
            onSaved={async (_res, isPublished) => {
              await refresh();
              if (isPublished) {
                setMessage('Sự kiện đã được công bố thành công lên marketplace!');
                setMessageType('status');
              }
            }}
          />
        ) : null
      }
    >
      <div className="org-layout organizer-layout">
        <OrganizerSidebar
          memberships={memberships}
          activeOrg={activeOrg}
          onSelectOrg={handleSelectOrg}
          userEmail={session.email}
          activeFilter={statusFilter}
          onSelectFilter={setStatusFilter}
          counts={{
            total: orgEvents.length,
            published: publishedCount,
            draft: draftCount,
          }}
        />

        <main className="org-main organizer-main" id="overview">
          <header className="org-main-header">
            <div className="org-main-heading-group">
              <h1 className="org-main-title">{activeFilterTitle}</h1>
              {activeOrg && (
                <p className="org-main-subtitle">
                  Quản lý lịch diễn, sơ đồ phân khu và xuất bản vé cho <strong>{activeOrg.organizationName}</strong>.
                </p>
              )}
            </div>

            {orgEvents.length > 0 && (
              <div className="org-main-header-actions">
                {runtimeConfig.useMockData && (
                  <button
                    type="button"
                    className="org-btn org-btn-secondary"
                    onClick={handleInitDemoPricing}
                    disabled={busyDemo}
                    title="Khởi tạo hoặc khôi phục bộ dữ liệu mô phỏng định giá dùng chung (không xóa sự kiện khác)"
                  >
                    {busyDemo ? 'Đang khôi phục…' : 'Khôi phục dữ liệu mẫu'}
                  </button>
                )}

                <button
                  type="button"
                  className="org-btn org-btn-primary organizer-primary"
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
                  <IconPlus size={16} />
                  <span>Tạo sự kiện</span>
                </button>
              </div>
            )}
          </header>

          {message && (
            <div
              className={`org-alert ${messageType === 'error' ? 'org-alert-danger' : 'org-alert-info'} organizer-message`}
              role={messageType === 'error' ? 'alert' : 'status'}
              aria-live={messageType === 'error' ? 'assertive' : 'polite'}
            >
              <div className="org-alert-body">{message}</div>
            </div>
          )}

          {state === 'error' && (
            <OrganizerEmptyState
              type="error"
              message="Không thể tải workspace. Kiểm tra kết nối cơ sở dữ liệu và quyền RLS."
              onRetry={refresh}
            />
          )}

          {state === 'loading' && <OrganizerEmptyState type="loading" />}

          {state === 'ready' && !memberships.length && (
            <OrganizerOnboarding onSubmit={addOrg} isBusy={busyOrg} />
          )}

          {state === 'ready' && memberships.length > 0 && (
            <>
              <OrganizerStatsCards
                totalCount={orgEvents.length}
                publishedCount={publishedCount}
                draftCount={draftCount}
              />

              <section id="events" className="org-events-section organizer-events">
                {orgEvents.length === 0 ? (
                  <OrganizerEmptyState
                    type="no-events"
                    canEdit={canEdit}
                    onCreateEvent={handleStartCreate}
                    onInitDemo={runtimeConfig.useMockData ? handleInitDemoPricing : undefined}
                    busyDemo={busyDemo}
                  />
                ) : (
                  <>
                    <div className="org-events-toolbar">
                      <div className="org-events-heading-wrap">
                        <h2 className="org-events-title">
                          {activeFilterTitle} ({filteredOrgEvents.length})
                        </h2>
                      </div>

                      <div className="org-events-controls">
                        <input
                          type="search"
                          className="org-input org-events-search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Tìm sự kiện theo tên, slug hoặc #ID…"
                          aria-label="Tìm sự kiện"
                        />

                        <div className="org-events-filter-pills" role="group" aria-label="Lọc trạng thái sự kiện">
                          <button
                            type="button"
                            className={`org-filter-pill ${statusFilter === 'ALL' ? 'is-active' : ''}`}
                            onClick={() => setStatusFilter('ALL')}
                          >
                            Tất cả ({orgEvents.length})
                          </button>
                          <button
                            type="button"
                            className={`org-filter-pill ${statusFilter === 'CONG_KHAI' ? 'is-active' : ''}`}
                            onClick={() => setStatusFilter('CONG_KHAI')}
                          >
                            Đã công bố ({publishedCount})
                          </button>
                          <button
                            type="button"
                            className={`org-filter-pill ${statusFilter === 'BAN_NHAP' ? 'is-active' : ''}`}
                            onClick={() => setStatusFilter('BAN_NHAP')}
                          >
                            Bản nháp ({draftCount})
                          </button>
                        </div>
                      </div>
                    </div>

                    {filteredOrgEvents.length === 0 ? (
                      <OrganizerEmptyState
                        type="no-match"
                        onResetFilter={() => {
                          setStatusFilter('ALL');
                          setSearchQuery('');
                        }}
                      />
                    ) : (
                      <div className="org-events-list">
                        {filteredOrgEvents.map((item) => (
                          <OrganizerEventCard
                            key={item.id}
                            event={item}
                            canEdit={canEdit}
                            isPublishing={publishingId === item.id}
                            onEdit={handleStartEdit}
                            onPublish={publish}
                            canManagePricing={canManagePricing(activeOrg, item.organizationId)}
                            onOpenPricing={(target) => {
                              if (canManagePricing(activeOrg, target.organizationId)) {
                                pricingOpenerRef.current =
                                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                                setPricingEvent(target);
                              }
                            }}
                            canManagePurchaseConfig={canManagePurchaseConfig(activeOrg, item.organizationId)}
                            onOpenPurchaseConfig={(target) => {
                              if (canManagePurchaseConfig(activeOrg, target.organizationId)) {
                                purchaseConfigOpenerRef.current =
                                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                                setPurchaseConfigEvent(target);
                              }
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </OrganizerFrame>
  );
}
