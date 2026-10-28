import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {deriveSaleStatus} from '../../domain/eventStatus';
import {loadPublicSchedule, type PublicScheduleItem} from '../../services/scheduleService';
import {type PublicArtistRecord} from '../../services/artistService';
import type {PublicEventRecord, PublicTicketTier} from '../../services/eventService';
import {ShowSwitcher} from '../EventCatalog';
import {ArtistLineupSection} from './ArtistLineupSection';
import {BookingAssistModal, BookingSummaryPanel} from './BookingSummaryPanel';
import {EventContactSection} from './EventContactSection';
import {EventFooter} from './EventFooter';
import {EventHeader} from './EventHeader';
import {EventHero} from './EventHero';
import {EventMediaSection} from './EventMediaSection';
import {EventPolicySection} from './EventPolicySection';
import {EventVenueSection} from './EventVenueSection';
import {MobileStickyBar} from './MobileStickyBar';
import {ScheduleDialog} from './ScheduleDialog';
import {SeatMapSection} from './SeatMapSection';
import {TeamInfoDialog} from './TeamInfoDialog';
import {TicketTiersSection} from './TicketTiersSection';
import {normalizeEventSlogan} from './eventTemplateLogic.js';
import './event-template.css';

export type EventTemplateSlots = {
  ambient?: ReactNode;
  lineup?: ReactNode;
  seating?: ReactNode;
  modals?: ReactNode;
  overlays?: ReactNode;
};

export type EventTemplateProps = {
  event: PublicEventRecord;
  tiers: PublicTicketTier[];
  tierState: 'loading' | 'ready' | 'error';
  onRetryTiers?: () => void;
  slots?: EventTemplateSlots;
  schedule?: PublicScheduleItem[];
  artists?: PublicArtistRecord[];
  isScheduleOpen?: boolean;
  onOpenSchedule?: () => void;
  onCloseSchedule?: () => void;
  isTeamInfoOpen?: boolean;
  onOpenTeamInfo?: () => void;
  onCloseTeamInfo?: () => void;
};

export function EventTemplate({
  event,
  tiers,
  tierState,
  onRetryTiers,
  slots,
  schedule: propSchedule,
  artists: propArtists,
  isScheduleOpen: propIsScheduleOpen,
  onOpenSchedule: propOnOpenSchedule,
  onCloseSchedule: propOnCloseSchedule,
  isTeamInfoOpen: propIsTeamInfoOpen,
  onOpenTeamInfo: propOnOpenTeamInfo,
  onCloseTeamInfo: propOnCloseTeamInfo,
}: EventTemplateProps) {
  const [clock, setClock] = useState(() => Date.now());
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [isAssistModalOpen, setIsAssistModalOpen] = useState(false);
  const [internalScheduleOpen, setInternalScheduleOpen] = useState(false);
  const [internalSchedule, setInternalSchedule] = useState<PublicScheduleItem[]>([]);
  const [scheduleState, setScheduleState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0);
  const [internalTeamInfoOpen, setInternalTeamInfoOpen] = useState(false);

  const isScheduleControlled = propIsScheduleOpen !== undefined;
  const isScheduleOpen = isScheduleControlled ? propIsScheduleOpen : internalScheduleOpen;

  const handleOpenSchedule = useCallback(() => {
    if (propOnOpenSchedule) {
      propOnOpenSchedule();
    } else {
      setInternalScheduleOpen(true);
    }
  }, [propOnOpenSchedule]);

  const handleCloseSchedule = useCallback(() => {
    if (propOnCloseSchedule) {
      propOnCloseSchedule();
    } else {
      setInternalScheduleOpen(false);
    }
  }, [propOnCloseSchedule]);

  const handleRetrySchedule = useCallback(() => {
    setScheduleReloadKey((k) => k + 1);
  }, []);

  const isTeamInfoControlled = propIsTeamInfoOpen !== undefined;
  const isTeamInfoOpen = isTeamInfoControlled ? propIsTeamInfoOpen : internalTeamInfoOpen;

  const handleOpenTeamInfo = useCallback(() => {
    if (propOnOpenTeamInfo) {
      propOnOpenTeamInfo();
    } else {
      setInternalTeamInfoOpen(true);
    }
  }, [propOnOpenTeamInfo]);

  const handleCloseTeamInfo = useCallback(() => {
    if (propOnCloseTeamInfo) {
      propOnCloseTeamInfo();
    } else {
      setInternalTeamInfoOpen(false);
    }
  }, [propOnCloseTeamInfo]);

  // Event-safe schedule loading lifecycle:
  // Immediately resets visible schedule/error/loading on event changes and ignores obsolete promise results
  useEffect(() => {
    if (propSchedule !== undefined) {
      setInternalSchedule([]);
      setScheduleState('idle');
      setScheduleError(null);
      return;
    }

    let isObsolete = false;
    setInternalSchedule([]);
    setScheduleState('loading');
    setScheduleError(null);

    loadPublicSchedule(event)
      .then((items) => {
        if (isObsolete) return;
        setInternalSchedule(items);
        setScheduleState('ready');
      })
      .catch((err) => {
        if (isObsolete) return;
        console.error('Không thể tải lịch trình sự kiện:', err);
        setScheduleError('Không thể tải lịch trình sự kiện lúc này.');
        setScheduleState('error');
      });

    return () => {
      isObsolete = true;
    };
  }, [event.id, event.templateKey, event.code, event.slug, propSchedule, scheduleReloadKey]);

  const activeScheduleItems = propSchedule ?? internalSchedule;
  const hasSchedule = activeScheduleItems.length > 0;

  const isConcert = event.templateKey === 'SUPER_CONCERT_2026';

  // Load concert runtime dynamically when concert specialization is active
  useEffect(() => {
    if (!isConcert) return;
    void import('../../legacy/concertRuntime.js').catch((error) => {
      console.error('Không thể khởi tạo trải nghiệm concert:', error);
    });
  }, [isConcert]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Reset selected tier when show or event changes
  useEffect(() => {
    setSelectedTierId(null);
  }, [event.id, event.selectedShow.id]);

  // Derive sale status considering inventory availability
  const saleStatus = useMemo(() => {
    const hasAvailability =
      tierState === 'loading'
        ? true
        : tiers.length > 0
        ? tiers.some((tier) => tier.available > 0)
        : true;

    return deriveSaleStatus({
      now: new Date(clock),
      saleStartsAt: event.saleStartsAt,
      saleEndsAt: event.saleEndsAt,
      databaseStatus: event.databaseSaleStatus,
      hasAvailability,
    });
  }, [clock, event.databaseSaleStatus, event.saleEndsAt, event.saleStartsAt, tierState, tiers]);

  useEffect(() => {
    document.body.dataset.saleStatus = saleStatus;
    document.body.dataset.saleStartsAt = event.saleStartsAt;
    document.body.dispatchEvent(new CustomEvent('eventticketing:sale-status', {
      detail: {status: saleStatus},
    }));
  }, [event.saleStartsAt, saleStatus]);

  const selectedTier = useMemo(() => {
    if (selectedTierId === null) return null;
    return tiers.find((tier) => tier.id === selectedTierId) || null;
  }, [selectedTierId, tiers]);

  const cleanSlogan = useMemo(
    () => normalizeEventSlogan(event.slogan, event.category),
    [event.slogan, event.category]
  );

  return (
    <div
      className={`et-shell ${isConcert ? 'et-shell--concert' : ''}`}
      data-category={event.category || 'AM_NHAC'}
    >
      <div className="et-stage-ambient" aria-hidden="true" />
      {slots?.ambient}

      <EventHeader
        event={event}
        saleOpen={saleStatus === 'ON_SALE'}
        onOpenSchedule={handleOpenSchedule}
        hasSchedule={hasSchedule}
      />

      <EventHero
        event={event}
        saleStatus={saleStatus}
        onOpenSchedule={handleOpenSchedule}
        hasSchedule={hasSchedule}
      />

      <ShowSwitcher event={event} />

      <div className="et-body-surface">
        <main className="et-main">
          <div className="et-content-col">
            {/* Section 01: Overview / Introduction */}
            <section className="et-content-section" aria-labelledby="overview-heading">
              <div className="et-section-header">
                <span className="et-section-kicker">01 / TỔNG QUAN SỰ KIỆN</span>
                <h2 id="overview-heading" className="et-section-title">
                  {cleanSlogan || 'GIỚI THIỆU SỰ KIỆN'}
                </h2>
              </div>
              <div className="et-box">
                <p className="et-description-text">
                  {event.description ||
                    'Thông tin chi tiết về sự kiện và lịch trình đang được Ban tổ chức tiếp tục cập nhật.'}
                </p>
              </div>
            </section>

            {/* Specialization slot: Artist Lineup (falls back to data-driven ArtistLineupSection) */}
            {slots?.lineup !== undefined ? (
              slots.lineup
            ) : (
              <ArtistLineupSection event={event} artists={propArtists} />
            )}

            {/* Section 02: Ticket Tiers & Pricing (Single source of truth for all events) */}
            <div id="pricing-section" aria-hidden="true" />
            <TicketTiersSection
              tiers={tiers}
              tierState={tierState}
              selectedTierId={selectedTierId}
              onSelectTier={setSelectedTierId}
              onRetry={onRetryTiers}
              saleStatus={saleStatus}
            />

            {/* Specialization slot: Interactive Seating Map (defaults to data-driven SeatMapSection) */}
            {slots?.seating !== undefined ? (
              slots.seating
            ) : (
              <SeatMapSection event={event} />
            )}

            {/* Section 03: Venue & Attendance (Auto-hides if empty) */}
            <div id="concert-guide-section" aria-hidden="true" />
            <EventVenueSection event={event} />

            {/* Section 04: Seating Map & Trailer (Auto-hides if empty) */}
            <EventMediaSection event={event} />

            {/* Section 05: Policies & Rules (Auto-hides if empty) */}
            <EventPolicySection event={event} />

            {/* Section 06: Organizer Contact & Legal (Auto-hides if empty) */}
            <EventContactSection event={event} />
          </div>

          {/* Desktop Sticky Booking Summary Panel */}
          <BookingSummaryPanel
            event={event}
            tiers={tiers}
            selectedTier={selectedTier}
            saleStatus={saleStatus}
            onOpenAssistModal={() => setIsAssistModalOpen(true)}
          />
        </main>
      </div>

      {/* Footer: React-driven product footer shared across generic and concert events */}
      <EventFooter
        event={event}
        hasSchedule={hasSchedule}
        onOpenSchedule={handleOpenSchedule}
        onOpenTeamInfo={handleOpenTeamInfo}
      />

      {/* Team & Project SRS Information Modal Dialog */}
      <TeamInfoDialog
        isOpen={isTeamInfoOpen}
        onClose={handleCloseTeamInfo}
      />

      {/* Specialization slot: Concert seating runtime overlays (seat tooltip, toast container, booking modal) */}
      {slots?.overlays ?? slots?.modals}

      <BookingAssistModal
        isOpen={isAssistModalOpen}
        onClose={() => setIsAssistModalOpen(false)}
        event={event}
        selectedTier={selectedTier}
      />

      <ScheduleDialog
        isOpen={isScheduleOpen}
        onClose={handleCloseSchedule}
        items={activeScheduleItems}
        isLoading={scheduleState === 'loading' && propSchedule === undefined}
        error={scheduleError}
        onRetry={handleRetrySchedule}
        event={event}
      />

      {/* Mobile Sticky Bottom CTA */}
      <MobileStickyBar
        event={event}
        tiers={tiers}
        selectedTier={selectedTier}
        saleStatus={saleStatus}
        onOpenAssistModal={() => setIsAssistModalOpen(true)}
        onOpenSchedule={handleOpenSchedule}
        hasSchedule={hasSchedule}
      />
    </div>
  );
}
