KẾT LUẬN: NO-GO

Không áp các migration Sprint 2 lên staging ở trạng thái hiện tại. Hai điều kiện chặn đã được kiểm chứng: staging không có lịch sử migration do Supabase CLI quản lý (25 migration trong repo đều chỉ có ở Local), và dry-run dừng tại migration thứ hai vì cả `anon` lẫn `authenticated` đang có quyền `INSERT`, `UPDATE`, `DELETE` trực tiếp trên `public."GHE"`. Báo cáo này chỉ đọc staging; không migration nào được áp lên staging và không dữ liệu staging nào bị ghi/sửa/xóa.

## 1. Mục đích

- Kiểm tra project Supabase staging `qxkgkbayxxaakkwtepss` trước khi quyết định áp 9 migration Sprint 2, từ `20261112090000_sprint2_pricing_tables.sql` đến `20261115100000_sprint2_purchase_config.sql`.
- Đối chiếu lịch sử migration, hiện trạng schema, dữ liệu demo, Auth và Realtime.
- Phân tích rủi ro của từng migration đối với dữ liệu staging hiện có.
- Tạo backup schema và dữ liệu ngoài repo.
- Dry-run trên Supabase local bằng bản dump staging, không ghi vào staging.

## 2. Môi trường

| Thành phần | Giá trị đã kiểm chứng |
|---|---|
| Repo | `D:\FTU\Year 3\First\Phân tích và thiết kế hệ thống\Eventticketing` |
| Nhánh nguồn | `sprint2/w6-tich-hop` tại commit `f446496` (dùng theo chỉ dẫn vì W6 chưa được xác nhận có trên `main`) |
| Nhánh báo cáo | `docs/sprint2-supabase-preflight` |
| Supabase project | `qxkgkbayxxaakkwtepss` (`EventTicketing`, production branch của project staging) |
| Supabase CLI | `3.2.0`, chạy bằng `npx --yes supabase@3.2.0` |
| PostgreSQL staging | `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit` |
| Thời điểm kiểm tra | 22/11/2026, múi giờ Asia/Saigon |
| Credential trong báo cáo | Access token, anon key, service-role key, JWT và mật khẩu DB: `***` |

Đã chạy `supabase link --project-ref qxkgkbayxxaakkwtepss` thành công sau khi đăng nhập CLI bằng luồng OAuth chính thức. Không trích xuất token từ Dashboard và không ghi token vào repo/báo cáo.

## 3. Các bước đã thực hiện

1. Xác nhận repo sạch, đang ở nhánh `sprint2/w6-tich-hop`; tạo nhánh `docs/sprint2-supabase-preflight`.
2. Chạy đúng Supabase CLI 3.2.0, đăng nhập và link project staging.
3. Chạy `supabase migration list --remote`; đối chiếu với `supabase/migrations`.
4. Dùng SQL Editor chỉ chạy `SELECT` để đọc phiên bản PostgreSQL, extension, bảng public, số dòng, Auth count, publication Realtime, object Sprint 2, chữ ký hàm và dữ liệu có nguy cơ.
5. Chạy hai script kiểm chứng công khai với biến môi trường staging từ `.env.local`; không in khóa.
6. Chạy `supabase db dump` cho schema và data vào thư mục ngoài repo; kiểm tra kích thước, dòng đầu và SHA-256.
7. Khởi động Supabase local tạm bằng Docker, restore schema và dữ liệu public từ staging, xác nhận số dòng, chép đúng 9 migration Sprint 2 và chạy `supabase migration up --local`.
8. Xác nhận lại quyền `GHE` trực tiếp trên staging bằng `has_table_privilege`; dừng và xóa volume Supabase local tạm sau khi dry-run.

Không chạy `db reset` trên staging, không đổi Auth, không sửa migration, không áp migration, không ghi dữ liệu staging.

## 4. Kết quả theo tiêu chí và rủi ro từng migration còn thiếu

### 4.1. Đối chiếu migration

`supabase migration list --remote` chạy thành công nhưng cột Remote trống cho toàn bộ 25 migration trong repo. SQL Editor cũng trả lỗi nguyên văn khi đọc lịch sử:

```text
ERROR: 42P01: relation "supabase_migrations.schema_migrations" does not exist
```

- Có ở repo nhưng không có trong lịch sử Remote: toàn bộ 25 migration (xem phụ lục 8.1).
- Có trong Remote nhưng không có ở repo: không có.
- Chín migration Sprint 2: đều thiếu trên staging theo lịch sử và theo kiểm tra object vật lý.
- Schema vật lý cho thấy các bảng/nghiệp vụ trước Sprint 2 đã tồn tại, nhưng không được ghi nhận trong lịch sử migration. Vì vậy không được chạy `db push` trực tiếp: CLI có thể cố áp lại toàn bộ chuỗi local.
- Migration `20261104100000_seed_ticketgo_and_ticketmaster_events.sql` từng bị sửa sau khi áp theo `docs/LOCAL_DEV_DATABASE.md`. Do staging không có bảng lịch sử migration, không thể đối chiếu checksum/nội dung đã áp; ghi nhận sai lệch này và không sửa file.

### 4.2. Bảng rủi ro và dry-run

| Migration còn thiếu | Rủi ro với dữ liệu/luồng hiện có | Kết quả dry-run | Kết luận |
|---|---|---|---|
| `20261112090000_sprint2_pricing_tables.sql` | Thêm `CHI_TIET_GIU_CHO.DonGiaChot` và `GIU_CHO.NguoiDungID` dạng nullable nên 8 giữ chỗ cũ không cần backfill. Thêm `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP BOOLEAN NOT NULL DEFAULT FALSE`; 6 dòng hiện có nhận mặc định, không có dòng cấu hình ngoài khoảng `SoVeToiDaMoiDon` 1–20. Ba bảng giá mới rỗng nên các `UNIQUE`, FK và `CHECK` chưa xung đột dữ liệu cũ. Có lock DDL trên ba bảng hiện hữu nhưng quy mô staging nhỏ. | **Đạt**: migration được áp thành công trên bản restore local. | Bản thân migration này có thể áp trên dữ liệu hiện có, nhưng không được áp riêng lẻ khi chuỗi/historic baseline chưa được xử lý. |
| `20261112100000_sprint2_ghe_state_time.sql` | Cột `GHE.NgayCapNhatTrangThai` nullable, không backfill; trigger chỉ ghi thời gian khi `TrangThai` đổi. Tuy nhiên assertion yêu cầu `anon/authenticated` không có quyền ghi trực tiếp `GHE`. Staging thực tế cấp cả INSERT/UPDATE/DELETE cho cả hai role. | **Không đạt**. Lỗi nguyên văn: `ERROR: MIGRATION ASSERTION FAILED: authenticated/anon can write GHE directly (SQLSTATE P0001)` tại statement 5. | **Chặn triển khai.** Cần người dùng quyết định cách đồng bộ quyền với migration trước `20261111090000_server_side_seat_generation.sql`; báo cáo không tự sửa quyền hay migration. |
| `20261112110000_sprint2_pricing_security.sql` | Chỉ siết ACL/RLS ba bảng giá mới và tạo trigger bất biến cho `NHAT_KY_GIA`. Bảng mới chưa có dữ liệu nên trigger không làm hỏng dòng cũ. Sau khi áp, client không thể ghi trực tiếp; luồng phải qua RPC. | **Chưa chạy** vì migration trước thất bại và `migration up` dừng. | Rủi ro dữ liệu thấp; phụ thuộc xử lý blocker quyền `GHE` và migration đầu tiên. |
| `20261113090000_sprint2_pricing_rpc.sql` | Tạo bảng log định giá mới và nhiều RPC/trigger. Assertion của file cũng yêu cầu `anon/authenticated` không ghi `GHE`, nên với quyền hiện tại sẽ tiếp tục thất bại nếu đi tới đây. Các hàm đọc `GHE.NgayCapNhatTrangThai`, phụ thuộc migration trước. 16 khu vực hiện không có giá niêm yết NULL/≤0/≥10 tỷ nên không vướng guard giá hiện hành. | **Chưa chạy** vì migration thứ hai thất bại. | Chặn bởi quyền `GHE`; không có xung đột dòng cũ ở bảng log mới. |
| `20261113093000_sprint2_pricing_guard.sql` | Tạo unique partial index: tối đa một `DE_XUAT_GIA` trạng thái `PENDING` cho mỗi khu vực. Bảng `DE_XUAT_GIA` chưa tồn tại trên staging và sẽ mới/rỗng sau migration đầu, nên không có duplicate cũ. Khi vận hành, proposal quá 120 phút bị chuyển `EXPIRED`; các luồng phải xử lý kết quả `BI_CHAN` thay vì chỉ dựa vào exception. | **Chưa chạy** vì migration thứ hai thất bại. | Không có rủi ro dữ liệu hiện hữu; có thay đổi hợp đồng ứng dụng cho đề xuất giá. |
| `20261113100000_sprint2_demand_simulator.sql` | Tạo bảng mô phỏng mới và RPC có thể cập nhật trạng thái `GHE` khi được gọi; bản thân migration không đổi dữ liệu ghế. File có assertion khóa quyền ghi trực tiếp `GHE`, nên quyền hiện tại cũng là blocker. Khi sử dụng mô phỏng, trigger migration thứ hai sẽ ghi thời điểm đổi trạng thái. | **Chưa chạy** vì migration thứ hai thất bại. | Chặn bởi quyền `GHE`; cần bảo đảm chỉ role/RPC được ủy quyền gọi mô phỏng. |
| `20261114090000_sprint2_price_approval.sql` | Staging chưa có `duyet_de_xuat_gia`/`tu_choi_de_xuat_gia`, nên lệnh bỏ overload cũ không đụng hàm hiện hữu. RPC mới cập nhật giá khu vực và log khi được gọi, không tự sửa dữ liệu lúc migration. Tất cả 16 giá khu vực hiện nằm trong miền hợp lệ cho guard cơ bản. | **Chưa chạy** vì migration thứ hai thất bại. | Rủi ro dữ liệu hiện hữu thấp; cần kiểm thử phân quyền và optimistic locking sau khi blocker được xử lý. |
| `20261115090000_sprint2_otp_limit_hold.sql` | Viết lại `tao_giu_cho_theo_suat(bigint, uuid, jsonb)` cùng chữ ký hiện có, nhưng đổi hợp đồng: bắt buộc `auth.uid()`, thu hồi EXECUTE của `anon`, kiểm tra OTP khi cấu hình yêu cầu và giới hạn số vé. 8 giữ chỗ lịch sử không bị sửa; thời điểm kiểm tra có 0 giữ chỗ `DANG_GIU` chưa hết hạn. Tuy nhiên luồng giữ chỗ ẩn danh đang dùng trên staging sẽ bị chặn với `Can dang nhap de giu cho`. | **Chưa chạy** vì migration thứ hai thất bại. | Thay đổi hành vi có chủ ý nhưng ảnh hưởng người dùng demo. Phải thông báo và triển khai UI đăng nhập trước/cùng đợt. |
| `20261115100000_sprint2_purchase_config.sql` | Tạo bảng audit mới với `CHECK` 1–20; không có dữ liệu cũ trong bảng mới. Sáu dòng `CAU_HINH_SU_KIEN` hiện đều có `SoVeToiDaMoiDon` trong 1–20. Trigger mới chặn/ghi audit thay đổi cấu hình mua vé, chỉ cho chủ sở hữu/quản trị; bỏ đường DELETE client và viết lại wrapper `luu_su_kien_toan_dien`. Luồng editor hiện tại có thể bị chặn nếu thay đổi max vé/OTP hoặc gửi giá mặc định khác dữ liệu lưu. | **Chưa chạy** vì migration thứ hai thất bại. | Cần regression test luồng lưu sự kiện của editor và phân biệt thay đổi cấu hình mua vé với cập nhật cấu hình khác. |

## 5. Số liệu và bằng chứng kiểm tra

### 5.1. Extension đang bật

| Extension | Phiên bản |
|---|---:|
| `pg_cron` | 1.6.4 |
| `pg_stat_statements` | 1.11 |
| `pgcrypto` | 1.3 |
| `pgtap` | 1.3.3 |
| `plpgsql` | 1.0 |
| `supabase_vault` | 0.3.1 |
| `uuid-ossp` | 1.1 |

### 5.2. Bảng public

Có 14 bảng:

`CAU_HINH_SU_KIEN`, `CHI_TIET_GIU_CHO`, `DIA_DIEM`, `GHE`, `GIU_CHO`, `HO_SO_NGUOI_DUNG`, `KHU_VUC`, `NGHE_SI`, `PHIEN_BAN_SO_DO`, `SUAT_DIEN`, `SU_KIEN`, `SU_KIEN_NGHE_SI`, `THANH_VIEN_TO_CHUC`, `TO_CHUC`.

### 5.3. Số dòng

| Bảng/nguồn | Số dòng |
|---|---:|
| `SU_KIEN` | 6 |
| `SUAT_DIEN` | 6 |
| `KHU_VUC` | 16 |
| `GHE` | 48 |
| `GIU_CHO` | 8 |
| `HO_SO_NGUOI_DUNG` | 5 |
| `TO_CHUC` | 3 |
| `THANH_VIEN_TO_CHUC` | 2 |
| `CAU_HINH_SU_KIEN` | 6 |
| `auth.users` (chỉ số lượng) | 5 |

Số liệu rủi ro bổ sung: 0 giữ chỗ `DANG_GIU` chưa hết hạn; 0 khu vực có `GiaVeNiemYet` NULL/≤0/≥10 tỷ; 0 cấu hình sự kiện có `SoVeToiDaMoiDon` ngoài 1–20.

### 5.4. Realtime và object Sprint 2

- Publication `supabase_realtime`: `public.GHE`, `public.KHU_VUC`; cả hai bảng yêu cầu đều có.
- Chưa có bảng: `QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA`, `NHAT_KY_CAU_HINH_MUA_VE`.
- Chưa có hàm: `luu_de_xuat_gia`, `duyet_de_xuat_gia`, `tu_choi_de_xuat_gia`, `da_xac_minh_otp`, `luu_cau_hinh_mua_ve`.
- Có hàm cũ: `tao_giu_cho_theo_suat(p_suat_dien_id bigint, p_phien_id uuid, p_items jsonb) RETURNS jsonb`; migration OTP giữ nguyên chữ ký nhưng thay toàn bộ thân hàm và quyền gọi.
- Quyền hiện tại trên `GHE`: `anon` và `authenticated` đều có `INSERT=true`, `UPDATE=true`, `DELETE=true`.

### 5.5. Script kiểm chứng

`node scripts/verify-supabase-auth-config.mjs`: **đạt**.

- Project URL đúng staging.
- GoTrue `v2.198.0`.
- Signup và email provider bật.
- `mailerAutoconfirm=false`, vì vậy bắt buộc xác nhận email.
- Script báo độ dài mật khẩu tối thiểu 6.

`node scripts/verify-supabase-public.mjs`: **đạt**.

- Event ID 1 công khai (`CONG_KHAI`).
- Trạng thái bán `DANG_MO_BAN`.
- Anon gọi RPC riêng `expire_seat_holds` nhận HTTP 401, đúng kỳ vọng bị chặn.

### 5.6. Backup

Backup hợp lệ nằm ngoài repo:

`D:\backup-supabase\staging-20261122-230249\`

| File | Kích thước | Dòng không rỗng đầu tiên | SHA-256 |
|---|---:|---|---|
| `schema.sql` | 465.531 byte | `SET statement_timeout = 0;` | `D5B422E2A56B257237E55DC3E03CE7A556FBA1FC9E04FE138CDFB424F67F7843` |
| `data.sql` | 52.575 byte | `SET session_replication_role = replica;` | `D879B5ADEAFA83D721B66A97E918A835AE79218651B832B10DA3A938CF6FBC92` |

Hai file không nằm trong repo và không được commit. Bộ backup thử đầu tiên bị nối lặp đã bị xóa; file data-public phục vụ riêng dry-run cũng đã bị xóa sau khi dùng.

## 6. Sự cố và cách xử lý

1. Lần `link` đầu tiên lỗi `Access token not provided...`; đã giải quyết bằng luồng đăng nhập CLI chính thức, không ghi token vào báo cáo.
2. Bảng `supabase_migrations.schema_migrations` không tồn tại; `migration list --remote` xác nhận toàn bộ Remote trống. Đây là hiện trạng staging, chưa sửa.
3. Supabase CLI 3.2.0 trả quyền điều khiển trước khi container dump schema kết thúc. Việc chạy lại cùng file đã tạo schema nối lặp; bộ lỗi đã bị xóa. Bộ cuối được tạo ở thư mục timestamp mới, chờ container kết thúc và kiểm tra header chỉ xuất hiện một lần.
4. Restore `data.sql` mặc định vào local gặp lỗi nguyên văn `ERROR: permission denied for table buckets_vectors` vì dump chứa dữ liệu hệ thống không phù hợp quyền local. Để dry-run migration trên dữ liệu nghiệp vụ, đã tạo tạm data-only cho schema `public`, restore thành công rồi xóa file tạm. Số dòng local sau restore khớp: `SU_KIEN=6`, `GHE=48`, `GIU_CHO=8`.
5. Lần gọi `migration up` đầu tiên trên project tạm lỗi `failed to read directory: BadResource` do đường dẫn `migrations` tạm bị tạo nhầm thành file; chưa migration nào chạy. Đã sửa cấu trúc thư mục tạm, xác nhận đủ 9 file rồi chạy lại.
6. Dry-run hợp lệ: migration đầu đạt; migration thứ hai dừng với assertion quyền `GHE`. Đã xác nhận cùng quyền trực tiếp trên staging, không phải sai lệch của bản restore.
7. Restore schema local phát nhiều warning `no privileges were granted` cho các hàm pgtap đã có sẵn; đây là warning không chặn, restore dữ liệu public và kiểm tra số dòng vẫn hoàn tất.
8. Supabase local đã được dừng và volume tạm đã bị xóa sau khi dry-run.

## 7. Việc còn lại cho người dùng

Các điều kiện bắt buộc trước khi chuyển sang GO:

1. Quyết định phương án sửa hiện trạng quyền `GHE` trên staging để khớp với thiết kế server-side seat generation. Việc này làm thay đổi CSDL nên báo cáo dừng tại đây, không tự thực hiện.
2. Quyết định cách thiết lập/baseline lịch sử migration cho staging. Không chạy `db push` khi Remote trống vì có nguy cơ áp lại cả 25 migration trên schema đã tồn tại. Không dùng `migration repair` nếu chưa duyệt chính xác các phiên bản thực sự đã được áp vật lý.
3. Sau hai quyết định trên, tạo backup mới và lặp lại dry-run từ đầu; yêu cầu cả 9 migration chạy hết, không chỉ vượt migration thứ hai.
4. Chuẩn bị rollout thay đổi bắt buộc đăng nhập khi giữ chỗ: thông báo người dùng demo, cập nhật UI/flow đăng nhập và xác nhận email, kiểm thử lỗi hết phiên/OTP.
5. Regression test quyền tổ chức và luồng lưu sự kiện: chủ sở hữu/quản trị được đổi max vé/OTP; editor thường không bị chặn khi chỉ sửa cấu hình không liên quan; không còn đường DELETE cấu hình từ client.
6. Giữ nguyên migration cũ, đặc biệt không sửa lại `20261104100000_seed_ticketgo_and_ticketmaster_events.sql`.

## 8. Phụ lục

### 8.1. Danh sách Local có, Remote không có

```text
20260927000000_event_ticketing_sprint1.sql
20260927120000_secure_seat_holds.sql
20260929090000_sprint1_publication_policy.sql
20260929120000_sprint1_hold_hardening.sql
20261005090000_product_foundation.sql
20261005150000_marketplace_organizer_mvp.sql
20261006190000_organizer_event_creation_slice.sql
20261006210000_user_organizer_boundary.sql
20261007090000_fix_account_role_function_overload.sql
20261027120000_harden_rpc_acls_and_service_boundaries.sql
20261027130000_organizer_schedule_lineup_slice.sql
20261028100000_schema_timeline_cleanup_and_explicit_relationships.sql
20261103090000_restrict_event_configuration_writes.sql
20261103221500_update_all_events_to_november.sql
20261104100000_seed_ticketgo_and_ticketmaster_events.sql
20261111090000_server_side_seat_generation.sql
20261112090000_sprint2_pricing_tables.sql
20261112100000_sprint2_ghe_state_time.sql
20261112110000_sprint2_pricing_security.sql
20261113090000_sprint2_pricing_rpc.sql
20261113093000_sprint2_pricing_guard.sql
20261113100000_sprint2_demand_simulator.sql
20261114090000_sprint2_price_approval.sql
20261115090000_sprint2_otp_limit_hold.sql
20261115100000_sprint2_purchase_config.sql
```

Remote có mà repo không có: không có.

### 8.2. Lệnh chính đã chạy

```text
npx --yes supabase@3.2.0 link --project-ref qxkgkbayxxaakkwtepss
npx --yes supabase@3.2.0 migration list --remote
node scripts/verify-supabase-auth-config.mjs
node scripts/verify-supabase-public.mjs
npx --yes supabase@3.2.0 db dump --remote --file <ngoài-repo>\schema.sql
npx --yes supabase@3.2.0 db dump --remote --data-only --use-copy --file <ngoài-repo>\data.sql
npx --yes supabase@3.2.0 start --workdir <project-tạm>
npx --yes supabase@3.2.0 migration up --local --workdir <project-tạm>
npx --yes supabase@3.2.0 stop --no-backup --workdir <project-tạm>
```

Mọi bí mật dùng trong các lệnh/biến môi trường được ghi là `***` và không xuất hiện trong file này.
