import {useCallback, useEffect, useState} from 'react';
import heroHtml from '../legacy/fragments/hero.html?raw';
import pricingHtml from '../legacy/fragments/pricing.html?raw';
import seatingHtml from '../legacy/fragments/seating.html?raw';
import type {PublicEventRecord} from '../services/eventService';
import {
  ArtistLineupSection,
  type ArtistLineupSectionProps,
} from './event-template/ArtistLineupSection';
import {
  BookingHoldModal,
  RuntimeToastContainer,
  type RuntimeToast,
  SeatTooltip,
} from './event-template';
import {
  SeatMapSection,
  type SeatMapSectionProps,
} from './event-template/SeatMapSection';
import {
  dispatchToast,
  normalizeSeatTooltipPayload,
  SPRINT3_PREVIEW_TOAST_MESSAGE,
  subscribeToBookingModal,
  subscribeToSeatTooltip,
  subscribeToToasts,
  type BookingModalPayload,
  type SeatTooltipPayload,
} from '../domain/runtimeOverlays.js';

export {ArtistLineupSection, type ArtistLineupSectionProps};

type StaticMarkupProps = {
  html: string;
};

/**
 * Transitional boundary for markup that is being migrated from the validated
 * Sprint 1 prototype. `display: contents` avoids introducing layout wrappers.
 */
function StaticMarkup({html}: StaticMarkupProps) {
  return <div style={{display: 'contents'}} dangerouslySetInnerHTML={{__html: html}} />;
}

export function HeroSection() {
  return <StaticMarkup html={heroHtml} />;
}

export function ArtistLineup(props: {event?: PublicEventRecord | null}) {
  return <ArtistLineupSection {...props} />;
}

export function PricingSection() {
  return <StaticMarkup html={pricingHtml} />;
}

export function SeatingSection(props: SeatMapSectionProps) {
  // Super Concert keeps its validated, bespoke stadium geometry and camera/drill-down
  // interactions. Organizer-created events continue to use the catalog-driven React
  // map so a new event never inherits Super Concert-specific layout assumptions.
  if (props.event?.templateKey === 'SUPER_CONCERT_2026') {
    return <StaticMarkup html={seatingHtml} />;
  }

  return <SeatMapSection {...props} />;
}

export function ConcertRuntimeOverlays() {
  const [toasts, setToasts] = useState<RuntimeToast[]>([]);
  const [tooltip, setTooltip] = useState<SeatTooltipPayload>({visible: false});
  const [modalState, setModalState] = useState<BookingModalPayload>({open: false});

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let isMounted = true;
    const activeTimers = new Set<number>();

    const unsubToast = subscribeToToasts((payload) => {
      if (!isMounted) return;
      setToasts((prev) => {
        const next = [...prev, payload];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });

      const timerId = window.setTimeout(() => {
        activeTimers.delete(timerId);
        if (isMounted) {
          setToasts((prev) => prev.filter((t) => t.id !== payload.id));
        }
      }, payload.durationMs || 3600);

      activeTimers.add(timerId);
    });

    const unsubTooltip = subscribeToSeatTooltip((payload) => {
      if (!isMounted) return;
      setTooltip((prev) => normalizeSeatTooltipPayload(payload, prev));
    });

    const unsubModal = subscribeToBookingModal((payload) => {
      if (!isMounted) return;
      setModalState(payload);
    });

    return () => {
      isMounted = false;
      activeTimers.forEach((timerId) => window.clearTimeout(timerId));
      activeTimers.clear();
      unsubToast();
      unsubTooltip();
      unsubModal();
    };
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalState((prev) => ({...prev, open: false}));
  }, []);

  const handleSimulateSprintPreview = useCallback(() => {
    dispatchToast({
      message: SPRINT3_PREVIEW_TOAST_MESSAGE,
      type: 'success',
    });
  }, []);

  return (
    <>
      <SeatTooltip {...tooltip} />
      <RuntimeToastContainer toasts={toasts} onDismiss={handleDismissToast} />
      <BookingHoldModal
        isOpen={Boolean(modalState.open)}
        onClose={handleCloseModal}
        onSimulateSprintPreview={handleSimulateSprintPreview}
        holdId={modalState.holdId}
        items={modalState.items}
        totalQuantity={modalState.totalQuantity}
        totalAmount={modalState.totalAmount}
        totalAmountFormatted={modalState.totalAmountFormatted}
        remainingSeconds={modalState.remainingSeconds}
      />
    </>
  );
}

export const FooterAndModals = ConcertRuntimeOverlays;

/**
 * Product-relevant Venue Guidance, Attendance Rules, and Organizer Contact.
 * Truthfully renders only attributes backed by the loaded event record.
 */
export function ConcertGuideSection({
  event,
  onOpenSchedule,
}: {
  event?: PublicEventRecord | null;
  onOpenSchedule?: () => void;
}) {
  const venueName = event?.venueName?.trim() || '';
  const address = event?.address?.trim() || '';
  const hasVenue = Boolean(venueName || address);

  const ageRestriction = event?.ageRestriction?.trim();
  const refundPolicy = event?.refundPolicy?.trim();
  const termsAndConditions = event?.termsAndConditions?.trim();
  const hasPolicies = Boolean(ageRestriction || refundPolicy || termsAndConditions);

  const hotline = event?.contactHotline?.trim();
  const email = event?.contactEmail?.trim();
  const fanpage = event?.fanpageUrl?.trim();
  const permit = event?.permitNumber?.trim();
  const hasContact = Boolean(hotline || email || fanpage || permit);

  const mapsQuery = [venueName, address].filter(Boolean).join(', ');

  return (
    <section
      id="concert-guide-section"
      aria-label="Hướng dẫn tham gia và thông tin sự kiện"
      className="scroll-focus-section py-16 border-b border-white/[0.085] relative bg-[#07090e]/60"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="editorial-heading mb-10 flex items-end justify-between gap-4">
          <div>
            <span className="editorial-kicker">Venue guidance & attendance rules · 04 / 04</span>
            <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white mt-2">
              HƯỚNG DẪN THAM GIA & ĐỊA ĐIỂM
            </h2>
          </div>
          <span className="section-number hidden sm:block">04 / 04</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Địa điểm & Bản đồ */}
          <div className="rounded-2xl liquid-glass p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-300 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-display">Địa điểm tổ chức</h3>
              {venueName && <p className="text-xs text-slate-200 font-semibold mb-2">{venueName}</p>}
              {address && <p className="text-xs text-slate-400 leading-relaxed mb-4">{address}</p>}
              {!hasVenue && <p className="text-xs text-slate-400 italic">Địa điểm đang được cập nhật.</p>}
            </div>
            {hasVenue && (
              <div className="mt-6 pt-4 border-t border-white/[0.08]">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-3 rounded-xl ghost-tab text-amber-300 hover:text-white flex items-center justify-center gap-1.5 text-xs font-semibold transition"
                >
                  <span>Xem trên Google Maps</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>

          {/* Card 2: Quy định & Lịch trình */}
          <div className="rounded-2xl liquid-glass p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-display">Quy định & Lưu ý</h3>
              <div className="space-y-2 text-xs text-slate-300">
                {ageRestriction && (
                  <div>
                    <strong className="text-slate-200">Độ tuổi: </strong>
                    <span>Khán giả từ {ageRestriction} tuổi</span>
                  </div>
                )}
                {refundPolicy && (
                  <div>
                    <strong className="text-slate-200">Hoàn vé: </strong>
                    <span>{refundPolicy}</span>
                  </div>
                )}
                {termsAndConditions && (
                  <div>
                    <strong className="text-slate-200">Điều khoản: </strong>
                    <span>{termsAndConditions}</span>
                  </div>
                )}
                {!hasPolicies && (
                  <p className="text-xs text-slate-400 italic">Quy định chi tiết đang được cập nhật.</p>
                )}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onOpenSchedule}
                className="w-full py-2.5 px-3 rounded-xl ghost-tab text-blue-300 hover:text-white flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer"
              >
                <span>Xem Timeline Run-of-show</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Card 3: Thông tin liên hệ & Hỗ trợ */}
          <div className="rounded-2xl liquid-glass p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-display">Kênh hỗ trợ chính thức</h3>
              <div className="space-y-2 text-xs text-slate-300">
                {hotline && (
                  <div>
                    <strong className="text-slate-200">Hotline: </strong>
                    <a href={`tel:${hotline.replace(/[^0-9+]/g, '')}`} className="font-mono text-emerald-400 hover:underline">
                      {hotline}
                    </a>
                  </div>
                )}
                {email && (
                  <div>
                    <strong className="text-slate-200">Email: </strong>
                    <a href={`mailto:${email}`} className="font-mono text-slate-200 hover:underline">
                      {email}
                    </a>
                  </div>
                )}
                {fanpage && (
                  <div>
                    <strong className="text-slate-200">Fanpage: </strong>
                    <a href={fanpage} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">
                      Xem trang sự kiện
                    </a>
                  </div>
                )}
                {permit && (
                  <div>
                    <strong className="text-slate-200">Giấy phép: </strong>
                    <span className="font-mono text-slate-300">{permit}</span>
                  </div>
                )}
                {!hasContact && (
                  <p className="text-xs text-slate-400 italic">Kênh hỗ trợ đang được cập nhật.</p>
                )}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-white/[0.08]">
              <a
                href="#seating-section"
                className="btn-glow w-full py-2.5 px-3 rounded-xl text-black font-extrabold flex items-center justify-center gap-1.5 text-xs transition cursor-pointer"
                style={{background: 'linear-gradient(135deg, #f5c63d 0%, #eab308 100%)'}}
              >
                <span>Đến sơ đồ chọn chỗ</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Mobile sticky booking action bar for Super Concert.
 * Enables direct access to seat selection and timeline without excessive scrolling.
 */
export function ConcertMobileSticky({
  saleStatus,
  onOpenSchedule,
}: {
  saleStatus: string;
  onOpenSchedule?: () => void;
}) {
  const saleOpen = saleStatus === 'ON_SALE';
  return (
    <>
      {/* Mobile-only flow spacer: reserves document flow height so all footer controls scroll fully clear of the fixed action bar */}
      <div
        className="concert-mobile-sticky-spacer md:hidden w-full pointer-events-none"
        style={{height: '96px'}}
        aria-hidden="true"
      />

      <nav
        aria-label="Thao tác nhanh trên di động"
        className="concert-mobile-sticky md:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-[#0c1527]/95 backdrop-blur-md border-t border-white/[0.12] flex items-center justify-between gap-3 shadow-2xl"
      >
      <div className="flex flex-col min-w-0">
        <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Bảng giá vé</span>
        <strong className="text-sm font-bold text-amber-400 font-display truncate">Từ 800.000 VNĐ</strong>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenSchedule}
          className="h-10 px-3 rounded-xl ghost-tab text-xs font-semibold text-slate-200 hover:text-white transition cursor-pointer flex items-center gap-1"
        >
          <span>Lịch trình</span>
        </button>

        <a
          href="#seating-section"
          className="h-10 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer"
        >
          <span className={`w-2 h-2 rounded-full ${saleOpen ? 'bg-emerald-600 animate-pulse' : 'bg-black/60'}`} />
          <span>{saleOpen ? 'Chọn vé' : 'Xem sơ đồ vé'}</span>
        </a>
      </div>
    </nav>
    </>
  );
}
