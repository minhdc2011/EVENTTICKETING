import {useCallback, useEffect, useRef, useState} from 'react';
import type React from 'react';
import * as pricingService from '../../services/pricingService';
import type {LayDanhSachDeXuatResult, SoLieuDinhGiaRow} from '../../services/pricingService';
import {
  NHAN_MO_PHONG_UI,
  findRow,
} from './pricingPanelController.js';
import type {PricingEventLike, PricingOrgLike} from './pricingPanelController';
import {
  THONG_BAO_KHONG_CO_QUYEN,
  approveAdjustedPriceProposal,
  approvePriceProposal,
  createDialogFocusScope,
  createPricingSession,
  formatPriceVnd,
  getFocusableElements,
  hasPricingAccess,
  loadPriceProposals,
  normalizeProposals,
  rejectPriceProposal,
  resolveDialogKeyDown,
  validateAdjustedPriceForm,
} from './priceProposalsController.js';
import type {
  AdjustedPriceErrors,
  AdjustedPriceField,
  PriceProposalServices,
  PriceProposalView,
  ProposalBand,
} from './priceProposalsController';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconClock,
  IconClose,
  IconEdit,
  IconInfoCircle,
  IconSpinner,
} from './OrganizerIcons';
import './organizer-price-proposals.css';

const defaultServices: PriceProposalServices = {
  layDanhSachDeXuat: (suKienId) =>
    pricingService.layDanhSachDeXuat(suKienId, {nguoiDung: pricingService.DEMO_NGUOI_DUNG}),
  duyetDeXuatGia: (deXuatId, params) =>
    pricingService.duyetDeXuatGia(deXuatId, params, {nguoiDung: pricingService.DEMO_NGUOI_DUNG}),
  tuChoiDeXuatGia: (deXuatId, params) =>
    pricingService.tuChoiDeXuatGia(deXuatId, params, {nguoiDung: pricingService.DEMO_NGUOI_DUNG}),
};

export type OrganizerPriceProposalsProps = {
  event: PricingEventLike;
  activeOrg: PricingOrgLike;
  rows?: SoLieuDinhGiaRow[];
  refreshMetrics?: () => unknown | Promise<unknown>;
  refreshTrigger?: unknown;
  services?: PriceProposalServices;
};

type ListLoadState = 'loading' | 'ready' | 'forbidden' | 'forbidden_error' | 'error';

type BannerFeedback = {
  tone: 'success' | 'warning' | 'danger' | 'info';
  message: string;
  canReload?: boolean;
};

type ActionMode = 'approve' | 'approve_adjusted' | 'reject';

type DialogFeedback = {
  kind: 'forbidden_error' | 'out_of_bounds' | 'validation_error' | 'conflict' | 'error' | 'busy';
  message: string;
  canReload?: boolean;
  khung?: ProposalBand | null;
};

type ActiveDialogState = {
  mode: ActionMode;
  proposal: PriceProposalView;
};

const DIALOG_TITLES: Record<ActionMode, string> = {
  approve: 'Xác nhận duyệt đề xuất giá',
  approve_adjusted: 'Duyệt với giá điều chỉnh',
  reject: 'Từ chối đề xuất giá',
};

const EMPTY_ROWS: SoLieuDinhGiaRow[] = [];

function serializeOrgContext(activeOrg: PricingOrgLike): string {
  if (!activeOrg) return '';
  const list = Array.isArray(activeOrg) ? activeOrg : [activeOrg];
  return list
    .map((m) =>
      m && typeof m === 'object'
        ? `${m.organizationId ?? m.ToChucID ?? ''}:${m.role ?? m.VaiTro ?? ''}:${m.accountKind ?? m.LoaiTaiKhoan ?? ''}`
        : '',
    )
    .join('|');
}

function describeSuatInfo(rows: SoLieuDinhGiaRow[], proposal: PriceProposalView): string {
  const matched = findRow(rows, proposal.khuVucId);
  const parts = [`Suất #${proposal.suatDienId}`];
  if (matched?.trang_thai_suat) parts.push(matched.trang_thai_suat);
  return parts.join(' — ');
}

function renderDirectionIcon(huongDoi: PriceProposalView['huongDoi']) {
  if (huongDoi === 'TANG') return <IconArrowUp size={14} />;
  if (huongDoi === 'GIAM') return <IconArrowDown size={14} />;
  return <IconArrowRight size={14} />;
}

export function OrganizerPriceProposals({
  event,
  activeOrg,
  rows = EMPTY_ROWS,
  refreshMetrics,
  refreshTrigger,
  services = defaultServices,
}: OrganizerPriceProposalsProps) {
  const sessionRef = useRef(createPricingSession());
  const session = sessionRef.current;

  const orgId = (activeOrg && !Array.isArray(activeOrg) ? activeOrg.organizationId : null) ?? null;
  const orgContextKey = serializeOrgContext(activeOrg);
  const allowed = hasPricingAccess(activeOrg, event);

  const [loadState, setLoadState] = useState<ListLoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState<LayDanhSachDeXuatResult | null>(null);
  const [proposals, setProposals] = useState<PriceProposalView[]>([]);
  const [banner, setBanner] = useState<BannerFeedback | null>(null);

  const [dialogState, setDialogState] = useState<ActiveDialogState | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [adjustedPrice, setAdjustedPrice] = useState('');
  const [adjustedNote, setAdjustedNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AdjustedPriceErrors>({});
  const [dialogFeedback, setDialogFeedback] = useState<DialogFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const servicesRef = useRef(services);
  servicesRef.current = services;
  const ctxRef = useRef({activeOrg, event});
  ctxRef.current = {activeOrg, event};

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const reloadBtnRef = useRef<HTMLButtonElement | null>(null);
  const actionOverlayRef = useRef<HTMLDivElement | null>(null);
  const actionDialogRef = useRef<HTMLDivElement | null>(null);
  const adjustedPriceInputRef = useRef<HTMLInputElement | null>(null);
  const adjustedNoteInputRef = useRef<HTMLTextAreaElement | null>(null);

  const reloadProposals = useCallback(async () => {
    setLoadError(null);
    if (!hasPricingAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      setRawResult(null);
      setProposals([]);
      setLoadState('forbidden');
      return {status: 'forbidden' as const};
    }
    const outcome = await loadPriceProposals(session, servicesRef.current, {
      activeOrg: ctxRef.current.activeOrg,
      event: ctxRef.current.event,
    });
    if (outcome.status === 'stale') return outcome;
    if (outcome.status === 'ok') {
      setRawResult(outcome.result);
      setProposals(outcome.proposals);
      setLoadState('ready');
    } else if (outcome.status === 'forbidden') {
      setRawResult(null);
      setProposals([]);
      setLoadState('forbidden');
    } else if (outcome.status === 'forbidden_error') {
      setRawResult(null);
      setProposals([]);
      setLoadState('forbidden_error');
      setLoadError(outcome.message);
    } else if (outcome.status === 'error') {
      setLoadState('error');
      setLoadError(outcome.message);
    }
    return outcome;
  }, [session]);

  useEffect(() => {
    session.reset();
    setDialogState(null);
    setDialogFeedback(null);
    setFieldErrors({});
    setSubmitting(false);
    setBanner(null);
    if (!allowed || !hasPricingAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      setRawResult(null);
      setProposals([]);
      setLoadError(null);
      setLoadState('forbidden');
      return () => session.reset();
    }
    setLoadState('loading');
    void reloadProposals();
    return () => session.reset();
  }, [session, reloadProposals, orgId, orgContextKey, event.id, event.organizationId, allowed]);

  // Làm mới danh sách đề xuất khi số liệu khu vực hoặc kết quả chạy tính giá thay đổi.
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    if (!hasPricingAccess(ctxRef.current.activeOrg, ctxRef.current.event)) return;
    void reloadProposals();
  }, [rows, refreshTrigger, reloadProposals]);

  // Cập nhật cờ quá hạn hỗ trợ người dùng theo thời gian thực khi xem danh sách.
  useEffect(() => {
    if (!allowed || !rawResult) return;
    const timer = window.setInterval(() => {
      setProposals(normalizeProposals(rawResult, Date.now()));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [allowed, rawResult]);

  // Bẫy focus & khóa nền khi hộp thoại thao tác đang mở.
  useEffect(() => {
    if (!allowed || !dialogState) return;
    const dialog = actionDialogRef.current;
    if (!dialog) return;
    const scope = createDialogFocusScope({
      dialog,
      overlay: actionOverlayRef.current ?? undefined,
      ownerDocument: dialog.ownerDocument,
      fallbackFocus: () => [reloadBtnRef.current, headingRef.current],
    });
    return () => scope.cleanup();
  }, [allowed, dialogState]);

  function closeDialog() {
    if (submitting) return;
    setDialogState(null);
    setDialogFeedback(null);
    setFieldErrors({});
  }

  function openActionDialog(mode: ActionMode, proposal: PriceProposalView) {
    if (!hasPricingAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      setLoadState('forbidden');
      setBanner({tone: 'danger', message: THONG_BAO_KHONG_CO_QUYEN});
      return;
    }
    if (submitting) return;

    // Làm mới trạng thái hạn xử lý tại thời điểm mở hộp thoại (không chặn gửi máy chủ).
    const freshProposal = rawResult
      ? normalizeProposals(rawResult, Date.now()).find((p) => p.deXuatId === proposal.deXuatId) ?? proposal
      : proposal;
    if (rawResult) setProposals(normalizeProposals(rawResult, Date.now()));

    setBanner(null);
    setDialogFeedback(null);
    setFieldErrors({});
    setApproveNote('');
    setAdjustedPrice(freshProposal.giaDeXuat !== null ? String(freshProposal.giaDeXuat) : '');
    setAdjustedNote('');
    setRejectReason('');
    setDialogState({mode, proposal: freshProposal});
  }

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const dialog = actionDialogRef.current;
    if (!dialog) return;
    const decision = resolveDialogKeyDown({
      key: e.key,
      shiftKey: e.shiftKey,
      activeElement: dialog.ownerDocument?.activeElement ?? null,
      dialogElement: dialog,
      focusables: getFocusableElements(dialog),
      canClose: !submitting,
    });
    // Không để Tab/Escape nổi lên panel cha.
    if (e.key === 'Tab' || e.key === 'Escape') e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (decision.action === 'close') closeDialog();
    } else if (decision.action === 'wrap') {
      e.preventDefault();
      decision.target.focus();
    }
  }

  function focusInvalidField(field: AdjustedPriceField | null) {
    if (field === 'giaDieuChinh') adjustedPriceInputRef.current?.focus();
    else if (field === 'ghiChu') adjustedNoteInputRef.current?.focus();
  }

  async function handleManualReload(closeAfter = false) {
    if (submitting) return;
    if (closeAfter) {
      setDialogState(null);
      setDialogFeedback(null);
      setFieldErrors({});
    }
    setBanner(null);
    setLoadState('loading');
    await reloadProposals();
  }

  async function handleSubmitAction(e: React.FormEvent) {
    e.preventDefault();
    if (!dialogState) return;
    if (!hasPricingAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      setDialogFeedback({kind: 'forbidden_error', message: THONG_BAO_KHONG_CO_QUYEN});
      return;
    }
    if (submitting || session.busy) {
      setDialogFeedback({
        kind: 'busy',
        message: 'Đang có thao tác khác đang xử lý. Vui lòng đợi hoàn tất.',
      });
      return;
    }

    const {mode, proposal} = dialogState;
    const adjustedContext = {
      giaSan: proposal.khung?.giaSan ?? null,
      giaTran: proposal.khung?.giaTran ?? null,
      giaHienHanh: proposal.giaHienHanh,
      giaHienTai: proposal.giaHienTai,
    };

    if (mode === 'approve_adjusted') {
      const check = validateAdjustedPriceForm(
        {giaDieuChinh: adjustedPrice, ghiChu: adjustedNote},
        adjustedContext,
      );
      if (!check.ok) {
        setFieldErrors(check.errors);
        focusInvalidField(check.firstInvalidField);
        return;
      }
    }

    setDialogFeedback(null);
    setFieldErrors({});
    setSubmitting(true);

    let outcome;
    if (mode === 'approve') {
      outcome = await approvePriceProposal(session, servicesRef.current, {
        activeOrg: ctxRef.current.activeOrg,
        event: ctxRef.current.event,
        deXuatId: proposal.deXuatId,
        ghiChu: approveNote,
        onReload: reloadProposals,
        refreshMetrics,
      });
    } else if (mode === 'approve_adjusted') {
      outcome = await approveAdjustedPriceProposal(session, servicesRef.current, {
        activeOrg: ctxRef.current.activeOrg,
        event: ctxRef.current.event,
        deXuatId: proposal.deXuatId,
        formValues: {giaDieuChinh: adjustedPrice, ghiChu: adjustedNote},
        context: adjustedContext,
        onReload: reloadProposals,
        refreshMetrics,
      });
    } else {
      outcome = await rejectPriceProposal(session, servicesRef.current, {
        activeOrg: ctxRef.current.activeOrg,
        event: ctxRef.current.event,
        deXuatId: proposal.deXuatId,
        lyDo: rejectReason,
        onReload: reloadProposals,
        refreshMetrics,
      });
    }

    if (outcome.status === 'stale') return;
    setSubmitting(false);

    switch (outcome.status) {
      case 'approved':
      case 'rejected':
        setDialogState(null);
        setDialogFeedback(null);
        setFieldErrors({});
        setBanner({
          tone: outcome.reloadFailed ? 'warning' : 'success',
          message: outcome.reloadFailed
            ? `${outcome.message} Tuy nhiên không tải lại được danh sách mới, vui lòng tải lại thủ công.`
            : outcome.message,
          canReload: outcome.reloadFailed,
        });
        break;
      case 'expired':
        setDialogState(null);
        setDialogFeedback(null);
        setFieldErrors({});
        setBanner({
          tone: 'warning',
          message: outcome.reloadFailed
            ? `${outcome.message} Không tải lại được danh sách tự động, vui lòng tải lại thủ công.`
            : outcome.message,
          canReload: outcome.reloadFailed,
        });
        break;
      case 'conflict':
        // Xung đột 409: hiển thị thông báo riêng kèm nút tải lại, tuyệt đối KHÔNG tự thử duyệt lại.
        setDialogFeedback({
          kind: 'conflict',
          message: outcome.message,
          canReload: true,
        });
        break;
      case 'forbidden':
        setDialogFeedback({
          kind: 'forbidden_error',
          message: THONG_BAO_KHONG_CO_QUYEN,
        });
        break;
      case 'forbidden_error':
        setDialogFeedback({
          kind: 'forbidden_error',
          message: outcome.message,
        });
        break;
      case 'out_of_bounds':
        if (mode === 'approve_adjusted') {
          setFieldErrors({
            giaDieuChinh: outcome.message,
            ...(outcome.khung ? {khung: outcome.khung} : {}),
          });
          adjustedPriceInputRef.current?.focus();
        }
        setDialogFeedback({
          kind: 'out_of_bounds',
          message: outcome.message,
          khung: outcome.khung,
        });
        break;
      case 'invalid':
        setFieldErrors(outcome.errors);
        focusInvalidField(outcome.firstInvalidField);
        break;
      case 'validation_error':
        setDialogFeedback({
          kind: 'validation_error',
          message: outcome.message,
        });
        break;
      case 'busy':
        setDialogFeedback({
          kind: 'busy',
          message: 'Đang có thao tác khác đang xử lý. Vui lòng đợi hoàn tất.',
        });
        break;
      case 'no_selection':
        setDialogFeedback({
          kind: 'error',
          message: 'Không xác định được đề xuất giá cần xử lý.',
        });
        break;
      case 'error':
        setDialogFeedback({
          kind: 'error',
          message: outcome.message,
        });
        break;
      default:
        break;
    }
  }

  const isSimulated = rawResult?.nguon === 'MO_PHONG';

  return (
    <section className="org-pricing-section org-proposals" aria-labelledby="pricing-proposals-title">
      <div className="org-proposals-header">
        <div className="org-proposals-heading-wrap">
          <h3 id="pricing-proposals-title" ref={headingRef} className="org-pricing-section-title" tabIndex={-1}>
            Đề xuất giá chờ duyệt
          </h3>
          {allowed && loadState === 'ready' && (
            <span className="org-proposals-count">{proposals.length} đang chờ</span>
          )}
          {allowed && isSimulated && (
            <span className="org-chip org-proposals-source-chip">{NHAN_MO_PHONG_UI}</span>
          )}
        </div>
        {allowed && loadState !== 'forbidden' && loadState !== 'forbidden_error' && (
          <button
            ref={reloadBtnRef}
            type="button"
            className="org-btn org-btn-secondary org-proposals-reload-btn"
            onClick={() => void handleManualReload(false)}
            disabled={loadState === 'loading' || submitting}
          >
            {loadState === 'loading' ? (
              <>
                <IconSpinner size={15} />
                <span>Đang tải…</span>
              </>
            ) : (
              <span>Tải lại danh sách</span>
            )}
          </button>
        )}
      </div>

      <div className="org-proposals-feedback" aria-live="polite">
        {allowed && banner && (
          <div
            className={`org-alert ${
              banner.tone === 'success'
                ? 'org-alert-success'
                : banner.tone === 'warning'
                  ? 'org-alert-warning'
                  : banner.tone === 'danger'
                    ? 'org-alert-danger'
                    : 'org-alert-info'
            }`}
            role={banner.tone === 'danger' || banner.tone === 'warning' ? 'alert' : 'status'}
          >
            {banner.tone === 'success' ? (
              <IconCheck size={16} className="org-alert-icon" />
            ) : (
              <IconAlertTriangle size={16} className="org-alert-icon" />
            )}
            <div className="org-alert-body">
              <div>{banner.message}</div>
              {banner.canReload && (
                <div className="org-proposals-feedback-actions">
                  <button
                    type="button"
                    className="org-btn org-btn-secondary"
                    onClick={() => void handleManualReload(false)}
                    disabled={submitting}
                  >
                    Tải lại danh sách
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(!allowed || loadState === 'forbidden' || loadState === 'forbidden_error') && (
        <div className="org-alert org-alert-danger" role="alert">
          <IconAlertTriangle size={16} className="org-alert-icon" />
          <div className="org-alert-body">
            {allowed && loadState === 'forbidden_error' && loadError ? loadError : THONG_BAO_KHONG_CO_QUYEN}
          </div>
        </div>
      )}

      {allowed && loadState === 'loading' && (
        <div className="org-pricing-state" role="status">
          <IconSpinner size={18} />
          <span>Đang tải danh sách đề xuất giá…</span>
        </div>
      )}

      {allowed && loadState === 'error' && (
        <div className="org-alert org-alert-danger" role="alert">
          <IconAlertTriangle size={16} className="org-alert-icon" />
          <div className="org-alert-body">
            <p>{loadError ?? 'Không tải được danh sách đề xuất giá.'}</p>
            <button
              type="button"
              className="org-btn org-btn-secondary"
              onClick={() => void handleManualReload(false)}
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {allowed && loadState === 'ready' && proposals.length === 0 && (
        <div className="org-pricing-state" role="status">
          <IconInfoCircle size={18} />
          <span>Hiện không có đề xuất giá nào ở trạng thái chờ duyệt (PENDING).</span>
        </div>
      )}

      {allowed && loadState === 'ready' && proposals.length > 0 && (
        <div className="org-proposals-list">
          {proposals.map((p) => (
            <article
              key={p.deXuatId}
              className="org-proposal-card"
              aria-labelledby={`proposal-heading-${p.deXuatId}`}
            >
              <header className="org-proposal-card-header">
                <div className="org-proposal-identity">
                  <h4 id={`proposal-heading-${p.deXuatId}`} className="org-proposal-zone">
                    {p.nhanKhu}
                  </h4>
                  <p className="org-proposal-show-meta">
                    {describeSuatInfo(rows, p)} · Đề xuất{' '}
                    <span className="org-proposal-num">#{p.deXuatId}</span>
                  </p>
                </div>
                <div className="org-proposal-warnings">
                  {p.canhBao.map((w) => (
                    <span
                      key={w.ma}
                      className={`org-proposal-tag ${
                        w.muc === 'warn' ? 'org-proposal-tag-warn' : 'org-proposal-tag-info'
                      }`}
                    >
                      {w.muc === 'warn' ? (
                        <IconAlertTriangle size={14} />
                      ) : (
                        <IconInfoCircle size={14} />
                      )}
                      <span>{w.nhan}</span>
                    </span>
                  ))}
                  {p.daQuaHan && (
                    <span className="org-proposal-tag org-proposal-tag-warn">
                      <IconClock size={14} />
                      <span>Quá hạn trên giao diện</span>
                    </span>
                  )}
                </div>
              </header>

              {p.giaDaThayDoi && p.canhBaoGiaDoi && (
                <div className="org-alert org-alert-warning" role="alert">
                  <IconAlertTriangle size={16} className="org-alert-icon" />
                  <div className="org-alert-body">
                    <strong>Giá niêm yết hiện tại đã thay đổi:</strong>{' '}
                    <span className="org-proposal-num">{p.hienThi.giaHienHanh}</span>. {p.canhBaoGiaDoi}
                  </div>
                </div>
              )}

              {p.daQuaHan && p.canhBaoHetHan && (
                <div className="org-alert org-alert-warning" role="status">
                  <IconClock size={16} className="org-alert-icon" />
                  <div className="org-alert-body">{p.canhBaoHetHan}</div>
                </div>
              )}

              <div className="org-proposal-price-grid">
                <div className="org-proposal-stat">
                  <span className="org-proposal-stat-label">Giá lúc đề xuất</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.giaHienTai}
                  </strong>
                </div>
                <div
                  className={`org-proposal-stat ${p.giaDaThayDoi ? 'org-proposal-stat-warn' : ''}`}
                >
                  <span className="org-proposal-stat-label">Giá niêm yết hiện tại</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.giaHienHanh}
                  </strong>
                </div>
                <div className="org-proposal-stat org-proposal-stat-highlight">
                  <span className="org-proposal-stat-label">Giá đề xuất</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.giaDeXuat}
                  </strong>
                </div>
                <div className="org-proposal-stat">
                  <span className="org-proposal-stat-label">Phần trăm đổi</span>
                  <strong className="org-proposal-stat-value">
                    {renderDirectionIcon(p.huongDoi)}
                    <span>{p.nhanHuongDoi}</span>
                    <span className="org-proposal-num">{p.hienThi.phanTramDoi}</span>
                  </strong>
                </div>
              </div>

              <div className="org-proposal-metrics-grid">
                <div className="org-proposal-stat">
                  <span className="org-proposal-stat-label">Tỷ lệ lấp đầy (r)</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.r}
                  </strong>
                </div>
                <div className="org-proposal-stat">
                  <span className="org-proposal-stat-label">Tốc độ bán (u)</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.u}
                  </strong>
                </div>
                <div className="org-proposal-stat">
                  <span className="org-proposal-stat-label">Thời gian còn lại (T_rem)</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.tRem}
                  </strong>
                </div>
                <div className="org-proposal-stat">
                  <span className="org-proposal-stat-label">Khung giá hiện hành</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.khung}
                  </strong>
                </div>
                <div className={`org-proposal-stat ${p.daQuaHan ? 'org-proposal-stat-warn' : ''}`}>
                  <span className="org-proposal-stat-label">Hạn xử lý</span>
                  <strong className="org-proposal-stat-value org-proposal-num">
                    {p.hienThi.hetHan}
                  </strong>
                </div>
              </div>

              {p.lyDo && (
                <p className="org-proposal-reason">
                  <strong>Lý do đề xuất:</strong> {p.lyDo}
                </p>
              )}

              <div className="org-proposal-actions">
                <button
                  type="button"
                  className="org-btn org-btn-primary"
                  onClick={() => openActionDialog('approve', p)}
                  disabled={submitting || !allowed}
                >
                  <IconCheck size={15} />
                  <span>Duyệt</span>
                </button>
                <button
                  type="button"
                  className="org-btn org-btn-secondary"
                  onClick={() => openActionDialog('approve_adjusted', p)}
                  disabled={submitting || !allowed}
                >
                  <IconEdit size={15} />
                  <span>Duyệt với giá điều chỉnh</span>
                </button>
                <button
                  type="button"
                  className="org-btn org-btn-secondary"
                  onClick={() => openActionDialog('reject', p)}
                  disabled={submitting || !allowed}
                >
                  <IconClose size={15} />
                  <span>Từ chối</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {allowed && dialogState && (
        <div
          ref={actionOverlayRef}
          className="org-proposal-dialog-overlay"
          role="presentation"
          onKeyDown={handleDialogKeyDown}
        >
          <div
            ref={actionDialogRef}
            className="org-proposal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-dialog-title"
            tabIndex={-1}
            aria-busy={submitting}
          >
            <header className="org-proposal-dialog-header">
              <h4 id="proposal-dialog-title" className="org-proposal-dialog-title">
                {DIALOG_TITLES[dialogState.mode]}
              </h4>
              <button
                type="button"
                className="org-btn org-btn-secondary"
                onClick={closeDialog}
                disabled={submitting}
                aria-label="Đóng hộp thoại xử lý đề xuất"
              >
                <IconClose size={16} />
              </button>
            </header>

            <div className="org-proposal-dialog-body">
              <div className="org-proposal-dialog-summary">
                <p>
                  <strong>{dialogState.proposal.nhanKhu}</strong> · {describeSuatInfo(rows, dialogState.proposal)}
                </p>
                <p>
                  Giá lúc đề xuất:{' '}
                  <strong className="org-proposal-num">{dialogState.proposal.hienThi.giaHienTai}</strong> · Giá đề xuất:{' '}
                  <strong className="org-proposal-num">{dialogState.proposal.hienThi.giaDeXuat}</strong> (
                  {dialogState.proposal.nhanHuongDoi}{' '}
                  <span className="org-proposal-num">{dialogState.proposal.hienThi.phanTramDoi}</span>)
                </p>
                <p>
                  Giá niêm yết hiện tại:{' '}
                  <strong className="org-proposal-num">{dialogState.proposal.hienThi.giaHienHanh}</strong> · Khung hiện
                  hành: <strong className="org-proposal-num">{dialogState.proposal.hienThi.khung}</strong>
                </p>
                <p>
                  Hạn xử lý:{' '}
                  <strong className="org-proposal-num">{dialogState.proposal.hienThi.hetHan}</strong>
                </p>
              </div>

              {dialogState.proposal.giaDaThayDoi && dialogState.proposal.canhBaoGiaDoi && (
                <div className="org-alert org-alert-warning" role="alert">
                  <IconAlertTriangle size={16} className="org-alert-icon" />
                  <div className="org-alert-body">{dialogState.proposal.canhBaoGiaDoi}</div>
                </div>
              )}

              {dialogState.proposal.daQuaHan && dialogState.proposal.canhBaoHetHan && (
                <div className="org-alert org-alert-warning" role="status">
                  <IconClock size={16} className="org-alert-icon" />
                  <div className="org-alert-body">{dialogState.proposal.canhBaoHetHan}</div>
                </div>
              )}

              <form className="org-proposal-form" onSubmit={handleSubmitAction} noValidate>
                {dialogState.mode === 'approve' && (
                  <div className="org-proposal-field">
                    <label className="org-label" htmlFor="proposal-approve-note">
                      Ghi chú duyệt (không bắt buộc)
                    </label>
                    <textarea
                      id="proposal-approve-note"
                      className="org-textarea"
                      value={approveNote}
                      onChange={(e) => setApproveNote(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                )}

                {dialogState.mode === 'approve_adjusted' && (
                  <>
                    <div className="org-proposal-field">
                      <label className="org-label" htmlFor="proposal-adjusted-price">
                        Giá điều chỉnh (VNĐ)
                      </label>
                      <input
                        id="proposal-adjusted-price"
                        ref={adjustedPriceInputRef}
                        className="org-input org-proposal-num"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={adjustedPrice}
                        onChange={(e) => {
                          setAdjustedPrice(e.target.value);
                          setFieldErrors((prev) => {
                            if (!prev.giaDieuChinh && !prev.khung) return prev;
                            const {giaDieuChinh: _g, khung: _k, ...rest} = prev;
                            return rest;
                          });
                        }}
                        aria-invalid={fieldErrors.giaDieuChinh ? true : undefined}
                        aria-describedby={
                          fieldErrors.giaDieuChinh
                            ? 'proposal-adjusted-price-hint proposal-adjusted-price-error'
                            : 'proposal-adjusted-price-hint'
                        }
                        disabled={submitting}
                      />
                      <p id="proposal-adjusted-price-hint" className="org-proposal-field-hint">
                        Khung giá cho phép:{' '}
                        <strong className="org-proposal-num">{dialogState.proposal.hienThi.khung}</strong> (khác giá
                        niêm yết hiện tại).
                      </p>
                      {fieldErrors.giaDieuChinh && (
                        <p id="proposal-adjusted-price-error" className="org-field-error" role="alert">
                          {fieldErrors.giaDieuChinh}
                        </p>
                      )}
                    </div>

                    <div className="org-proposal-field">
                      <label className="org-label" htmlFor="proposal-adjusted-note">
                        Lý do điều chỉnh (bắt buộc)
                      </label>
                      <textarea
                        id="proposal-adjusted-note"
                        ref={adjustedNoteInputRef}
                        className="org-textarea"
                        value={adjustedNote}
                        onChange={(e) => {
                          setAdjustedNote(e.target.value);
                          setFieldErrors((prev) => {
                            if (!prev.ghiChu) return prev;
                            const {ghiChu: _n, ...rest} = prev;
                            return rest;
                          });
                        }}
                        aria-invalid={fieldErrors.ghiChu ? true : undefined}
                        aria-describedby={fieldErrors.ghiChu ? 'proposal-adjusted-note-error' : undefined}
                        disabled={submitting}
                      />
                      {fieldErrors.ghiChu && (
                        <p id="proposal-adjusted-note-error" className="org-field-error" role="alert">
                          {fieldErrors.ghiChu}
                        </p>
                      )}
                    </div>
                  </>
                )}

                {dialogState.mode === 'reject' && (
                  <div className="org-proposal-field">
                    <label className="org-label" htmlFor="proposal-reject-reason">
                      Lý do từ chối (không bắt buộc)
                    </label>
                    <textarea
                      id="proposal-reject-reason"
                      className="org-textarea"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      aria-describedby="proposal-reject-reason-hint"
                      disabled={submitting}
                    />
                    <p id="proposal-reject-reason-hint" className="org-proposal-field-hint">
                      Có thể để trống. Từ chối không làm thay đổi giá niêm yết hiện tại.
                    </p>
                  </div>
                )}

                <div className="org-proposals-feedback" aria-live="polite">
                  {dialogFeedback && (
                    <div className="org-alert org-alert-danger" role="alert">
                      <IconAlertTriangle size={16} className="org-alert-icon" />
                      <div className="org-alert-body">
                        <div>{dialogFeedback.message}</div>
                        {dialogFeedback.kind === 'out_of_bounds' && dialogFeedback.khung && (
                          <div className="org-proposal-field-hint">
                            Khung hợp lệ:{' '}
                            <strong className="org-proposal-num">
                              {formatPriceVnd(dialogFeedback.khung.giaSan)} –{' '}
                              {formatPriceVnd(dialogFeedback.khung.giaTran)}
                            </strong>
                          </div>
                        )}
                        {dialogFeedback.canReload && (
                          <div className="org-proposals-feedback-actions">
                            <button
                              type="button"
                              className="org-btn org-btn-secondary"
                              onClick={() => void handleManualReload(true)}
                              disabled={submitting}
                            >
                              Tải lại danh sách
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="org-proposal-dialog-footer">
                  <button
                    type="button"
                    className="org-btn org-btn-secondary"
                    onClick={closeDialog}
                    disabled={submitting}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="org-btn org-btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <IconSpinner size={15} />
                        <span>Đang gửi…</span>
                      </>
                    ) : dialogState.mode === 'approve' ? (
                      <span>Xác nhận duyệt</span>
                    ) : dialogState.mode === 'approve_adjusted' ? (
                      <span>Xác nhận duyệt giá điều chỉnh</span>
                    ) : (
                      <span>Xác nhận từ chối</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
