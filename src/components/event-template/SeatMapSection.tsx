import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PublicEventRecord} from '../../services/eventService';
import type {TicketingCatalog, SeatRecord, ZoneRecord} from '../../types/ticketing';
import {loadTicketingCatalog} from '../../services/ticketDataService';
import {createSeatHold, releaseSeatHold} from '../../services/bookingService';
import {
  subscribeToSeatUpdates,
  type RealtimeConnectionStatus,
} from '../../services/seatRealtimeService';
import {runtimeConfig} from '../../config/runtime';
import {deriveSaleStatus} from '../../domain/eventStatus';
import {dispatchToast} from '../../domain/runtimeOverlays.js';
import {
  groupSeatsByZoneAndRow,
  filterSeatsByQuery,
  findZoneForSeatQuery,
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
import {SelectionSummary} from './SelectionSummary';
import {HoldConfirmationDialog} from './HoldConfirmationDialog';
import './SeatMapSection.css';

export interface SeatMapSectionProps {
  event?: PublicEventRecord | null;
}

export function SeatMapSection({event}: SeatMapSectionProps) {
  const [catalog, setCatalog] = useState<TicketingCatalog | null>(null);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
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
  const [showContextMapModal, setShowContextMapModal] = useState<boolean>(false);

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
      now: new Date(),
      saleStartsAt: event.saleStartsAt,
      saleEndsAt: event.saleEndsAt,
      databaseStatus: event.databaseSaleStatus,
      hasAvailability: true,
    });
  }, [event]);

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
      setZoom(1);
    }
  }, [currentScopeKey]);

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

  const activeZoneGroup = useMemo(() => {
    if (selectedZoneId == null) return null;
    return groupedData.find((g) => g.zone.KhuVucID === selectedZoneId) || null;
  }, [groupedData, selectedZoneId]);

  // Search input change handler
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query.trim() && catalog?.seats) {
        const matchingZoneId = findZoneForSeatQuery(catalog.seats, query);
        if (matchingZoneId != null) {
          setSelectedZoneId(matchingZoneId);
        }
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
        setSelectedZoneId(zoneIdNum);
      }
    } else {
      setSelectedZoneId(null);
    }
    setZoom(1);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.8, +(z - 0.15).toFixed(2)));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  // Seat toggle handler
  const handleToggleSeat = useCallback(
    (seat: SeatRecord) => {
      const evaluation = evaluateSeatSelection({
        seat,
        selectedSeats,
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

      const next = toggleSeatSelection(selectedSeats, seat);
      setSelectedSeats(next);
      setInspectedSeat(seat);

      const msg = `${next.length} ghế đã chọn. Tổng ${formatMoneyVND(
        next.reduce((a, b) => a + (b.GiaVeNiemYet || 0), 0)
      )}`;
      setAnnouncement(msg);
    },
    [activeHold, isPending, saleOpen, selectedSeats]
  );

  // Clear all seats
  const handleClearAll = useCallback(() => {
    setSelectedSeats([]);
    setAnnouncement('Đã bỏ chọn tất cả ghế.');
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

    if (!selectedSeats.length || !saleOpen || isPending) return;

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

    const pendingSeatCodes = selectedSeats.map((seat) => seat.MaGheDayDu);
    pendingHoldSeatCodesRef.current = new Set(pendingSeatCodes);
    setIsPending(true);
    try {
      const holdResult = await createSeatHold({
        eventId: event?.slug || runtimeConfig.eventId,
        items: holdItemsResult.items,
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
      setRealtimeBanner('Đã giữ ghế tạm trong 5 phút · Chưa phát sinh thanh toán');
      setAnnouncement(`Đã giữ ${selectedSeats.length} ghế thành công.`);
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
  }, [activeHold, catalog?.zones, event?.slug, fetchCatalog, isConnectionTrusted, isPending, saleOpen, selectedSeats]);

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

  // Search filtered seats
  const isSearchEmpty = useMemo(() => {
    if (!searchQuery.trim() || !catalog?.seats) return false;
    const matches = filterSeatsByQuery(catalog.seats, searchQuery);
    return matches.length === 0;
  }, [catalog?.seats, searchQuery]);

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
              Chọn khu vực, tìm vị trí yêu thích và giữ tối đa 4 vé trong một lượt đặt.
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
                  {activeZoneGroup
                    ? `Khu ${activeZoneGroup.zone.TenKhuVuc || activeZoneGroup.zone.MaKhuVuc} · ${formatMoneyVND(
                        activeZoneGroup.zone.GiaVeNiemYet
                      )} / vé`
                    : 'Tổng quan sân vận động'}
                </h2>
                <p id="map-subtitle">
                  {activeZoneGroup
                    ? 'Hàng phía trước gần sân khấu hơn · Chọn ghế để đặt vé'
                    : 'Chọn một phân khu để xem từng hàng ghế chi tiết'}
                </p>
              </div>
              <span id="view-tag" className="et-view-tag">
                {activeZoneGroup
                  ? `KHU ${activeZoneGroup.zone.MaKhuVuc || activeZoneGroup.zone.TenKhuVuc}`
                  : 'TỔNG QUAN'}
              </span>
            </div>

            {/* Map Viewport / State Panel */}
            <div className="et-map-viewport" id="map" data-od-id="interactive-map">
              {catalogState === 'loading' ? (
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
              ) : isSearchEmpty ? (
                <div className="et-state-panel" role="status">
                  <h3>Không tìm thấy ghế</h3>
                  <p>Không có ghế nào khớp với mã "{searchQuery}". Thử mã như A-01 hoặc xóa tìm kiếm.</p>
                  <button
                    type="button"
                    className="et-secondary-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    Xóa tìm kiếm
                  </button>
                </div>
              ) : activeZoneGroup ? (
                <ZoneSeatGrid
                  zone={activeZoneGroup.zone}
                  rows={activeZoneGroup.rows}
                  selectedSeats={selectedSeats}
                  searchQuery={searchQuery}
                  saleOpen={saleOpen}
                  isPending={isPending}
                  hasActiveHold={Boolean(activeHold)}
                  zoom={zoom}
                  inspectedSeat={inspectedSeat}
                  onInspectSeat={setInspectedSeat}
                  onToggleSeat={handleToggleSeat}
                  onBackToOverview={() => {
                    setSelectedZoneId(null);
                    setZoom(1);
                  }}
                />
              ) : (
                <StadiumOverview
                  zones={catalog?.zones || []}
                  seats={catalog?.seats || []}
                  activeFilter={filter}
                  zoom={zoom}
                  onSelectZone={(zoneId) => {
                    setSelectedZoneId(zoneId);
                    setZoom(1);
                  }}
                />
              )}
            </div>

            {/* Map Footnote */}
            <div className="et-map-footnote">
              <span id="map-hint">
                {activeZoneGroup ? 'Nhấn ghế để chọn / bỏ chọn' : 'Nhấn vào phân khu để khám phá'}
              </span>
              <span id="zoom-label">{Math.round(zoom * 100)}%</span>
            </div>

            {/* Visible Status Legend */}
            <div className="et-legend" aria-label="Chú giải trạng thái ghế" data-od-id="seat-legend">
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
            </div>
          </section>

          {/* Selection & Hold Summary Panel */}
          <SelectionSummary
            selectedSeats={selectedSeats}
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

        {/* Optional Contextual Seating Map Reference (Requirement 3) */}
        {event?.seatingMapUrl && (
          <div style={{marginTop: '16px'}}>
            <button
              type="button"
              className="et-context-map-btn"
              onClick={() => setShowContextMapModal((prev) => !prev)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <span>{showContextMapModal ? 'Ẩn sơ đồ đính kèm từ BTC' : 'Xem sơ đồ đính kèm từ Ban tổ chức'}</span>
            </button>

            {showContextMapModal && (
              <div style={{marginTop: '12px', maxWidth: '640px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--seat-border)'}}>
                <img
                  src={event.seatingMapUrl}
                  alt={`Sơ đồ mặt bằng tổ chức của ${event.name}`}
                  style={{width: '100%', height: 'auto', display: 'block'}}
                />
              </div>
            )}
          </div>
        )}

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
