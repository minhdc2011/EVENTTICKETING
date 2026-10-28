import {useRef, type KeyboardEvent} from 'react';
import type {ZoneRecord} from '../../types/ticketing';
import type {RealtimeConnectionStatus} from '../../services/seatRealtimeService';

export interface MapToolbarProps {
  zones: ZoneRecord[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  connectionStatus: RealtimeConnectionStatus;
  isMock: boolean;
  saleOpen: boolean;
}

export function MapToolbar({
  zones,
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  connectionStatus,
  isMock,
  saleOpen,
}: MapToolbarProps) {
  const filterGroupRef = useRef<HTMLDivElement>(null);

  const filterOptions = [
    {value: 'all', label: 'Tất cả'},
    ...zones.map((zone) => ({
      value: String(zone.KhuVucID),
      label: zone.TenKhuVuc || zone.MaKhuVuc,
    })),
  ];

  const handleFilterKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;
    const total = filterOptions.length;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % total;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + total) % total;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = total - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextOption = filterOptions[nextIndex];
    onFilterChange(nextOption.value);

    // Focus the new button
    const buttons = filterGroupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  };

  const getLiveStatusText = () => {
    if (!saleOpen) return 'Chỉ xem';
    switch (connectionStatus) {
      case 'CONNECTING':
        return 'Đang kết nối dữ liệu';
      case 'CONNECTED':
        return isMock ? 'Dữ liệu mô phỏng' : 'Trực tiếp';
      case 'DISCONNECTED':
        return 'Mất kết nối';
      case 'ERROR':
        return 'Lỗi kết nối';
      default:
        return 'Chỉ xem';
    }
  };

  const dotClass = !saleOpen
    ? 'et-live-dot'
    : connectionStatus === 'CONNECTED'
    ? 'et-live-dot connected'
    : connectionStatus === 'CONNECTING'
    ? 'et-live-dot connecting'
    : 'et-live-dot disconnected';

  return (
    <div className="et-seatmap-toolbar" role="toolbar" aria-label="Công cụ sơ đồ" data-od-id="map-toolbar">
      {/* 1. Zone Segmented Filter (One-of-many radiogroup) */}
      <div
        ref={filterGroupRef}
        className="et-segmented"
        role="radiogroup"
        aria-label="Lọc khu vực"
        data-od-id="zone-filter"
      >
        {filterOptions.map((opt, i) => {
          const isChecked = activeFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isChecked}
              tabIndex={isChecked ? 0 : -1}
              data-filter={opt.value}
              onClick={() => onFilterChange(opt.value)}
              onKeyDown={(e) => handleFilterKeyDown(e, i)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 2. Seat-Code Search */}
      <label className="et-seatmap-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" strokeLinecap="round" />
        </svg>
        <span className="sr-only">Tìm mã ghế, ví dụ A-D03 hoặc VVIP-A-01</span>
        <input
          id="search"
          data-od-id="seat-search"
          placeholder="Tìm mã ghế…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
        />
      </label>

      {/* 3. Zoom Controls */}
      <div className="et-zoom" role="group" aria-label="Thu phóng sơ đồ">
        <button
          type="button"
          id="zoom-out"
          aria-label="Thu nhỏ sơ đồ"
          data-od-id="zoom-out"
          disabled={zoom <= 0.8}
          onClick={onZoomOut}
        >
          −
        </button>
        <button
          type="button"
          id="zoom-in"
          aria-label="Phóng to sơ đồ"
          data-od-id="zoom-in"
          disabled={zoom >= 1.4}
          onClick={onZoomIn}
        >
          +
        </button>
        <button
          type="button"
          id="zoom-reset"
          aria-label="Đặt lại thu phóng 100%"
          data-od-id="zoom-reset"
          onClick={onZoomReset}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 4. Realtime Connection Status Badge */}
      <span className="et-live-badge" id="live-status" data-od-id="live-status" role="status" aria-live="polite">
        <i className={dotClass} aria-hidden="true" />
        <span>{getLiveStatusText()}</span>
      </span>
    </div>
  );
}
