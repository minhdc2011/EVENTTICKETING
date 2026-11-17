ĐỢT W1 SPRINT 2: NỀN DỮ LIỆU (WBS 2.2, 3.2 phần cột, 4.2, 4.10)

Đọc kỹ .multiagent/briefs/sprint2-spec.md (mục 0, 1) và bản nháp .multiagent/briefs/dp_schema_draft.sql.txt. Bản nháp chưa chạy trên Postgres: rà soát, sửa lỗi, không chép nguyên.

Việc cần làm:
1. Một migration mới (mốc thời gian lớn hơn migration mới nhất) tạo bảng QUY_TAC_GIA, DE_XUAT_GIA, NHAT_KY_GIA; thêm cột CHI_TIET_GIU_CHO.DonGiaChot, GIU_CHO.NguoiDungID, CAU_HINH_SU_KIEN.YeuCauXacMinhOTP, GHE.NgayCapNhatTrangThai cùng trigger đặt now() khi TrangThai đổi; trigger bất biến cho NHAT_KY_GIA.
2. RLS cho 3 bảng mới đúng mục 1 điểm 5 của đặc tả (thành viên tổ chức chỉ đọc dữ liệu giá của sự kiện mình; khán giả và người ẩn danh không đọc; ghi trực tiếp bị chặn, ghi qua RPC ở đợt sau).
3. Cập nhật src/types/database.types.ts cho đúng 17 bảng và cột mới (cùng phong cách file hiện có).
4. Viết pgTAP supabase/tests/sprint2_data_foundation.sql: ràng buộc CHECK khung giá, UNIQUE 1-1, trigger bất biến chặn UPDATE và DELETE, RLS theo vai trò, cột mới tồn tại, trigger GHE đặt thời điểm. Nếu không chạy được pgTAP trong môi trường của bạn, vẫn viết và ghi rõ chưa chạy.
5. Viết test node trong tests/ nếu thêm kiểu dữ liệu mock mới. Không thêm test regex trên mã nguồn.

Nghiệm thu: npm run check đạt; migration idempotent (chạy hai lần không lỗi, theo cách đọc mã); không sửa migration cũ; dữ liệu Super Concert (SuKienID 1, 48 ghế) không bị ảnh hưởng.
Không làm: RPC nghiệp vụ, giao diện, engine tính giá (thuộc đợt sau).
Báo cáo cuối: tên migration, bảng, cột, trigger; thứ chưa chạy; rủi ro.
