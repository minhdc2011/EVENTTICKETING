import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import * as pricingService from '../../services/pricingService';
import type {
  ChayDinhGiaNgayResult,
  KetQuaKhu,
  MoPhongNhuCauServiceResult,
  SoLieuDinhGiaRow,
} from '../../services/pricingService';
import type {OrganizerEvent} from '../../services/organizerService';
import {OrganizerPricingConfig} from './OrganizerPricingConfig';
import {OrganizerPriceProposals} from './OrganizerPriceProposals';
import {
  KICH_BAN_MO_PHONG,
  NHAN_MO_PHONG_UI,
  createDialogFocusScope,
  createPricingSession,
  findRow,
  getFocusableElements,
  hasPricingAccess,
  isSimulatedView,
  isSimulationEnabled,
  loadMetrics,
  resolveDialogKeyDown,
  runPricingNow,
  runSimulation,
  storageWarning,
} from './pricingPanelController.js';
import type {
  DuLieuMeta,
  KichBan,
  PricingOrgLike,
  PricingServices,
  RunSummary,
} from './pricingPanelController';
import {IconAlertTriangle, IconArrowRight, IconClose, IconInfoCircle, IconPlay, IconSpinner} from './OrganizerIcons';
import './organizer-pricing.css';

const defaultServices: PricingServices = {
  laySoLieuDinhGia: pricingService.laySoLieuDinhGia,
  luuCauHinhGia: pricingService.luuCauHinhGia,
  chayDinhGiaNgay: pricingService.chayDinhGiaNgay,
  moPhongNhuCau: pricingService.moPhongNhuCau,
};

export type PricingProposalsContext = {
  suKienId: number;
  rows: SoLieuDinhGiaRow[];
  refreshMetrics: () => Promise<void>;
};

const moneyFormatter = new Intl.NumberFormat('vi-VN');
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const KICH_BAN_LABELS: Record<KichBan, string> = {
  ban_nhanh: 'ban_nhanh — Bán nhanh',
  ban_cham: 'ban_cham — Bán chậm',
  ban_deu: 'ban_deu — Bán đều',
};

const ALERT_TYPE_LABELS: Record<'BINH_THUONG' | 'CHAM_GIA_TRAN' | 'CHAM_GIA_SAN', string> = {
  BINH_THUONG: 'BINH_THUONG (Bình thường)',
  CHAM_GIA_TRAN: 'CHAM_GIA_TRAN (Chạm giá trần)',
  CHAM_GIA_SAN: 'CHAM_GIA_SAN (Chạm giá sàn)',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormatter.format(date);
}

function describeKhu(rows: SoLieuDinhGiaRow[], khuVucId: number, suatDienId: number): string {
  const matched = findRow(rows, khuVucId);
  const name = matched?.ten_khu_vuc ?? matched?.ma_khu_vuc ?? `Khu #${khuVucId}`;
  return `${name} (Suất #${suatDienId})`;
}

export type OrganizerPricingPanelProps = {
  key?: React.Key;
  event: OrganizerEvent;
  /** Membership của tổ chức đang chọn (canManagePricing kiểm tra vai trò + tổ chức sở hữu sự kiện). */
  activeOrg: PricingOrgLike;
  onClose: () => void;
  services?: PricingServices;
  /** Điểm tích hợp riêng cho màn hình Đề xuất giá (T8). */
  renderProposals?: (ctx: PricingProposalsContext) => React.ReactNode;
};

type LoadState = 'loading' | 'ready' | 'error';

export function OrganizerPricingPanel({
  event,
  activeOrg,
  onClose,
  services = defaultServices,
  renderProposals,
}: OrganizerPricingPanelProps) {
  const sessionRef = useRef(createPricingSession());
  const session = sessionRef.current;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const orgId = (activeOrg && !Array.isArray(activeOrg) ? activeOrg.organizationId : null) ?? null;
  const allowed = hasPricingAccess(activeOrg, event);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<SoLieuDinhGiaRow[]>([]);
  const [meta, setMeta] = useState<DuLieuMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configBusy, setConfigBusy] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [runResult, setRunResult] = useState<{result: ChayDinhGiaNgayResult; summary: RunSummary} | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [kichBan, setKichBan] = useState<KichBan>('ban_deu');
  const [simResult, setSimResult] = useState<MoPhongNhuCauServiceResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const submitting = configBusy || runningNow || simulating;

  const servicesRef = useRef(services);
  servicesRef.current = services;
  const ctxRef = useRef({activeOrg, event});
  ctxRef.current = {activeOrg, event};

  const refreshMetrics = useCallback(async () => {
    setLoadError(null);
    const outcome = await loadMetrics(session, servicesRef.current, ctxRef.current);
    if (outcome.status === 'ok') {
      setRows(outcome.rows);
      setMeta(outcome.meta);
      setLoadState('ready');
    } else if (outcome.status === 'error') {
      setLoadError(outcome.error.message);
      setLoadState('error');
    } else if (outcome.status === 'forbidden') {
      setLoadState('error');
      setLoadError('Bạn không có quyền cấu hình giá cho sự kiện này.');
    }
    // stale: phiên đã đổi, bỏ qua hoàn toàn.
  }, [session]);

  // Đổi tổ chức/sự kiện (hoặc đóng panel): đặt lại dữ liệu cũ, vô hiệu phản hồi đang bay, nạp lại.
  useEffect(() => {
    session.reset();
    setRows([]);
    setMeta(null);
    setRunResult(null);
    setRunError(null);
    setSimResult(null);
    setSimError(null);
    setConfigBusy(false);
    setRunningNow(false);
    setSimulating(false);
    setLoadError(null);
    if (!hasPricingAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      setLoadState('error');
      setLoadError('Bạn không có quyền cấu hình giá cho sự kiện này.');
      return () => session.reset();
    }
    setLoadState('loading');
    void refreshMetrics();
    return () => session.reset();
  }, [session, refreshMetrics, orgId, event.id]);

  // Bẫy focus + đánh dấu inert nền khi hộp thoại mở; khôi phục nền và focus về opener khi đóng.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const scope = createDialogFocusScope({
      dialog,
      overlay: overlayRef.current ?? undefined,
      ownerDocument: dialog.ownerDocument,
    });
    return () => scope.cleanup();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const decision = resolveDialogKeyDown({
      key: e.key,
      shiftKey: e.shiftKey,
      activeElement: dialog.ownerDocument?.activeElement ?? null,
      dialogElement: dialog,
      focusables: getFocusableElements(dialog),
    });
    if (decision.action === 'close') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (decision.action === 'wrap') {
      e.preventDefault();
      e.stopPropagation();
      decision.target.focus();
    }
  }

  const eventFlags = event as OrganizerEvent & {moPhong?: boolean};
  const simulationEnabled = isSimulationEnabled(eventFlags, rows);
  const simulated = isSimulatedView({meta, rows, event: eventFlags});
  const warning = storageWarning(meta);
  const locked = submitting;

  async function handleRunNow() {
    if (locked || session.busy) return;
    setRunError(null);
    setRunningNow(true);
    const outcome = await runPricingNow(session, servicesRef.current, ctxRef.current);
    if (outcome.status === 'stale') return;
    setRunningNow(false);
    if (outcome.status === 'busy') {
      setRunError('Đang có thao tác khác đang chạy. Vui lòng đợi hoàn tất.');
      return;
    }
    if (outcome.status === 'done') {
      setRunResult({result: outcome.result, summary: outcome.summary});
      void refreshMetrics();
    } else if (outcome.status === 'error') {
      setRunError(outcome.error.message);
    } else {
      setRunError('Bạn không có quyền chạy định giá cho sự kiện này.');
    }
  }

  async function handleSimulate() {
    if (locked || session.busy) return;
    setSimError(null);
    setSimulating(true);
    const outcome = await runSimulation(session, servicesRef.current, {...ctxRef.current, rows, kichBan});
    if (outcome.status === 'stale') return;
    setSimulating(false);
    if (outcome.status === 'busy') {
      setSimError('Đang có thao tác khác đang chạy. Vui lòng đợi hoàn tất.');
      return;
    }
    if (outcome.status === 'done') {
      setSimResult(outcome.result);
      void refreshMetrics();
    } else if (outcome.status === 'error') {
      setSimError(outcome.error.message);
    } else if (outcome.status === 'not_available') {
      setSimError('Simulator chỉ khả dụng cho sự kiện mô phỏng.');
    } else {
      setSimError('Không thể chạy mô phỏng.');
    }
  }

  const proposalsCtx = useMemo<PricingProposalsContext>(
    () => ({suKienId: event.id, rows, refreshMetrics}),
    [event.id, rows, refreshMetrics],
  );

  return (
    <div ref={overlayRef} className="org-pricing-overlay" role="presentation" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        className="org-pricing-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-panel-title"
        tabIndex={-1}
        aria-busy={loadState === 'loading' || submitting}
      >
        <header className="org-pricing-header">
          <div>
            <h2 id="pricing-panel-title" className="org-pricing-title">
              Cấu hình giá động
              {simulated && <span className="org-chip org-pricing-sim-label"> {NHAN_MO_PHONG_UI}</span>}
            </h2>
            <p className="org-pricing-subtitle">{event.name}</p>
          </div>
          <button type="button" className="org-btn org-btn-secondary" onClick={onClose} aria-label="Đóng cấu hình giá">
            <IconClose size={16} />
          </button>
        </header>

        <div className="org-pricing-body">
          {warning && (
            <div className="org-alert org-alert-warning" role="alert">
              <IconAlertTriangle size={16} className="org-alert-icon" />
              <div className="org-alert-body">{warning}</div>
            </div>
          )}

          {loadState === 'loading' && (
            <div className="org-pricing-state" role="status">
              <IconSpinner size={18} />
              <span>Đang tải số liệu định giá…</span>
            </div>
          )}

          {loadState === 'error' && (
            <div className="org-alert org-alert-danger" role="alert">
              <IconAlertTriangle size={16} className="org-alert-icon" />
              <div className="org-alert-body">
                <p>{loadError ?? 'Không tải được số liệu định giá.'}</p>
                {allowed && (
                  <button
                    type="button"
                    className="org-btn org-btn-secondary"
                    onClick={() => {
                      setLoadState('loading');
                      void refreshMetrics();
                    }}
                  >
                    Thử lại
                  </button>
                )}
              </div>
            </div>
          )}

          {loadState === 'ready' && rows.length === 0 && (
            <div className="org-pricing-state" role="status">
              <IconInfoCircle size={18} />
              <span>Sự kiện chưa có suất diễn hoặc khu vực nào để cấu hình giá.</span>
            </div>
          )}

          {loadState === 'ready' && rows.length > 0 && (
            <>
              <section className="org-pricing-section" aria-labelledby="pricing-config-title">
                <h3 id="pricing-config-title" className="org-pricing-section-title">
                  Cấu hình theo khu vực
                </h3>
                <OrganizerPricingConfig
                  key={`${orgId}:${event.id}`}
                  session={session}
                  activeOrg={activeOrg}
                  event={event}
                  rows={rows}
                  locked={locked}
                  services={services}
                  onSaved={() => void refreshMetrics()}
                  onBusyChange={setConfigBusy}
                />
              </section>

              <section className="org-pricing-section" aria-labelledby="pricing-run-title">
                <h3 id="pricing-run-title" className="org-pricing-section-title">
                  Chạy ngay
                </h3>
                <div className="org-pricing-run-controls">
                  <button type="button" className="org-btn org-btn-primary" onClick={handleRunNow} disabled={locked}>
                    {runningNow ? (
                      <>
                        <IconSpinner size={15} />
                        <span>Đang gửi…</span>
                      </>
                    ) : (
                      <>
                        <IconPlay size={15} />
                        <span>Chạy tính giá ngay</span>
                      </>
                    )}
                  </button>
                </div>
                {runError && (
                  <div className="org-alert org-alert-danger" role="alert">
                    <IconAlertTriangle size={16} className="org-alert-icon" />
                    <div className="org-alert-body">{runError}</div>
                  </div>
                )}
                {runResult && (
                  <div className="org-pricing-run-result" data-pricing-run-result aria-live="polite">
                    <div className="org-pricing-summary-grid">
                      <div className="org-pricing-summary-card">
                        <span className="org-pricing-summary-label">Đã lưu</span>
                        <strong className="org-pricing-summary-value">{runResult.summary.counts.DA_LUU}</strong>
                      </div>
                      <div className="org-pricing-summary-card">
                        <span className="org-pricing-summary-label">Bỏ qua</span>
                        <strong className="org-pricing-summary-value">{runResult.summary.counts.BO_QUA}</strong>
                      </div>
                      <div className="org-pricing-summary-card">
                        <span className="org-pricing-summary-label">PriceGuard chặn</span>
                        <strong className="org-pricing-summary-value">{runResult.summary.counts.BI_CHAN}</strong>
                      </div>
                      <div className="org-pricing-summary-card">
                        <span className="org-pricing-summary-label">Lỗi</span>
                        <strong className="org-pricing-summary-value">{runResult.summary.counts.LOI}</strong>
                      </div>
                    </div>

                    <p className="org-pricing-hint">
                      Đề xuất cũ hết hạn:{' '}
                      <strong className="org-pricing-num">{runResult.result.hetHan.soLuong}</strong>
                      {runResult.result.hetHan.deXuatHetHan.length > 0 && (
                        <>
                          {' '}
                          (mã:{' '}
                          <span className="org-pricing-num">
                            {runResult.result.hetHan.deXuatHetHan.join(', ')}
                          </span>
                          )
                        </>
                      )}
                      .
                    </p>

                    {runResult.result.theoKhu.length === 0 ? (
                      <p className="org-pricing-hint">Không có khu vực nào được xử lý trong lần chạy này.</p>
                    ) : (
                      <div className="org-pricing-table-wrap">
                        <table className="org-pricing-table">
                          <thead>
                            <tr>
                              <th scope="col">Khu vực</th>
                              <th scope="col">Kết quả</th>
                              <th scope="col">Chi tiết</th>
                            </tr>
                          </thead>
                          <tbody>
                            {runResult.result.theoKhu.map((item: KetQuaKhu, idx: number) => (
                              <tr key={`${item.suatDienId}-${item.khuVucId}-${idx}`}>
                                <td>{describeKhu(rows, item.khuVucId, item.suatDienId)}</td>
                                <td>
                                  {item.ketQua === 'DA_LUU' && (
                                    <span className="org-pricing-badge org-pricing-badge-saved">Đã lưu</span>
                                  )}
                                  {item.ketQua === 'BO_QUA' && (
                                    <span className="org-pricing-badge org-pricing-badge-skipped">Bỏ qua</span>
                                  )}
                                  {item.ketQua === 'BI_CHAN' && (
                                    <span className="org-pricing-badge org-pricing-badge-blocked">Bị chặn</span>
                                  )}
                                  {item.ketQua === 'LOI' && (
                                    <span className="org-pricing-badge org-pricing-badge-error">Lỗi</span>
                                  )}
                                </td>
                                <td>
                                  {item.ketQua === 'DA_LUU' && (
                                    <div className="org-pricing-price-arrow">
                                      <span>
                                        Đề xuất <strong className="org-pricing-num">#{item.deXuatId}</strong>:
                                      </span>
                                      <span className="org-pricing-num">{moneyFormatter.format(item.giaHienTai)}</span>
                                      <IconArrowRight size={13} />
                                      <strong className="org-pricing-num">{moneyFormatter.format(item.giaDeXuat)}</strong>
                                      <span>({ALERT_TYPE_LABELS[item.loaiCanhBao] ?? item.loaiCanhBao})</span>
                                    </div>
                                  )}
                                  {item.ketQua === 'BO_QUA' && (
                                    <span>
                                      Lý do:{' '}
                                      {item.lyDoBoQua.length > 0 ? item.lyDoBoQua.join(', ') : 'Không rõ lý do'}
                                    </span>
                                  )}
                                  {item.ketQua === 'BI_CHAN' && (
                                    <span>
                                      Mã chặn: <strong>{item.maChan}</strong> · Nhật ký:{' '}
                                      <span className="org-pricing-num">
                                        {item.nhatKyId !== null ? `#${item.nhatKyId}` : '—'}
                                      </span>
                                    </span>
                                  )}
                                  {item.ketQua === 'LOI' && <span>{item.loi}</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {simulationEnabled && (
                <section className="org-pricing-section" aria-labelledby="pricing-sim-title">
                  <h3 id="pricing-sim-title" className="org-pricing-section-title">
                    Simulator nhu cầu <span className="org-chip org-pricing-sim-label">{NHAN_MO_PHONG_UI}</span>
                  </h3>
                  <div className="org-pricing-sim-controls">
                    <div className="org-pricing-sim-select-wrap">
                      <label className="org-label" htmlFor="pricing-kich-ban">
                        Kịch bản mô phỏng
                      </label>
                      <select
                        id="pricing-kich-ban"
                        className="org-select"
                        value={kichBan}
                        onChange={(e) => setKichBan(e.target.value as KichBan)}
                        disabled={locked}
                      >
                        {KICH_BAN_MO_PHONG.map((k: KichBan) => (
                          <option key={k} value={k}>
                            {KICH_BAN_LABELS[k] ?? k}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="org-btn org-btn-secondary" onClick={handleSimulate} disabled={locked}>
                      {simulating ? (
                        <>
                          <IconSpinner size={15} />
                          <span>Đang mô phỏng…</span>
                        </>
                      ) : (
                        <span>Chạy mô phỏng</span>
                      )}
                    </button>
                  </div>
                  {simError && (
                    <div className="org-alert org-alert-danger" role="alert">
                      <IconAlertTriangle size={16} className="org-alert-icon" />
                      <div className="org-alert-body">{simError}</div>
                    </div>
                  )}
                  {simResult && (
                    <div className="org-pricing-sim-result" data-pricing-sim-result aria-live="polite">
                      {simResult.ketQua === 'DA_MO_PHONG' && (
                        <>
                          <p className="org-pricing-hint">
                            <span className="org-chip org-pricing-sim-label">{NHAN_MO_PHONG_UI}</span> Đã mô phỏng kịch
                            bản <strong>{simResult.kichBan}</strong> tại mốc{' '}
                            <span className="org-pricing-num">{formatDateTime(simResult.thoiDiemNeo)}</span>. Suất đã mô
                            phỏng: <strong className="org-pricing-num">{simResult.suatDaMoPhong.length}</strong> · Suất bỏ
                            qua: <strong className="org-pricing-num">{simResult.suatBoQua.length}</strong>.
                          </p>

                          <div className="org-pricing-sim-stats">
                            <div className="org-pricing-summary-card">
                              <span className="org-pricing-summary-label">Đặt lại tổng</span>
                              <strong className="org-pricing-summary-value">{simResult.datLai.tong}</strong>
                            </div>
                            <div className="org-pricing-summary-card">
                              <span className="org-pricing-summary-label">Bỏ qua đã đổi</span>
                              <strong className="org-pricing-summary-value">{simResult.datLai.boQuaDaThayDoi}</strong>
                            </div>
                            <div className="org-pricing-summary-card">
                              <span className="org-pricing-summary-label">Bỏ qua đang khóa</span>
                              <strong className="org-pricing-summary-value">{simResult.datLai.boQuaDangKhoa}</strong>
                            </div>
                            <div className="org-pricing-summary-card">
                              <span className="org-pricing-summary-label">Chưa đặt lại</span>
                              <strong className="org-pricing-summary-value">{simResult.datLai.chuaDatLai}</strong>
                            </div>
                          </div>

                          {simResult.khuVuc.length > 0 && (
                            <div className="org-pricing-table-wrap">
                              <table className="org-pricing-table">
                                <thead>
                                  <tr>
                                    <th scope="col">Khu vực</th>
                                    <th scope="col">Ghi mới</th>
                                    <th scope="col">Đặt lại</th>
                                    <th scope="col">Bỏ qua đang giữ</th>
                                    <th scope="col">Kẹp cửa sổ 6h</th>
                                    <th scope="col">Ghi chú</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {simResult.khuVuc.map((k) => (
                                    <tr key={`${k.suatDienId}-${k.khuVucId}`}>
                                      <td>{describeKhu(rows, k.khuVucId, k.suatDienId)}</td>
                                      <td className="org-pricing-num">{k.ghiMoi}</td>
                                      <td className="org-pricing-num">{k.datLai}</td>
                                      <td className="org-pricing-num">{k.boQuaDangGiu}</td>
                                      <td className="org-pricing-num">{k.biKepVaoCuaSo6h}</td>
                                      <td>{k.khongCoGhe ? 'Không có ghế' : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="org-pricing-next-step">
                            <span>
                              Bước tiếp theo: chạy tính giá ngay để engine tính đề xuất giá mới từ dữ liệu mô phỏng này.
                            </span>
                            <button
                              type="button"
                              className="org-btn org-btn-primary"
                              onClick={handleRunNow}
                              disabled={locked}
                            >
                              {runningNow ? (
                                <>
                                  <IconSpinner size={15} />
                                  <span>Đang gửi…</span>
                                </>
                              ) : (
                                <>
                                  <IconPlay size={15} />
                                  <span>Chạy tính giá tiếp</span>
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )}

                      {simResult.ketQua === 'KHONG_CO_SUAT_HOP_LE' && (
                        <div className="org-alert org-alert-warning" role="status">
                          <IconAlertTriangle size={16} className="org-alert-icon" />
                          <div className="org-alert-body">
                            <strong>{NHAN_MO_PHONG_UI} Không có suất diễn hợp lệ để mô phỏng</strong> (
                            {simResult.ketQua}). Số suất bỏ qua:{' '}
                            <span className="org-pricing-num">{simResult.suatBoQua.length}</span>. Hãy mở bán ít nhất
                            một suất trước khi chạy mô phỏng.
                          </div>
                        </div>
                      )}

                      {simResult.ketQua === 'LOI' && (
                        <div className="org-alert org-alert-danger" role="alert">
                          <IconAlertTriangle size={16} className="org-alert-icon" />
                          <div className="org-alert-body">Không thể mô phỏng: {simResult.loi}.</div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {/* Điểm tích hợp riêng cho màn hình Đề xuất giá (T8). */}
          <div data-pricing-proposals-slot>
            {loadState === 'ready' &&
              (renderProposals ? (
                renderProposals(proposalsCtx)
              ) : (
                <OrganizerPriceProposals
                  event={event}
                  activeOrg={activeOrg}
                  rows={rows}
                  refreshMetrics={refreshMetrics}
                  refreshTrigger={runResult}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
