import {useEffect, useMemo, useState} from 'react';
import {buildPublicPath, deduplicateSlug} from '../../domain/publicRoute';
import {
  evaluatePublishReadiness,
  isValidHttpsUrl,
  VALID_CATEGORIES,
  VALID_LOCATION_MODES,
  type FullEventAggregateInput,
  type FullEventShowInput,
  type FullEventTierInput,
  type FullEventScheduleInput,
  type FullEventArtistInput,
  type PublishReadinessResult,
} from '../../services/organizerService';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconBuilding,
  IconCheck,
  IconClock,
  IconClose,
  IconCopy,
  IconExternalLink,
  IconInfoCircle,
  IconPlus,
  IconPublish,
  IconSave,
  IconShield,
  IconSpinner,
  IconTrash,
} from './OrganizerIcons';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

import {getCategoryTheme} from '../../domain/categoryThemes';
import {
  getDefaultDraftDates,
  toSlug,
  CATEGORY_LABELS as categoryLabels,
  LOCATION_MODE_LABELS as locationModeLabels,
  WIZARD_STEP_TITLES,
} from './organizerLogic';

export {getDefaultDraftDates};

export type OrganizerEventWizardProps = {
  initialAggregate: FullEventAggregateInput;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (
    result: {eventId: number; slug: string; status: string},
    isPublished?: boolean,
  ) => Promise<void>;
  saveDraftAction: (data: FullEventAggregateInput) => Promise<{eventId: number; slug: string; status: string}>;
  publishEventAction: (eventId: number) => Promise<void> | Promise<any>;
};

export function OrganizerEventWizard({
  initialAggregate,
  canEdit,
  onClose,
  onSaved,
  saveDraftAction,
  publishEventAction,
}: OrganizerEventWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FullEventAggregateInput>(initialAggregate);
  const [selectedShowIdx, setSelectedShowIdx] = useState(0);
  const [busyDraft, setBusyDraft] = useState(false);
  const [busyPublish, setBusyPublish] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error' | 'info'; text: string} | null>(null);

  const readiness = useMemo<PublishReadinessResult>(() => evaluatePublishReadiness(formData), [formData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function updateField<K extends keyof FullEventAggregateInput>(key: K, value: FullEventAggregateInput[K]) {
    setFormData((prev) => ({...prev, [key]: value}));
  }

  function addShow() {
    const newIdx = formData.shows.length + 1;
    const lastShow = formData.shows[formData.shows.length - 1];
    let startsAt = getDefaultDraftDates().startsAt;
    let endsAt = getDefaultDraftDates().endsAt;
    let saleStartsAt = getDefaultDraftDates().saleStartsAt;
    let saleEndsAt = getDefaultDraftDates().saleEndsAt;

    if (lastShow) {
      try {
        const prevStart = new Date(lastShow.startsAt);
        const prevEnd = new Date(lastShow.endsAt);
        prevStart.setDate(prevStart.getDate() + 1);
        prevEnd.setDate(prevEnd.getDate() + 1);
        const pad = (n: number) => String(n).padStart(2, '0');
        startsAt = `${prevStart.getFullYear()}-${pad(prevStart.getMonth() + 1)}-${pad(prevStart.getDate())}T${pad(
          prevStart.getHours(),
        )}:${pad(prevStart.getMinutes())}`;
        endsAt = `${prevEnd.getFullYear()}-${pad(prevEnd.getMonth() + 1)}-${pad(prevEnd.getDate())}T${pad(
          prevEnd.getHours(),
        )}:${pad(prevEnd.getMinutes())}`;
        saleStartsAt = lastShow.saleStartsAt;
        saleEndsAt = lastShow.saleEndsAt;
      } catch {
        // Fallback to default draft dates
      }
    }

    const clonedTiers: FullEventTierInput[] =
      lastShow && lastShow.ticketTiers.length
        ? lastShow.ticketTiers.map((t) => ({
            code: `${t.code}_S${newIdx}`,
            name: t.name,
            type: t.type,
            price: t.price,
            capacity: t.capacity,
            color: t.color,
            benefits: t.benefits,
            minPerOrder: t.minPerOrder,
            maxPerOrder: t.maxPerOrder,
          }))
        : [
            {
              code: `TIER_${newIdx}`,
              name: 'Vé tiêu chuẩn',
              type: 'DUNG_STAND',
              price: 250000,
              capacity: 300,
              color: '#84CC16',
              benefits: 'Quyền vào cửa tiêu chuẩn.',
              minPerOrder: 1,
              maxPerOrder: 4,
            },
          ];

    const newShow: FullEventShowInput = {
      slug: `suat-${newIdx}`,
      name: `Suất diễn ${newIdx}`,
      startsAt,
      endsAt,
      doorsOpenAt: startsAt,
      saleStartsAt,
      saleEndsAt,
      ticketTiers: clonedTiers,
    };

    setFormData((prev) => ({
      ...prev,
      shows: [...prev.shows, newShow],
    }));
    setSelectedShowIdx(formData.shows.length);
  }

  function removeShow(index: number) {
    if (formData.shows.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      shows: prev.shows.filter((_, i) => i !== index),
    }));
    if (selectedShowIdx >= index && selectedShowIdx > 0) {
      setSelectedShowIdx(selectedShowIdx - 1);
    }
  }

  function updateShow(index: number, patch: Partial<FullEventShowInput>) {
    setFormData((prev) => {
      const shows = [...prev.shows];
      shows[index] = {...shows[index], ...patch};
      return {...prev, shows};
    });
  }

  function addTier(showIndex: number) {
    const curShow = formData.shows[showIndex];
    if (!curShow) return;
    const tierNum = curShow.ticketTiers.length + 1;
    const newTier: FullEventTierInput = {
      code: `TIER_${tierNum}`,
      name: `Hạng vé ${tierNum}`,
      type: 'DUNG_STAND',
      price: 200000,
      capacity: 200,
      color: '#3B82F6',
      benefits: 'Quyền lợi hạng vé tiêu chuẩn.',
      minPerOrder: 1,
      maxPerOrder: 4,
    };
    updateShow(showIndex, {ticketTiers: [...curShow.ticketTiers, newTier]});
  }

  function removeTier(showIndex: number, tierIndex: number) {
    const curShow = formData.shows[showIndex];
    if (!curShow || curShow.ticketTiers.length <= 1) return;
    updateShow(showIndex, {
      ticketTiers: curShow.ticketTiers.filter((_, i) => i !== tierIndex),
    });
  }

  function updateTier(showIndex: number, tierIndex: number, patch: Partial<FullEventTierInput>) {
    const curShow = formData.shows[showIndex];
    if (!curShow) return;
    const tiers = [...curShow.ticketTiers];
    tiers[tierIndex] = {...tiers[tierIndex], ...patch};
    updateShow(showIndex, {ticketTiers: tiers});
  }

  function cloneTiersToAllShows(sourceShowIdx: number) {
    const sourceShow = formData.shows[sourceShowIdx];
    if (!sourceShow) return;
    setFormData((prev) => ({
      ...prev,
      shows: prev.shows.map((s, idx) => {
        if (idx === sourceShowIdx) return s;
        return {
          ...s,
          ticketTiers: sourceShow.ticketTiers.map((t) => ({
            ...t,
            code: `${t.code}_S${idx + 1}`,
          })),
        };
      }),
    }));
    setFeedback({
      type: 'info',
      text: `Đã sao chép ${sourceShow.ticketTiers.length} hạng vé từ ${sourceShow.name} sang tất cả các suất diễn khác.`,
    });
  }

  function addScheduleItem() {
    const schedule = formData.schedule || [];
    const nextOrder = schedule.length + 1;
    let startTime = '18:00';
    let endTime = '19:00';
    if (schedule.length > 0) {
      const last = schedule[schedule.length - 1];
      if (last.endTime) {
        startTime = last.endTime;
        const [h, m] = startTime.split(':').map(Number);
        const endH = Math.min(23, ((h || 18) + 1) % 24);
        endTime = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
        if (endTime <= startTime) {
          endTime = '23:59';
        }
      }
    }
    const newItem: FullEventScheduleInput = {
      title: '',
      startTime,
      endTime,
      location: '',
      description: '',
      order: nextOrder,
    };
    setFormData((prev) => ({
      ...prev,
      schedule: [...(prev.schedule || []), newItem],
    }));
  }

  function removeScheduleItem(index: number) {
    setFormData((prev) => {
      const updated = (prev.schedule || [])
        .filter((_, i) => i !== index)
        .map((item, idx) => ({...item, order: idx + 1}));
      return {...prev, schedule: updated};
    });
  }

  function updateScheduleItem(index: number, patch: Partial<FullEventScheduleInput>) {
    setFormData((prev) => {
      const schedule = [...(prev.schedule || [])];
      schedule[index] = {...schedule[index], ...patch};
      return {...prev, schedule};
    });
  }

  function moveScheduleItem(index: number, direction: 'up' | 'down') {
    setFormData((prev) => {
      const list = [...(prev.schedule || [])];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      const reordered = list.map((item, idx) => ({...item, order: idx + 1}));
      return {...prev, schedule: reordered};
    });
  }

  function addArtistItem() {
    const artists = formData.artists || [];
    const nextOrder = artists.length + 1;
    const newArtist: FullEventArtistInput = {
      name: '',
      realName: '',
      role: 'Nghệ sĩ biểu diễn',
      imageUrl: '',
      bio: '',
      order: nextOrder,
    };
    setFormData((prev) => ({
      ...prev,
      artists: [...(prev.artists || []), newArtist],
    }));
  }

  function removeArtistItem(index: number) {
    setFormData((prev) => {
      const updated = (prev.artists || [])
        .filter((_, i) => i !== index)
        .map((item, idx) => ({...item, order: idx + 1}));
      return {...prev, artists: updated};
    });
  }

  function updateArtistItem(index: number, patch: Partial<FullEventArtistInput>) {
    setFormData((prev) => {
      const artists = [...(prev.artists || [])];
      artists[index] = {...artists[index], ...patch};
      return {...prev, artists};
    });
  }

  function moveArtistItem(index: number, direction: 'up' | 'down') {
    setFormData((prev) => {
      const list = [...(prev.artists || [])];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      const reordered = list.map((item, idx) => ({...item, order: idx + 1}));
      return {...prev, artists: reordered};
    });
  }

  async function handleSaveDraft() {
    setBusyDraft(true);
    setFeedback(null);
    try {
      const result = await saveDraftAction(formData);
      setFormData((prev) => ({
        ...prev,
        eventId: result.eventId,
        slug: result.slug,
      }));
      setFeedback({
        type: 'success',
        text: `Đã lưu bản nháp thành công! (Mã sự kiện: #${result.eventId})`,
      });
      await onSaved(result, false);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Không thể lưu bản nháp.',
      });
    } finally {
      setBusyDraft(false);
    }
  }

  async function handlePublish() {
    if (!readiness.isReady) {
      setFeedback({
        type: 'error',
        text: `Sự kiện còn ${readiness.blockers.length} tiêu chí bắt buộc chưa đạt. Vui lòng kiểm tra lại Bước 6.`,
      });
      setStep(6);
      return;
    }
    setBusyPublish(true);
    setFeedback(null);
    try {
      const draftRes = await saveDraftAction(formData);
      await publishEventAction(draftRes.eventId);
      setFeedback({
        type: 'success',
        text: 'Xuất sắc! Sự kiện đã được công bố chính thức lên Marketplace.',
      });
      await onSaved(draftRes, true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Không thể công bố sự kiện.',
      });
    } finally {
      setBusyPublish(false);
    }
  }

  const currentShow = formData.shows[selectedShowIdx] || formData.shows[0];

  return (
    <div
      className="org-wizard-backdrop wizard-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-dialog-title"
    >
      <div className="org-wizard-window wizard-modal-window">
        {/* Wizard Header */}
        <header className="org-wizard-header wizard-modal-header">
          <div className="org-wizard-header-title-box">
            <span className="org-wizard-header-tag wizard-header-tag">
              {formData.eventId ? `CHỈNH SỬA SỰ KIỆN #${formData.eventId}` : 'TẠO SỰ KIỆN MỚI'}
            </span>
            <h2 id="wizard-dialog-title" className="org-wizard-header-title">
              {formData.name || 'Sự kiện chưa đặt tên'}
            </h2>
          </div>

          <div className="org-wizard-header-actions">
            <button
              type="button"
              className="org-btn org-btn-secondary wizard-header-save-btn"
              onClick={handleSaveDraft}
              disabled={busyDraft || busyPublish || !canEdit}
              style={{minHeight: '40px', padding: '0 14px'}}
            >
              {busyDraft ? (
                <>
                  <IconSpinner size={14} />
                  <span>Đang lưu…</span>
                </>
              ) : (
                <>
                  <IconSave size={14} />
                  <span>Lưu bản nháp</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="org-wizard-close-btn wizard-modal-close"
              onClick={onClose}
              aria-label="Đóng biểu mẫu sự kiện"
            >
              <IconClose size={20} />
            </button>
          </div>
        </header>

        {/* Stepper Navigation */}
        <nav className="org-wizard-stepper wizard-step-bar" aria-label="Các bước tạo sự kiện">
          {WIZARD_STEP_TITLES.map((title, idx) => {
            const stepNum = idx + 1;
            const isActive = step === stepNum;
            const isCompleted = step > stepNum;
            return (
              <button
                key={stepNum}
                type="button"
                className={`org-wizard-step-item wizard-step-item ${isActive ? 'is-active' : ''} ${
                  isCompleted ? 'is-completed' : ''
                }`}
                onClick={() => setStep(stepNum)}
              >
                <span className="org-wizard-step-circle wizard-step-circle">
                  {isCompleted ? <IconCheck size={13} /> : stepNum}
                </span>
                <span className="wizard-step-label">{title}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`org-alert org-alert-${feedback.type} wizard-alert wizard-alert--${feedback.type}`}
            style={{margin: '16px 28px 0'}}
            role="alert"
          >
            {feedback.type === 'success' ? (
              <IconCheck className="org-alert-icon" size={18} />
            ) : feedback.type === 'error' ? (
              <IconAlertTriangle className="org-alert-icon" size={18} />
            ) : (
              <IconInfoCircle className="org-alert-icon" size={18} />
            )}
            <div className="org-alert-body">{feedback.text}</div>
            <button
              type="button"
              className="org-alert-close"
              onClick={() => setFeedback(null)}
              aria-label="Đóng thông báo"
            >
              <IconClose size={14} />
            </button>
          </div>
        )}

        {/* Wizard Body Steps */}
        <div className="org-wizard-body wizard-modal-content">
          {/* STEP 1: Basic Information */}
          {step === 1 && (
            <div className="wizard-form-section">
              <div className="org-wizard-section-intro wizard-section-intro">
                <h3 className="org-wizard-section-title">Bước 1: Thông tin chung & Nhận diện</h3>
                <p className="org-wizard-section-subtitle">
                  Thiết lập tên sự kiện, đường dẫn slug thân thiện và mô tả chi tiết nội dung.
                </p>
              </div>

              <div className="org-grid-2 wizard-grid-2">
                <label className="org-label wizard-label">
                  <span>
                    Tên sự kiện <span className="org-label-required">*</span>
                  </span>
                  <input
                    className="org-input"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    onBlur={(e) => {
                      if (!formData.slug && e.target.value) {
                        updateField('slug', toSlug(e.target.value));
                      }
                    }}
                    placeholder="Ví dụ: Hanoi Indie Music Festival 2026"
                    required
                  />
                  <span className="org-label-hint">Tối thiểu 5 ký tự. Sẽ hiển thị ở tiêu đề lớn.</span>
                </label>

                <label className="org-label wizard-label">
                  <span>
                    Đường dẫn (Slug) <span className="org-label-required">*</span>
                  </span>
                  <input
                    className="org-input"
                    value={formData.slug}
                    onChange={(e) => updateField('slug', toSlug(e.target.value))}
                    placeholder="hanoi-indie-music-festival-2026"
                    required
                  />
                  <span className="org-label-hint">Dùng cho URL: /events/{formData.slug || 'slug-su-kien'}</span>
                </label>
              </div>

              <div className="org-grid-2 wizard-grid-2">
                <label className="org-label wizard-label">
                  <span>
                    Thể loại sự kiện <span className="org-label-required">*</span>
                  </span>
                  <select
                    className="org-select"
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value)}
                  >
                    {VALID_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabels[cat] || cat}
                      </option>
                    ))}
                  </select>
                  <span className="org-label-hint">Phân loại giúp khán giả dễ dàng tìm kiếm trên marketplace.</span>
                </label>

                <label className="org-label wizard-label">
                  <span>Slogan / Thông điệp ngắn</span>
                  <input
                    className="org-input"
                    value={formData.slogan || ''}
                    onChange={(e) => updateField('slogan', e.target.value)}
                    placeholder="Ví dụ: Một đêm nhạc thăng hoa của những tâm hồn tự do"
                  />
                  <span className="org-label-hint">Dòng thông điệp hiển thị dưới tiêu đề (tùy chọn).</span>
                </label>
              </div>

              {/* Category Theme Visual Feedback */}
              {(() => {
                const currentTheme = getCategoryTheme(formData.category);
                return (
                  <div
                    className="org-category-theme-preview"
                    style={{
                      borderLeftColor: currentTheme.primary,
                      background: 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <div
                      className="org-category-theme-badge"
                      style={{
                        backgroundColor: currentTheme.badgeBg,
                        borderColor: currentTheme.badgeBorder,
                        color: currentTheme.badgeText,
                      }}
                    >
                      <span>{currentTheme.label}</span>
                    </div>
                    <div className="org-category-theme-info">
                      <strong>Giao diện công bố theo thể loại:</strong>
                      <span>
                        {currentTheme.tagline}. Hệ thống sẽ tự động áp dụng phối màu, ánh sáng sân khấu và phong cách thị giác đồng bộ lên trang sự kiện công khai của bạn.
                      </span>
                    </div>
                  </div>
                );
              })()}

              <label className="org-label wizard-label">
                <span>Mô tả chi tiết sự kiện</span>
                <textarea
                  className="org-textarea"
                  rows={6}
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Giới thiệu nội dung sự kiện, danh sách nghệ sĩ/diễn giả khách mời, lịch trình chi tiết và các trải nghiệm đặc biệt…"
                />
                <span className="org-label-hint">Khuyến nghị tối thiểu 20 ký tự để được duyệt công bố.</span>
              </label>
            </div>
          )}

          {/* STEP 2: Venue & Shows */}
          {step === 2 && (
            <div className="wizard-form-section">
              <div className="org-wizard-section-intro wizard-section-intro">
                <h3 className="org-wizard-section-title">Bước 2: Địa điểm & Lịch trình Suất diễn</h3>
                <p className="org-wizard-section-subtitle">
                  Hỗ trợ sự kiện trực tiếp, trực tuyến, hoặc kết hợp với nhiều suất diễn riêng biệt.
                </p>
              </div>

              <div className="org-alert org-alert-warning" role="note">
                <IconAlertTriangle className="org-alert-icon" size={18} />
                <div className="org-alert-body">
                  <strong>Lưu ý bảo vệ thương mại:</strong> Sau khi sự kiện được công bố và phát sinh lượt mua hoặc giữ chỗ, thời gian bắt đầu của suất diễn sẽ bị khóa chặt ở tầng backend. Hệ thống sẽ từ chối lưu thay đổi nếu cố tình dời lịch diễn đã bán vé.
                </div>
              </div>

              <div style={{marginBottom: '16px'}}>
                <label className="org-label wizard-label">
                  <span>
                    Hình thức tổ chức <span className="org-label-required">*</span>
                  </span>
                  <select
                    className="org-select"
                    value={formData.locationMode}
                    onChange={(e) => updateField('locationMode', e.target.value as any)}
                  >
                    {VALID_LOCATION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {locationModeLabels[mode] || mode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(formData.locationMode === 'OFFLINE' || formData.locationMode === 'HYBRID') && (
                <div className="org-grid-2 wizard-grid-2">
                  <label className="org-label wizard-label">
                    <span>
                      Tên địa điểm / Nhà hát / Sân vận động <span className="org-label-required">*</span>
                    </span>
                    <input
                      className="org-input"
                      value={formData.venueName || ''}
                      onChange={(e) => updateField('venueName', e.target.value)}
                      placeholder="Ví dụ: Trung tâm Triển lãm Quốc tế I.C.E Hà Nội"
                      required
                    />
                  </label>
                  <label className="org-label wizard-label">
                    <span>
                      Địa chỉ chi tiết <span className="org-label-required">*</span>
                    </span>
                    <input
                      className="org-input"
                      value={formData.address || ''}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="Ví dụ: 91 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội"
                      required
                    />
                  </label>
                </div>
              )}

              {(formData.locationMode === 'ONLINE' || formData.locationMode === 'HYBRID') && (
                <div className="org-grid-2 wizard-grid-2">
                  <label className="org-label wizard-label">
                    <span>
                      Đường dẫn trực tuyến (URL) <span className="org-label-required">*</span>
                    </span>
                    <input
                      className="org-input"
                      value={formData.onlineLink || ''}
                      onChange={(e) => updateField('onlineLink', e.target.value)}
                      placeholder="https://zoom.us/j/123456789 hoặc link livestream"
                      required
                    />
                  </label>
                  <label className="org-label wizard-label">
                    <span>Hướng dẫn tham gia trực tuyến</span>
                    <input
                      className="org-input"
                      value={formData.onlineInstructions || ''}
                      onChange={(e) => updateField('onlineInstructions', e.target.value)}
                      placeholder="Passcode phòng họp hoặc quy định mở camera"
                    />
                  </label>
                </div>
              )}

              {/* Shows List */}
              <div className="wizard-shows-block" style={{marginTop: '24px'}}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc'}}>
                      Danh sách suất diễn ({formData.shows.length})
                    </h4>
                    <span style={{fontSize: '12px', color: 'var(--org-text-muted)'}}>
                      Mỗi suất diễn có khung thời gian và giá vé riêng biệt.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="org-btn org-btn-secondary wizard-secondary-btn"
                    onClick={addShow}
                    style={{minHeight: '38px', padding: '0 14px', fontSize: '12px'}}
                  >
                    + Thêm suất diễn
                  </button>
                </div>

                {formData.shows.map((show, idx) => (
                  <div key={idx} className="org-wizard-item-card wizard-card-item">
                    <div className="org-wizard-item-card-header wizard-card-header">
                      <div className="org-wizard-item-card-title">
                        <span>Suất #{idx + 1}: {show.name}</span>
                      </div>
                      {formData.shows.length > 1 && (
                        <button
                          type="button"
                          className="org-btn org-btn-danger wizard-delete-btn"
                          onClick={() => removeShow(idx)}
                          style={{minHeight: '32px', padding: '0 10px', fontSize: '12px'}}
                          title="Xóa suất diễn này"
                        >
                          <IconTrash size={13} />
                          <span>Xóa suất</span>
                        </button>
                      )}
                    </div>

                    <div className="org-grid-2 wizard-grid-2">
                      <label className="org-label wizard-label">
                        <span>
                          Tên suất diễn <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          value={show.name}
                          onChange={(e) => updateShow(idx, {name: e.target.value})}
                          placeholder="Ví dụ: Đêm diễn 1 / Buổi sáng"
                          required
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>
                          Slug suất diễn <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          value={show.slug}
                          onChange={(e) => updateShow(idx, {slug: toSlug(e.target.value)})}
                          placeholder="dem-1"
                          required
                        />
                      </label>
                    </div>

                    <div className="org-grid-2 wizard-grid-2">
                      <label className="org-label wizard-label">
                        <span>
                          Giờ bắt đầu biểu diễn <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          type="datetime-local"
                          value={show.startsAt ? show.startsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {startsAt: e.target.value})}
                          required
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>
                          Giờ kết thúc biểu diễn <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          type="datetime-local"
                          value={show.endsAt ? show.endsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {endsAt: e.target.value})}
                          required
                        />
                      </label>
                    </div>

                    <div className="org-grid-3 wizard-grid-3">
                      <label className="org-label wizard-label">
                        <span>Giờ mở cửa đón khách (Doors Open)</span>
                        <input
                          className="org-input"
                          type="datetime-local"
                          value={show.doorsOpenAt ? show.doorsOpenAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {doorsOpenAt: e.target.value || undefined})}
                        />
                        <span className="org-label-hint">Trước hoặc bằng giờ bắt đầu.</span>
                      </label>
                      <label className="org-label wizard-label">
                        <span>
                          Thời gian mở bán vé <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          type="datetime-local"
                          value={show.saleStartsAt ? show.saleStartsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {saleStartsAt: e.target.value})}
                          required
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>Thời gian đóng bán vé</span>
                        <input
                          className="org-input"
                          type="datetime-local"
                          value={show.saleEndsAt ? show.saleEndsAt.slice(0, 16) : ''}
                          onChange={(e) => updateShow(idx, {saleEndsAt: e.target.value || undefined})}
                        />
                        <span className="org-label-hint">Trước giờ diễn.</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {/* REPEATABLE SECTION: Lịch trình sự kiện (Timeline) */}
              <div style={{marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--org-border-default)'}}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc'}}>
                      Lịch trình hoạt động (Timeline) {(formData.schedule || []).length > 0 ? `(${formData.schedule?.length})` : ''}
                    </h4>
                    <span style={{fontSize: '12px', color: 'var(--org-text-muted)'}}>
                      Tùy chọn. Khán giả có thể xem timeline chi tiết trên trang sự kiện như Super Concert.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="org-btn org-btn-secondary wizard-secondary-btn"
                    onClick={addScheduleItem}
                    style={{minHeight: '44px', padding: '0 16px', fontSize: '13px'}}
                  >
                    <IconPlus size={15} />
                    <span>Thêm mục lịch trình</span>
                  </button>
                </div>

                {(!formData.schedule || formData.schedule.length === 0) ? (
                  <div className="org-wizard-empty-box">
                    <IconClock size={32} style={{color: 'var(--org-text-muted)', marginBottom: '12px'}} />
                    <h5 style={{margin: '0 0 6px', fontSize: '15px', color: '#f8fafc', fontWeight: 600}}>
                      Chưa có mục lịch trình nào
                    </h5>
                    <p style={{margin: '0 auto 16px', maxWidth: '440px', fontSize: '13px', color: 'var(--org-text-muted)', lineHeight: 1.5}}>
                      Lịch trình là tùy chọn. Nếu để trống, mục lịch trình sẽ tự động ẩn trên trang công khai. Bạn có thể thêm các mốc như Check-in, Soundcheck, Khai mạc hoặc Biểu diễn.
                    </p>
                    <button
                      type="button"
                      className="org-btn org-btn-secondary"
                      onClick={addScheduleItem}
                      style={{minHeight: '44px', padding: '0 18px', fontSize: '13px'}}
                    >
                      <IconPlus size={15} />
                      <span>+ Thêm mục lịch trình đầu tiên</span>
                    </button>
                  </div>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
                    {formData.schedule.map((item, sIdx) => {
                      const isTimeInvalid = Boolean(item.startTime && item.endTime && item.endTime <= item.startTime);
                      const isChronologyInvalid = Boolean(
                        sIdx > 0 &&
                        formData.schedule &&
                        formData.schedule[sIdx - 1]?.startTime &&
                        item.startTime &&
                        item.startTime < formData.schedule[sIdx - 1].startTime
                      );
                      return (
                        <div key={sIdx} className="org-wizard-item-card wizard-card-item">
                          <div className="org-wizard-item-card-header wizard-card-header">
                            <div className="org-wizard-item-card-title">
                              <span className="org-item-order-badge">#{item.order || sIdx + 1}</span>
                              <span>{item.title ? item.title : `Hoạt động #${sIdx + 1}`}</span>
                              {item.startTime && (
                                <span style={{fontSize: '12px', color: 'var(--org-lime)', marginLeft: '6px', fontWeight: 600}}>
                                  ({item.startTime}{item.endTime ? ` – ${item.endTime}` : ''})
                                </span>
                              )}
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                              <button
                                type="button"
                                className="org-reorder-btn"
                                onClick={() => moveScheduleItem(sIdx, 'up')}
                                disabled={sIdx === 0}
                                title="Di chuyển lên"
                                aria-label={`Di chuyển mục ${sIdx + 1} lên`}
                              >
                                <IconArrowUp size={16} />
                              </button>
                              <button
                                type="button"
                                className="org-reorder-btn"
                                onClick={() => moveScheduleItem(sIdx, 'down')}
                                disabled={sIdx === (formData.schedule?.length || 0) - 1}
                                title="Di chuyển xuống"
                                aria-label={`Di chuyển mục ${sIdx + 1} xuống`}
                              >
                                <IconArrowDown size={16} />
                              </button>
                              <button
                                type="button"
                                className="org-btn org-btn-danger wizard-delete-btn"
                                onClick={() => removeScheduleItem(sIdx)}
                                style={{minHeight: '44px', minWidth: '44px', padding: '0 12px', fontSize: '13px'}}
                                title="Xóa mục lịch trình này"
                                aria-label={`Xóa mục lịch trình ${sIdx + 1}`}
                              >
                                <IconTrash size={14} />
                                <span>Xóa</span>
                              </button>
                            </div>
                          </div>

                          <div className="org-grid-2 wizard-grid-2">
                            <label className="org-label wizard-label">
                              <span>
                                Tên hoạt động <span className="org-label-required">*</span>
                              </span>
                              <input
                                className="org-input"
                                value={item.title}
                                onChange={(e) => updateScheduleItem(sIdx, {title: e.target.value})}
                                placeholder="Ví dụ: Mở cổng an ninh / Set DJ mở màn"
                                required
                              />
                              {!item.title && (
                                <span className="org-field-error">Vui lòng nhập tên hoạt động.</span>
                              )}
                            </label>

                            <label className="org-label wizard-label">
                              <span>Địa điểm diễn ra (Khu vực / Sân khấu)</span>
                              <input
                                className="org-input"
                                value={item.location || ''}
                                onChange={(e) => updateScheduleItem(sIdx, {location: e.target.value})}
                                placeholder="Ví dụ: Cổng A SVĐ / Sân khấu chính"
                              />
                            </label>
                          </div>

                          <div className="org-grid-3 wizard-grid-3">
                            <label className="org-label wizard-label">
                              <span>
                                Giờ bắt đầu (HH:mm) <span className="org-label-required">*</span>
                              </span>
                              <input
                                className="org-input"
                                type="time"
                                value={item.startTime}
                                onChange={(e) => updateScheduleItem(sIdx, {startTime: e.target.value})}
                                required
                              />
                              {isChronologyInvalid && (
                                <span className="org-field-error">Giờ bắt đầu phải sau hoặc bằng mục trước đó.</span>
                              )}
                            </label>

                            <label className="org-label wizard-label">
                              <span>
                                Giờ kết thúc (HH:mm) <span className="org-label-required">*</span>
                              </span>
                              <input
                                className="org-input"
                                type="time"
                                value={item.endTime}
                                onChange={(e) => updateScheduleItem(sIdx, {endTime: e.target.value})}
                                required
                              />
                              {isTimeInvalid && (
                                <span className="org-field-error">Giờ kết thúc phải sau giờ bắt đầu.</span>
                              )}
                            </label>

                            <label className="org-label wizard-label">
                              <span>Thứ tự hiển thị</span>
                              <input
                                className="org-input"
                                type="number"
                                min="1"
                                value={item.order ?? sIdx + 1}
                                onChange={(e) => updateScheduleItem(sIdx, {order: Number(e.target.value)})}
                              />
                            </label>
                          </div>

                          <label className="org-label wizard-label" style={{marginTop: '4px'}}>
                            <span>Mô tả ngắn hoạt động</span>
                            <input
                              className="org-input"
                              value={item.description || ''}
                              onChange={(e) => updateScheduleItem(sIdx, {description: e.target.value})}
                              placeholder="Ví dụ: Quét mã QR, phát vòng tay cho khu VIP và Fanzone."
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Ticket Tiers */}
          {step === 3 && (
            <div className="wizard-form-section">
              <div className="org-wizard-section-intro wizard-section-intro">
                <h3 className="org-wizard-section-title">Bước 3: Phân khu & Hạng vé</h3>
                <p className="org-wizard-section-subtitle">
                  Cấu hình các hạng vé (VIP, GA, Early Bird), giá tiền, sức chứa và giới hạn số vé mỗi đơn.
                </p>
              </div>

              <div className="org-alert org-alert-warning" role="note">
                <IconAlertTriangle className="org-alert-icon" size={18} />
                <div className="org-alert-body">
                  <strong>Lưu ý bảo vệ thương mại:</strong> Sau khi sự kiện được công bố và có vé đang giữ chỗ hoặc đã thanh toán, các trường thương mại cốt lõi sẽ bị khóa backend: giá vé không thể sửa đổi, sức chứa không thể giảm dưới số vé đã cấp, và không thể xóa phân khu/suất diễn đang có vé giữ hoặc vé bán.
                </div>
              </div>

              {formData.shows.length > 1 && (
                <div style={{marginBottom: '20px'}}>
                  <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px'}}>
                    {formData.shows.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedShowIdx(idx)}
                        className={`org-btn ${selectedShowIdx === idx ? 'org-btn-primary' : 'org-btn-secondary'}`}
                        style={{minHeight: '38px', padding: '0 12px', fontSize: '13px'}}
                      >
                        Suất #{idx + 1}: {s.name} ({s.ticketTiers.length} hạng vé)
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="org-btn org-btn-secondary wizard-secondary-btn"
                    onClick={() => cloneTiersToAllShows(selectedShowIdx)}
                    style={{minHeight: '38px', fontSize: '13px'}}
                  >
                    <IconCopy size={14} />
                    <span>Sao chép phân khu của {currentShow.name} sang tất cả các suất diễn</span>
                  </button>
                </div>
              )}

              <div className="wizard-tiers-block">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc'}}>
                      Hạng vé của {currentShow.name} ({currentShow.ticketTiers.length})
                    </h4>
                    <span style={{fontSize: '12px', color: 'var(--org-text-muted)'}}>
                      Tổng sức chứa suất này: {currentShow.ticketTiers.reduce((acc, t) => acc + (Number(t.capacity) || 0), 0)} vé
                    </span>
                  </div>
                  <button
                    type="button"
                    className="org-btn org-btn-secondary wizard-secondary-btn"
                    onClick={() => addTier(selectedShowIdx)}
                    style={{minHeight: '38px', padding: '0 14px', fontSize: '12px'}}
                  >
                    + Thêm hạng vé
                  </button>
                </div>

                {currentShow.ticketTiers.map((tier, tIdx) => (
                  <div key={tIdx} className="org-wizard-item-card wizard-card-item">
                    <div className="org-wizard-item-card-header wizard-card-header">
                      <div className="org-wizard-item-card-title">
                        <span
                          style={{
                            display: 'inline-block',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            backgroundColor: tier.color || '#84CC16',
                            border: '1px solid rgba(255,255,255,0.2)',
                          }}
                        />
                        <span>Hạng #{tIdx + 1}: {tier.name}</span>
                      </div>
                      {currentShow.ticketTiers.length > 1 && (
                        <button
                          type="button"
                          className="org-btn org-btn-danger wizard-delete-btn"
                          onClick={() => removeTier(selectedShowIdx, tIdx)}
                          style={{minHeight: '32px', padding: '0 10px', fontSize: '12px'}}
                          title="Xóa hạng vé này"
                        >
                          <IconTrash size={13} />
                          <span>Xóa hạng vé</span>
                        </button>
                      )}
                    </div>

                    <div className="org-grid-3 wizard-grid-3">
                      <label className="org-label wizard-label">
                        <span>
                          Tên hạng vé <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          value={tier.name}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {name: e.target.value})}
                          placeholder="Ví dụ: VIP Khán đài A / Vé GA"
                          required
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>
                          Mã phân khu <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          value={tier.code}
                          onChange={(e) =>
                            updateTier(selectedShowIdx, tIdx, {
                              code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                            })
                          }
                          placeholder="VIP_A"
                          required
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>
                          Loại vé <span className="org-label-required">*</span>
                        </span>
                        <select
                          className="org-select"
                          value={tier.type || 'DUNG_STAND'}
                          onChange={(e) =>
                            updateTier(selectedShowIdx, tIdx, {type: e.target.value as any})
                          }
                        >
                          <option value="DUNG_STAND">Vé đứng (Standing / GA)</option>
                          <option value="GHE_NGOI">Vé ghế ngồi (Seated)</option>
                        </select>
                      </label>
                    </div>

                    <div className="org-grid-3 wizard-grid-3">
                      <label className="org-label wizard-label">
                        <span>
                          Giá vé niêm yết (VNĐ) <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          type="number"
                          min="0"
                          step="1000"
                          value={tier.price}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {price: Number(e.target.value)})}
                          required
                        />
                        <span className="org-label-hint" style={{color: 'var(--org-lime)', fontWeight: 600}}>
                          {money.format(tier.price || 0)}
                        </span>
                      </label>
                      <label className="org-label wizard-label">
                        <span>
                          Số lượng vé phát hành (Sức chứa) <span className="org-label-required">*</span>
                        </span>
                        <input
                          className="org-input"
                          type="number"
                          min="1"
                          value={tier.capacity}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {capacity: Number(e.target.value)})}
                          required
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>Màu sắc nhận diện</span>
                        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                          <input
                            type="color"
                            value={tier.color || '#84CC16'}
                            onChange={(e) => updateTier(selectedShowIdx, tIdx, {color: e.target.value})}
                            style={{width: '44px', height: '44px', padding: 0, cursor: 'pointer', background: 'none', border: '1px solid var(--org-border-default)', borderRadius: '4px'}}
                          />
                          <input
                            className="org-input"
                            value={tier.color || '#84CC16'}
                            onChange={(e) => updateTier(selectedShowIdx, tIdx, {color: e.target.value})}
                            placeholder="#84CC16"
                          />
                        </div>
                      </label>
                    </div>

                    <div className="org-grid-3 wizard-grid-3">
                      <label className="org-label wizard-label">
                        <span>Tối thiểu mỗi đơn</span>
                        <input
                          className="org-input"
                          type="number"
                          min="1"
                          value={tier.minPerOrder || 1}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {minPerOrder: Number(e.target.value)})}
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>Tối đa mỗi đơn</span>
                        <input
                          className="org-input"
                          type="number"
                          min="1"
                          value={tier.maxPerOrder || 4}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {maxPerOrder: Number(e.target.value)})}
                        />
                      </label>
                      <label className="org-label wizard-label">
                        <span>Quyền lợi đi kèm</span>
                        <input
                          className="org-input"
                          value={tier.benefits || ''}
                          onChange={(e) => updateTier(selectedShowIdx, tIdx, {benefits: e.target.value})}
                          placeholder="Ví dụ: Tặng áo festival, lối check-in riêng"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Media & Visuals */}
          {step === 4 && (
            <div className="wizard-form-section">
              <div className="org-wizard-section-intro wizard-section-intro">
                <h3 className="org-wizard-section-title">Bước 4: Hình ảnh & Truyền thông</h3>
                <p className="org-wizard-section-subtitle">
                  Cung cấp ảnh bìa sự kiện, ảnh đại diện, sơ đồ phân khu và trailer giới thiệu.
                </p>
              </div>

              <div style={{marginBottom: '16px'}}>
                <label className="org-label wizard-label">
                  <span>
                    Ảnh bìa sự kiện (Desktop Banner 16:9 / 3:1) <span className="org-label-required">*</span>
                  </span>
                  <input
                    className="org-input"
                    value={formData.bannerUrl || ''}
                    onChange={(e) => updateField('bannerUrl', e.target.value)}
                    placeholder="https://example.com/banner.jpg"
                  />
                  <span className="org-label-hint">Bắt buộc phải là liên kết HTTPS hợp lệ để được công bố.</span>
                </label>
                {formData.bannerUrl && (
                  <div style={{marginTop: '10px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--org-border-default)', maxHeight: '180px'}}>
                    <img
                      src={formData.bannerUrl}
                      alt="Banner xem trước"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      onLoad={(e) => (e.currentTarget.style.display = 'block')}
                      style={{maxHeight: '180px', width: '100%', objectFit: 'cover'}}
                    />
                  </div>
                )}
              </div>

              <div className="org-grid-2 wizard-grid-2">
                <div>
                  <label className="org-label wizard-label">
                    <span>Ảnh đại diện / Poster đứng (Mobile Poster 2:3)</span>
                    <input
                      className="org-input"
                      value={formData.posterUrl || ''}
                      onChange={(e) => updateField('posterUrl', e.target.value)}
                      placeholder="https://example.com/poster.jpg"
                    />
                    <span className="org-label-hint">Tối ưu hiển thị trên ứng dụng di động và danh mục marketplace.</span>
                  </label>
                  {formData.posterUrl && (
                    <div style={{marginTop: '10px', width: '120px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--org-border-default)'}}>
                      <img
                        src={formData.posterUrl}
                        alt="Poster xem trước"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        onLoad={(e) => (e.currentTarget.style.display = 'block')}
                        style={{maxHeight: '160px', width: '100%', objectFit: 'cover'}}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="org-label wizard-label">
                    <span>Sơ đồ khán đài / Sơ đồ phân khu tĩnh (URL)</span>
                    <input
                      className="org-input"
                      value={formData.seatingMapUrl || ''}
                      onChange={(e) => updateField('seatingMapUrl', e.target.value)}
                      placeholder="https://example.com/seating-map.png"
                    />
                    <span className="org-label-hint">Ảnh minh họa vị trí các khán đài để khán giả chọn vé.</span>
                  </label>
                  {formData.seatingMapUrl && (
                    <div style={{marginTop: '10px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--org-border-default)'}}>
                      <img
                        src={formData.seatingMapUrl}
                        alt="Sơ đồ khán đài"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        onLoad={(e) => (e.currentTarget.style.display = 'block')}
                        style={{maxHeight: '160px', width: '100%', objectFit: 'contain'}}
                      />
                    </div>
                  )}
                </div>
              </div>

              <label className="org-label wizard-label">
                <span>Video giới thiệu sự kiện (YouTube Trailer URL)</span>
                <input
                  className="org-input"
                  value={formData.trailerUrl || ''}
                  onChange={(e) => updateField('trailerUrl', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <span className="org-label-hint">Khán giả có thể xem trực tiếp video teaser trước khi mua vé.</span>
              </label>

              {/* REPEATABLE SECTION: Nghệ sĩ biểu diễn (Artist Lineup) */}
              <div style={{marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--org-border-default)'}}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc'}}>
                      Dàn nghệ sĩ biểu diễn (Artist Lineup) {(formData.artists || []).length > 0 ? `(${formData.artists?.length})` : ''}
                    </h4>
                    <span style={{fontSize: '12px', color: 'var(--org-text-muted)'}}>
                      Tùy chọn. Hiển thị dàn nghệ sĩ khách mời trên trang sự kiện tương tự Super Concert.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="org-btn org-btn-secondary wizard-secondary-btn"
                    onClick={addArtistItem}
                    style={{minHeight: '44px', padding: '0 16px', fontSize: '13px'}}
                  >
                    <IconPlus size={15} />
                    <span>Thêm nghệ sĩ</span>
                  </button>
                </div>

                {(!formData.artists || formData.artists.length === 0) ? (
                  <div className="org-wizard-empty-box">
                    <IconBuilding size={32} style={{color: 'var(--org-text-muted)', marginBottom: '12px'}} />
                    <h5 style={{margin: '0 0 6px', fontSize: '15px', color: '#f8fafc', fontWeight: 600}}>
                      Chưa có nghệ sĩ nào trong danh sách
                    </h5>
                    <p style={{margin: '0 auto 16px', maxWidth: '440px', fontSize: '13px', color: 'var(--org-text-muted)', lineHeight: 1.5}}>
                      Danh sách nghệ sĩ là tùy chọn. Đối với các concert ca nhạc, festival hay kịch nói, dàn nghệ sĩ giúp thu hút khán giả đặt vé ngay từ cái nhìn đầu tiên.
                    </p>
                    <button
                      type="button"
                      className="org-btn org-btn-secondary"
                      onClick={addArtistItem}
                      style={{minHeight: '44px', padding: '0 18px', fontSize: '13px'}}
                    >
                      <IconPlus size={15} />
                      <span>+ Thêm nghệ sĩ đầu tiên</span>
                    </button>
                  </div>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
                    {formData.artists.map((artist, aIdx) => {
                      const isImageInvalid = Boolean(artist.imageUrl && !isValidHttpsUrl(artist.imageUrl));
                      return (
                        <div key={aIdx} className="org-wizard-item-card wizard-card-item">
                          <div className="org-wizard-item-card-header wizard-card-header">
                            <div className="org-wizard-item-card-title">
                              <span className="org-item-order-badge">#{artist.order || aIdx + 1}</span>
                              {artist.imageUrl && !isImageInvalid && (
                                <img
                                  src={artist.imageUrl}
                                  alt={artist.name || 'Ảnh nghệ sĩ'}
                                  className="org-artist-preview-thumb"
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                  onLoad={(e) => (e.currentTarget.style.display = 'inline-block')}
                                  style={{width: '32px', height: '32px', borderRadius: '50%'}}
                                />
                              )}
                              <span>{artist.name ? artist.name : `Nghệ sĩ #${aIdx + 1}`}</span>
                              {artist.role && (
                                <span style={{fontSize: '12px', color: 'var(--org-text-muted)', marginLeft: '6px'}}>
                                  ({artist.role})
                                </span>
                              )}
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                              <button
                                type="button"
                                className="org-reorder-btn"
                                onClick={() => moveArtistItem(aIdx, 'up')}
                                disabled={aIdx === 0}
                                title="Di chuyển lên"
                                aria-label={`Di chuyển nghệ sĩ ${aIdx + 1} lên`}
                              >
                                <IconArrowUp size={16} />
                              </button>
                              <button
                                type="button"
                                className="org-reorder-btn"
                                onClick={() => moveArtistItem(aIdx, 'down')}
                                disabled={aIdx === (formData.artists?.length || 0) - 1}
                                title="Di chuyển xuống"
                                aria-label={`Di chuyển nghệ sĩ ${aIdx + 1} xuống`}
                              >
                                <IconArrowDown size={16} />
                              </button>
                              <button
                                type="button"
                                className="org-btn org-btn-danger wizard-delete-btn"
                                onClick={() => removeArtistItem(aIdx)}
                                style={{minHeight: '44px', minWidth: '44px', padding: '0 12px', fontSize: '13px'}}
                                title="Xóa nghệ sĩ này"
                                aria-label={`Xóa nghệ sĩ ${aIdx + 1}`}
                              >
                                <IconTrash size={14} />
                                <span>Xóa</span>
                              </button>
                            </div>
                          </div>

                          <div className="org-grid-3 wizard-grid-3">
                            <label className="org-label wizard-label">
                              <span>
                                Nghệ danh / Tên hiển thị <span className="org-label-required">*</span>
                              </span>
                              <input
                                className="org-input"
                                value={artist.name}
                                onChange={(e) => updateArtistItem(aIdx, {name: e.target.value})}
                                placeholder="Ví dụ: Sơn Tùng M-TP / Suboi"
                                required
                              />
                              {!artist.name && (
                                <span className="org-field-error">Vui lòng nhập tên nghệ sĩ.</span>
                              )}
                            </label>

                            <label className="org-label wizard-label">
                              <span>Tên thật nghệ sĩ</span>
                              <input
                                className="org-input"
                                value={artist.realName || ''}
                                onChange={(e) => updateArtistItem(aIdx, {realName: e.target.value})}
                                placeholder="Ví dụ: Nguyễn Thanh Tùng"
                              />
                            </label>

                            <label className="org-label wizard-label">
                              <span>Vai trò / Dòng nhạc</span>
                              <input
                                className="org-input"
                                value={artist.role || ''}
                                onChange={(e) => updateArtistItem(aIdx, {role: e.target.value})}
                                placeholder="Ví dụ: Headliner Stage / Pop / R&B"
                              />
                            </label>
                          </div>

                          <div className="org-grid-2 wizard-grid-2">
                            <div>
                              <label className="org-label wizard-label">
                                <span>Ảnh đại diện (URL HTTPS)</span>
                                <input
                                  className="org-input"
                                  value={artist.imageUrl || ''}
                                  onChange={(e) => updateArtistItem(aIdx, {imageUrl: e.target.value})}
                                  placeholder="https://example.com/artist.jpg"
                                />
                                {isImageInvalid && (
                                  <span className="org-field-error">Ảnh phải là đường dẫn HTTPS hợp lệ.</span>
                                )}
                              </label>
                              {artist.imageUrl && !isImageInvalid && (
                                <div style={{marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                                  <img
                                    src={artist.imageUrl}
                                    alt="Ảnh xem trước"
                                    className="org-artist-preview-thumb"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                    onLoad={(e) => (e.currentTarget.style.display = 'block')}
                                  />
                                  <span style={{fontSize: '12px', color: 'var(--org-text-muted)'}}>Ảnh xem trước</span>
                                </div>
                              )}
                            </div>

                            <label className="org-label wizard-label">
                              <span>Thứ tự hiển thị</span>
                              <input
                                className="org-input"
                                type="number"
                                min="1"
                                value={artist.order ?? aIdx + 1}
                                onChange={(e) => updateArtistItem(aIdx, {order: Number(e.target.value)})}
                              />
                              <span className="org-label-hint">Nghệ sĩ có số nhỏ hơn sẽ được xếp trước trên lineup.</span>
                            </label>
                          </div>

                          <label className="org-label wizard-label" style={{marginTop: '4px'}}>
                            <span>Tiểu sử / Giới thiệu ngắn</span>
                            <textarea
                              className="org-textarea"
                              value={artist.bio || ''}
                              onChange={(e) => updateArtistItem(aIdx, {bio: e.target.value})}
                              placeholder="Tóm tắt phong cách trình diễn, thành tựu âm nhạc hoặc lời nhắn tới người hâm mộ..."
                              rows={2}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Policy & Contacts */}
          {step === 5 && (
            <div className="wizard-form-section">
              <div className="org-wizard-section-intro wizard-section-intro">
                <h3 className="org-wizard-section-title">Bước 5: Quy định & Thông tin Liên hệ</h3>
                <p className="org-wizard-section-subtitle">
                  Thiết lập chính sách độ tuổi, hoàn hủy vé và thông tin hỗ trợ người tham dự.
                </p>
              </div>

              <div className="org-grid-2 wizard-grid-2">
                <label className="org-label wizard-label">
                  <span>Quy định độ tuổi</span>
                  <select
                    className="org-select"
                    value={formData.ageRestriction || '14+'}
                    onChange={(e) => updateField('ageRestriction', e.target.value)}
                  >
                    <option value="Tất cả độ tuổi">Tất cả độ tuổi</option>
                    <option value="12+">12+ (Trẻ em cần người giám hộ)</option>
                    <option value="14+">14+ (Khuyến nghị)</option>
                    <option value="16+">16+</option>
                    <option value="18+">18+ (Có kiểm tra CCCD)</option>
                  </select>
                </label>

                <label className="org-label wizard-label">
                  <span>Số giấy phép biểu diễn / Văn bản chấp thuận</span>
                  <input
                    className="org-input"
                    value={formData.permitNumber || ''}
                    onChange={(e) => updateField('permitNumber', e.target.value)}
                    placeholder="Ví dụ: 124/GP-SVHTT ngày 15/09/2026"
                  />
                  <span className="org-label-hint">Cần thiết cho các sự kiện biểu diễn văn hóa nghệ thuật.</span>
                </label>
              </div>

              <div className="org-grid-2 wizard-grid-2">
                <label className="org-label wizard-label">
                  <span>
                    Email hỗ trợ khán giả <span className="org-label-required">*</span>
                  </span>
                  <input
                    className="org-input"
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => updateField('contactEmail', e.target.value)}
                    placeholder="support@eventname.vn"
                    required
                  />
                  <span className="org-label-hint">Bắt buộc để giải đáp thắc mắc về đơn hàng và vé.</span>
                </label>

                <label className="org-label wizard-label">
                  <span>
                    Hotline hỗ trợ <span className="org-label-required">*</span>
                  </span>
                  <input
                    className="org-input"
                    value={formData.contactHotline || ''}
                    onChange={(e) => updateField('contactHotline', e.target.value)}
                    placeholder="0912345678 hoặc 1900 xxxx"
                    required
                  />
                  <span className="org-label-hint">Số điện thoại hỗ trợ khán giả tại Việt Nam.</span>
                </label>
              </div>

              <div style={{marginBottom: '16px'}}>
                <label className="org-label wizard-label">
                  <span>Kênh thông tin chính thức (Fanpage / Website)</span>
                  <input
                    className="org-input"
                    value={formData.fanpageUrl || ''}
                    onChange={(e) => updateField('fanpageUrl', e.target.value)}
                    placeholder="https://facebook.com/eventfanpage"
                  />
                </label>
              </div>

              <div style={{marginBottom: '16px'}}>
                <label className="org-label wizard-label">
                  <span>
                    Chính sách hoàn / hủy vé <span className="org-label-required">*</span>
                  </span>
                  <textarea
                    className="org-textarea"
                    rows={3}
                    value={formData.refundPolicy || ''}
                    onChange={(e) => updateField('refundPolicy', e.target.value)}
                    placeholder="Nêu rõ điều kiện hoàn vé (ví dụ: Vé đã mua không được hoàn trả sau khi thanh toán; hoặc hoàn 100% nếu sự kiện bị hoãn/hủy)."
                    required
                  />
                  <span className="org-label-hint">Tối thiểu 10 ký tự.</span>
                </label>
              </div>

              <label className="org-label wizard-label">
                <span>Quy định tham gia sự kiện</span>
                <textarea
                  className="org-textarea"
                  rows={4}
                  value={formData.termsAndConditions || ''}
                  onChange={(e) => updateField('termsAndConditions', e.target.value)}
                  placeholder="Danh sách vật dụng cấm mang vào sân khấu, quy định về trang phục, chụp ảnh chuyên nghiệp và an ninh check-in…"
                />
              </label>
            </div>
          )}

          {/* STEP 6: Pre-flight Checklist */}
          {step === 6 && (
            <div className="wizard-form-section">
              <div className="org-wizard-section-intro wizard-section-intro">
                <h3 className="org-wizard-section-title">Bước 6: Kiểm tra trước xuất bản (Pre-flight Checklist)</h3>
                <p className="org-wizard-section-subtitle">
                  Kiểm tra tính sẵn sàng trước khi sự kiện chính thức xuất hiện trên marketplace.
                </p>
              </div>

              {/* Metric Summary */}
              <div className="org-stats-grid wizard-summary-stats" style={{marginBottom: '20px'}}>
                <div className="org-stat-card wizard-summary-stat">
                  <span className="org-stat-title">Số suất diễn</span>
                  <div className="org-stat-value">{formData.shows.length}</div>
                </div>

                <div className="org-stat-card wizard-summary-stat">
                  <span className="org-stat-title">Tổng số vé</span>
                  <div className="org-stat-value">
                    {formData.shows.reduce(
                      (acc, s) =>
                        acc + s.ticketTiers.reduce((tAcc, t) => tAcc + (Number(t.capacity) || 0), 0),
                      0,
                    )}
                  </div>
                </div>

                <div className="org-stat-card wizard-summary-stat">
                  <span className="org-stat-title">Lịch trình</span>
                  <div className="org-stat-value">{(formData.schedule || []).length} mục</div>
                </div>

                <div className="org-stat-card wizard-summary-stat">
                  <span className="org-stat-title">Dàn nghệ sĩ</span>
                  <div className="org-stat-value">{(formData.artists || []).length} người</div>
                </div>

                <div className="org-stat-card wizard-summary-stat">
                  <span className="org-stat-title">Hình thức</span>
                  <div style={{fontSize: '18px', fontWeight: 800, color: 'var(--org-text-primary)', marginTop: '8px'}}>
                    {locationModeLabels[formData.locationMode] || formData.locationMode}
                  </div>
                </div>

                <div className="org-stat-card wizard-summary-stat">
                  <span className="org-stat-title">Trạng thái kiểm tra</span>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: readiness.isReady ? '#86efac' : '#fca5a5',
                      marginTop: '8px',
                    }}
                  >
                    {readiness.isReady ? 'Đủ điều kiện công bố' : `Còn ${readiness.blockers.length} tiêu chí`}
                  </div>
                </div>
              </div>

              {/* Commercial Lock Advisory */}
              <div className="org-alert org-alert-info" role="note" style={{marginBottom: '24px'}}>
                <IconShield className="org-alert-icon" size={18} />
                <div className="org-alert-body">
                  <strong>Chính sách lưu dữ liệu & Khóa thương mại:</strong>
                  <p style={{margin: '4px 0 0', lineHeight: 1.5}}>
                    Ở trạng thái bản nháp (Draft), hệ thống cho phép chỉnh sửa và xóa linh hoạt. Tuy nhiên, một khi sự kiện đã xuất bản (Published) và phát sinh giao dịch hoặc giữ chỗ thành công, các trường thương mại (giờ bắt đầu suất diễn, giá vé, sức chứa tối thiểu, và xóa phân khu có giao dịch) sẽ bị khóa chặt bởi các quy tắc an toàn backend. Không phải mọi trường dữ liệu đều có thể lưu đè sau khi đã mở bán.
                  </p>
                </div>
              </div>

              {/* Traffic Light Checklist */}
              <div className="wizard-checklist-container">
                <h4 style={{margin: '0 0 12px', fontSize: '15px', color: '#f8fafc', fontWeight: 700}}>
                  Bảng tiêu chí sẵn sàng xuất bản:
                </h4>

                <div className="org-checklist-grid">
                  {/* Blockers */}
                  {readiness.blockers.map((blocker, bIdx) => (
                    <div key={bIdx} className="org-checklist-item org-checklist-item-blocker checklist-item checklist-item--blocker">
                      <div className="org-checklist-item-icon">
                        <IconClose size={16} />
                      </div>
                      <div className="org-checklist-item-content">
                        <h4>Bắt buộc để công bố:</h4>
                        <p>{blocker.message}</p>
                      </div>
                    </div>
                  ))}

                  {/* Warnings */}
                  {readiness.warnings.map((warn, wIdx) => (
                    <div key={wIdx} className="org-checklist-item org-checklist-item-warning checklist-item checklist-item--warning">
                      <div className="org-checklist-item-icon">
                        <IconAlertTriangle size={16} />
                      </div>
                      <div className="org-checklist-item-content">
                        <h4>Khuyến nghị hoàn thiện:</h4>
                        <p>{warn.message}</p>
                      </div>
                    </div>
                  ))}

                  {/* Passes */}
                  {readiness.isReady && (
                    <div className="org-checklist-item org-checklist-item-pass checklist-item checklist-item--pass">
                      <div className="org-checklist-item-icon">
                        <IconCheck size={16} />
                      </div>
                      <div className="org-checklist-item-content">
                        <h4>Tất cả tiêu chí bắt buộc đã hoàn tất!</h4>
                        <p>Sự kiện đã đầy đủ thông tin địa điểm, suất diễn, phân khu vé và phương thức liên hệ.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation */}
        <footer className="org-wizard-footer wizard-modal-footer">
          <div className="org-wizard-footer-left">
            <button
              type="button"
              className="org-btn org-btn-secondary wizard-secondary-btn"
              onClick={handleSaveDraft}
              disabled={busyDraft || busyPublish || !canEdit}
            >
              {busyDraft ? (
                <>
                  <IconSpinner size={14} />
                  <span>Đang lưu…</span>
                </>
              ) : (
                <>
                  <IconSave size={14} />
                  <span>Lưu bản nháp</span>
                </>
              )}
            </button>

            {formData.slug && (
              <a
                href={buildPublicPath(window.location.pathname, `events/${deduplicateSlug(formData.slug)}?preview=1`)}
                target="_blank"
                rel="noreferrer"
                className="org-event-btn-preview"
                title="Mở trang xem trước trong tab mới"
              >
                <span>Xem trước sự kiện</span>
                <IconExternalLink size={13} />
              </a>
            )}

            <span style={{fontSize: '11px', color: 'var(--org-text-muted)'}}>
              * Sau khi bán vé, giá và giờ diễn sẽ bị khóa an toàn backend.
            </span>
          </div>

          <div className="org-wizard-footer-right">
            {step > 1 && (
              <button
                type="button"
                className="org-btn org-btn-secondary wizard-secondary-btn"
                onClick={() => setStep(step - 1)}
                disabled={busyDraft || busyPublish}
              >
                <IconArrowLeft size={16} />
                <span>Quay lại</span>
              </button>
            )}

            {step < 6 ? (
              <button
                type="button"
                className="org-btn org-btn-primary organizer-primary"
                onClick={() => setStep(step + 1)}
                disabled={busyDraft || busyPublish}
              >
                <span>Tiếp theo</span>
                <IconArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="org-btn org-btn-primary organizer-primary"
                onClick={handlePublish}
                disabled={!readiness.isReady || busyPublish || busyDraft || !canEdit}
                style={{
                  backgroundColor: readiness.isReady ? 'var(--org-lime)' : '#334155',
                  color: readiness.isReady ? '#000' : '#94a3b8',
                  borderColor: readiness.isReady ? 'var(--org-lime)' : '#334155',
                  cursor: readiness.isReady ? 'pointer' : 'not-allowed',
                }}
                title={!readiness.isReady ? 'Cần khắc phục tất cả blocker trước khi công bố' : undefined}
              >
                {busyPublish ? (
                  <>
                    <IconSpinner size={16} />
                    <span>Đang công bố sự kiện…</span>
                  </>
                ) : (
                  <>
                    <IconPublish size={16} />
                    <span>Công bố sự kiện ngay</span>
                  </>
                )}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
