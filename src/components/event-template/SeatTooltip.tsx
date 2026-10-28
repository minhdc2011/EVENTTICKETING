import type {SeatTooltipPayload} from '../../domain/runtimeOverlays.js';

export type SeatTooltipProps = SeatTooltipPayload;

/**
 * Seat hover tooltip rendered via React with truthfulness and accessible semantics.
 * Retains exact design system styles and responsive positioning contract.
 */
export function SeatTooltip({
  visible,
  x = 0,
  y = 0,
  seatCode = 'VIP-A-01',
  zoneName = 'VIP Kim Cương',
  row = 'A',
  number = '01',
  priceFormatted = '3.500.000 VNĐ',
  status = 'available',
  statusText = 'Còn trống',
}: SeatTooltipProps) {
  let badgeClass =
    'px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';

  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus === 'selected') {
    badgeClass =
      'px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
  } else if (normalizedStatus === 'sold') {
    badgeClass =
      'px-2 py-0.5 rounded text-xs font-bold bg-white/[0.08] text-slate-400 border border-white/[0.08]';
  } else if (normalizedStatus === 'held') {
    badgeClass =
      'px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
  }

  return (
    <div
      id="seat-tooltip"
      role="tooltip"
      aria-hidden={!visible}
      className={`liquid-glass !rounded-xl text-white text-xs p-3 pointer-events-none min-w-[200px] shadow-2xl transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: `${x}px`,
        top: `${y - 12}px`,
        visibility: visible ? 'visible' : 'hidden',
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-1.5 mb-1.5">
        <span id="tooltip-seat-code" className="font-bold text-amber-400 font-mono text-sm">
          {seatCode}
        </span>
        <span id="tooltip-seat-status" className={badgeClass}>
          {statusText}
        </span>
      </div>
      <div className="space-y-1 text-slate-300 text-xs">
        <div>
          Phân khu: <strong id="tooltip-zone" className="text-white">{zoneName}</strong>
        </div>
        <div>
          Vị trí: Hàng <strong id="tooltip-row" className="text-white">{row}</strong>, Ghế{' '}
          <strong id="tooltip-number" className="text-white">{number}</strong>
        </div>
        <div className="text-amber-300 pt-1 text-xs">
          Giá vé: <strong id="tooltip-price" className="text-sm font-bold text-white">{priceFormatted}</strong>
        </div>
      </div>
    </div>
  );
}
