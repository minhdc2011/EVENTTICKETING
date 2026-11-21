import {useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import * as pricingService from '../../services/pricingService';
import type {SoLieuDinhGiaRow} from '../../services/pricingService';
import {PRICING_FIELDS} from './pricingFormLogic.js';
import type {PricingFieldKey, PricingFormErrors} from './pricingFormLogic';
import {
  buildFormValues,
  findRow,
  groupBySuat,
  resolveSelection,
  saveConfig,
} from './pricingPanelController.js';
import type {
  PricingEventLike,
  PricingOrgLike,
  PricingServices,
  PricingFormValues,
  PricingSession,
  SaveNotice,
} from './pricingPanelController';
import {IconAlertTriangle, IconCheck, IconInfoCircle, IconSave, IconSpinner} from './OrganizerIcons';

const defaultServices: Pick<PricingServices, 'luuCauHinhGia'> = {
  luuCauHinhGia: pricingService.luuCauHinhGia,
};

const moneyFormatter = new Intl.NumberFormat('vi-VN');

type OrganizerPricingConfigProps = {
  key?: React.Key;
  session: PricingSession;
  activeOrg: PricingOrgLike;
  event: PricingEventLike;
  rows: SoLieuDinhGiaRow[];
  /** Có thao tác gửi khác đang chạy (Chạy ngay / Simulator): khóa lưu. */
  locked?: boolean;
  services?: Pick<PricingServices, 'luuCauHinhGia'>;
  /** Gọi sau khi lưu thành công để panel làm mới số liệu (không tự áp giá). */
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export function OrganizerPricingConfig({
  session,
  activeOrg,
  event,
  rows,
  locked = false,
  services = defaultServices,
  onSaved,
  onBusyChange,
}: OrganizerPricingConfigProps) {
  const [selection, setSelection] = useState(() => resolveSelection(rows, null));
  const [values, setValues] = useState<PricingFormValues>(() =>
    buildFormValues(findRow(rows, resolveSelection(rows, null).khuVucId)),
  );
  const [errors, setErrors] = useState<PricingFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const inputRefs = useRef<Partial<Record<PricingFieldKey, HTMLInputElement | null>>>({});

  const suatList = useMemo(() => groupBySuat(rows), [rows]);
  const khuList = suatList.find((s) => s.suatDienId === selection.suatDienId)?.khuVuc ?? [];

  // Số liệu được làm mới: giữ lựa chọn nếu còn hợp lệ, nếu không chuyển sang mục đầu và nạp lại.
  useEffect(() => {
    const next = resolveSelection(rows, selection);
    if (next.suatDienId !== selection.suatDienId || next.khuVucId !== selection.khuVucId) {
      setSelection(next);
      loadKhu(next.khuVucId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function loadKhu(khuVucId: number | null) {
    setValues(buildFormValues(findRow(rows, khuVucId)));
    setErrors({});
    setNotice(null);
    setFailure(null);
  }

  function handleSuatChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = resolveSelection(rows, {suatDienId: Number(e.target.value), khuVucId: null});
    setSelection(next);
    loadKhu(next.khuVucId);
  }

  function handleKhuChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const khuVucId = Number(e.target.value);
    setSelection((s) => ({...s, khuVucId}));
    loadKhu(khuVucId);
  }

  function handleFieldChange(key: PricingFieldKey, raw: string | boolean) {
    setValues((v) => ({...v, [key]: raw}));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const {[key]: _removed, ...rest} = prev;
      return rest;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || locked) return;
    if (session.busy) {
      // Thao tác khác đang chạy: không đụng tới khóa của chúng.
      setFailure('Đang có thao tác khác đang chạy. Vui lòng đợi hoàn tất.');
      return;
    }
    setNotice(null);
    setFailure(null);
    setSaving(true);
    onBusyChange?.(true);
    const outcome = await saveConfig(session, services, {
      activeOrg,
      event,
      khuVucId: selection.khuVucId,
      formValues: values,
    });
    // stale: phiên đã đổi, không ghi đè màn hình mới và không nhả khóa phiên mới.
    if (outcome.status === 'stale') return;
    setSaving(false);
    if (outcome.status === 'busy') {
      // Khóa thuộc thao tác khác: không gọi onBusyChange(false).
      setFailure('Đang có thao tác khác đang chạy. Vui lòng đợi hoàn tất.');
      return;
    }
    onBusyChange?.(false);
    // Kiểm tra biểu mẫu/quyền không chiếm khóa phiên nhưng đã báo true ở trên, nên nhả ở đây là đúng.
    switch (outcome.status) {
      case 'invalid':
        setErrors(outcome.errors);
        inputRefs.current[outcome.firstInvalidField]?.focus();
        break;
      case 'saved':
        setErrors({});
        setNotice(outcome.notice);
        onSaved?.();
        break;
      case 'rejected':
        setFailure(
          outcome.loi === 'KHU_VUC_KHONG_TON_TAI'
            ? 'Khu vực không còn tồn tại.'
            : `Cấu hình giá không hợp lệ${outcome.truong ? ` (${outcome.truong})` : ''}.`,
        );
        break;
      case 'error':
        setFailure(outcome.error.message);
        break;
      case 'forbidden':
        setFailure('Bạn không có quyền cấu hình giá cho sự kiện này.');
        break;
      case 'no_selection':
        setFailure('Chọn suất diễn và khu vực trước khi lưu.');
        break;
      default:
        break;
    }
  }

  const disabled = saving || locked;

  if (rows.length === 0) return null;

  return (
    <form className="org-pricing-config" onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className="org-pricing-config-selectors">
        <div className="org-pricing-field">
          <label className="org-label" htmlFor="pricing-suat">
            Suất diễn
          </label>
          <select
            id="pricing-suat"
            className="org-select"
            value={selection.suatDienId ?? ''}
            onChange={handleSuatChange}
            disabled={disabled}
          >
            {suatList.map((s) => (
              <option key={s.suatDienId} value={s.suatDienId}>
                Suất #{s.suatDienId}
                {s.trangThai ? ` — ${s.trangThai}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="org-pricing-field">
          <label className="org-label" htmlFor="pricing-khu">
            Khu vực
          </label>
          <select
            id="pricing-khu"
            className="org-select"
            value={selection.khuVucId ?? ''}
            onChange={handleKhuChange}
            disabled={disabled}
          >
            {khuList.map((k) => (
              <option key={k.khu_vuc_id} value={k.khu_vuc_id}>
                {k.ten_khu_vuc ?? k.ma_khu_vuc ?? `Khu #${k.khu_vuc_id}`}
                {k.co_quy_tac === true ? '' : ' (chưa có quy tắc)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="org-pricing-hint">
        Giá hiện hành:{' '}
        <strong className="org-pricing-num">
          {(() => {
            const g = findRow(rows, selection.khuVucId)?.gia_hien_hanh;
            return typeof g === 'number' ? moneyFormatter.format(g) : '—';
          })()}
        </strong>
        . Lưu cấu hình không tự áp giá mới cho khán giả.
      </p>

      <div className="org-pricing-grid">
        {PRICING_FIELDS.map((f) => {
          const id = `pricing-${f.key}`;
          const errId = `${id}-error`;
          const error = errors[f.key];
          return (
            <div className="org-pricing-field" key={f.key}>
              <label className="org-label" htmlFor={id}>
                {f.label}
              </label>
              <input
                id={id}
                ref={(el) => {
                  inputRefs.current[f.key] = el;
                }}
                className="org-input org-pricing-num"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values[f.key]}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
                disabled={disabled}
              />
              {error && (
                <p id={errId} className="org-field-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="org-pricing-toggle">
        <input
          id="pricing-trangThaiKichHoat"
          type="checkbox"
          checked={values.trangThaiKichHoat}
          onChange={(e) => handleFieldChange('trangThaiKichHoat', e.target.checked)}
          aria-invalid={errors.trangThaiKichHoat ? true : undefined}
          aria-describedby={errors.trangThaiKichHoat ? 'pricing-trangThaiKichHoat-error' : undefined}
          disabled={disabled}
        />
        <label htmlFor="pricing-trangThaiKichHoat">Bật định giá động cho khu vực này</label>
        {errors.trangThaiKichHoat && (
          <p id="pricing-trangThaiKichHoat-error" className="org-field-error" role="alert">
            {errors.trangThaiKichHoat}
          </p>
        )}
      </div>

      <div className="org-pricing-actions">
        <button type="submit" className="org-btn org-btn-primary" disabled={disabled}>
          {saving ? (
            <>
              <IconSpinner size={15} />
              <span>Đang lưu…</span>
            </>
          ) : (
            <>
              <IconSave size={15} />
              <span>Lưu cấu hình</span>
            </>
          )}
        </button>
      </div>

      <div className="org-pricing-feedback" aria-live="polite">
        {failure && (
          <div className="org-alert org-alert-danger" role="alert">
            <IconAlertTriangle size={16} className="org-alert-icon" />
            <div className="org-alert-body">{failure}</div>
          </div>
        )}
        {notice && (
          <>
            <div className="org-alert org-alert-success">
              <IconCheck size={16} className="org-alert-icon" />
              <div className="org-alert-body">
                Đã lưu cấu hình. Lưu cấu hình không tự áp giá mới cho khán giả; giá chỉ đổi khi một đề xuất được duyệt.
              </div>
            </div>
            {notice.canhBaoNgoaiKhung.map((c, i) => (
              <div className="org-alert org-alert-warning" role="alert" key={i}>
                <IconAlertTriangle size={16} className="org-alert-icon" />
                <div className="org-alert-body">
                  Giá hiện hành <span className="org-pricing-num">{moneyFormatter.format(c.giaHienHanh)}</span> nằm ngoài khung{' '}
                  <span className="org-pricing-num">{moneyFormatter.format(c.giaSan)}</span> –{' '}
                  <span className="org-pricing-num">{moneyFormatter.format(c.giaTran)}</span>.
                </div>
              </div>
            ))}
            {notice.deXuatHetHieuLuc.length > 0 && (
              <div className="org-alert org-alert-info">
                <IconInfoCircle size={16} className="org-alert-icon" />
                <div className="org-alert-body">
                  {notice.deXuatHetHieuLuc.length} đề xuất chờ duyệt đã bị vô hiệu sau khi thu hẹp khung giá (mã:{' '}
                  <span className="org-pricing-num">{notice.deXuatHetHieuLuc.join(', ')}</span>).
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </form>
  );
}
