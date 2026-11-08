# BÁO CÁO RÀ SOÁT UI/UX (đối chiếu mã hiện tại)

Phạm vi: accessibility, hiệu năng, theme, responsive, tính nhất quán triển khai (theo nhóm kiểm tra Impeccable).
Phương pháp: **chỉ đọc mã tĩnh** (JSX/CSS), đối chiếu từng nhận định của báo cáo cũ với mã hiện tại.

## 0. Giới hạn xác minh (bắt buộc đọc)

- **ĐÃ làm:** đọc trực tiếp mã nguồn, so thứ tự import, độ đặc hiệu selector, thứ tự khai báo trong cùng tệp.
- **ĐÃ đọc trong lượt này:** `src/components/organizer-ui/` (`OrganizerSidebar`, `OrganizerStatsCards`, `OrganizerTopBar`, `OrganizerEventCard`, `OrganizerEmptyState`, `OrganizerOnboarding`, các đoạn stepper/ô màu của `OrganizerEventWizard`), `src/components/site/` (`GlobalHeader`, `SearchBlock`, `FeaturedEvent`, `EventRow`, `NotFoundPage`, `ArtistFilter`), `src/components/event-template/` (`EventHero`, `ShowSwitcher`, `ArtistLineupSection`, `EventTemplate.tsx:205-216`), `src/components/EventCatalog.tsx:210-290`, `src/App.tsx:1-20`, `src/main.tsx`, các đoạn CSS liên quan của `src/index.css`, `organizer-ui.css`, `organizer-skin.css`, `event-template.css`, `ArtistLineupSection.css`.
- **Tên tệp khác với đề bài:** `HeroSection.tsx` thực tế là `src/components/event-template/EventHero.tsx`; `OrganizerOnboardingForm.tsx` thực tế là `OrganizerOnboarding.tsx`; **không tìm thấy** tệp `BookingSidebar*` nào trong `src/` (glob không khớp) nên không có kết luận về nó.
- **CHƯA làm:** chạy ứng dụng, chụp screenshot, thử cảm ứng/bàn phím trên thiết bị thật, đo kích thước vùng chạm thực tế, tính tỷ lệ tương phản bằng trình duyệt, build CSS, chạy trình quét tự động. Mọi câu về "hiển thị như thế nào" là **suy luận từ cascade**. Các mục chưa chứng minh được nằm ở Mục 5, **không** gắn mức P1/P2/P3.

## 1. Cascade thực tế (nền để đánh giá lại các lỗi cũ)

- `src/main.tsx:2-4`: `App` được import **trước** `./index.css` → `OrganizerPortal.tsx:37-38` kéo `organizer-ui.css` rồi `organizer-skin.css` vào trước, `index.css` đứng sau. Với rule cùng độ đặc hiệu, `index.css` thắng.
- `OrganizerPortal.tsx:170` bọc portal trong `.organizer-shell`; `organizer-skin.css` viết lại phần lớn rule với tiền tố `.organizer-shell …` (0,2,0+) nên thắng `index.css` bất kể thứ tự. Phần lớn lỗi "chữ tàng hình" cũ đã được vá bằng ghi đè.
- **Lưu ý còn thiếu ở báo cáo trước:** override trong skin chỉ che các thuộc tính nó khai báo. Rule legacy trong `index.css` có độ đặc hiệu cao hơn rule `org-*` một class (ví dụ `.organizer-layout > aside > div` = 0,1,2 so với `.org-sidebar-mobile-top` = 0,1,0) vẫn thắng các thuộc tính mà skin không đụng tới → xem F22/F23.
- Hai khối reduced-motion toàn cục cùng nằm ở import cấp cao nhất, độc lập nhau: `src/App.tsx:4` import tĩnh `./components/event-template/event-template.css` (khối `@media (prefers-reduced-motion: reduce)` ở `:1689-1697`) và `src/App.tsx:5` import tĩnh `OrganizerPortal` ⇒ `organizer-ui.css` (khối `:1857-1866`). Cả hai nằm trong bundle chính, áp cho mọi trang → xem F15.

## 2. Phát hiện cũ đã được SỬA / GIẢM NHẸ / KHÔNG CÒN CĂN CỨ

| # | Nhận định cũ | Trạng thái | Bằng chứng trong mã hiện tại |
|---|---|---|---|
| A1 | Focus ô nhập đổi chữ thành trắng trên nền trắng (`.organizer-auth input`) | ✅ ĐÃ SỬA | `src/components/organizer-ui/organizer-skin.css:181-206` ép `background #fff`, `color var(--org-text-primary)`, `caret-color`; `:focus` (0,3,0) giữ nền/chữ; autofill `:207-213`. |
| A2 | Inline `color:'#fff'` trên card phiên đăng nhập | ✅ ĐÃ SỬA | `OrganizerAuthView.tsx:98-118` dùng class `org-auth-session-*`; grep `color: '#fff'`/`'#f8fafc'` trong `src/components` không còn kết quả. |
| A3 | Hero h1 `line-height .92`, `letter-spacing -.07em` dính dấu tiếng Việt | ✅ ĐÃ SỬA (suy luận từ cascade) | `organizer-skin.css:142-148` đặt `line-height 1.12`, `-0.02em`; rule cũ `src/index.css:4266-4270` (0,1,2) bị 0,2,0 thắng. Chưa xem render. |
| A4 | Form tối lồng trong card trắng | ✅ ĐÃ SỬA | `organizer-skin.css:165-171` đưa `.organizer-auth form`/`.organizer-onboarding` về `transparent`. |
| A5 | Tab xác thực gạch lime trên nền trắng, label xám nhạt | ✅ ĐÃ SỬA | `organizer-skin.css:158-164` (tab xanh `--et-blue`), `:172-180`. |
| A6 | Lưới 2 cột `1fr 480px` bóp hero ở 901–1024px | ⚠️ GIẢM NHẸ Ở DESKTOP / CHƯA XÁC MINH RENDER · phần breakpoint → **F28** | Giá trị gốc: `src/index.css:4256-4263` (`.organizer-auth`): `grid-template-columns: 1fr 480px; gap: 70px; width: min(1180px, calc(100% - 40px))`; `src/components/organizer-ui/organizer-ui.css:821-830` (`.org-auth-container`): `grid-template-columns: 1fr 480px; gap: 60px; max-width: 1200px`. Skin `src/components/organizer-ui/organizer-skin.css:137-141` (`.organizer-shell .organizer-auth`, 0,2,0) giảm xuống `width: min(1040px, calc(100% - 32px)); gap: 48px; grid-template-columns: 1fr minmax(0, 440px)` (cột phải `480px` → `minmax(0, 440px)`, `gap` `70px`/`60px` → `48px`). Trong `@media (max-width: 480px)` tại `organizer-skin.css:580-595`, skin chỉ chỉnh `.organizer-shell .org-topbar`, `.organizer-shell .org-topbar-actions`, `.organizer-shell .org-topbar-back-link`, `.organizer-shell .org-topbar-actions .org-btn`, không đụng lưới auth. Hero ở 901–1024px còn bị co thắt thực tế hay không **không kết luận được nếu không render thật** (→ Mục 5). Việc breakpoint một cột ≤1024px/≤900px bị vô hiệu hóa là phát hiện còn hiệu lực riêng → **F28**. |
| A7 | Thông báo xác thực email mất do `await onChanged()` sau đăng ký | ✅ ĐÃ SỬA | `OrganizerAuthView.tsx:69-85`: nhánh đăng ký không gọi `onChanged()`; chỉ nhánh đăng nhập gọi (`:66`). |
| A8 | Tiêu đề wizard `.wizard-section-intro h3` màu `#f8fafc` trên nền trắng | ✅ ĐÃ SỬA | `src/index.css:5446-5450` vẫn sáng nhưng bị `organizer-skin.css:309-312` thắng. |
| A9 | Label/Input wizard xám nhạt hoặc đen-trên-trắng | ✅ ĐÃ SỬA | `organizer-skin.css:317-341` (`.wizard-label` → `--org-text-primary`; input/select/textarea nền `#fff`, viền `#94a3b8`, `min-height 44px`, focus ring xanh). Rule gốc `src/index.css:5456-5479` (nền `#050706`, chữ `#fff`) bị thắng bởi 0,2,1 > 0,1,1. |
| A10 | Thẻ thống kê bước 6 "đen trên đen" + lưới 4 cột | ✅ ĐÃ SỬA (màu) · lưới đã có breakpoint | Màu: `organizer-skin.css:351-358` (`.wizard-summary-stat` nền `#fff`), `:374-379` (span `--org-text-secondary`, strong `--org-text-primary`) thắng `src/index.css:5582-5599` (nền `#080a09`, strong `#f8fafc`). Lưới: `src/index.css:5576-5579` `repeat(4, 1fr)`; gập về 1 cột tại `@media (max-width: 768px)` (`src/index.css:5661-5664`, chung với `.wizard-grid-2/-3`). Skin **không** đụng `grid-template-columns` (chỉ màu), và không có media nào khác trong skin/`organizer-ui.css` đổi số cột của `.wizard-summary-stats` ⇒ cascade đầy đủ: 4 cột khi >768px, 1 cột khi ≤768px. F6 cũ không còn là lỗi; kiểm tra render ở 769–900px chuyển sang Mục 5. |
| A11 | Alert warning/info chữ vàng/xanh nhạt trên nền sáng | ✅ ĐÃ SỬA | `organizer-skin.css:446-462` ép màu chữ theo trạng thái; token trạng thái tối ở `:31-42`. |
| A12 | `.organizer-message` chữ vàng nhạt `#fde68a` trên nền sáng | ✅ ĐÃ SỬA phần tương phản (còn lệch ngữ nghĩa → **F7**) | `organizer-skin.css:224-228` chuyển sang `--org-status-warning` trên nền kem. |
| A13 | Chữ số "Đã công bố"/"Bản nháp" nhạt trên card trắng | ✅ ĐÃ SỬA | Số thống kê: `src/components/organizer-ui/OrganizerStatsCards.tsx:30` (`style={{color: 'var(--org-status-success)'}}` trên `.org-stat-value`) và `:39` (`var(--org-status-warning)`); icon cùng token ở `:28`, `:37`. Inline style thắng `.org-stat-value { color: #0f172a }` (`organizer-ui.css:645-650`). Token đã được skin làm đậm: `organizer-skin.css:31` (`--org-status-success: #0b6b3a`), `:34` (`--org-status-warning: #7a4a00`) thay cho `#22c55e`/`#f59e0b` ở `organizer-ui.css:29,33`. Chip trạng thái ở thẻ sự kiện: `organizer-skin.css:540-549` (dùng ở `OrganizerEventCard.tsx:60-62`). Tương phản thực tế chưa đo. |
| A14 | Mobile sticky bar: giá đè lên nút | ✅ ĐÃ SỬA (suy luận) | `src/components/event-template/event-template.css:1299-1320`, `:1330-1337`, `:1364-1386`, `:1410-1414`. Chưa thử trên 390–414px thật. |
| A15 | Sơ đồ ghế bị bóp ~1024px do 2 tầng cột | ⚠️ KHÔNG ĐỦ BẰNG CHỨNG | `SeatMapSection.css:97-102` (`minmax(0,1fr) minmax(320px,360px)`), gập ≤850px (`:1169`); `.et-main` 1 cột (`event-template.css:723-731`), gập ≤1023px (`:1568`). Chuyển sang Mục 5. |
| A16 | Sidebar `margin-top:auto` lệch bố cục (`.organizer-layout > aside > div`) | ❌ **VẪN CÒN HIỆU LỰC** (dưới dạng va chạm CSS) → **F22, F23** | DOM thực: `OrganizerPortal.tsx:328` `div.org-layout.organizer-layout` > `OrganizerSidebar.tsx:28` `aside.org-sidebar` > hai `div` (`.org-sidebar-mobile-top` `:29`, `.org-sidebar-mobile-bottom` `:95`). Hai `div` này khớp `src/index.css:4466-4472`; skin chỉ ghi đè `grid-template-columns` của chúng (`organizer-skin.css:607-609`), không ghi đè `display`, `margin-top`, `padding-top`, `border-top`, `gap`. |
| A17 | "Tên bước ellipsis không hoạt động" · "ô màu hạng vé tràn lưới" | ⚠️ **KHÔNG CÓ CĂN CỨ** cho cả hai như đã phát biểu | (a) Ellipsis: `OrganizerEventWizard.tsx:491` gắn `.wizard-step-label`; `src/index.css:5430-5434` đặt `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, skin chỉ đổi màu (`organizer-skin.css:472-474`) ⇒ cơ chế ellipsis **đang có**; nút có `min-width:140px` (`index.css:5383`, `organizer-ui.css:1195`) và skin đặt `flex-shrink:0` + stepper `overflow-x:auto` (`organizer-skin.css:519-526`). Việc nhãn có bị cắt hay không phụ thuộc kích thước thật → Mục 5. (b) Ô màu: `OrganizerEventWizard.tsx:1259-1275`, `<input type="color">` rộng 44px inline (`:1266`) cạnh `.org-input` (`width:100%`, `organizer-ui.css:253`) trong `div` flex inline (`:1261`), nằm trong `.wizard-grid-3` (`1fr 1fr 1fr`, `index.css:5490-5494`; 1 cột ≤768px, `:5661-5664`). Không có bằng chứng mã cho việc "tràn"; chỉ có khả năng ô màu bị co dưới 44px (Mục 5). Một lỗi mã khác, có thật, ở ô này → F25. |

## 3. Phát hiện CÒN HIỆU LỰC (đã xác nhận ở mức mã)

Mức độ: **P1** chặn/hại người dùng, **P2** ảnh hưởng đáng kể, **P3** nhỏ/nhất quán. Mỗi mục dưới đây là sự thật đọc từ mã; tác động mô tả hệ quả suy ra từ mã, **chưa kiểm chứng chạy thật**.

### Wizard Ban tổ chức (`src/components/organizer-ui/OrganizerEventWizard.tsx`)

**F1 — [P1][Accessibility/UX] Escape và nút đóng hủy dữ liệu chưa lưu, không xác nhận**
- Vị trí: `OrganizerEventWizard.tsx:83-89` (listener `window` `Escape` → `onClose()`), `:461-468` (nút đóng); `src/components/OrganizerPortal.tsx:432` (`onClose={() => setWizardAggregate(null)}` → unmount).
- Tác động: `formData` chỉ nằm trong `useState` (`:75`); Escape (kể cả khi đang gõ hoặc `busyDraft`/`busyPublish`) làm mất dữ liệu nhiều bước và có thể đóng giữa lúc lưu/công bố.
- Đề xuất nhỏ: so `formData` với `initialAggregate` (cờ `isDirty`); nếu dirty hoặc đang busy thì xác nhận trước `onClose`; bỏ qua Escape khi `busyDraft || busyPublish`; lưu id của `setTimeout(onClose,1200)` (`:406-408`) và clear khi unmount.
- Bằng chứng luồng: Portal → `setWizardAggregate(null)` → wizard unmount; không có `beforeunload`/localStorage.

**F2 — [P1][Accessibility] Dialog `aria-modal` nhưng không có focus trap, không trả focus, không khóa cuộn nền**
- Vị trí: `OrganizerEventWizard.tsx:421-427` (`role="dialog" aria-modal="true"`). Grep `useRef|focus(|inert|body.style|aria-hidden` trong tệp chỉ khớp 3 style overflow cục bộ (`:1378,1403,1427`).
- Tác động: Tab có thể đi ra dashboard phía sau; khi đóng, focus không về nút "Tạo sự kiện"; trang nền không bị khóa cuộn.
- Đề xuất nhỏ: focus vào tiêu đề/ô đầu khi mở; vòng Tab trong dialog; `document.body.style.overflow='hidden'` trong effect và khôi phục khi cleanup; lưu/trả `document.activeElement`. Hoặc dùng `<dialog>` + `showModal()`.
- Bằng chứng: không có `inert`/`aria-hidden` trên `.organizer-shell`.

**F3 — [P2][Responsive] Nút dài không xuống dòng (`.org-btn { white-space: nowrap }`)**
- Vị trí: `src/components/organizer-ui/organizer-ui.css:194`; nút "Sao chép phân khu của {tên suất} sang tất cả các suất diễn" (`OrganizerEventWizard.tsx:1111-1119`) và nút chọn suất "Suất #n: {tên} (k hạng vé)" (`:1099-1107`). `organizer-skin.css` chỉ đặt `min-height` cho `.org-btn` (`:532-536`), không đổi `white-space`.
- Chuỗi DOM/overflow: `<div className="org-wizard-window wizard-modal-window">` (`OrganizerEventWizard.tsx:428`) → `<div className="org-wizard-body wizard-modal-content">` (`:524`) → nút bước. `.org-wizard-window` (`organizer-ui.css:1091`) và `.wizard-modal-window` (`src/index.css:5325`) đặt `overflow:hidden`; nhưng vùng trung gian `.org-wizard-body` (`organizer-ui.css:1257-1262`) và `.wizard-modal-content` (`src/index.css:5436-5440`) đặt `overflow-y:auto` mà không khai báo `overflow-x` (`organizer-skin.css` không ghi đè), nên theo chuẩn CSS `overflow-x` được tính thành `auto`.
- Tác động (suy từ mã, chưa xác minh chạy thật): tên suất dài làm nút rộng hơn khung nội dung → nguy cơ tràn ngang hoặc phát sinh thanh cuộn ngang trên `.org-wizard-body.wizard-modal-content`. `overflow:hidden` của `.org-wizard-window` bên ngoài không đủ chứng minh nội dung bị cắt thay vì cuộn; hành vi thực tế xem Mục 5.
- Đề xuất: `.organizer-shell .org-wizard-window .org-btn { white-space: normal; text-align: left; max-width: 100%; }` hoặc modifier `.org-btn--wrap` chỉ cho hai nút trên.

**F4 — [P2][Responsive] Header thẻ suất/hoạt động/hạng/nghệ sĩ không wrap, thiếu `min-width:0`**
- Vị trí: `organizer-ui.css:1356-1363` (`.org-wizard-item-card-header`: `flex`, `space-between`, không `flex-wrap`/`gap`), `:1365-1372` (`-title`: không `min-width:0`/`overflow-wrap`); dùng tại `OrganizerEventWizard.tsx:769, 942, 1154, 1507`.
- Chuỗi DOM/overflow: header nằm trong `.org-wizard-body.wizard-modal-content` (`OrganizerEventWizard.tsx:524`, `overflow-y:auto` tại `organizer-ui.css:1257-1262` và `src/index.css:5436-5440`, `overflow-x` không khai báo → tính thành `auto`), bên trong `.org-wizard-window.wizard-modal-window` (`:428`, `overflow:hidden` tại `organizer-ui.css:1091`, `src/index.css:5325`).
- Tác động (suy từ mã, chưa xác minh chạy thật): tên dài hoặc không dấu cách đẩy cụm nút vượt chiều ngang → nguy cơ tràn ngang hoặc xuất hiện thanh cuộn ngang trên `.org-wizard-body`; không đủ bằng chứng để kết luận bị cắt (xem Mục 5).
- Đề xuất: `flex-wrap: wrap; gap: 12px` cho header; `min-width:0; overflow-wrap:anywhere` cho title.

**F5 — [P3][Nhất quán/Responsive] Modal mobile không full-screen như CSS mới định nghĩa**
- Vị trí: `organizer-ui.css:1798-1805` đặt `.org-wizard-window{max-height:100vh;border-radius:0}` và `.org-wizard-backdrop{padding:0}`; cùng phần tử còn mang `wizard-modal-window`/`wizard-modal-backdrop` (`OrganizerEventWizard.tsx:423,428`) và `src/index.css:5306-5328` (đứng sau, cùng độ đặc hiệu → thắng): `padding:20px`, `max-height:92vh`, `z-index:999`; `organizer-skin.css:242-248` đặt `border-radius: var(--org-radius-md)` (0,2,0) thắng `border-radius:0`.
- Tác động: trên màn hẹp modal vẫn có lề 20px, bo góc, cao 92vh; `z-index` 999 và 100 từ hai nguồn mâu thuẫn.
- Đề xuất: bỏ class `wizard-modal-*` khỏi hai phần tử (sau khi chuyển rule còn cần sang `org-*`) hoặc thêm override mobile `.organizer-shell .wizard-modal-window` trong skin.

### Xác thực và thông báo Ban tổ chức

**F7 — [P2][Theme/Nhất quán] `.organizer-message` ép nền/viền vàng lên mọi `org-alert-*`**
- Vị trí: `OrganizerAuthView.tsx:225` (`org-alert-success|danger organizer-message`), `OrganizerPortal.tsx:366` (`org-alert-danger|info organizer-message`); CSS `src/index.css:4390-4398` và `organizer-skin.css:224-228` (0,2,0, nền/viền/màu = warning).
- Cascade: nền/viền do `.organizer-message` (0,2,0) thắng `.org-alert-*` (`organizer-ui.css:348-370`, 0,1,0); màu chữ bị `organizer-skin.css:447-462` (cùng 0,2,0, đứng sau) đặt lại theo trạng thái. Suy ra: chữ xanh/đỏ/xanh dương trên nền kem vàng với viền vàng, tức thành công/lỗi/thông tin trông như cảnh báo.
- Đề xuất nhỏ (chỉ các phương án giải quyết đúng nguyên nhân): (a) bỏ class `organizer-message` khỏi `OrganizerAuthView.tsx:225` và `OrganizerPortal.tsx:366`; hoặc (b) viết đủ `background-color`/`border-color`/`color` theo từng trạng thái dưới `.organizer-shell .org-alert-{success,danger,warning,info}` trong `organizer-skin.css`.
- **Không** chỉ xóa khối `organizer-skin.css:224-228` khi `organizer-message` còn trong JSX: `src/index.css:4390-4398` (`.organizer-message`, nạp sau `organizer-ui.css`, cùng 0,1,0) vẫn thắng `.org-alert-*` (`organizer-ui.css:348-370`) và áp nền/viền cảnh báo tối (`src/index.css:4393-4394`: `border: 1px solid rgba(251, 191, 36, 0.35)`, `background: rgba(251, 191, 36, 0.08)`), nên vấn đề không được giải quyết.

**F8 — [P3][Nhất quán/Accessibility] Hai mẫu tương tác khác nhau cho cùng một ý định đăng nhập/đăng ký**
- Vị trí: `OrganizerAuthView.tsx:162-181` (`role="group"` + `aria-pressed`, nút `disabled={busy}`) so với `src/components/BuyerAuth.tsx:257-286` (`role="tablist"`/`tab`, `aria-selected`, `aria-controls`, roving `tabIndex`) và `:76-89` (mũi tên/Home/End).
- Sự thật mã: `group + aria-pressed` là mẫu hợp lệ (không sai chuẩn); form BTC không nằm trong `tabpanel` và form không có heading riêng đổi theo chế độ (trong form chỉ có `autoComplete` `:209`, thông báo quyền `:214-221` và nhãn nút submit `:249-253` đổi theo `mode`).
- Tác động có căn cứ (điều kiện: người dùng thao tác bằng bàn phím hoặc trình đọc màn hình ở cổng BTC `/organizer`, sau khi đã quen cổng khán giả `/login` hoặc `/account/login`, theo `src/domain/publicRoute.js:54-61`): (i) ở `BuyerAuth.tsx:257-286` + `:76-89` một lần Tab vào `tablist` rồi mũi tên/Home/End chuyển chế độ; ở `OrganizerAuthView.tsx:162-181` (`role="group"` + `aria-pressed`) không có xử lý phím mũi tên (không có `onKeyDown`), phải Tab qua từng nút — cùng cụm Đăng nhập/Đăng ký nhưng khác hành vi bàn phím giữa hai cổng. (ii) `BuyerAuth.tsx:289-291` có `<h1 id="auth-title" className="et-auth__title">` và `<p className="et-auth__sub">` (`:292-296`) đổi theo `mode` trong `tabpanel`; `OrganizerAuthView.tsx:183-259` thiếu heading riêng đổi theo `mode` — `<label>` Email/Mật khẩu giữ nguyên ở hai chế độ, chỉ có `autoComplete` (`:209`), thông báo quyền (`:214-221`) và nhãn nút submit cuối form (`:249-253`) đổi theo `mode`, cùng `aria-pressed` trên nút chọn chế độ (`:162-181`) (kết luận đọc mã, chưa kiểm chứng bằng trình đọc màn hình thật).
- Đề xuất nhỏ: giữ `aria-pressed`; tối thiểu thêm heading đổi theo `mode` phía trên form (chọn cấp heading phù hợp cấu trúc trang BTC), hoặc dùng lại `handleTabKeyDown` nếu muốn thống nhất tablist.

**F9 — [P2][Accessibility/UX] Card xác thực BTC thiếu liên kết trực tiếp sang cổng khán giả và nút hiện/ẩn mật khẩu**
- Luồng component: `src/components/OrganizerPortal.tsx:141-149` bọc `OrganizerAuthView` bằng `OrganizerFrame`; `OrganizerFrame` (`OrganizerPortal.tsx:170-172`) luôn render `OrganizerTopBar`, trong đó `src/components/organizer-ui/OrganizerTopBar.tsx:35-43` đã có liên kết về trang sự kiện công khai (`buildPublicPath(basePath, 'events')`, "Khám phá sự kiện" / "Về trang bán vé"). Vì vậy việc điều hướng về trang sự kiện **không** thiếu; phát hiện được thu hẹp lại.
- Vị trí: trong card `OrganizerAuthView.tsx:161-260` không có liên kết trực tiếp sang cổng đăng nhập khán giả (`/login` hoặc `/account/login`; `resolvePublicRoute` ở `src/domain/publicRoute.js:54-61` chỉ nhận `account`, `login`, `register`), bất đối xứng với `BuyerAuth.tsx:246-253, 391-396` (có liên kết sang cổng BTC); đồng thời `OrganizerAuthView.tsx:198-212` cố định `type="password"` so với `BuyerAuth.tsx:324-347` (`et-auth__toggle`, `aria-pressed`).
- Tác động: điều hướng giữa hai cổng không đối xứng ngay trong card; mật khẩu gõ không nhìn thấy được.
- Đề xuất nhỏ: thêm liên kết "Bạn là khán giả? Đăng nhập tại đây →" cuối card BTC (dùng `buildPublicPath(basePath, 'login')` hoặc target `'account/login'` theo `src/domain/publicRoute.js:54-61, 80-100`) và toggle mật khẩu (style bổ sung dưới `.organizer-shell`).

**F10 — [P3][Nhất quán] Style inline và màu cứng còn sót trong các view xác thực**
- Vị trí: `OrganizerAuthView.tsx:140-158` (`color:'#475569'` cứng), `:242`; `OrganizerAccessDeniedView.tsx:40,45,49,59,70` (inline style, `minWidth:'180px'`). Tương tự ở sidebar: `OrganizerSidebar.tsx:97` (`color:'#e2e8f0'` inline), `:42` (`minHeight`, `fontSize` inline).
- Tác động: khó thống nhất theme.
- Đề xuất nhỏ: chuyển sang class `org-*` / token `--org-text-secondary`.

**F11 — [P3][Nhất quán/Bảo trì] Nhiều `!important` và hai bộ class chồng nhau**
- Vị trí: `organizer-skin.css:424, 504, 553-555`; `src/index.css:4243-4725` & `:5275-5639` tồn tại song song `organizer-ui.css`.
- Tác động: mỗi component mới phải nhớ thêm override; F22/F23 là ví dụ cụ thể của hệ quả này.
- Đề xuất: dọn dần sau khi grep xác nhận `src/legacy/` không dùng `.organizer-*`/`.wizard-*` (chưa kiểm tra).

**F22 — [P2][Nhất quán/Responsive] Rule legacy `.organizer-layout > aside > div` đè lên DOM sidebar mới (kết luận cho A16)**
- Vị trí: DOM: `src/components/OrganizerPortal.tsx:328` (`className="org-layout organizer-layout"`) → `src/components/organizer-ui/OrganizerSidebar.tsx:28` (`<aside className="org-sidebar">`) → `div.org-sidebar-mobile-top` (`:29`) và `div.org-sidebar-mobile-bottom` (`:95`). Selector: `src/index.css:4466-4472` (`display:grid; gap:8px; margin-top:auto; padding-top:24px; border-top:1px solid …`, độ đặc hiệu 0,1,2) và `:4474-4479` (`.organizer-layout > aside > div span`: `overflow:hidden; color:#94a3b8; font-size:12px; text-overflow:ellipsis`, 0,1,3). Rule mới: `organizer-ui.css:423-434` (`display:flex; gap:24px`, 0,1,0; bottom có `margin-top:auto`). Skin chỉ đặt `grid-template-columns` cho `.org-sidebar-mobile-top` (`organizer-skin.css:607-609`).
- Tác động (suy từ cascade): trên desktop cả hai khối bị `display:grid; gap:8px` thay vì flex/24px; **cả hai** khối có `margin-top:auto` (khối trên lẽ ra không có) nên khoảng trống dọc được chia đôi và khối "KHÔNG GIAN LÀM VIỆC" bị đẩy xuống; khối trên còn có `border-top` + `padding-top:24px`. Cascade của `span` bên trong, tách `color` và `font-size`: `src/index.css:4474-4479` (`.organizer-layout > aside > div span`, 0,1,3) đặt `color:#94a3b8; font-size:12px`. (i) Chip vai trò `.org-chip-role` (`OrganizerSidebar.tsx:53,71`): **không** nhận `#94a3b8` — `organizer-skin.css:489-492` (`.organizer-shell .org-chip-role`, 0,2,0) thắng 0,1,3 ở `color` (`#0b3f91`), `background-color` (`#e3edfb`), `border-color` (`#b3cdf3`); riêng `font-size: 12px` của 0,1,3 vẫn thắng `.org-chip { font-size: 11px }` (`organizer-ui.css:300-310`, 0,1,0) vì skin không khai báo lại `font-size`. (ii) Nhãn menu không active (`OrganizerSidebar.tsx:86,90`) và tiêu đề ghi chú bảo mật (`:99`) vẫn nhận **cả** `color:#94a3b8` và `font-size:12px` từ `index.css:4474-4479`, vì skin chỉ ghi đè `.org-sidebar-nav-item.is-active span` (`organizer-skin.css:506-509`, 0,3,1) và `.org-sidebar-user-info > span` (`:495-497, 503-505`, 0,2,1). Rule `padding: 32px 24px` + `border-right` của `.organizer-layout > aside` (`index.css:4406-4412`, 0,1,1) cũng thắng `.org-sidebar` (`organizer-ui.css:414-421`, 0,1,0). Chưa xem render.
- Đề xuất nhỏ: bỏ class `organizer-layout` khỏi `OrganizerPortal.tsx:328` (`org-layout` đã cấp lưới 280px/1fr ở `organizer-ui.css:~408-412`) sẽ gỡ các rule legacy của F22 (`index.css:4466-4479`), nhưng **không** tự giải quyết F23 (xem F23); kiểm tra thêm các rule `.organizer-layout …` đi kèm selector `.org-sidebar-nav*` ở `organizer-ui.css:1633-1660`. Phương án tối thiểu khác: thêm vào skin `.organizer-shell .org-sidebar > div { display:flex; gap:24px; padding-top:0; border-top:0; margin-top:0 }` và `.organizer-shell .org-sidebar > .org-sidebar-mobile-bottom { margin-top:auto }`.

**F23 — [P3][Responsive/Accessibility] Menu sidebar ≤768px bị ép `font-size: 11px !important`**
- Vị trí: `src/index.css:4829` (`@media (max-width: 768px)`) → `:4868-4875` (`.organizer-layout > aside nav a { min-height:30px !important; padding:4px 10px !important; font-size:11px !important; white-space:nowrap !important }`). Skin chỉ cứu `min-height` (`organizer-skin.css:552-556`, 0,2,0 `!important` thắng 0,1,3 `!important`), không cứu `font-size`/`padding`.
- Phân biệt phần tử: `font-size: 11px !important` áp lên chính thẻ `<a>`; còn nhãn nằm trong `<span>` (`OrganizerSidebar.tsx:86,90`) nhận `font-size: 12px` khai báo **trực tiếp** trên span bởi `.organizer-layout > aside > div span` (`src/index.css:4474-4479`). `!important` trên phần tử cha không thắng khai báo trực tiếp trên phần tử con (kế thừa luôn thua khai báo trực tiếp), nên chữ nhãn trong `<span>` hiển thị 12px, còn 11px chỉ áp cho hộp `<a>` (và `padding`).
- Có thêm nguồn thứ hai: `src/components/organizer-ui/organizer-ui.css:1645-1656` (trong `@media (max-width: 768px)` mở tại `:1564`) cũng đặt `min-height: 30px !important; padding: 4px 10px !important; font-size: 11px !important; color: #94a3b8 !important; white-space: nowrap !important` cho `.org-sidebar-nav-item, .organizer-layout > aside nav a, .organizer-layout .org-sidebar-nav-item` (ngoài `src/index.css:4829, 4868-4875`).
- Hệ quả: (a) bỏ `organizer-layout` ở `OrganizerPortal.tsx:328` **không** tự sửa F23, vì `.org-sidebar-nav-item` ở `organizer-ui.css:1645-1656` vẫn áp `font-size: 11px !important; padding: 4px 10px !important`; (b) chỉ override `font-size` trên `<a>` (`.org-sidebar-nav-item`) không đổi `font-size` của `<span>` con nếu rule legacy `.organizer-layout > aside > div span` còn hiệu lực.
- Tác động: chữ menu 11–12px trên mobile; `min-height` được skin cứu (`organizer-skin.css:552-556`) nhưng `padding` ngang chỉ ~10px mỗi bên. Chưa đo vùng chạm thực.
- Đề xuất nhỏ: một trong hai — (1) gỡ/chỉnh các `!important` mobile ở `organizer-ui.css:1645-1656` (cùng với bỏ `organizer-layout` hoặc bỏ `src/index.css:4868-4875`); hoặc (2) trong `organizer-skin.css` thêm, ở `@media (max-width: 768px)`, `.organizer-shell .org-sidebar-nav-item { padding: 10px 14px !important; font-size: 13px !important }` **và** `.organizer-shell .org-sidebar-nav-item span { font-size: inherit }` (0,2,1 > 0,1,3; hoặc đặt cỡ chữ tường minh) để `<span>` con theo `<a>`.

**F25 — [P3][Accessibility] Ô nhập mã màu hạng vé không có tên truy cập riêng**
- Vị trí: `OrganizerEventWizard.tsx:1259-1275`: một `<label>` bọc hai điều khiển (`type="color"` `:1263` và ô hex `.org-input` `:1268`); chỉ điều khiển đầu tiên được gắn với nhãn "Màu sắc nhận diện".
- Tác động: ô hex chỉ có `placeholder="#84CC16"` làm gợi ý, không có tên truy cập; ô `type="color"` không có mô tả giá trị cho trình đọc màn hình ngoài giá trị native.
- Đề xuất nhỏ: thêm `aria-label="Mã màu hạng vé (hex)"` cho ô hex (và `aria-label` cho ô color); tùy chọn thêm `pattern="#[0-9A-Fa-f]{6}"`.

### Bộ lọc nghệ sĩ mới (`src/components/site/ArtistFilter.tsx`, `ArtistFilter.css`; dùng ở `src/components/EventCatalog.tsx:219`)

*(F12 đã chuyển sang Mục 3B — không phải lỗi cần xử lý.)*

**F13 — [P3][API component] Nút "Bỏ chọn nghệ sĩ" không tôn trọng prop `disabled`**
- Sự thật mã: `ArtistFilter.tsx:9` khai báo `disabled?: boolean`, `:37` áp cho `<select>` (`disabled={disabled || isEmpty}`), nhưng nút xóa ở `ArtistFilter.tsx:54-58` **không** có `disabled={disabled}`. Đây là thiếu sót API của component.
- Hiện không gây lỗi người dùng: `EventCatalog.tsx:219` gọi `<ArtistFilter artists value onChange />` và **không truyền** `disabled`, nên prop luôn là `false`.
- Đề xuất nhỏ: thêm `disabled={disabled}` cho nút ở `ArtistFilter.tsx:55` để component an toàn khi tái sử dụng.
- **Đã có và đúng (không phải lỗi):** `EventCatalog.tsx:223` `role="status" aria-live="polite"`; `:241` thông báo số sự kiện sau lọc; `:272-283` trạng thái rỗng "Không tìm thấy sự kiện phù hợp" kèm nút "Xem tất cả sự kiện"; `:243-245` nút "Đặt lại bộ lọc". `ArtistFilter.tsx:37-38,49-53` có `aria-describedby` tới gợi ý khi danh sách nghệ sĩ rỗng; xếp chồng ≤480px ở `ArtistFilter.css:93-108`.

### Lineup nghệ sĩ (`src/components/event-template/ArtistLineupSection.tsx`, `ArtistLineupSection.css`)

**F14 — [P3][Hiệu năng] `will-change: transform` thường trực trên mỗi thẻ nghệ sĩ**
- Vị trí: `ArtistLineupSection.css:20` (`.et-artist-card`), thẻ render lặp ở `ArtistLineupSection.tsx:120-151` (tối đa 6 cột × N hàng). Transform chỉ đổi khi hover (`ArtistLineupSection.css:23-25`).
- Cascade `.scroll-focus-section` (mọi section lineup mang class này, `.tsx:56,74,102`): `src/index.css:199-202` khai `transition: opacity, filter, transform` và `will-change: opacity, filter, transform`; khối thứ hai `src/index.css:879-882` (`transition: opacity .2s ease-out; will-change: opacity`) cùng độ đặc hiệu (0,1,0), đứng sau nên thắng. Grep at-rule trong `index.css` không thấy `@media`/`@layer` nào mở giữa `:268` và `:893`, nên cả hai khối có vẻ nằm ở cấp cao nhất (không bị điều kiện hóa). Kết quả: `will-change: opacity` thường trực trên mỗi section, và `will-change: transform` thường trực trên mỗi thẻ.
- Tác động (là **nguy cơ**, chưa đo): thuộc tính này có thể khiến trình duyệt giữ sẵn layer compositing cho từng thẻ trong suốt vòng đời trang, làm tăng bộ nhớ GPU và có nguy cơ chữ/ảnh bị nhòe do raster ở tỷ lệ cố định; không có lợi ích rõ ràng vì chỉ cần khi hover. Việc layer có thật sự được tạo hay không phụ thuộc trình duyệt — xem Mục 5.
- Đề xuất nhỏ: xóa `ArtistLineupSection.css:20`; nếu cần, đặt `will-change: transform` chỉ trong `.et-artist-card:hover`/`:focus-within`. Cân nhắc tương tự cho `index.css:881`.

**F15 — [P3][Nhất quán/Tính độc lập component] `ArtistLineupSection.css` không tự chứa rule reduced-motion cho chấm loading**
- Vị trí: `ArtistLineupSection.css:78-84` (`.et-artist-loading-dot` `animation: pulse 2s … infinite`); khối `@media (prefers-reduced-motion: reduce)` ở `:116-125` chỉ liệt kê `.et-artist-card`, `.et-artist-image` (+ hover), **không** có `.et-artist-loading-dot`. Phần tử được render ở `ArtistLineupSection.tsx:60`.
- Cascade hiện tại: `src/App.tsx:4` import tĩnh `event-template.css` → `src/components/event-template/event-template.css:1689-1697` (`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; } }`, kèm `.et-live-dot { animation: none !important; }` ở `:1699-1701`) đã áp lên `.et-artist-loading-dot`. Đây là import cấp cao nhất, không phụ thuộc `OrganizerPortal`. Ngoài ra `src/App.tsx:5` → `src/components/organizer-ui/organizer-ui.css:1857-1866` là khối toàn cục thứ hai, dự phòng.
- Tác động: **không có lỗi accessibility reduced-motion ở runtime** trong ứng dụng, vì `event-template.css:1689-1697` (import ở `App.tsx:4`) đã ép `animation-duration: 0.001ms !important` và `animation-iteration-count: 1 !important`; lazy-load hay bỏ `OrganizerPortal` cũng không làm mất bảo vệ này. Tác động chỉ nằm ở đóng gói stylesheet/nhất quán nội bộ: khối cục bộ `ArtistLineupSection.css:117-125` xử lý `.et-artist-card` và `.et-artist-image` nhưng bỏ sót `.et-artist-loading-dot`, nên file CSS của component không tự chứa nếu được mount ngoài entry có nạp `event-template.css`. (Kết luận đọc mã; chưa xác minh bằng giao diện chạy thật với cài đặt reduced-motion của hệ điều hành.)
- Đề xuất nhỏ: thêm `.et-artist-loading-dot { animation: none; }` (hoặc `animation: none !important;`) vào khối reduced-motion `ArtistLineupSection.css:117-125` để tăng tính độc lập của component. Xác minh `@keyframes pulse` xem Mục 5.
- Câu hỏi `@keyframes pulse` có được phát ra trong CSS build hay không **không** được kết luận ở đây → Mục 5.

**F16 — [P3][Nhất quán] Hiệu ứng hover chồng giữa utility Tailwind và CSS component**
- Vị trí: `ArtistLineupSection.tsx:123` có `hover:scale-[1.02] transition-all duration-300` và `:130` `group-hover:scale-110 transition-transform duration-500`, trong khi `ArtistLineupSection.css:23-25` đặt `transform: translateY(-4px) scale(1.01)` và `:48-50` `scale(1.08)`; khối reduced-motion (`:117-125`) chỉ đặt `transform: none !important` và `transition: none !important`.
- Sự thật mã: cùng một hover được khai báo ở hai nơi bằng hai cơ chế. Hệ quả cụ thể (hover nhân đôi, `scale` của Tailwind có còn chạy khi reduce hay không) phụ thuộc cách Tailwind 4 sinh CSS → Mục 5.
- Đề xuất nhỏ: bỏ `hover:scale-[1.02]`, `group-hover:scale-110`, `transition-all`, `transition-transform` khỏi JSX và để CSS component quản lý.

**F17 — [P3][Accessibility/Nhất quán] Mã chết cho focus/hover và `alt` lặp tên**
- Vị trí: thẻ là `<div>` không `tabIndex`, không có phần tử focus con (`ArtistLineupSection.tsx:121-150`), nhưng có `focus-within:ring-2 focus-within:ring-amber-400` (`:123`) và `.et-artist-card:focus-visible` (`ArtistLineupSection.css:27-30`) — không bao giờ kích hoạt. `:145` `group-hover:text-amber-400` bị `ArtistLineupSection.css:56-58` (`color: var(--et-cat-accent,#d8ff3e) !important`) đè. `:129` `alt={artist.name}` trùng với `<h3>` (`:145-147`) ngay bên dưới.
- Tác động: mã gợi ý có hỗ trợ bàn phím nhưng không có; trình đọc màn hình đọc tên nghệ sĩ hai lần.
- Đề xuất nhỏ: xóa `focus-within:*`, `.et-artist-card:focus-visible`, `group-hover:text-amber-400`; đặt `alt=""` cho ảnh.

*(F18 đã chuyển sang Mục 3B — không phải lỗi cần xử lý.)*

### Cổng xác thực khán giả (`src/components/BuyerAuth.tsx`, `src/components/site/auth.css`)

**F19 — [P3][Accessibility] Nút kích hoạt tác vụ bất đồng bộ bị `disabled={busy}` ngay khi kích hoạt, làm mất focus tại chỗ**
- Luồng component (`BuyerAuth.tsx`): hai nút tab (`:258-285`, `type="button"`, `role="tab"`, `disabled={busy}` ở `:266, :280`) nằm **ngoài** `<form>` (`:298-381`); `onClick` chỉ gọi `switchMode('login' | 'register')` (`:268, :282`) và không bật `busy`. `busy` chỉ được bật (`setBusy(true)`) trong `handleSubmit` (`:91-108`, khi submit `<form>` bằng nút submit `:378` hoặc Enter trong `<input>` của form) hoặc `handleSignOut` (`:153-157`, ở nhánh đã đăng nhập `:189-254`, nơi không render tab).
- Luồng đăng xuất đầy đủ: `handleSignOut` (`:153-157`) được truyền tới hai nơi. (1) Nút Đăng xuất trong card tài khoản (`BuyerAuth.tsx:236-243`) có `disabled={busy}` ở `:240`. (2) `BuyerAuth.tsx:186` còn truyền `onSignOut={handleSignOut}` cho `<GlobalHeader session={activeSession} onSignOut={handleSignOut} />`; `src/components/site/GlobalHeader.tsx:97-99` gọi `onClick={() => void onSignOut()}` từ `<button type="button" className="et-header__link et-header__signout">` **không** có `disabled={busy}`. Hai nút này khác nhau: chỉ nút trong card bị `disabled` khi `busy`; nút trên header thì không.
- Phạm vi kết luận: nguy cơ mất focus chỉ áp dụng khi **chính nút đang focus** bị `disabled={busy}` ngay khi kích hoạt, tức nút submit form (`BuyerAuth.tsx:378`) hoặc nút Đăng xuất trong card (`:240`). Kích hoạt đăng xuất qua `GlobalHeader.tsx:97` hay điều khiển khác không thuộc kết luận này (nút header không bị disabled). Không khẳng định đây là danh sách phần tử giữ focus đầy đủ (cùng kiểu: nút phụ `:266, :280, :385`).
- Hai tab: mã hiện tại không có luồng UI chuẩn nào khiến tab đang giữ focus đúng lúc `busy` bật; việc tab mất focus chỉ là giả định nếu có tác nhân ngoài chuyển focus vào tab trước khi `busy` bật → **không** coi là lỗi đã xác nhận (chưa xác minh chạy thật, → Mục 5). `switchMode` (`:69-74`, `if (busy || submittingRef.current) return;`) và `handleTabKeyDown` (`:86`, cùng guard) **đã có sẵn** guard `busy || submittingRef.current`; điểm còn lại ở tab chỉ là dùng `disabled` thay vì `aria-disabled`. Mẫu tablist chuẩn (roving `tabIndex`, `aria-selected`, `aria-controls`, mũi tên/Home/End ở `:76-89, 257-286`) là điểm tốt.
- Tác động: người dùng bàn phím có thể mất vị trí focus tại nút submit/Đăng xuất trong card vừa kích hoạt (suy luận từ mã, chưa kiểm chứng chạy thật); hành vi của trình đọc màn hình → Mục 5.
- Đề xuất nhỏ: với nút submit `:378` và Đăng xuất `:240` đổi `disabled={busy}` thành `aria-disabled={busy}` để giữ focus trong lúc chờ (cần chặn click lặp; `handleSubmit` đã có `submittingRef`). Ở hai tab chỉ cần đổi `disabled={busy}` → `aria-disabled={busy}` (không cần thêm guard vì `switchMode` `:69-74` và `handleTabKeyDown` `:86` đã chặn).

### Trang công khai khác (đọc trong lượt này)

**F24 — [P3][Accessibility] `<nav aria-label="Thể loại sự kiện">` vẫn được render khi không có danh mục**
- Vị trí: `src/components/site/GlobalHeader.tsx:60-86` — `<nav>` luôn được render, nhưng nội dung chỉ có khi `categories` có phần tử (`:61`). `src/components/site/NotFoundPage.tsx:17` gọi `<GlobalHeader session onSignOut />` không truyền `categories`.
- Tác động: landmark `navigation` rỗng có tên "Thể loại sự kiện" trên trang 404 (và mọi trang không truyền `categories`).
- Đề xuất nhỏ: bao `<nav>` trong điều kiện `categories && categories.length > 0`.

**F26 — [P3][Accessibility] Suất diễn đang chọn chỉ được đánh dấu bằng class**
- Vị trí: `src/components/event-template/ShowSwitcher.tsx:23-28` — `className={show.id === event.selectedShow.id ? 'is-active' : ''}` không kèm `aria-current`.
- Tác động: người dùng trình đọc màn hình không biết suất nào đang xem.
- Đề xuất nhỏ: thêm `aria-current={show.id === event.selectedShow.id ? 'true' : undefined}`.

**F27 — [P3][Nhất quán/Accessibility] Hero: nhãn "Khởi chiếu" dùng cho mọi loại sự kiện; `aria-label` trên `div` không có role**
- Vị trí: `src/components/event-template/EventHero.tsx:180` (`Khởi chiếu: …` hiển thị cho mọi `category`), `:170` (`<div className="et-poster-card" aria-label="…">` không có `role`).
- Tác động: từ ngữ sai ngữ cảnh với thể thao/hội thảo/tham quan; `aria-label` trên phần tử generic thường không được công bố.
- Đề xuất nhỏ: đổi nhãn trung tính ("Thời gian:" hoặc "Ngày diễn ra:"); bỏ `aria-label` ở `:170` (ảnh bên trong đã có `alt` ở `:173`).

**F28 — [P2][Responsive] Rule `.organizer-shell .organizer-auth` vô hiệu hóa các breakpoint gập 1 cột của trang xác thực BTC**
- Vị trí & bằng chứng selector: phạm vi kết luận chỉ là **nhánh form đăng nhập/đăng ký** (`src/components/organizer-ui/OrganizerAuthView.tsx:122-262`), nơi `:123` render `<main className="org-auth-container organizer-auth">` bên trong `.organizer-shell` (`src/components/OrganizerPortal.tsx:170`). Nhánh phiên hợp lệ (`OrganizerAuthView.tsx:96-120`) render `<main className="org-auth-container org-auth-session-container">` ở `:98`, **không** mang class `organizer-auth` nên `.organizer-shell .organizer-auth` không khớp và không thuộc phát hiện này. Rule `src/components/organizer-ui/organizer-skin.css:137-141` (`.organizer-shell .organizer-auth`, độ đặc hiệu 0,2,0) đặt `grid-template-columns: 1fr minmax(0, 440px)` ở cấp ngoài media query và skin không có `@media` tương ứng cho lưới này. Do 0,2,0 > 0,1,0 nên nó thắng cả `@media (max-width: 1024px) { .org-auth-container { grid-template-columns: 1fr } }` (`organizer-ui.css:1538, 1549-1552`) lẫn `@media (max-width: 900px) { .organizer-auth { grid-template-columns: 1fr } }` (`src/index.css:4786, 4794-4797`).
- Tác động (suy luận từ cascade, chỉ với nhánh form đăng nhập/đăng ký): bố cục xác thực BTC bị khóa 2 cột (`1fr minmax(0, 440px)`, `gap: 48px`) ở mọi kích thước kể cả tablet/mobile (≤1024px, ≤900px, ≤480px) thay vì gập về 1 cột như thiết kế của cả hai stylesheet gốc. Mức co thắt hiển thị thực tế của khối hero chưa xác minh (→ Mục 5, A6).
- Đề xuất nhỏ: thêm vào `organizer-skin.css` khối `@media (max-width: 1024px) { .organizer-shell .organizer-auth { grid-template-columns: 1fr; } }`.

## 3B. Ghi chú tùy chọn thiết kế / đồng bộ mã (KHÔNG phải lỗi cần xử lý, không gán mức độ)

Các mục dưới đây là lựa chọn hợp lệ hoặc nhánh dự phòng chưa được luồng hiện tại kích hoạt; không có tác động bất lợi nào được chứng minh từ mã, nên không đưa vào Mục 4.

**F12 — Vòng focus của `ArtistFilter` dùng `:focus-within`**
- Vị trí: `src/components/site/ArtistFilter.css:82-91`. Vòng kép cũ **không** còn: `:82-87` đặt outline cho `select:focus-visible`, `clear:focus-visible` và `.field:focus-within`; `:89-91` tắt outline của `select` khi nằm trong `.field:focus-within` ⇒ chỉ còn vòng ngoài.
- Nhận định: dùng `:focus-within` là lựa chọn hiển thị focus hợp lệ, vẫn hiện focus rõ cho người dùng bàn phím, không vi phạm WCAG và không gây tác động bất lợi.
- Tùy chọn thẩm mỹ (nếu nhóm muốn ẩn vòng bao ngoài khi click chuột): `.et-artist-filter__field:has(.et-artist-filter__select:focus-visible)` và bỏ rule `:89-91`.

**F18 — Hai giá trị fallback khác nhau cho `--et-cat-accent` trong `ArtistLineupSection.css`**
- Sự thật mã: `src/components/event-template/ArtistLineupSection.css:28, 57` fallback `#d8ff3e`; `:82` fallback `#f59e0b`.
- Phạm vi kết luận: `EventTemplate.tsx:212` (`data-category={event.category || 'AM_NHAC'}`) chỉ dự phòng khi `event.category` là falsy, **không** chuẩn hóa mọi chuỗi `category` về một trong 7 mã chủ đề; riêng việc có `data-category` trên `.et-shell` chưa đủ chứng minh selector khớp. Fallback tại `:28, 57` (`#d8ff3e`) và `:82` (`#f59e0b`) chỉ không kích hoạt **khi** phần tử nằm trong `.et-shell` có `data-category` khớp một trong 7 selector tại `event-template.css:1707-1782` (`AM_NHAC`, `SAN_KHAU`, `THE_THAO`, `HOI_THAO`, `WORKSHOP`, `THAM_QUAN`, `KHAC`).
- Ghi chú: fallback sẽ được dùng nếu `ArtistLineupSection` render ngoài `.et-shell` hoặc khi `event.category` truthy nhưng nằm ngoài 7 giá trị trên (chưa chứng minh luồng dữ liệu thực tế có tạo giá trị ngoài 7 mã này); khi đó chấm loading (`:82`) cam `#f59e0b` lệch lime `#d8ff3e` của viền focus/tên nghệ sĩ (`:28, 57`). Giữ ở Mục 3B, không phải lỗi P1/P2/P3.
- Tùy chọn đồng bộ: dùng cùng fallback `#d8ff3e` ở `:82`.

## 4. Thứ tự xử lý đề xuất

1. **F1, F2** (an toàn dữ liệu + a11y modal) — mỗi mục sửa trong `OrganizerEventWizard.tsx`.
2. **F22 rồi F23** — F22: bỏ `organizer-layout` ở `OrganizerPortal.tsx:328` (hoặc override skin). F23 cần xử lý riêng, vì bỏ `organizer-layout` không đủ: `organizer-ui.css:1645-1656` vẫn ép `font-size: 11px !important; padding: 4px 10px !important`, và `<span>` nhãn cần được override (`.organizer-shell .org-sidebar-nav-item span`) nếu rule legacy còn. Sau đó kiểm tra render sidebar.
3. **F3, F4, F7, F9, F28** (CSS nhỏ + bỏ `organizer-message` + điều hướng cổng + khôi phục breakpoint 1 cột của auth BTC; F28 là P2).
4. **F14–F17** (lineup: bỏ `will-change`, bổ sung rule reduced-motion cục bộ cho chấm loading chỉ để component tự chứa — F15 không phải lỗi runtime vì `event-template.css:1689-1697` đã bảo vệ —, dọn mã chết).
5. **F5, F8, F10, F11, F13, F19, F24–F27** theo thời gian; **F11** cần grep `src/legacy/` trước khi gỡ CSS cũ. (F12, F18 ở Mục 3B, không nằm trong danh sách xử lý.)

## 5. Cần xác minh bằng giao diện chạy thật (chưa thực hiện, không gán mức độ)

- **Render/bố cục sidebar** (liên quan F22/F23): desktop có bị đẩy xuống/viền trên không; mobile ≤768px kích thước chữ và vùng chạm thực của menu.
- **Stepper wizard:** nhãn bước có bị cắt bởi ellipsis ở 140px–~165px/nút hay không (tiêu đề dài nhất `organizerLogic.js:54` "Hình ảnh & Truyền thông"); có cần thêm `title`; hành vi cuộn ngang của `.org-wizard-stepper`.
- **Ô màu hạng vé:** ô `type="color"` rộng 44px có bị co dưới 44px trong flex (không có `flex-shrink:0`) ở cột hẹp (769–~900px) không (`OrganizerEventWizard.tsx:1261-1273`). Nếu xác nhận: thêm `flex: 0 0 44px` cho ô color và `min-width:0` cho ô hex.
- **Lưới thống kê bước 6** ở 769–900px (4 cột, `index.css:5576-5579`): số 18px có chật không.
- **Sơ đồ ghế 851–1023px** (A15): `SeatMapSection.css:97-102, 1169` so với `event-template.css:1562-1572`; nếu chật, nâng breakpoint gập lên 1023px hoặc dùng container query.
- **`@keyframes pulse`:** `animation: pulse` ở `ArtistLineupSection.css:83` không có `@keyframes pulse` trong `src/**/*.css` (grep chỉ thấy `et-pulse` ở `event-template.css:356`, `SeatMapSection.css:276`; không có `animate-pulse` trong `src`). Cần xem CSS đã build xem Tailwind 4 có phát `pulse` không; nếu không, chấm đứng yên (sửa nhỏ: dùng `et-pulse` hoặc khai báo keyframes cục bộ).
- **Tailwind `scale`** (F16): hover có nhân đôi không và phần `scale` có còn chạy khi `prefers-reduced-motion` không.
- **GPU/layer** (F14): có layer riêng thực sự không, tác động bộ nhớ/độ nhòe (Chrome DevTools Layers).
- **Tương phản:** `#64748b` chữ loading trên nền tối (`ArtistLineupSection.css:74`); `:disabled` của `ArtistFilter.css:48-52`; `--et-blue` trên `--et-surface` ở `auth.css`; `primary` của bảy chủ đề (`src/domain/categoryThemes.js`) khi dùng làm màu chữ trên nền sáng (`inkOnLight`/`badgeText`).
- **Vùng chạm:** nút toggle mật khẩu (`auth.css:129-147`), nút xóa lọc nghệ sĩ, `minWidth:180px` ×2 trong `org-denied-actions` (`OrganizerAccessDeniedView.tsx`) ở viewport <400px.
- **Bàn phím + trình đọc màn hình:** wizard (F1, F2), `ArtistFilter` (vòng focus, Mục 3B-F12) và live region của `EventCatalog.tsx:223`.
- **Mobile 390px — F3/F4 (overflow thực tế):** với tên suất/hạng/nghệ sĩ dài (kể cả chuỗi không dấu cách), xác minh trên giao diện thật nội dung có gây cuộn ngang trong `.org-wizard-body.wizard-modal-content` hay bị cắt ở tổ tiên nào (`.org-wizard-window`/`.wizard-modal-window` `overflow:hidden`); kiểm tra nút vẫn truy cập được.
- **Mobile 390px:** modal wizard (F3–F5); render `/organizer/login` ở 360/768/1024px (A3, A6, F9, F28); với A6/F28 cần xem hero có còn bị co khi lưới giữ 2 cột ở ≤1024px/≤900px không.
- **Focus khi `busy`** (F19): chưa xác minh chạy thật — kiểm tra bằng bàn phím rằng nút submit (`:378`) và Đăng xuất trong card (`:240`) mất focus khi `disabled`; kiểm tra bằng trình đọc màn hình xem "Đang xử lý…" có được đọc hay không và focus đi đâu; đối chiếu nút Đăng xuất ở `GlobalHeader.tsx:97` (không `disabled`) và xác nhận không có luồng nào đưa focus vào hai tab đúng lúc `busy` bật.
