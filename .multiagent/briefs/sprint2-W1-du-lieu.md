# Đợt W1 Sprint 2: nền dữ liệu (ban A)

Chạy bằng `agentkit team`. **Đọc trước:** `.multiagent/briefs/sprint2-spec.md` (mục 0, 1, 7, 8) và bản nháp `.multiagent/briefs/dp_schema_draft.sql.txt` (chưa chạy trên Postgres: rà soát và sửa lỗi, không chép nguyên).

**Mục tiêu:** có đủ 17 bảng, cột mới, bảo mật và test CSDL cho Sprint 2. Không viết RPC nghiệp vụ, giao diện hay engine (các đợt sau).
**WBS:** 2.2, 3.2 (phần cột), 4.2, 4.10. **Điều kiện đầu vào:** `sprint2/integration` có sẵn đợt trước (không có, đây là đợt đầu); migration mới nhất hiện là `20261111090000`.

## Gợi ý chia task (Astra có thể điều chỉnh, không được bỏ tiêu chí)

| Task | Ban | Chế độ | Sau | Việc | Tiêu chí (kiểm bằng đọc code hoặc gate) |
|---|---|---|---|---|---|
| T1 | A | pair | | Migration `20261112090000_sprint2_pricing_tables.sql`: bảng `QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA`; cột `CHI_TIET_GIU_CHO.DonGiaChot`, `GIU_CHO.NguoiDungID`, `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP` | Ba `CREATE TABLE IF NOT EXISTS` đúng cột, kiểu và CHECK như bản nháp đã sửa; `QUY_TAC_GIA.KhuVucID` UNIQUE và FK `ON DELETE CASCADE`; `NHAT_KY_GIA` FK `ON DELETE RESTRICT`; `DE_XUAT_GIA.TrangThaiDuyet` chỉ gồm `PENDING/APPROVED/REJECTED/EXPIRED`; ba `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` với `DEFAULT` và `NOT NULL` đúng (`YeuCauXacMinhOTP BOOLEAN NOT NULL DEFAULT FALSE`); không `DROP` và không đổi bảng cũ ngoài `ADD COLUMN`; idempotent |
| T2 | A | solo | T1 | Migration `20261112100000_sprint2_ghe_state_time.sql`: `GHE.NgayCapNhatTrangThai` và trigger | Cột `TIMESTAMPTZ` cho phép NULL; hàm trigger có `SET search_path = public`; trigger `BEFORE UPDATE OF "TrangThai"` chỉ đặt `now()` khi giá trị đổi; không phá chính sách và quyền hiện có của `GHE` (đọc `20261111090000_server_side_seat_generation.sql`: `authenticated` không được ghi trực tiếp) |
| T3 | A | pair | T1 | Migration `20261112110000_sprint2_pricing_security.sql`: RLS, quyền, trigger bất biến | `ENABLE ROW LEVEL SECURITY` trên 3 bảng; chỉ có chính sách `SELECT` cho thành viên tổ chức sở hữu sự kiện (dùng hàm kiểm tra thành viên đã có trong CSDL, đọc cách các bảng khác làm); không chính sách ghi; `REVOKE INSERT, UPDATE, DELETE, TRUNCATE` khỏi `PUBLIC`, `anon`, `authenticated`; khán giả và `anon` không đọc được; trigger `BEFORE UPDATE OR DELETE` trên `NHAT_KY_GIA` chặn mọi sửa và xóa |
| T4 | A | solo | T1, T2 | Cập nhật `src/types/database.types.ts` | `npm run lint` (gate) đạt; có đủ 17 bảng; kiểu mọi cột mới khớp migration; theo phong cách file hiện có |
| T5 | A | pair | T1, T2, T3 | pgTAP `supabase/tests/sprint2_data_foundation.sql` theo quy tắc spec mục 0 | `plan(N)` bằng đúng số khẳng định đếm được trong file; tự tạo toàn bộ fixture; kết thúc `finish()` và `ROLLBACK`; phủ: CHECK khung giá, UNIQUE 1-1, trigger bất biến (UPDATE và DELETE đều lỗi), RLS (thành viên đọc được, người ngoài và anon không, không ghi trực tiếp được), 3 cột mới tồn tại, trigger `NgayCapNhatTrangThai` |
| T6 | A | solo | T1–T5 | Ghi chú `.multiagent/notes/sprint2-W1-ghi-chu.md` theo spec mục 7 | Có bảng AC, danh sách bảng/cột/trigger mới, tài liệu cần cập nhật (ERD 17 bảng, từ điển dữ liệu, ma trận truy vết), mục `cần db:test` |

## Ngoài phạm vi

RPC nghiệp vụ, engine tính giá, giao diện, OTP, giới hạn vé, sửa `tao_giu_cho_theo_suat`, sửa migration đã có, tạo bảng ngoài 3 bảng trên.

## Nghiệm thu đợt (người làm sau khi merge)

`npm run db:reset` rồi `npm run db:test` (6 file cũ và file mới đều đạt); `git diff --name-status` trên `supabase/migrations` chỉ có dòng `A`.
