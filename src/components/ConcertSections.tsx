import {useCallback, useEffect, useState} from 'react';
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

export function ArtistLineup(props: {event?: PublicEventRecord | null}) {
  return <ArtistLineupSection {...props} />;
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
