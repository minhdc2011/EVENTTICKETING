# 05 — Ma trận truy vết, kiểm thử và đóng Sprint 1

## 1. Requirements Traceability Matrix

| Requirement | Thiết kế / dữ liệu | Hiện thực | Bằng chứng test | Trạng thái |
|---|---|---|---|---|
| FR-U01/02 | Route event/show; `SU_KIEN 1:N SUAT_DIEN` | `App.tsx`, `publicRoute`, `EventCatalog` | `product-foundation.test.mjs` | Pass |
| FR-U03 | `KHU_VUC` theo suất diễn | `eventService`, `TicketTiersSection` | `event-template.test.mjs` | Pass |
| FR-U04 | `GHE`, Realtime publication | `seatRealtimeService`, `seatRealtime` domain, seating extension | `seat-realtime.test.mjs` + migration/tests | Pass: server filter theo zone/show + client guard; browser staging evidence còn cần bổ sung |
| FR-U05 | `GIU_CHO`, `CHI_TIET_GIU_CHO`, RPC transaction | `bookingService`, `tao_giu_cho`, `huy_giu_cho` | SQL/unit checks hiện có | Backend pass; checkout E2E pending |
| FR-O01 | Account type boundary | `BuyerAuth`, `OrganizerAuthView`, role RPC | `account-boundary.test.mjs` | Pass |
| FR-O02 | `TO_CHUC`, membership/RBAC/RLS | organizer service + policies | `account-boundary`, pgTAP | Pass ở tầng code/DB |
| FR-O03 | Aggregate event/show/tier/schedule/lineup | `OrganizerEventWizard`, `luu_su_kien_toan_dien` | `organizer-uat.test.mjs` + `organizer-schedule-lineup.test.mjs` + live catalog post-flight | **Pass live ở tầng schema/ACL/RLS**; authenticated mutation UAT chờ staging cô lập |
| FR-O04 | Preview draft | preview route + `EventHeader` banner | route/template tests | Pass tự động; browser UAT cần tái xác nhận |
| FR-O05 | Publish readiness/RPC | organizer logic + `cong_bo_su_kien` | organizer UAT/product foundation tests | Pass tự động |
| FR-O06 | Shared template + extension slots | `GenericEventPage`, `EventTemplate` | architecture invariant tests | Pass |
| FR-U06 | Lịch trình sự kiện theo dữ liệu | `LICH_TRINH`, `scheduleService`, `publicSchedule`, `ScheduleDialog` | `public-schedule.test.mjs` + browser QA | Pass |
| NFR-01 | RLS, role checks, secure RPC | migrations | account/product tests + pgTAP artifacts + live ACL audit/post-flight | **Pass live:** P0 ACL đã sửa; 7 RPC trọng yếu khớp ma trận quyền thiết kế |
| NFR-02 | Row lock + expiry | hold RPC | migration review | Cần concurrency load test bổ sung |
| NFR-05/06 | Accessibility/responsive contracts | template CSS/tokens | CSS invariant tests | Pass tự động |

## 2. Kết quả verification ngày 28/10/2026

Lệnh: `npm run check`

- TypeScript: pass, 0 lỗi.
- Automated tests: **122/122 pass**, 0 fail, 0 skipped.
- Production build: pass, 142 modules transformed.
- Cảnh báo còn lại: `organizerService` vừa static vừa dynamic import nên chưa tách chunk; bundle JS chính khoảng 525 kB trước gzip. Đây là tối ưu kỹ thuật, không chặn Sprint 1.
- Visual QA: Super Concert và event do BTC tạo dùng cùng mobile sticky dark/frosted; CTA đóng bán không gợi ý mua; mã máy `AM_NHAC` được loại khỏi nội dung trình bày.
- Lineup Super Concert: đã chuyển sang React/data-driven, đọc quan hệ `SU_KIEN_NGHE_SI` → `NGHE_SI`; section tự ẩn nếu event không có nghệ sĩ.
- Timeline: đã chuyển từ HTML hard-code sang React/data-driven, đọc `LICH_TRINH`; 6 hoạt động Super Concert hiển thị đúng thứ tự, các trigger header/mobile/footer cùng mở một controlled dialog.
- Footer & Runtime Overlays: footer/team dialog dùng React chung; tooltip ghế, toast và modal xác nhận hold cũng đã chuyển sang React (`SeatTooltip`, `RuntimeToastContainer`, `BookingHoldModal`). Adapter có cấu trúc thay thế DOM string injection và global `simulateNextSprint`.
- Accessibility QA: Tab và Shift+Tab không thoát khỏi dialog; Escape đóng và trả focus đúng nút mở; viewport hẹp không clip ngang timeline; touch target của footer links và buttons đều đạt >= 44px.
- Live Supabase audit/remediation: 14 bảng public đều bật RLS; cron hết hạn hold đang chạy thành công. ACL drift P0 đã được khắc phục và xác minh: RPC phân quyền chỉ còn `service_role`, RPC mutation của BTC chặn `anon`, public booking và cron boundary được giữ nguyên.
- Repository remediation: `20261027120000_harden_rpc_acls_and_service_boundaries.sql` thêm role guard trong thân hàm, revoke tường minh `PUBLIC/anon/authenticated`, thu hẹp các organizer RPC và có assertion chống hồi quy.
- Realtime isolation: trước khi subscribe, client resolve `KHU_VUC` theo `SuatDienID`; đăng ký `KhuVucID=in.(...)` phía server theo chunk tối đa 100 zone trên một channel và kiểm tra membership lần nữa ở client. Zero-zone không tạo subscription toàn cục; cleanup trước/sau async setup đều được test.
- Organizer content parity: wizard đã có editor lặp, sắp xếp được cho `LICH_TRINH` và lineup nghệ sĩ; mock/Supabase load fail-closed, shared `EventTemplate` tự render dữ liệu và không rò fallback Super Concert. Migration additive `20261027130000_organizer_schedule_lineup_slice.sql` đã áp dụng live thành công sau hai vòng Gemini review và GPT acceptance.
- Live post-flight schedule/lineup: RPC `luu_su_kien_toan_dien(p_payload jsonb)` có `SECURITY DEFINER`, `search_path=public`, `anon=false`, `authenticated=true`, `service_role=true`; đủ 3/3 policy organizer `SELECT`; RLS bật 3/3 bảng `LICH_TRINH`, `NGHE_SI`, `SU_KIEN_NGHE_SI`. Bằng chứng: `artifacts/supabase-schedule-lineup-migration-applied.png` và `artifacts/supabase-schedule-lineup-postflight-pass.png`.
- Browser QA: event UAT đã hiển thị đúng empty state và CTA của hai editor tại Step 2/4; footer React xuất hiện trên event thường mà không lộ nút lịch trình khi dữ liệu rỗng; Super Concert có nút lịch trình và mở đúng controlled dialog. Team dialog đã pass focus trap, Escape và focus restoration. QA ngày 28/10 xác nhận ghế `VVIP-B-03` hiện đúng tooltip (khu/hàng/số/giá 4.500.000 VNĐ), event đóng bán hiện đúng React toast và overlay tự ẩn khi rời ghế. Modal hold không bị ép mở trên live khi sale đã đóng. Bằng chứng trước đó ở `artifacts/organizer-schedule-editor-qa.png`, `artifacts/organizer-lineup-editor-qa.png`, `artifacts/shared-react-footer-generic-qa.png`, `artifacts/shared-react-footer-super-concert-qa.png` và `artifacts/shared-react-team-dialog-qa.png`.

## 3. UAT cần trình diễn với cô

| Kịch bản | Dữ liệu | Kết quả mong đợi |
|---|---|---|
| BTC tạo event mới | Tổ chức hợp lệ, 1 show, >=1 tier | Lưu draft và preview đúng dữ liệu |
| Công bố thiếu dữ liệu | Thiếu show/tier/thời gian | Hệ thống chặn và nêu lỗi cụ thể |
| Đồng bộ UI | Super Concert + event vừa tạo | Cùng header/hero/tier/venue/policy/contact/CTA; concert do BTC tạo có thể thêm lineup/lịch trình, seating vẫn là extension |
| Truy vết lịch trình/lineup | `LICH_TRINH`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | BTC nhập–sắp xếp–lưu–preview; UI công khai hiển thị đúng thứ tự; event rỗng không nhận fallback concert |
| Cách ly tenant | User thuộc tổ chức A truy cập event B | Không có quyền ghi/không lộ draft |
| Giữ ghế cạnh tranh | Hai session chọn cùng ghế | Một request thành công, request sau bị từ chối |
| Hết hạn hold | Không checkout trong 5 phút | Hold `EXPIRED`, ghế trở lại `TRONG` |
| Responsive/accessibility | 375px và desktop, keyboard | Không clip CTA; focus rõ; nội dung đọc được |

## 4. Definition of Done Sprint 1

- [x] Có mô hình actor/use case/activity/sequence/ERD và ánh xạ tới code.
- [x] Một event-detail composition dùng chung cho event mặc định và Super Concert.
- [x] BTC có luồng tạo–preview–công bố và ranh giới quyền theo tổ chức.
- [x] Có mô hình dữ liệu show/tier/seat/hold và giữ chỗ 5 phút ở backend.
- [x] Full automated suite pass.
- [x] Có audit Supabase live và corrective migration chống ACL drift trong repository.
- [x] Áp dụng corrective migration lên Supabase live và xác minh đủ 7 RPC bằng system catalog.
- [x] BTC có UI authoring lịch trình và lineup dùng chung public template; browser QA empty state/CTA đã pass.
- [x] Áp dụng migration persistence lịch trình/lineup lên Supabase live và hậu kiểm RPC ACL, policy, RLS bằng catalog read-only.
- [x] Footer/team dialog dùng React chung cho mọi event; loại bỏ custom-event bridge và QA accessibility trên trình duyệt.
- [x] Tooltip ghế, toast và modal xác nhận hold dùng React; loại bỏ string injection/global handler, có test duration/focus/timer cleanup.
- [ ] Thực hiện lại authenticated browser UAT với đủ tài khoản đã xác minh email.
- [ ] Ghi video hoặc ảnh minh chứng hai session tranh cùng ghế trên staging.

## 5. Backlog ưu tiên

1. P0: chạy pgTAP + authenticated round-trip UAT cho schedule/lineup trên staging cô lập; không tạo dữ liệu thử trên live.
2. P0: UAT staging hoàn chỉnh và evidence cho RLS/concurrency.
3. P0: checkout/payment idempotent; chuyển hold → order → ticket.
4. P1: browser/staging evidence cho realtime isolation và hai session tranh cùng ghế.
5. P1: sinh lại `database.types.ts` trực tiếp từ schema staging/live và loại bỏ `as any`.
6. P1: QR động, offline scan và đồng bộ sau mạng yếu.
7. P1: waiting room/anti-bot/rate limit và load test quy mô concert.
8. P1: dashboard tồn kho/doanh thu/check-in cho BTC.
9. P2: dynamic pricing với sàn/trần và audit log.
10. P2: migrate phần SVG/state/event handling còn lại của `SeatingSection` sang React; loại bỏ `concertRuntime.js`.
11. P2: thêm tie-breaker xác định (`ORDER BY NgheSiID`) cho fallback tìm nghệ sĩ theo nghệ danh khi payload bên ngoài thiếu `artistId`.

## 6. Kết luận

Sprint 1 đủ nền tảng để trình bày chuỗi **phân tích → thiết kế → triển khai → kiểm thử**, không phải chỉ là landing page. P0 ACL và persistence lịch trình/lineup trên live đã được áp dụng và xác minh ở tầng catalog, nên có thể trình bày marketplace, organizer flow, dữ liệu event/show/tier/schedule/artist/seat và backend hold. Payment, QR, refund, queue, authenticated mutation evidence, concurrency evidence và tải lớn vẫn là backlog.

