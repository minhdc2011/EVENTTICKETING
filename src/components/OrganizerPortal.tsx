import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import type * as React from 'react';
import {navigatePublicRoute} from '../domain/publicRoute';
import {
  canManageOrganizationEvents,
  createOrganization,
  filterEventsByOrganization,
  getOrganizerSession,
  isOrganizerAccount,
  loadOrganizerWorkspace,
  loadSavedActiveOrganizationId,
  publishEvent,
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
  OrganizerSidebar,
  OrganizerStatsCards,
  OrganizerTopBar,
  getDefaultDraftDates,
  IconPlus,
} from './organizer-ui';
import './organizer-ui/organizer-ui.css';

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
        <div style={{maxWidth: '680px', margin: '40px auto', padding: '0 20px'}}>
          <OrganizerEmptyState type="loading" />
        </div>
      </OrganizerFrame>
    );
  }

  if (!session || page === 'login') {
    return (
      <OrganizerFrame>
        <OrganizerAuthView
          session={session}
          onChanged={refreshSession}
          onLoginSuccess={() => navigatePublicRoute('organizer')}
        />
      </OrganizerFrame>
    );
  }

  if (!isOrganizerAccount(session.accountKind)) {
    return (
      <OrganizerFrame>
        <OrganizerAccessDeniedView
          session={session}
          onSignOut={async () => {
            await signOutOrganizer();
            await refreshSession();
            navigatePublicRoute('organizer/login');
          }}
        />
      </OrganizerFrame>
    );
  }

  return <OrganizerDashboard session={session} />;
}

function OrganizerFrame({
  children,
  userEmail,
  onSignOut,
}: {
  children: React.ReactNode;
  userEmail?: string;
  onSignOut?: () => Promise<void> | void;
}) {
  return (
    <div className="organizer-shell org-portal">
      <OrganizerTopBar userEmail={userEmail} onSignOut={onSignOut} />
      {children}
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
    <OrganizerFrame userEmail={session.email} onSignOut={logout}>
      <div className="org-layout organizer-layout">
        <OrganizerSidebar
          memberships={memberships}
          activeOrg={activeOrg}
          onSelectOrg={handleSelectOrg}
          userEmail={session.email}
          onLogout={logout}
        />

        <main className="org-main organizer-main" id="overview">
          <header className="org-main-header">
            <div>
              <div className="org-main-eyebrow">PRODUCT FOUNDATION · COMMAND CENTER</div>
              <h1 className="org-main-title">
                {activeOrg?.organizationName || 'Trung tâm Ban tổ chức'}
              </h1>
            </div>

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
          </header>

          {message && (
            <div className="org-alert org-alert-info organizer-message" role="status">
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
                publishedCount={orgEvents.filter((e) => e.status === 'CONG_KHAI').length}
                draftCount={orgEvents.filter((e) => e.status === 'BAN_NHAP').length}
              />

              <section id="events" className="org-events-section organizer-events">
                <div className="org-events-header">
                  <div>
                    <div className="org-main-eyebrow">QUẢN LÝ XUẤT BẢN</div>
                    <h2 className="org-events-title">Danh sách Sự kiện ({orgEvents.length})</h2>
                  </div>
                </div>

                {orgEvents.length === 0 ? (
                  <OrganizerEmptyState
                    type="no-events"
                    canEdit={canEdit}
                    onCreateEvent={handleStartCreate}
                  />
                ) : (
                  <div className="org-events-list">
                    {orgEvents.map((item) => (
                      <OrganizerEventCard
                        key={item.id}
                        event={item}
                        canEdit={canEdit}
                        isPublishing={publishingId === item.id}
                        onEdit={handleStartEdit}
                        onPublish={publish}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {wizardAggregate && (
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
                }
              }}
            />
          )}
        </main>
      </div>
    </OrganizerFrame>
  );
}
