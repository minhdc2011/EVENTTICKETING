import {useState, type FormEvent} from 'react';
import {IconBuilding, IconPlus, IconSpinner} from './OrganizerIcons';

const toSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

type OrganizerOnboardingProps = {
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void> | void;
  isBusy: boolean;
};

export function OrganizerOnboarding({onSubmit, isBusy}: OrganizerOnboardingProps) {
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  function handleNameBlur() {
    if (!orgSlug && orgName) {
      setOrgSlug(toSlug(orgName));
    }
  }

  return (
    <div style={{maxWidth: '560px', margin: '40px auto 0'}} className="organizer-onboarding-wrapper">
      <form className="org-auth-card organizer-onboarding" onSubmit={onSubmit}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px'}}>
          <div className="org-sidebar-org-avatar" style={{width: '42px', height: '42px'}}>
            <IconBuilding size={20} />
          </div>
          <div>
            <span className="org-main-eyebrow" style={{display: 'block', margin: 0}}>
              BƯỚC KHỞI TẠO KHÔNG GIAN
            </span>
            <h2 style={{fontSize: '22px', fontWeight: 800, margin: '2px 0 0', color: 'var(--org-text-primary)'}}>
              Tạo tổ chức đầu tiên của bạn
            </h2>
          </div>
        </div>

        <p style={{fontSize: '14px', color: 'var(--org-text-secondary)', lineHeight: 1.5, marginBottom: '24px'}}>
          Mỗi sự kiện được phát hành trên hệ thống phải thuộc về một tổ chức đại diện pháp lý và sở hữu tài khoản ngân hàng nhận tiền vé.
        </p>

        <div style={{display: 'flex', flexDirection: 'column', gap: '18px'}}>
          <label className="org-label">
            <span>
              Tên tổ chức <span className="org-label-required">*</span>
            </span>
            <input
              className="org-input"
              name="name"
              required
              minLength={3}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Ví dụ: FTU Entertainment Lab"
            />
            <span className="org-label-hint">Tối thiểu 3 ký tự. Tên sẽ hiển thị trên vé và trang sự kiện.</span>
          </label>

          <label className="org-label">
            <span>
              Đường dẫn định danh (Slug) <span className="org-label-required">*</span>
            </span>
            <input
              className="org-input"
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={orgSlug}
              onChange={(e) => setOrgSlug(toSlug(e.target.value))}
              placeholder="ftu-entertainment-lab"
            />
            <span className="org-label-hint">
              Chỉ bao gồm chữ thường không dấu và gạch ngang. Dùng cho đường dẫn của tổ chức.
            </span>
          </label>

          <button
            type="submit"
            className="org-btn org-btn-primary"
            disabled={isBusy}
            style={{marginTop: '10px'}}
          >
            {isBusy ? (
              <>
                <IconSpinner size={16} />
                <span>Đang tạo tổ chức…</span>
              </>
            ) : (
              <>
                <IconPlus size={16} />
                <span>Tạo tổ chức & Bắt đầu làm việc</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
