# 06 — Supabase Live Readiness Audit

Ngày kiểm tra và khắc phục: 27/10/2026  
Phạm vi: project Supabase `EventTicketing`; audit system catalog, áp dụng corrective migration đã được chủ project phê duyệt, rồi kiểm chứng lại bằng catalog read-only. Không gọi RPC ghi dữ liệu và không thử khai thác trên tài khoản thật.

## 1. Kết luận điều hành

Database **đáp ứng mô hình nghiệp vụ Sprint 1 và đã đóng P0 ACL trước demo live**.

- Thiết kế dữ liệu: đủ cho event, suất diễn, khu vực/ghế, lịch trình, nghệ sĩ, tổ chức, thành viên và giữ chỗ.
- RLS: 14/14 bảng public đã bật. Hai bảng hold không có policy trực tiếp, phù hợp với hướng truy cập qua RPC giao dịch.
- Realtime: publication có `GHE` và `KHU_VUC`.
- Tác vụ nền: cron hết hạn giữ chỗ chạy mỗi 10 giây; 5 lần chạy gần nhất đều thành công tại thời điểm kiểm tra.
- P0 bảo mật đã khắc phục: `public.gan_loai_tai_khoan(text,text)` có guard từ chối `anon/authenticated`; ACL chỉ cho `service_role`. Các RPC mutation của BTC đã bỏ quyền `anon`.
- Vận hành: dashboard báo không có migration history, chưa có backup và chưa kết nối GitHub. Trạng thái live vì vậy không chứng minh được đồng bộ với repository.

Verdict: **READY cho phạm vi demo Sprint 1 sau remediation**. Hai migration `20261027120000_harden_rpc_acls_and_service_boundaries.sql` và `20261027130000_organizer_schedule_lineup_slice.sql` đã chạy thành công trên live; ma trận quyền, policy và RLS sau chạy khớp thiết kế.

## 2. Bằng chứng live

### 2.1 Inventory và dữ liệu

Có 14 bảng trong schema public:

`CHI_TIET_GIU_CHO`, `DIA_DIEM`, `GHE`, `GIU_CHO`, `HO_SO_NGUOI_DUNG`, `KHU_VUC`, `LICH_TRINH`, `NGHE_SI`, `PHIEN_BAN_SO_DO`, `SUAT_DIEN`, `SU_KIEN`, `SU_KIEN_NGHE_SI`, `THANH_VIEN_TO_CHUC`, `TO_CHUC`.

Số bản ghi cốt lõi tại thời điểm kiểm tra:

- `SU_KIEN`: 4; `SUAT_DIEN`: 4; `KHU_VUC`: 14; `GHE`: 48.
- `LICH_TRINH`: 6; `NGHE_SI`: 6; `SU_KIEN_NGHE_SI`: 6.
- `GIU_CHO`: 5; `CHI_TIET_GIU_CHO`: 11.

Các số liệu trên chứng minh dữ liệu Super Concert đã được chuẩn hóa thành quan hệ, thay vì chỉ hard-code trên giao diện.

### 2.2 RLS và RPC

- Cả 14 bảng đều bật RLS.
- 12 bảng có policy trực tiếp.
- `GIU_CHO` và `CHI_TIET_GIU_CHO` không có policy trực tiếp; client phải đi qua hold RPC để giữ transaction/row lock.
- Có 18 hàm `SECURITY DEFINER`; tất cả đặt `search_path=public`.
- Hai overload `lay_loai_tai_khoan` và `la_ban_to_chuc` không còn default argument mơ hồ.

### 2.3 ACL drift P0

ACL live quan sát được:

- `gan_loai_tai_khoan`: `anon`, `service_role` và owner có quyền execute.
- `luu_su_kien_toan_dien`, `cong_bo_su_kien`: cũng có grant `anon`; hai hàm này có kiểm tra `auth.uid()`/membership trong thân hàm nên anonymous bị từ chối, nhưng grant vẫn thừa và vi phạm least privilege.
- `expire_seat_holds`: chỉ owner và `service_role`.
- `tao_giu_cho_theo_suat`: cho `anon` và `authenticated`, phù hợp public booking flow.

`gan_loai_tai_khoan` nghiêm trọng hơn vì hàm đọc `auth.users` và cập nhật `HO_SO_NGUOI_DUNG.LoaiTaiKhoan` với quyền owner nhưng không xác minh caller. RLS/trigger không bù được lỗi này do hàm chạy `SECURITY DEFINER`.

### 2.4 Kết quả remediation và post-flight

Migration đã được Gemini review độc lập với verdict **GO**, sau đó GPT áp dụng trên live. SQL Editor trả `Success. No rows returned`; PostgREST được yêu cầu reload schema bằng `NOTIFY pgrst, 'reload schema'`.

Ma trận `has_function_privilege` sau remediation:

- `gan_loai_tai_khoan`: `anon=false`, `authenticated=false`, `service_role=true`.
- `cong_bo_su_kien`, `luu_su_kien_toan_dien`, `tao_ban_nhap_su_kien`, `tao_to_chuc_cua_toi`: `anon=false`, `authenticated=true`, `service_role=true`.
- `tao_giu_cho_theo_suat`: `anon=true`, `authenticated=true`, `service_role=true`; public booking được giữ nguyên.
- `expire_seat_holds`: `anon=false`, `authenticated=false`, `service_role=true`; cron/backend boundary được giữ nguyên.

Ảnh bằng chứng: `artifacts/supabase-acl-postflight-verified.png`.

### 2.5 Persistence lịch trình/lineup và post-flight

Migration `20261027130000_organizer_schedule_lineup_slice.sql` đã được Gemini review hai vòng, GPT chạy `npm run check` (109/109 test pass), rồi áp dụng trên live sau khi chủ project xác nhận. SQL Editor trả `Success. No rows returned`.

Catalog post-flight chỉ đọc xác nhận:

- `luu_su_kien_toan_dien(p_payload jsonb)`: `SECURITY DEFINER=true`, `search_path=public`, `anon=false`, `authenticated=true`, `service_role=true`.
- Ba policy `Members read event schedule`, `Members read event artists`, `Members read artists` tồn tại, đều là `SELECT` cho role `authenticated`.
- RLS bật trên đủ 3 bảng `LICH_TRINH`, `SU_KIEN_NGHE_SI`, `NGHE_SI`.
- Không gọi RPC mutation với dữ liệu production; transaction atomicity, cross-tenant rejection, in-place schedule update và shared-artist auto-fork được chứng minh bằng pgTAP artifact/local automated tests, còn authenticated round-trip UAT phải chạy trên staging cô lập.

Ảnh bằng chứng: `artifacts/supabase-schedule-lineup-migration-applied.png`, `artifacts/supabase-schedule-lineup-postflight-pass.png`.

## 3. Nguyên nhân gốc

1. Migration cũ revoke từ `PUBLIC` và `authenticated` nhưng không revoke tường minh từ `anon`.
2. Live không có `supabase_migrations.schema_migrations`; SQL nhiều khả năng đã được áp dụng thủ công nên grant cũ tồn tại.
3. Hàm phân quyền dựa hoàn toàn vào ACL, thiếu defense-in-depth trong thân PL/pgSQL.
4. Test Node hiện kiểm tra nội dung SQL tĩnh; các file pgTAP chưa được chạy thực sự trên live.

## 4. Corrective migration trong repository

File `supabase/migrations/20261027120000_harden_rpc_acls_and_service_boundaries.sql` thực hiện:

- Thêm guard từ chối `anon` và `authenticated` ngay trong `gan_loai_tai_khoan`.
- Revoke tường minh `PUBLIC`, `anon`, `authenticated`; chỉ grant hàm phân quyền cho `service_role`.
- Bỏ grant `anon` khỏi các RPC mutation dành cho BTC.
- Giữ public hold RPC theo đúng customer flow.
- Chạy assertion `has_function_privilege` trong transaction để migration fail nếu quyền nguy hiểm còn tồn tại.
- Reload PostgREST schema cache sau commit để ACL mới có hiệu lực ngay ở API layer.

Automated regression test đã được thêm vào `tests/account-boundary.test.mjs`. Sau gói realtime isolation, organizer schedule/lineup authoring, shared React footer/dialog và React runtime overlays, kết quả repository hiện tại là: TypeScript pass, **122/122 test pass**, production build pass.

## 5. Checklist trước demo

1. [x] Chủ project phê duyệt corrective migration trên Supabase live.
2. [x] Áp dụng migration và reload PostgREST schema cache.
3. [x] Xác minh catalog cho đủ 7 RPC trọng yếu; kết quả khớp policy.
4. [x] Ghi ảnh ACL sau sửa làm evidence.
5. [ ] Chạy negative case `42501` và pgTAP/SQL acceptance trên staging, không khai thác tài khoản live.
6. [ ] Thiết lập migration tracking, backup và liên kết repository để giảm schema drift.
7. [x] Áp dụng migration persistence schedule/lineup và xác minh RPC ACL, 3 policy organizer, RLS trên 3 bảng.

## 6. Rủi ro còn lại sau khi sửa P0

- Realtime `GHE` đã được scope trong repository theo zone của suất diễn bằng server-side `in` filters và client-side membership guard; vẫn cần ghi browser/staging evidence trên live data.
- `src/types/database.types.ts` chưa phản ánh đầy đủ schema mới; một số service phải dùng cast lỏng.
- Organizer aggregate đã có UI ghi/preview `LICH_TRINH` và lineup; migration additive đã chạy live và catalog post-flight pass. Authenticated mutation UAT/pgTAP vẫn cần chạy trên staging cô lập.
- Fallback tìm nghệ sĩ chỉ bằng nghệ danh dùng `LIMIT 1` khi payload thiếu `artistId`; client hiện luôn gửi ID nên không chặn demo, nhưng nên thêm tie-breaker xác định trong migration tương lai.
- Concurrency hold mới có bằng chứng thiết kế/static SQL; cần chạy hai session thật trên staging.

Các mục này là P1/P2 tiếp theo. ACL P0 và persistence schedule/lineup đã đóng ở tầng live schema/catalog; live có thể dùng trong phạm vi demo Sprint 1 đã nêu.
