Dưới đây là báo cáo tổng hợp và đối soát toàn diện về hiện trạng UI/UX của hệ thống Eventticketing, dựa trên kết quả phân tích kiến trúc CSS,      
cascade độ ưu tiên và review chi tiết từ mã nguồn.

---------------------------------------------------------------------------------------------------------------------------------------------------

                                                     BÁO CÁO TỔNG HỢP RÀ SOÁT UI/UX TOÀN DIỆN

I. NGUYÊN NHÂN CỐT LÕI (ROOT CAUSE)

Gốc rễ của phần lớn các lỗi chữ tàng hình, tương phản kém, chồng chữ và layout vỡ nằm ở sự xung đột giữa hai thế hệ giao diện:

 1 Xung đột 2 hệ thống CSS trái ngược nhau:
    • Bộ mới (organizer-ui.css): Thiết kế theo phong cách nền sáng (card trắng #fff, chữ đậm #0f172a, class .org-*).
    • Bộ cũ (index.css): Thiết kế theo phong cách nền tối (nền #0d121c / #080a09, chữ trắng/xám nhạt #f8fafc, class .organizer-*, .wizard-*).      
    • Các component JSX hiện tại đang được gắn đồng thời cả 2 class (ví dụ: org-auth-container organizer-auth, org-wizard-window 
      wizard-modal-window).
 2 Bộ CSS cũ luôn thắng và phá vỡ bộ mới do:
    • Thứ tự import bị đảo ngược trong main.tsx: App được import trước index.css. Khi App kéo theo organizer-ui.css, index.css nằm sau cùng trong  
      cascade nên ghi đè mọi rule cùng độ ưu tiên.
    • Specificity (độ đặc hiệu) của CSS cũ cao hơn: index.css lạm dụng selector con cháu (độ ưu tiên 0,1,1 như .wizard-label input, .organizer-auth      form) áp đảo các class đơn 0,1,0 của organizer-ui.css.
 3 Chỉ thị inline style và thiếu ràng buộc co dãn:
    • Inline style màu sáng (color: '#fff', #f8fafc) được gắn cứng trong JSX đè lên nền trắng mới.
    • Các phần tử flex/grid thiếu min-width: 0, kết hợp với thuộc tính white-space: nowrap trên các nút bấm mang nội dung động khiến chữ bị tràn   
      khung modal hoặc đè lên nhau trên màn hình hẹp/mobile.

---------------------------------------------------------------------------------------------------------------------------------------------------
II. DANH SÁCH LỖI CHI TIẾT & PHÂN LOẠI MỨC ĐỘ

1. Khu vực Đăng nhập & Đăng ký Ban tổ chức (OrganizerAuthView.tsx)

 • 🔴 [P1] Chữ biến thành trắng trên nền trắng khi focus ô nhập:
    • Vấn đề: Khi click vào ô email/password, .org-input:focus đổi nền sang trắng, nhưng selector cũ .organizer-auth input vẫn ép màu chữ trắng    
      khiến nội dung người dùng đang nhập bị "biến mất".
    • Vị trí: organizer-ui.css:277, index.css:4298.
 • 🔴 [P1] Màn hình "Đã đăng nhập" / Từ chối truy cập che mất tiêu đề và email:
    • Vấn đề: Tiêu đề và thông tin tài khoản bị gán inline color: '#fff' trên card trắng, hoàn toàn không đọc được.
    • Vị trí: OrganizerAuthView.tsx:86, 90.
 • 🔴 [P1] Tiêu đề Hero chồng chữ, dính dấu tiếng Việt:
    • Vấn đề: Selector .organizer-auth > div h1 ép line-height: 0.92, letter-spacing: -0.07em ở cỡ chữ ~88px. Các ký tự tiếng Việt có dấu ở dòng   
      dưới (như "thành sân khấu") đụng vào phần đuôi chữ "ý", "g" ở dòng trên, các nét chữ đậm dính chặt vào nhau.
    • Vị trí: index.css:4241-4245, 5110.
 • 🔴 [P1] Form tối lồng trong card trắng & nút bấm không xuống dòng:
    • Vấn đề: .organizer-auth form áp nền tối #0d121c với padding 32px nằm lọt thỏm trong .org-auth-card trắng (padding 36px), tạo thành 2 lớp viền      kỳ dị. Nút "Tạo tài khoản Ban tổ chức" bị gắn white-space: nowrap, làm card dễ phình to vượt chiều rộng viewport mobile.
    • Vị trí: index.css:4256-4262, organizer-ui.css:179, 862-869.
 • 🟠  [P2] Tab active/inactive và Label khó nhận diện:
    • Vấn đề: Gạch chân tab active mang màu lime #d8ff3e trên nền trắng (gần như tàng hình), viền tab thường là viền mờ rgba(255,255,255,.15).     
      Label bị ép chữ in hoa 11px màu xám nhạt #94a3b8 khó đọc.
    • Vị trí: index.css:4270-4296.
 • 🟠  [P2] Layout 2 cột bị co thắt ở khổ 901–1024px:
    • Vấn đề: index.css:4233 giữ grid-template-columns: 1fr 480px đè lên breakpoint mobile của CSS mới, làm cột hero bị bóp hẹp còn ~330px, khiến  
      lỗi chồng chữ tiêu đề càng nghiêm trọng.
 • 🟠  [P2] Thông báo xác thực email bị mất sau khi đăng ký:
    • Vấn đề: await onChanged() kích hoạt trạng thái loading ở Portal khiến OrganizerAuthView bị unmount trước khi kịp hiển thị hướng dẫn "kiểm tra      email" cho người dùng.
    • Vị trí: OrganizerAuthView.tsx:45, OrganizerPortal.tsx:99.

---------------------------------------------------------------------------------------------------------------------------------------------------
2. Khu vực Wizard Tạo sự kiện (OrganizerEventWizard.tsx)

 • 🔴 [P1] Tiêu đề bước và tiêu đề khối bị tàng hình:
    • Vấn đề: Thân wizard .org-wizard-body có nền trắng, nhưng .wizard-section-intro h3 bị ép màu sáng #f8fafc. Các tiêu đề mục ("Danh sách suất   
      diễn", "Lịch trình hoạt động", "Hạng vé của...", "Dàn nghệ sĩ") cũng dùng inline color: '#f8fafc' nên hòa lẫn vào nền trắng.
    • Vị trí: index.css:5415-5419, OrganizerEventWizard.tsx:737, 879, 1122, 1412.
 • 🔴 [P1] Label và Input mờ/đen trắng lẫn lộn:
    • Vấn đề: Nhãn .wizard-label mang màu xám nhạt #cbd5e1 (độ tương phản chỉ ~1.5:1 trên nền trắng). Ô nhập liệu thì bị biến thành ô đen chữ trắng      lạc lõng giữa nền trắng.
    • Vị trí: index.css:5425-5445.
 • 🔴 [P1] Thẻ thống kê Bước 6 bị "đen trên đen" và tràn lưới:
    • Vấn đề: Khối thẻ .wizard-summary-stat nền tối #080a09, nhưng con số thống kê dùng class .org-stat-value màu tối #0f172a (đen trên đen không  
      thể thấy). Lưới ép cố định 4 cột khiến số liệu lớn bị tràn viền ở màn hình ~800px.
    • Vị trí: index.css:5551-5558, organizer-ui.css:646.
 • 🔴 [P1] Hộp cảnh báo / thông báo lưu ý không đọc được:
    • Vấn đề: .org-alert-warning và .org-alert-info dùng chữ vàng #fde047 và xanh #7dd3fc (thiết kế cho nền tối), khi đặt trên nền sáng khiến các  
      lưu ý bảo vệ thương mại ở Bước 2, 3 và chính sách Bước 6 bị lóa, không đọc được.
    • Vị trí: organizer-ui.css:344-366, OrganizerEventWizard.tsx:643, 1075, 1780.
 • 🔴 [P1] Nút thao tác dài tràn ra ngoài khung modal:
    • Vấn đề: .org-btn có white-space: nowrap. Nút "Sao chép phân khu của {tên suất} sang tất cả các suất diễn" và nút chọn suất dài bị đâm xuyên  
      qua lề modal trên mobile.
    • Vị trí: organizer-ui.css:194, OrganizerEventWizard.tsx:1093, 1105.
 • 🔴 [P1] Nhấn Escape hoặc nút [×] làm mất sạch dữ liệu chưa lưu:
    • Vấn đề: onClose() unmount toàn bộ wizard ngay lập tức; state chỉ lưu tạm trong component nên mọi công sức nhập liệu nhiều bước bị mất trắng  
      mà không có cảnh báo xác nhận hay lưu bản nháp.
    • Vị trí: OrganizerEventWizard.tsx:82, OrganizerPortal.tsx:418.
 • 🔴 [P1] Thiếu quản lý Focus bàn phím (Focus Trap):
    • Vấn đề: Mặc dù có aria-modal="true", wizard không khóa focus. Người dùng bấm Tab vẫn có thể điều hướng ra dashboard bị che mờ phía sau và bấm      nhầm các thao tác khác.
    • Vị trí: OrganizerEventWizard.tsx:409.
 • 🟠  [P2] Header Card nghệ sĩ / Lịch trình bị đè chữ trên mobile:
    • Vấn đề: Header chứa cả ảnh, tên, vai trò và 3 nút thao tác trên cùng 1 hàng, không có flex-wrap, thiếu min-width: 0 và ngắt dòng
      overflow-wrap: anywhere. Tên dài hoặc không dấu cách sẽ đẩy cụm nút văng ra ngoài khung card.
    • Vị trí: OrganizerEventWizard.tsx:929-971, 1455-1507, organizer-ui.css:1231-1247.
 • 🟠  [P2] Tên bước cắt chữ bị lỗi & modal không full-screen mobile:
    • Vấn đề: Ellipsis của .wizard-step-label không hoạt động do phần tử cha thiếu min-width: 0. Modal trên mobile không bung hết toàn màn hình    
      (border-radius: 0 bị CSS cũ chặn).
 • 🟡  [P3] Ô màu hạng vé có thể tràn ô lưới & lặp icon:
    • Vấn đề: Ô type=color kèm text input thiếu min-width: 0 có thể tràn cột ở màn hình hẹp; các nút thêm mới bị lặp cả icon lẫn chữ ("+ Thêm...").
---------------------------------------------------------------------------------------------------------------------------------------------------
3. Khu vực Dashboard & Sidebar Ban tổ chức

 • 🔴 [P1] Thông báo Alert khó đọc: .organizer-message ép chữ vàng #fde68a đè lên nền alert sáng #f8f9fb, khiến thông báo quan trọng ("Công bố sự  
   kiện thành công!") mờ tịt.
 • 🟠  [P2] Sidebar bị xô lệch bố cục: Rule .organizer-layout > aside > div ép margin-top: auto cho cả phần trên lẫn phần dưới sidebar, đẩy khối    
   "Không gian làm việc" lơ lửng ở giữa; toàn bộ span bị ép về chữ 12px nhạt màu.
 • 🟠  [P2] Số liệu thống kê nhạt nhòa: Chữ số "Đã công bố" (#86efac) và "Bản nháp" (#fde047) trên card trắng có độ tương phản cực thấp (~1.4:1).   

---------------------------------------------------------------------------------------------------------------------------------------------------
4. Khu vực Khách xem & Đặt vé (event-template/)

 • 🔴 [P1] Sơ đồ ghế bị co thắt nghẹt thở ở ngưỡng ~1024px:
    • Vấn đề: Layout trang sự kiện desktop chia cột nội dung và booking sidebar (tối thiểu 360px). Bản thân sơ đồ ghế bên trong lại dành thêm 336px      cho summary panel. Gần ngưỡng 1024px, khu vực vẽ sơ đồ ghế chỉ còn vỏn vẹn vài chục pixel do breakpoint của sơ đồ chỉ đổi khi viewport <     
      850px.
    • Vị trí: EventTemplate.tsx:272, event-template.css:730, SeatMapSection.css:97.
 • 🟠  [P2] Giá vé chồng lấn nút bấm ở thanh cố định Mobile (MobileStickyBar):
    • Vấn đề: Ở viewport hẹp (~390–414px), thanh dính dưới cùng gồm nút "Lịch trình", cụm giá vé và nút "Mua vé". Nhóm nút không co (flex-shrink:  
      0), trong khi giá vé có white-space: nowrap nhưng không giới hạn overflow, dẫn tới việc giá vé dài đè chồng lên nút bấm.
    • Vị trí: MobileStickyBar.tsx:117, event-template.css:1328.

---------------------------------------------------------------------------------------------------------------------------------------------------
III. KẾ HOẠCH HÀNH ĐỘNG KHẮC PHỤC (ACTION PLAN)

Khuyến nghị chiến lược: Thống nhất 1 nguồn style duy nhất — chuyển toàn bộ Organizer Portal sang theme nền sáng của organizer-ui.css.


                   ┌──────────────────────────────────────────────┐
                   │ Giai đoạn 1: Triệt tiêu xung đột CSS         │
                   │ (Xóa class cũ trong JSX, dọn index.css,      │
                   │  đảo thứ tự import trong main.tsx)           │
                   └──────────────────────┬───────────────────────┘
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │ Giai đoạn 2: Chuẩn hóa Design Tokens & Màu   │
                   │ (Token nền sáng, sửa Alert, xóa inline color) │
                   └──────────────────────┬───────────────────────┘
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │ Giai đoạn 3: Chống tràn & Khắc phục Bố cục  │
                   │ (line-height, min-width: 0, wrap, mobile bar)│
                   └──────────────────────┬───────────────────────┘
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │ Giai đoạn 4: UX An toàn & Trợ năng (A11y)    │
                   │ (Cảnh báo mất dữ liệu, Focus trap, email)    │
                   └──────────────────────────────────────────────┘


Giai đoạn 1: Triệt tiêu hoàn toàn xung đột CSS (Ưu tiên số 1)

 1 Dọn sạch class legacy khỏi JSX: Loại bỏ triệt để các class cũ trong src/components/organizer-ui/*.tsx: organizer-auth, organizer-auth-tabs,     
   organizer-primary, organizer-message, organizer-layout, organizer-main, wizard-*, checklist-item*. Chỉ giữ lại các class thuộc hệ .org-*.       
 2 Loại bỏ block CSS cũ trong index.css: Xóa bỏ hoặc đóng gói các dòng :4231-4725 và :5275-5639 (sau khi grep xác nhận không còn trang legacy/HTML 
   fragment nào dùng).
 3 Đảo thứ tự import trong main.tsx: Import index.css trước App để style đặc thù của component luôn có độ ưu tiên cao hơn style toàn cục.

Giai đoạn 2: Chuẩn hóa Design Tokens & Tương phản màu sắc

 1 Bổ sung token nền sáng cho organizer-ui.css:
    • Text chính: --org-ink: #0f172a, Text phụ: --org-ink-muted: #475569.
    • Màu Alert nền sáng: Warning (#92400e), Danger (#b91c1c), Success (#166534), Info (#075985).
    • Màu xanh lime #d8ff3e chỉ dùng làm nền nút tương phản với chữ đen, tuyệt đối không dùng làm màu chữ hay đường gạch trên nền trắng.
 2 Xóa toàn bộ inline color: '#fff' và '#f8fafc': Thay thế bằng token/class chuẩn trong OrganizerAuthView.tsx và OrganizerEventWizard.tsx.

Giai đoạn 3: Khắc phục chồng chữ, tràn viền & Bố cục linh hoạt

 1 Typography tiếng Việt: Tăng line-height của các heading lớn lên tối thiểu 1.15 (thay vì 0.92) và nới letter-spacing thành -0.03em để dấu thanh  
   không chạm chữ dòng trên.
 2 Chống vỡ khung flex/grid:
    • Thêm min-width: 0 cho các phần tử chứa text, flex-item và input.
    • Thêm modifier .org-btn--wrap { white-space: normal; text-align: left; } hoặc cắt gọn nhãn cho các nút thao tác dài trong wizard.
    • Cho phép .org-wizard-item-card-header ngắt dòng (flex-wrap: wrap; gap: 12px) khi tên nghệ sĩ/hoạt động dài.
 3 Xử lý Sơ đồ ghế & Mobile Bar:
    • Cho phép Sơ đồ ghế bung toàn chiều ngang (full-width) hoặc áp dụng Container Queries thay vì phụ thuộc Viewport Media Query.
    • Thanh MobileStickyBar: chuyển sang 2 dòng khi màn hình hẹp để giá vé và các nút bấm không đè lên nhau.

Giai đoạn 4: Hoàn thiện UX, Phòng tránh mất dữ liệu & Trợ năng

 1 Bảo vệ dữ liệu Wizard: Thêm dialog xác nhận "Bạn có chắc muốn thoát? Dữ liệu chưa lưu sẽ bị mất" khi nhấn Escape hoặc nút [×], hoặc tự động lưu 
   nháp vào localStorage.
 2 Quản lý Focus Modal (A11y): Thiết lập focus trap khi mở Wizard, khóa cuộn (overflow: hidden) trang nền và trả lại focus cho nút mở khi đóng.    
 3 Giữ thông báo Email: Không unmount OrganizerAuthView ngay khi submit thành công để người dùng kịp đọc hướng dẫn xác thực hòm thư.