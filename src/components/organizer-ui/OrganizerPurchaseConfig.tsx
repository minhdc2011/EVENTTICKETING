import {useCallback, useEffect, useRef, useState} from 'react';
import type React from 'react';
import * as purchaseConfigService from '../../services/purchaseConfigService';
import type {PurchaseConfigFieldErrors} from '../../services/purchaseConfigService';
import {
  MAX_SO_VE_TOI_DA,
  MIN_SO_VE_TOI_DA,
  NHAN_MO_PHONG_UI,
  THONG_BAO_AP_DUNG_SAU,
  buildPurchaseConfigFormValues,
  createDialogFocusScope,
  createPurchaseConfigSession,
  getFocusableElements,
  hasPurchaseConfigAccess,
  isSimulatedPurchaseConfig,
  loadPurchaseConfig,
  resolveDialogKeyDown,
  savePurchaseConfig,
  validatePurchaseConfigForm,
} from './purchaseConfigController.js';
import type {
  PurchaseConfigEventLike,
  PurchaseConfigFieldKey,
  PurchaseConfigFormValues,
  PurchaseConfigOrgLike,
  PurchaseConfigSavedValue,
  PurchaseConfigServices,
} from './purchaseConfigController';
import {IconAlertTriangle, IconCheck, IconClose, IconInfoCircle, IconSave, IconSpinner} from './OrganizerIcons';
import './organizer-purchase-config.css';

const defaultServices: PurchaseConfigServices = {
  docCauHinhMuaVe: purchaseConfigService.docCauHinhMuaVe,
  luuCauHinhMuaVe: purchaseConfigService.luuCauHinhMuaVe,
};

const MAX_TICKETS_INPUT_ID = 'purchase-config-max-tickets';
const MAX_TICKETS_HINT_ID = 'purchase-config-max-tickets-hint';
const MAX_TICKETS_ERROR_ID = 'purchase-config-max-tickets-error';
const OTP_INPUT_ID = 'purchase-config-require-otp';
const OTP_HINT_ID = 'purchase-config-require-otp-hint';
const OTP_ERROR_ID = 'purchase-config-require-otp-error';

export type OrganizerPurchaseConfigProps = {
  key?: React.Key;
  event: PurchaseConfigEventLike & {name?: string};
  activeOrg: PurchaseConfigOrgLike;
  onClose: () => void;
  services?: PurchaseConfigServices;
  onSaved?: (saved: PurchaseConfigSavedValue) => void;
};

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

type SaveFeedback =
  | {kind: 'saved'; message: string}
  | {kind: 'error'; message: string; retryable: boolean}
  | null;

function serializeOrgContext(activeOrg: PurchaseConfigOrgLike): string {
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

export function OrganizerPurchaseConfig({
  event,
  activeOrg,
  onClose,
  services = defaultServices,
  onSaved,
}: OrganizerPurchaseConfigProps) {
  const sessionRef = useRef(createPurchaseConfigSession());
  const session = sessionRef.current;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const soVeInputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFocusFieldRef = useRef<PurchaseConfigFieldKey | null>(null);

  const orgContextKey = serializeOrgContext(activeOrg);
  const allowed = hasPurchaseConfigAccess(activeOrg, event);

  const [loadState, setLoadState] = useState<LoadState>(() => (allowed ? 'loading' : 'forbidden'));
  const [loadError, setLoadError] = useState<string | null>(() =>
    allowed ? null : 'Bạn không có quyền cấu hình mua vé cho sự kiện này.',
  );
  const [savedValue, setSavedValue] = useState<PurchaseConfigSavedValue | null>(null);
  const [formValues, setFormValues] = useState<PurchaseConfigFormValues>(() => buildPurchaseConfigFormValues(null));
  const [fieldErrors, setFieldErrors] = useState<PurchaseConfigFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const [simulated, setSimulated] = useState<boolean>(() => isSimulatedPurchaseConfig({event}));

  const servicesRef = useRef(services);
  servicesRef.current = services;
  const ctxRef = useRef({activeOrg, event});
  ctxRef.current = {activeOrg, event};

  const refreshConfig = useCallback(async () => {
    setLoadError(null);
    const outcome = await loadPurchaseConfig(session, servicesRef.current, ctxRef.current);
    if (outcome.status === 'stale') return;
    if (outcome.status === 'ok') {
      setSavedValue({
        soVeToiDaMoiDon: outcome.config.soVeToiDaMoiDon,
        yeuCauXacMinhOtp: outcome.config.yeuCauXacMinhOtp,
      });
      setFormValues(outcome.formValues);
      setSimulated(outcome.simulated);
      setFieldErrors({});
      setSaveFeedback(null);
      setLoadState('ready');
    } else if (outcome.status === 'forbidden') {
      setSavedValue(null);
      setLoadError('Bạn không có quyền cấu hình mua vé cho sự kiện này.');
      setLoadState('forbidden');
    } else if (outcome.status === 'error') {
      setLoadError(outcome.error.message);
      setLoadState('error');
    }
  }, [session]);

  // Đổi tổ chức, đổi sự kiện hoặc mất quyền: vô hiệu phản hồi cũ, xóa dữ liệu sự kiện cũ, nạp lại.
  useEffect(() => {
    session.reset();
    setSavedValue(null);
    setFormValues(buildPurchaseConfigFormValues(null));
    setFieldErrors({});
    setSaving(false);
    setSaveFeedback(null);
    setLoadError(null);
    setSimulated(isSimulatedPurchaseConfig({event: ctxRef.current.event}));

    if (!hasPurchaseConfigAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      setLoadState('forbidden');
      setLoadError('Bạn không có quyền cấu hình mua vé cho sự kiện này.');
      return () => session.reset();
    }

    setLoadState('loading');
    void refreshConfig();
    return () => session.reset();
  }, [session, refreshConfig, orgContextKey, event.id, event.organizationId, allowed]);

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

  function focusField(key: PurchaseConfigFieldKey | null) {
    if (key === 'soVeToiDaMoiDon') {
      soVeInputRef.current?.focus();
    } else if (key === 'yeuCauXacMinhOtp') {
      otpInputRef.current?.focus();
    }
  }

  // Sau khi lưu lỗi từ server nhả disabled, chuyển focus vào trường lỗi đầu tiên nếu có.
  useEffect(() => {
    if (saving || !pendingFocusFieldRef.current) return;
    const target = pendingFocusFieldRef.current;
    pendingFocusFieldRef.current = null;
    focusField(target);
  }, [saving, fieldErrors]);

  function clearFieldError(key: PurchaseConfigFieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const {[key]: _removed, ...rest} = prev;
      return rest;
    });
  }

  function handleMaxTicketsChange(value: string) {
    setFormValues((prev) => ({...prev, soVeToiDaMoiDon: value}));
    clearFieldError('soVeToiDaMoiDon');
    setSaveFeedback(null);
  }

  function handleOtpChange(checked: boolean) {
    setFormValues((prev) => ({...prev, yeuCauXacMinhOtp: checked}));
    clearFieldError('yeuCauXacMinhOtp');
    setSaveFeedback(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || session.busy) return;
    if (!hasPurchaseConfigAccess(ctxRef.current.activeOrg, ctxRef.current.event)) {
      session.reset();
      setLoadState('forbidden');
      setLoadError('Bạn không có quyền cấu hình mua vé cho sự kiện này.');
      return;
    }

    const check = validatePurchaseConfigForm(formValues);
    if (!check.ok) {
      setSaveFeedback(null);
      setFieldErrors(check.errors);
      focusField(check.firstInvalidField);
      return;
    }

    setSaveFeedback(null);
    setSaving(true);
    const outcome = await savePurchaseConfig(session, servicesRef.current, {
      ...ctxRef.current,
      formValues,
    });
    if (outcome.status === 'stale') return;
    setSaving(false);

    switch (outcome.status) {
      case 'invalid':
        setFieldErrors(outcome.errors);
        pendingFocusFieldRef.current = outcome.firstInvalidField;
        break;
      case 'busy':
        setSaveFeedback({
          kind: 'error',
          message: 'Đang có thao tác lưu khác đang chạy. Vui lòng đợi hoàn tất.',
          retryable: true,
        });
        break;
      case 'forbidden':
        session.reset();
        setLoadState('forbidden');
        setLoadError('Bạn không có quyền lưu cấu hình mua vé của sự kiện này.');
        break;
      case 'error': {
        if (Object.keys(outcome.fieldErrors).length > 0) {
          setFieldErrors(outcome.fieldErrors);
          const firstKey: PurchaseConfigFieldKey | null = outcome.fieldErrors.soVeToiDaMoiDon
            ? 'soVeToiDaMoiDon'
            : outcome.fieldErrors.yeuCauXacMinhOtp
              ? 'yeuCauXacMinhOtp'
              : null;
          pendingFocusFieldRef.current = firstKey;
        }
        setSaveFeedback({
          kind: 'error',
          message: outcome.error.message,
          retryable: outcome.error.retryable,
        });
        break;
      }
      case 'saved':
        setFieldErrors({});
        setSavedValue(outcome.config);
        setFormValues(outcome.formValues);
        setSimulated((prev) => outcome.simulated || prev);
        setSaveFeedback({kind: 'saved', message: outcome.message});
        onSaved?.(outcome.config);
        break;
    }
  }

  const showSimulated = simulated || isSimulatedPurchaseConfig({event});

  return (
    <div ref={overlayRef} className="org-purchase-overlay" role="presentation" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        className="org-purchase-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-config-title"
        tabIndex={-1}
        aria-busy={loadState === 'loading' || saving}
      >
        <header className="org-purchase-header">
          <div>
            <h2 id="purchase-config-title" className="org-purchase-title">
              <span>Cấu hình mua vé</span>
              {showSimulated && <span className="org-purchase-sim-label">{NHAN_MO_PHONG_UI}</span>}
            </h2>
            <p className="org-purchase-subtitle">{event.name || `Sự kiện #${event.id}`}</p>
          </div>
          <button
            type="button"
            className="org-purchase-close"
            onClick={onClose}
            aria-label="Đóng cấu hình mua vé"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="org-purchase-body">
          {loadState === 'loading' && (
            <div className="org-purchase-state" role="status">
              <IconSpinner size={18} />
              <span>Đang tải cấu hình mua vé…</span>
            </div>
          )}

          {loadState === 'forbidden' && (
            <div className="org-purchase-notice org-purchase-notice--error" role="alert">
              <IconAlertTriangle size={16} />
              <span>{loadError ?? 'Bạn không có quyền cấu hình mua vé cho sự kiện này.'}</span>
            </div>
          )}

          {loadState === 'error' && (
            <div className="org-purchase-notice org-purchase-notice--error" role="alert">
              <IconAlertTriangle size={16} />
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0}}>
                <span>{loadError ?? 'Không đọc được cấu hình mua vé. Hãy thử lại.'}</span>
                {allowed && (
                  <div>
                    <button
                      type="button"
                      className="org-purchase-button"
                      onClick={() => {
                        setLoadState('loading');
                        void refreshConfig();
                      }}
                    >
                      Thử lại
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {loadState === 'ready' && (
            <>
              <dl className="org-purchase-summary" aria-label="Cấu hình đang áp dụng">
                <div>
                  <dt>Giới hạn vé mỗi đơn (đã lưu)</dt>
                  <dd data-purchase-saved-max>{savedValue ? `${savedValue.soVeToiDaMoiDon} vé` : '—'}</dd>
                </div>
                <div>
                  <dt>Xác minh OTP (đã lưu)</dt>
                  <dd data-purchase-saved-otp>
                    {savedValue ? (savedValue.yeuCauXacMinhOtp ? 'Bắt buộc (Bật)' : 'Không bắt buộc (Tắt)') : '—'}
                  </dd>
                </div>
              </dl>

              <form className="org-purchase-form" onSubmit={handleSubmit} noValidate aria-busy={saving}>
                <div className="org-purchase-field">
                  <label className="org-purchase-label" htmlFor={MAX_TICKETS_INPUT_ID}>
                    Số vé tối đa mỗi đơn
                  </label>
                  <p id={MAX_TICKETS_HINT_ID} className="org-purchase-hint">
                    Số nguyên từ {MIN_SO_VE_TOI_DA} đến {MAX_SO_VE_TOI_DA} vé cho mỗi đơn hàng.
                  </p>
                  <input
                    id={MAX_TICKETS_INPUT_ID}
                    ref={soVeInputRef}
                    className="org-purchase-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={formValues.soVeToiDaMoiDon}
                    onChange={(e) => handleMaxTicketsChange(e.target.value)}
                    aria-invalid={fieldErrors.soVeToiDaMoiDon ? true : undefined}
                    aria-describedby={fieldErrors.soVeToiDaMoiDon ? MAX_TICKETS_ERROR_ID : MAX_TICKETS_HINT_ID}
                    disabled={saving}
                  />
                  {fieldErrors.soVeToiDaMoiDon && (
                    <p id={MAX_TICKETS_ERROR_ID} className="org-field-error" role="alert">
                      {fieldErrors.soVeToiDaMoiDon}
                    </p>
                  )}
                </div>

                <div className="org-purchase-field">
                  <label className="org-purchase-toggle" htmlFor={OTP_INPUT_ID}>
                    <input
                      id={OTP_INPUT_ID}
                      ref={otpInputRef}
                      type="checkbox"
                      checked={formValues.yeuCauXacMinhOtp}
                      onChange={(e) => handleOtpChange(e.target.checked)}
                      aria-invalid={fieldErrors.yeuCauXacMinhOtp ? true : undefined}
                      aria-describedby={fieldErrors.yeuCauXacMinhOtp ? OTP_ERROR_ID : OTP_HINT_ID}
                      disabled={saving}
                    />
                    <span className="org-purchase-toggle-text">
                      <span>Yêu cầu xác minh OTP (YeuCauXacMinhOTP)</span>
                      <small id={OTP_HINT_ID}>
                        Khi bật, khán giả phải xác minh OTP trước khi tạo giữ chỗ cho sự kiện này.
                      </small>
                    </span>
                  </label>
                  {fieldErrors.yeuCauXacMinhOtp && (
                    <p id={OTP_ERROR_ID} className="org-field-error" role="alert">
                      {fieldErrors.yeuCauXacMinhOtp}
                    </p>
                  )}
                </div>

                <div className="org-purchase-notice" role="note">
                  <IconInfoCircle size={16} />
                  <span>{THONG_BAO_AP_DUNG_SAU}</span>
                </div>

                <div aria-live="polite">
                  {saveFeedback?.kind === 'error' && (
                    <div className="org-purchase-notice org-purchase-notice--error" role="alert">
                      <IconAlertTriangle size={16} />
                      <span>{saveFeedback.message}</span>
                    </div>
                  )}
                  {saveFeedback?.kind === 'saved' && (
                    <div className="org-purchase-notice org-purchase-notice--success" role="status">
                      <IconCheck size={16} />
                      <span>{saveFeedback.message}</span>
                    </div>
                  )}
                </div>

                <div className="org-purchase-actions">
                  <button type="button" className="org-purchase-button" onClick={onClose}>
                    Đóng
                  </button>
                  <button
                    type="submit"
                    className="org-purchase-button org-purchase-button--primary"
                    disabled={saving}
                  >
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
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
