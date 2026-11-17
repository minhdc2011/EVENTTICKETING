import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PublicEventRecord} from '../../services/eventService';
import type {TicketingCatalog, SeatRecord, ZoneRecord} from '../../types/ticketing';
import {loadTicketingCatalog} from '../../services/ticketDataService';
import {createSeatHold, releaseSeatHold} from '../../services/bookingService';
import {
  subscribeToSeatUpdates,
  type RealtimeConnectionStatus,
} from '../../services/seatRealtimeService';
import {getActiveEventContext, runtimeConfig} from '../../config/runtime';
import {loadEventPurchaseConfig} from '../../services/eventService';
import {resolvePurchaseLimits, DEFAULT_HOLD_MINUTES} from '../../domain/purchaseLimits.js';
import {
  isStandingZone,
  sumStanding,
  setStandingQuantity,
  buildStandingHoldItems,
  calculateStandingTotal,

} from '../../domain/standingSelection.js';
import {deriveSaleStatus} from '../../domain/eventStatus';
import {dispatchToast} from '../../domain/runtimeOverlays.js';
import {
  groupSeatsByZoneAndRow,
  evaluateSeatSelection,
  toggleSeatSelection,
  reconcileSeatUpdate,
  reconcileSelectionAfterUpdate,
  reconcileSelectionWithCatalog,
  buildHoldItems,
  calculateRemainingSeconds,
  formatMoneyVND,
} from '../../domain/seatMap.js';

import {MapToolbar} from './MapToolbar';
import {StadiumOverview} from './StadiumOverview';
import {ZoneSeatGrid} from './ZoneSeatGrid';
import {resolveSeatSearch} from '../../domain/seatSearch.js';
import {SelectionSummary} from './SelectionSummary';
import {StandingTicketPicker} from './StandingTicketPicker';
import {HoldConfirmationDialog} from './HoldConfirmationDialog';
import {OfficialSeatingMap} from './OfficialSeatingMap';
import {MapPanZoom, usePanZoom} from './MapPanZoom';
import './SeatMapSection.css';

export interface SeatMapSectionProps {
  event?: PublicEventRecord | null;
  /** Ticket tier picked in the tier list: the map focuses its zone (tier.code === zone MaKhuVuc). */
  selectedTier?: {code: string} | null;
}

export function SeatMapSection({event, selectedTier = null}: SeatMapSectionProps) {
  const [catalog, setCatalog] = useState<TicketingCatalog | null>(null);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [viewMode, setViewMode] = useState<'interactive' | 'official'>(
    event?.seatingMapUrl ? 'official' : 'interactive',
  );
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const panZoom = usePanZoom();
  const {zoomIn: handleZoomIn, zoomOut: handleZoomOut, reset: handleZoomReset} = panZoom;
  const zoom = panZoom.view.zoom;
  const [selectedSeats, setSelectedSeats] = useState<SeatRecord[]>([]);
  const [heldSeatsSnapshot, setHeldSeatsSnapshot] = useState<SeatRecord[]>([]);
  const [inspectedSeat, setInspectedSeat] = useState<SeatRecord | null>(null);
  const [activeHold, setActiveHold] = useState<{
    holdId: string;
    expiresAt: string;
    seatCodes: string[];
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300);
  const [isHoldDialogOpen, setIsHoldDialogOpen] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [isReleasePending, setIsReleasePending] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('CONNECTING');
  const [realtimeBanner, setRealtimeBanner] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [standing, setStanding] = useState<Record<string, number>>({});
  const [clock, setClock] = useState<number>(() => Date.now());
  const [limits, setLimits] = useState(() => resolvePurchaseLimits(null));

  const holdButtonRef = useRef<HTMLButtonElement>(null);
  const pendingHoldSeatCodesRef = useRef<Set<string> | null>(null);

  // Active event/show scope identity for race safety and boundary resets
  const currentScopeKey = `${event?.id ?? 0}_${event?.selectedShow?.id ?? 0}`;
  const activeScopeRef = useRef(currentScopeKey);
  const activeHoldRef = useRef(activeHold);
  activeHoldRef.current = activeHold;

  // Derive sale status
  const saleStatus = useMemo(() => {
    if (!event) return 'ON_SALE';
    return deriveSaleStatus({
      now: new Date(clock),
      saleStartsAt: event.saleStartsAt,
      saleEndsAt: event.saleEndsAt,
      databaseStatus: event.databaseSaleStatus,
      hasAvailability: true,
    });
  }, [event, clock]);

  // Re-evaluate the sale window while the page stays open (opens/closes without a reload)
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // Purchase limits and hold duration come from the event configuration (defaults when unavailable)
  useEffect(() => {
    let cancelled = false;
    setLimits(resolvePurchaseLimits(null));
    if (!event) return undefined;
    void loadEventPurchaseConfig(event).then((config) => {
      if (!cancelled) {
        setLimits(resolvePurchaseLimits({maxTicketsPerOrder: config.maxTicketsPerOrder, holdMinutes: config.holdMinutes}));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  const saleOpen = saleStatus === 'ON_SALE';
  const isMock = runtimeConfig.useMockData;
  const isConnectionTrusted = isMock || connectionStatus === 'CONNECTED';

  // Event/show boundary: reset scope and attempt release of previous show's active hold
  useEffect(() => {
    const prevScope = activeScopeRef.current;
    if (prevScope !== currentScopeKey) {
      if (activeHoldRef.current) {
        void releaseSeatHold(activeHoldRef.current.holdId).catch((err) => {
          console.warn('Lỗi giải phóng giữ chỗ khi chuyển sự kiện/suất diễn:', err);
        });
      }
      activeScopeRef.current = currentScopeKey;

      setSelectedSeats([]);
      setStanding({});
      setHeldSeatsSnapshot([]);
      setInspectedSeat(null);
      setActiveHold(null);
      setIsHoldDialogOpen(false);
      setIsPending(false);
      setIsReleasePending(false);
      pendingHoldSeatCodesRef.current = null;
      setRealtimeBanner(null);
      setAnnouncement('');
      setSelectedZoneId(null);
      setFilter('all');
      setSearchQuery('');
      handleZoomReset();
      setViewMode(event?.seatingMapUrl ? 'official' : 'interactive');
    }
  }, [currentScopeKey, event?.seatingMapUrl]);

  // Load catalog (race-safe against stale async scope changes)
  const fetchCatalog = useCallback(async (): Promise<TicketingCatalog | null> => {
    const requestScope = currentScopeKey;
    setCatalogState('loading');
    try {
      const data = await loadTicketingCatalog();
      if (activeScopeRef.current !== requestScope) {
        return null;
      }
      if (!data.zones || data.zones.length === 0 || !data.seats || data.seats.length === 0) {
        setCatalog(data);
        setCatalogState('empty');
      } else {
        setCatalog(data);
        setCatalogState('ready');
      }
      return data;
    } catch (err) {
      if (activeScopeRef.current !== requestScope) {
        return null;
      }
      console.error('Không thể tải dữ liệu sơ đồ ghế:', err);
      setCatalogState('error');
      return null;
    }
  }, [currentScopeKey]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog, currentScopeKey]);

  // Realtime subscription (reconciles with activeHoldRef to avoid stale closure / own-hold race)
  useEffect(() => {
    const unsubscribe = subscribeToSeatUpdates(
      (updateEvent) => {
        setCatalog((prev) => {
          if (!prev) return prev;
          return reconcileSeatUpdate(prev, updateEvent);
        });

        setSelectedSeats((prev) => {
          const ownSeatCodes = new Set([
            ...(activeHoldRef.current?.seatCodes || []),
            ...(pendingHoldSeatCodesRef.current || []),
          ]);
          const {updatedSelection, lostSeat, message} = reconcileSelectionAfterUpdate(
            prev,
            updateEvent,
            ownSeatCodes
          );
          if (lostSeat && message) {
            setRealtimeBanner(message);
            setAnnouncement(message);
            dispatchToast({
              message,
              type: 'warning',
            });
          }
          return updatedSelection;
        });
      },
      (status) => {
        setConnectionStatus(status);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentScopeKey]);

  // Hold countdown interval timer
  useEffect(() => {
    if (!activeHold) return;

    const interval = window.setInterval(() => {
      const secondsLeft = calculateRemainingSeconds(activeHold.expiresAt);
      setRemainingSeconds(secondsLeft);

      if (secondsLeft <= 0) {
        setActiveHold(null);
        setSelectedSeats([]);
        setStanding({});
        setHeldSeatsSnapshot([]);
        setIsHoldDialogOpen(false);
        setIsReleasePending(false);
        const expiredNotice = 'Thời gian giữ ghế đã hết. Vui lòng chọn lại ghế để tiếp tục.';
        setRealtimeBanner(expiredNotice);
        setAnnouncement(expiredNotice);
        dispatchToast({
          message: expiredNotice,
          type: 'warning',
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeHold]);

  // Closed sale banner
  useEffect(() => {
    if (!saleOpen) {
      setRealtimeBanner('Sự kiện đã đóng bán · Sơ đồ chỉ để xem, không thể chọn hoặc giữ ghế.');
    }
  }, [saleOpen]);

  // Grouped seats and zones
  const groupedData = useMemo(() => {
    if (!catalog) return [];
    return groupSeatsByZoneAndRow(catalog.seats, catalog.zones);
  }, [catalog]);

  const standingZones = useMemo(
    () => (catalog?.zones || []).filter((zone) => isStandingZone(zone)),
    [catalog]
  );
  const standingCount = sumStanding(standing);
  const roomLeft = Math.max(0, limits.maxPerOrder - selectedSeats.length - standingCount);
  const holdLabel = `${limits.holdMinutes || DEFAULT_HOLD_MINUTES} phút`;


  const activeZoneGroup = useMemo(() => {
    if (selectedZoneId == null) return null;
    return groupedData.find((g) => g.zone.KhuVucID === selectedZoneId) || null;
  }, [groupedData, selectedZoneId]);

  const activeStandingZone = useMemo(() => {
    if (selectedZoneId == null) return null;
    return standingZones.find((zone) => zone.KhuVucID === selectedZoneId) || null;
  }, [selectedZoneId, standingZones]);
  const activeDisplayZone = activeZoneGroup?.zone || activeStandingZone;

  // Search result is derived from the catalog so every display mode reacts to it.
  const seatSearch = useMemo(
    () => resolveSeatSearch(catalog?.seats, searchQuery),
    [catalog?.seats, searchQuery],
  );

  // Search input change handler: a matching seat opens its zone in any display mode.
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      const result = resolveSeatSearch(catalog?.seats, query);
      if (result.status === 'found' && result.zoneId != null) {
        setViewMode('interactive');
        setFilter(String(result.zoneId));
        setSelectedZoneId(result.zoneId);
      }
    },
    [catalog]
  );

  // Filter change handler
  const handleFilterChange = useCallback((newFilter: string) => {
    setFilter(newFilter);
    if (newFilter !== 'all') {
      const zoneIdNum = Number(newFilter);
      if (Number.isInteger(zoneIdNum)) {
        setViewMode('interactive');
        setSelectedZoneId(zoneIdNum);
      }
    } else {
      setSelectedZoneId(null);
      if (event?.seatingMapUrl) setViewMode('official');
    }
  }, [event?.seatingMapUrl]);

  const handleOfficialZoneSelect = useCallback((zone: ZoneRecord) => {
    setViewMode('interactive');
    setFilter(String(zone.KhuVucID));
    setAnnouncement(`Đã mở khu ${zone.TenKhuVuc || zone.MaKhuVuc}.`);

    if (isStandingZone(zone)) {
      setSelectedZoneId(zone.KhuVucID);
      window.requestAnimationFrame(() => {
        document.querySelector(`[data-standing-zone="${zone.MaKhuVuc}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }

    setSelectedZoneId(zone.KhuVucID);
  }, []);

  // Camera reset whenever the visible map changes (zone drill-down, official/interactive switch)
  useEffect(() => {
    handleZoomReset();
  }, [selectedZoneId, viewMode, currentScopeKey, handleZoomReset]);

  // Seat toggle handler
  const handleToggleSeat = useCallback(
    (seat: SeatRecord) => {
      const evaluation = evaluateSeatSelection({
        seat,
        selectedSeats,
        maxCap: Math.max(0, limits.maxPerOrder - standingCount),
        saleOpen,
        isPending,
        hasActiveHold: Boolean(activeHold),
      });

      if (!evaluation.allowed) {
        if (evaluation.message) {
          setRealtimeBanner(evaluation.message);
          setAnnouncement(evaluation.message);
          dispatchToast({
            message: evaluation.message,
            type: 'warning',
          });
        }
        return;
      }

      const next = toggleSeatSelection(selectedSeats, seat, Math.max(0, limits.maxPerOrder - standingCount));
      setSelectedSeats(next);
      setInspectedSeat(seat);

      const msg = `${next.length} ghế đã chọn. Tổng ${formatMoneyVND(
        next.reduce((a, b) => a + (b.GiaVeNiemYet || 0), 0)
      )}`;
      setAnnouncement(msg);
    },
    [activeHold, isPending, limits.maxPerOrder, saleOpen, selectedSeats, standingCount]
  );

  // Clear all seats
  const handleStandingChange = useCallback(
    (zoneCode: string, quantity: number) => {
      if (!saleOpen || isPending || activeHold) return;
      const zone = (catalog?.zones || []).find((z) => z.MaKhuVuc === zoneCode);
      const result = setStandingQuantity(standing, zoneCode, quantity, {
        maxPerOrder: limits.maxPerOrder,
        seatedCount: selectedSeats.length,
        available: zone?.TongSoGhe ?? Infinity,
      });
      setStanding(result.standing);
      const msg = result.clamped
        ? `Tối đa ${limits.maxPerOrder} vé mỗi lượt đặt.`
        : `${zone?.TenKhuVuc || zoneCode}: ${result.quantity} vé đứng.`;
      setAnnouncement(msg);
      if (result.clamped) dispatchToast({message: msg, type: 'warning'});
    },
    [activeHold, catalog?.zones, isPending, limits.maxPerOrder, saleOpen, selectedSeats.length, standing]
  );

  const handleClearAll = useCallback(() => {
    setSelectedSeats([]);
    setStanding({});
    setAnnouncement('Đã bỏ chọn tất cả vé.');
  }, []);

  // Remove single seat
  const handleRemoveSeat = useCallback((seat: SeatRecord) => {
    setSelectedSeats((prev) => prev.filter((s) => s.MaGheDayDu !== seat.MaGheDayDu));
    setAnnouncement(`Đã bỏ chọn ghế ${seat.MaGheDayDu}.`);
  }, []);

  // Proceed Hold
  const handleProceedHold = useCallback(async () => {
    if (activeHold) {
      setIsHoldDialogOpen(true);
      return;
    }

    if ((!selectedSeats.length && standingCount === 0) || !saleOpen || isPending) return;

    if (!isConnectionTrusted) {
      const warnMsg = 'Kết nối dữ liệu ghế chưa ổn định. Vui lòng đợi kết nối lại trước khi giữ ghế.';
      setRealtimeBanner(warnMsg);
      dispatchToast({message: warnMsg, type: 'warning'});
      return;
    }

    const holdItemsResult = buildHoldItems(selectedSeats, catalog?.zones || []);
    if ('error' in holdItemsResult) {
      setRealtimeBanner(holdItemsResult.error);
      setAnnouncement(holdItemsResult.error);
      dispatchToast({message: holdItemsResult.error, type: 'error'});
      return;
    }

    const standingItems = buildStandingHoldItems(standing, catalog?.zones || []);
    const pendingSeatCodes = selectedSeats.map((seat) => seat.MaGheDayDu);
    pendingHoldSeatCodesRef.current = new Set(pendingSeatCodes);
    setIsPending(true);
    try {
      const holdResult = await createSeatHold({
        eventId: getActiveEventContext().eventId || event?.slug || runtimeConfig.eventId,
        items: [...holdItemsResult.items, ...standingItems],
      });

      setActiveHold({
        holdId: holdResult.holdId,
        expiresAt: holdResult.expiresAt,
        seatCodes: pendingSeatCodes,
      });
      setHeldSeatsSnapshot([...selectedSeats]);

      const secs = calculateRemainingSeconds(holdResult.expiresAt);
      setRemainingSeconds(secs);
      setIsHoldDialogOpen(true);
      setRealtimeBanner(`Đã giữ chỗ tạm trong ${holdLabel} · Chưa phát sinh thanh toán`);
      setAnnouncement(`Đã giữ ${selectedSeats.length + standingCount} vé thành công.`);
    } catch (err: any) {
      console.error('Lỗi yêu cầu giữ chỗ:', err);
      const isConflict =
        err?.status === 409 ||
        err?.code === '409' ||
        String(err?.message || '').toLowerCase().includes('conflict') ||
        String(err?.message || '').toLowerCase().includes('đã được');

      // Reconcile from fresh catalog on any hold error/conflict so foreign holds cannot remain falsely selected
      const freshCatalog = await fetchCatalog();
      if (freshCatalog) {
        setSelectedSeats((currentSelection) => {
          const {validSelection, removedSeats, message} = reconcileSelectionWithCatalog(
            currentSelection,
            freshCatalog
          );
          if (removedSeats.length > 0) {
            setRealtimeBanner(message);
            setAnnouncement(message || '');
            dispatchToast({
              message: message || '',
              type: 'warning',
            });
          } else if (isConflict) {
            const defaultConflictMsg =
              'Một số ghế vừa có sự thay đổi trạng thái. Vui lòng kiểm tra lại lựa chọn.';
            setRealtimeBanner(defaultConflictMsg);
            dispatchToast({message: defaultConflictMsg, type: 'warning'});
          } else {
            const errorText = 'Không thể giữ ghế lúc này. Vui lòng thử lại sau.';
            setRealtimeBanner(errorText);
            dispatchToast({message: errorText, type: 'error'});
          }
          return validSelection;
        });
      } else {
        const errorText = 'Không thể giữ ghế lúc này. Vui lòng thử lại sau.';
        setRealtimeBanner(errorText);
        dispatchToast({message: errorText, type: 'error'});
      }
    } finally {
      pendingHoldSeatCodesRef.current = null;
      setIsPending(false);
    }
  }, [activeHold, catalog?.zones, event?.slug, fetchCatalog, holdLabel, isConnectionTrusted, isPending, saleOpen, selectedSeats, standing, standingCount]);

  // Release Hold (only clears state and announces success on confirmed release)
  const handleReleaseHold = useCallback(async () => {
    if (!activeHold || isReleasePending) return;

    setIsReleasePending(true);
    try {
      await releaseSeatHold(activeHold.holdId);
      setActiveHold(null);
      setHeldSeatsSnapshot([]);
      setIsHoldDialogOpen(false);
      setRealtimeBanner(null);
      const msg = 'Đã hủy giữ ghế. Bạn có thể tiếp tục thay đổi lựa chọn.';
      setAnnouncement(msg);
      dispatchToast({message: msg, type: 'info'});
    } catch (err) {
      console.error('Lỗi khi hủy giữ chỗ:', err);
      const errMsg = 'Chưa thể hủy giữ chỗ do lỗi kết nối. Phiên giữ ghế vẫn đang tiếp tục.';
      setRealtimeBanner(errMsg);
      dispatchToast({message: errMsg, type: 'error'});
    } finally {
      setIsReleasePending(false);
    }
  }, [activeHold, isReleasePending]);

  return (
    <section
      id="seating-section"
      className="et-seatmap-root"
      aria-label="Sơ đồ chỗ ngồi và chọn vé trực quan"
      data-od-id="seat-map-region"
    >
      <div className="et-seatmap-container">
        {/* Section Heading */}
        <div className="et-seatmap-heading">
          <div>
            <p className="et-seatmap-eyebrow">Sơ đồ ghế tương tác</p>
            <h2 className="et-seatmap-title" data-od-id="page-title">
              {event?.name ? `Chọn chỗ ngồi · ${event.name}` : 'Chọn chỗ ngồi'}
            </h2>
            <p className="et-seatmap-subcopy">
              Chọn khu vực, tìm vị trí yêu thích và giữ tối đa {limits.maxPerOrder} vé trong một lượt đặt.
            </p>
          </div>
          <div className="et-seatmap-meta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
              <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span>
              {event?.venueName || 'Địa điểm đang cập nhật'}
              {event?.address ? (
                <>
                  <br />
                  {event.address}
                </>
              ) : null}
            </span>
          </div>
        </div>

        {/* Realtime Announcement Banner */}
        {realtimeBanner && (
          <div className="et-seatmap-banner" role="status" data-od-id="realtime-banner">
            <span>{realtimeBanner}</span>
            <button
              type="button"
              className="et-seatmap-banner-dismiss"
              aria-label="Đóng thông báo"
              onClick={() => setRealtimeBanner(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* Main Workarea (2 columns on desktop, stacked below 850px) */}
        <div className="et-seatmap-workarea">
          <section className="et-seatmap-card" aria-label="Sơ đồ tương tác">
            {/* Toolbar */}
            <MapToolbar
              zones={catalog?.zones || []}
              activeFilter={filter}
              onFilterChange={handleFilterChange}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
              connectionStatus={connectionStatus}
              isMock={isMock}
              saleOpen={saleOpen}
            />

            {/* Map Header */}
            <div className="et-map-card-head">
              <div>
                <h2 id="map-title" data-od-id="map-title">
                  {viewMode === 'official'
                    ? 'Sơ đồ tổng quan do Ban tổ chức cung cấp'
                    : activeDisplayZone
                    ? `Khu ${activeDisplayZone.TenKhuVuc || activeDisplayZone.MaKhuVuc} · ${formatMoneyVND(
                        activeDisplayZone.GiaVeNiemYet
                      )} / vé`
                    : 'Tổng quan sân vận động'}
                </h2>
                <p id="map-subtitle">
                  {viewMode === 'official'
                    ? 'Bấm trực tiếp vào đúng phân khu để xem và chọn ghế của riêng khu đó.'
                    : activeDisplayZone
                    ? isStandingZone(activeDisplayZone)
                      ? 'Khu vé đứng · Chọn số lượng vé ở bộ điều khiển bên dưới'
                      : 'Hàng phía trước gần sân khấu hơn · Chọn ghế để đặt vé'
                    : 'Chọn một phân khu để xem từng hàng ghế chi tiết'}
                </p>
              </div>
              <span id="view-tag" className="et-view-tag">
                {viewMode === 'official'
                  ? 'SƠ ĐỒ BTC'
                  : activeDisplayZone
                  ? `KHU ${activeDisplayZone.MaKhuVuc || activeDisplayZone.TenKhuVuc}`
                  : 'TỔNG QUAN'}
              </span>
            </div>

            {seatSearch.status === 'not-found' && (
              <div className="et-seat-search-notice" role="status" data-od-id="seat-search-empty">
                <div>
                  <strong>Không tìm thấy ghế</strong>
                  <span>
                    Không có ghế nào khớp với mã "{seatSearch.query}". Thử mã như A-01 hoặc xóa tìm kiếm.
                  </span>
                </div>
                <button type="button" className="et-secondary-btn" onClick={() => setSearchQuery('')}>
                  Xóa tìm kiếm
                </button>
              </div>
            )}

            {/* Map Viewport / State Panel */}
            <div className="et-map-viewport" id="map" data-od-id="interactive-map">
              <MapPanZoom controller={panZoom} label="Sơ đồ chỗ ngồi. Giữ Ctrl và cuộn để thu phóng, kéo để di chuyển, hoặc dùng phím + − 0 và các mũi tên.">
              {viewMode === 'official' && event?.seatingMapUrl ? (
                <OfficialSeatingMap
                  src={event.seatingMapUrl}
                  eventName={event.name}
                  zones={catalog?.zones || []}
                  onSelectZone={handleOfficialZoneSelect}
                />
              ) : catalogState === 'loading' ? (
                <div className="et-state-panel" role="status">
                  <div className="et-spinner" aria-hidden="true" />
                  <h3>Đang tải sơ đồ</h3>
                  <p>Đang kiểm tra và đồng bộ trạng thái ghế mới nhất từ hệ thống…</p>
                </div>
              ) : catalogState === 'error' ? (
                <div className="et-state-panel" role="alert">
                  <h3>Chưa thể tải sơ đồ</h3>
                  <p>Kết nối bị gián đoạn. Lựa chọn của bạn vẫn được lưu trong phiên này.</p>
                  <button
                    type="button"
                    className="et-secondary-btn"
                    id="retry"
                    data-od-id="retry"
                    onClick={fetchCatalog}
                  >
                    Thử lại
                  </button>
                </div>
              ) : catalogState === 'empty' ? (
                <div className="et-state-panel" role="status">
                  <h3>Chưa có ghế mở bán</h3>
                  <p>Sơ đồ hiện chưa có ghế khả dụng. Vui lòng quay lại khi Ban tổ chức mở bán.</p>
                </div>
              ) : activeStandingZone ? (
                <div className="et-standing-zone-detail" data-sector-code={activeStandingZone.MaKhuVuc}>
                  <button
                    type="button"
                    className="et-back-btn"
                    onClick={() => {
                      setSelectedZoneId(null);
                      setFilter('all');
                      if (event?.seatingMapUrl) setViewMode('official');
                    }}
                  >
                    <span aria-hidden="true">←</span>
                    <span>{event?.seatingMapUrl ? 'Sơ đồ khán đài BTC' : 'Tổng quan sân vận động'}</span>
                  </button>
                  <div className="et-standing-zone-shape">
                    <strong>{activeStandingZone.TenKhuVuc || activeStandingZone.MaKhuVuc}</strong>
                    <span>Vé đứng · Chọn số lượng ở bên dưới</span>
                  </div>
                </div>
              ) : activeZoneGroup ? (
                <ZoneSeatGrid
                  zone={activeZoneGroup.zone}
                  rows={activeZoneGroup.rows}
                  selectedSeats={selectedSeats}
                  searchQuery={searchQuery}
                  focusSeatCode={seatSearch.status === 'found' ? seatSearch.seatCode : null}
                  saleOpen={saleOpen}
                  isPending={isPending}
                  hasActiveHold={Boolean(activeHold)}
                  inspectedSeat={inspectedSeat}
                  onInspectSeat={setInspectedSeat}
                  onToggleSeat={handleToggleSeat}
                  onRevealSeat={panZoom.reveal}
                  backLabel={event?.seatingMapUrl ? 'Sơ đồ khán đài BTC' : 'Tổng quan sân vận động'}
                  onBackToOverview={() => {
                    setSelectedZoneId(null);
                    setFilter('all');
                    if (event?.seatingMapUrl) setViewMode('official');
                  }}
                />
              ) : (
                <StadiumOverview
                  zones={catalog?.zones || []}
                  seats={catalog?.seats || []}
                  activeFilter={filter}
                  onSelectZone={(zoneId) => {
                    setSelectedZoneId(zoneId);
                  }}
                />
              )}
              </MapPanZoom>
            </div>

            {viewMode === 'interactive' && (
              <StandingTicketPicker
                zones={activeStandingZone ? [activeStandingZone] : standingZones}
                quantities={standing}
                roomLeft={roomLeft}
                disabled={!saleOpen || isPending || Boolean(activeHold)}
                onChange={handleStandingChange}
              />
            )}

            {/* Map Footnote */}
            <div className="et-map-footnote">
              <span id="map-hint">
                {viewMode === 'official'
                  ? 'Bấm một phân khu để mở đúng lưới ghế của phân khu đó'
                  : activeStandingZone
                    ? 'Dùng nút − / + để chọn số lượng vé đứng'
                    : activeZoneGroup
                      ? 'Nhấn ghế để chọn / bỏ chọn'
                    : 'Nhấn vào phân khu để khám phá'}
              </span>
              <span id="zoom-label" aria-live="polite">Thu phóng {Math.round(zoom * 100)}%</span>
            </div>

            {/* Visible Status Legend */}
            {viewMode === 'interactive' && <div className="et-legend" aria-label="Chú giải trạng thái ghế" data-od-id="seat-legend">
              <span className="et-legend-item">
                <i className="et-sample" aria-hidden="true" />
                <span>Còn trống</span>
              </span>
              <span className="et-legend-item">
                <i className="et-sample sold" aria-hidden="true">×</i>
                <span>Đã bán</span>
              </span>
              <span className="et-legend-item">
                <i className="et-sample held" aria-hidden="true">◷</i>
                <span>Đang giữ</span>
              </span>
              <span className="et-legend-item">
                <i className="et-sample selected" aria-hidden="true">✓</i>
                <span>Đã chọn</span>
              </span>
              <span className="et-legend-item">
                <i className="et-sample blocked" aria-hidden="true">−</i>
                <span>Không mở bán</span>
              </span>
            </div>}
          </section>

          {/* Selection & Hold Summary Panel */}
          <SelectionSummary
            selectedSeats={selectedSeats}
            standingLines={(Object.entries(standing) as Array<[string, number]>).map(([zoneCode, quantity]) => {
              const zone = (catalog?.zones || []).find((z) => z.MaKhuVuc === zoneCode);
              return {zoneCode, name: zone?.TenKhuVuc || zoneCode, quantity, price: Number(zone?.GiaVeNiemYet || 0)};
            })}
            standingTotal={calculateStandingTotal(standing, catalog?.zones || [])}
            maxCap={limits.maxPerOrder}
            holdLabel={holdLabel}
            onChangeStanding={handleStandingChange}
            saleOpen={saleOpen}
            isPending={isPending}
            hasActiveHold={Boolean(activeHold)}
            isConnectionTrusted={isConnectionTrusted}
            holdButtonRef={holdButtonRef}
            onRemoveSeat={handleRemoveSeat}
            onClearAll={handleClearAll}
            onProceedHold={handleProceedHold}
          />
        </div>

        {/* Accessible screen reader announcement live region */}
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>

        {/* Hold Confirmation Modal */}
        <HoldConfirmationDialog
          isOpen={isHoldDialogOpen}
          onClose={() => setIsHoldDialogOpen(false)}
          onRelease={handleReleaseHold}
          holdId={activeHold?.holdId}
          selectedSeats={heldSeatsSnapshot.length > 0 ? heldSeatsSnapshot : selectedSeats}
          remainingSeconds={remainingSeconds}
          openerRef={holdButtonRef}
          isReleasing={isReleasePending}
        />
      </div>
    </section>
  );
}

export {SeatMapSection as SeatingSection};
