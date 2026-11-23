import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {loadPublicTicketTiers, type PublicEventRecord, type PublicTicketTier} from '../services/eventService';
import {subscribeToPriceUpdates, type PriceConnectionStatus} from '../services/priceRealtimeService';
import {applyPriceSnapshotToTiers, applyPriceUpdateToTiers} from '../domain/pricePresentation.js';
import {isValidPrice, khopMaPhamViNghiemNgat} from '../domain/priceRealtime.js';
import {ArtistLineup, ConcertRuntimeOverlays} from './ConcertSections';
import {EventTemplate, type EventTemplateSlots} from './event-template';

/**
 * Caller-level specialization adapter: supplies additive rich slots for Super Concert
 * while generic and organizer-created events receive empty slots.
 */
export function resolveEventTemplateSlots(event: PublicEventRecord): EventTemplateSlots {
  if (event.templateKey !== 'SUPER_CONCERT_2026') {
    return {};
  }

  return {
    ambient: (
      <>
        <div id="stA" aria-hidden="true" />
        <div id="stB" aria-hidden="true" />
      </>
    ),
    lineup: <ArtistLineup event={event} />,
    // Sơ đồ chỗ ngồi: dùng SeatMapSection chung (bản đồ kiểu Ticketmaster) như mọi sự kiện, không còn sơ đồ riêng.
    // Khe overlays giữ lại để hiện thông báo nổi (toast) và hộp thoại giữ chỗ cũ của trang Super Concert.
    overlays: <ConcertRuntimeOverlays />,
  };
}

export function GenericEventPage({event}: {event: PublicEventRecord}) {
  const [tiers, setTiers] = useState<PublicTicketTier[]>([]);
  const [tierState, setTierState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [priceConnectionStatus, setPriceConnectionStatus] = useState<PriceConnectionStatus>('CONNECTING');
  const [hasPriceConnectedBefore, setHasPriceConnectedBefore] = useState<boolean>(false);

  const scopeKey = `${event.id}_${event.selectedShow?.id ?? 0}`;
  const activeScopeKeyRef = useRef(scopeKey);
  activeScopeKeyRef.current = scopeKey;
  const latestPriceSnapshotRef = useRef<ReadonlyMap<number, number> | null>(null);

  const tierReqIdRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      tierReqIdRef.current += 1;
    };
  }, []);

  const fetchTiers = useCallback(() => {
    const requestScopeKey = scopeKey;
    const reqId = ++tierReqIdRef.current;
    const isCurrent = () =>
      isMountedRef.current && activeScopeKeyRef.current === requestScopeKey && tierReqIdRef.current === reqId;
    setTierState('loading');
    loadPublicTicketTiers(event)
      .then((rows) => {
        if (!isCurrent()) return;
        const snapshot = latestPriceSnapshotRef.current;
        setTiers(snapshot ? applyPriceSnapshotToTiers(rows, snapshot) : rows);
        setTierState('ready');
      })
      .catch((error) => {
        if (!isCurrent()) return;
        console.error('Không thể tải danh sách hạng vé sự kiện:', error);
        setTierState('error');
      });
  }, [event, scopeKey]);

  useEffect(() => {
    document.title = `${event.name} | EventTicketing`;
    latestPriceSnapshotRef.current = null;
    fetchTiers();
    return () => {
      // Scope/event change or unmount: invalidate any in-flight tier request
      tierReqIdRef.current += 1;
    };
  }, [event, fetchTiers]);

  useEffect(() => {
    let active = true;
    const effectScopeKey = `${event.id}_${event.selectedShow?.id ?? 0}`;
    const scope = {
      suKienId: event.id,
      suatDienId: event.selectedShow?.id,
    };

    latestPriceSnapshotRef.current = null;
    setPriceConnectionStatus('CONNECTING');
    setHasPriceConnectedBefore(false);

    const unsubscribe = subscribeToPriceUpdates(
      (priceEvent) => {
        if (!active || activeScopeKeyRef.current !== effectScopeKey) return;
        if (
          priceEvent?.type === 'ZONE_PRICE_CHANGED' &&
          isValidPrice(priceEvent.gia) &&
          khopMaPhamViNghiemNgat(priceEvent.suKienId, scope.suKienId) &&
          khopMaPhamViNghiemNgat(priceEvent.suatDienId, scope.suatDienId)
        ) {
          const nextMap = new Map(latestPriceSnapshotRef.current ?? undefined);
          nextMap.set(Number(priceEvent.khuVucId), priceEvent.gia);
          latestPriceSnapshotRef.current = nextMap;
        }
        setTiers((prev) => applyPriceUpdateToTiers(prev, priceEvent, scope));
      },
      (status) => {
        if (!active || activeScopeKeyRef.current !== effectScopeKey) return;
        setPriceConnectionStatus(status);
        if (status === 'CONNECTED' || status === 'LOCAL_ONLY') {
          setHasPriceConnectedBefore(true);
        }
      },
      {
        scope,
        onSnapshot: (priceMap) => {
          if (!active || activeScopeKeyRef.current !== effectScopeKey) return;
          latestPriceSnapshotRef.current = new Map(priceMap);
          setTiers((prev) => applyPriceSnapshotToTiers(prev, priceMap));
        },
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [event.id, event.selectedShow?.id]);

  const slots = useMemo(() => resolveEventTemplateSlots(event), [event]);

  return (
    <EventTemplate
      event={event}
      tiers={tiers}
      tierState={tierState}
      onRetryTiers={fetchTiers}
      priceConnectionStatus={priceConnectionStatus}
      hasPriceConnectedBefore={hasPriceConnectedBefore}
      slots={slots}
    />
  );
}

export {GenericEventPage as EventDetailPage};
