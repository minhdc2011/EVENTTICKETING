# Đặc tả Sprint 2: OTP, giới hạn 4 vé, Dynamic Pricing (dùng chung cho mọi đợt)

Đây là nguồn sự thật cho agent. Mỗi file nhiệm vụ `sprint2-W1…W6-*.md` là một lần chạy `agentkit team` và chỉ trỏ về đây. Nếu code hiện tại mâu thuẫn với đặc tả này, **không tự đoán**: làm phần chắc chắn, ghi điểm mâu thuẫn vào ghi chú cuối đợt (mục 7) và nêu rõ trong tiêu chí còn thiếu.

## 0. Phạm vi và ràng buộc chung

- Phạm vi Sprint 2: FR-T2-01 (xác minh OTP), FR-T2-02 (giới hạn 4 vé/tài khoản), FR-T4-02 (khung giá sàn/trần), FR-T4-04 (đề xuất giá động, BTC duyệt). **Ngoài phạm vi:** thanh toán, phát hành vé, hàng chờ ảo, Dashboard, CAPTCHA, Fraud Detection, mô-đun AI/ML, FR-T2-03/04.
- Stack: React 19 + TypeScript + Vite, Supabase (PostgreSQL, RLS, RPC `SECURITY DEFINER`, Realtime, Auth). Test: `node --test tests/*.test.mjs`; test CSDL: pgTAP trong `supabase/tests/`. Cổng kiểm tra: `npm run check`.
- **Migration:** chỉ thêm file mới trong `supabase/migrations/`, tên `YYYYMMDDHHMMSS_<mô_tả>.sql`, mốc thời gian lớn hơn mọi migration hiện có (mới nhất hiện là `20261111090000_server_side_seat_generation.sql`; dùng `20261112…` trở đi, tăng dần theo từng đợt). **Không sửa migration cũ.** Phong cách giống các migration hiện có: `SET search_path = public` cho hàm `SECURITY DEFINER`, `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`, bảng mới bật RLS, câu lệnh idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Quy ước tên: bảng, cột, hàm bằng tiếng Việt không dấu theo mẫu hiện có (`QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA`, `duyet_de_xuat_gia`). Mã yêu cầu: FR-T2-01, FR-T2-02, FR-T4-02, FR-T4-04, UC-T4-01…05, AC-T2-01.x, AC-T2-02.x, AC-T4-0x.x. **Không bịa mã khác.**
- Vai trò trong `THANH_VIEN_TO_CHUC`: `CHU_SO_HUU`, `QUAN_TRI`, `BIEN_TAP`, `VAN_HANH`, `SOAT_VE`. Cấu hình giá và duyệt giá: **chỉ** `CHU_SO_HUU`, `QUAN_TRI` của tổ chức sở hữu sự kiện. `VAN_HANH`, `SOAT_VE`, khán giả, người ẩn danh: không được.
- Chế độ mock: ứng dụng có `runtimeConfig.useMockData`. Mọi màn hình mới phải chạy được ở chế độ mock (ảnh chụp tự động và demo dùng mock). Dữ liệu mock mô phỏng phải gắn nhãn **mô phỏng**.
- **Bảng `GHE` đã bị khóa ghi trực tiếp** (migration `20261111090000`: thu hồi `INSERT/UPDATE/DELETE` của `authenticated`, ghế do hàm `SECURITY DEFINER` sinh ra). Mọi thao tác ghi `GHE` của Sprint 2 (Demand Simulator đánh dấu `DA_BAN`, trigger `NgayCapNhatTrangThai`) phải đi qua hàm `SECURITY DEFINER` hoặc trigger, **không** mở lại quyền ghi trực tiếp. Tham khảo cách làm và test trong migration đó và `supabase/tests/server_side_seat_generation.sql`.
- **pgTAP:** đọc `docs/LOCAL_DEV_DATABASE.md` mục "Viết file pgTAP mới" và làm đúng như đó. Tóm tắt: file mới trong `supabase/tests/` tự tạo toàn bộ fixture trong giao dịch (`auth.users`, `HO_SO_NGUOI_DUNG` với `LoaiTaiKhoan` = `ORGANIZER` cho người sửa sự kiện, `TO_CHUC`, `THANH_VIEN_TO_CHUC`), có `plan(N)` đúng số khẳng định, kết thúc `finish()` rồi `ROLLBACK`; khi giả lập người dùng đặt cả `SET LOCAL ROLE authenticated`, `request.jwt.claim.sub` và `request.jwt.claim.role = 'authenticated'`. Không dựa vào `supabase/seed.sql`, không dùng `supabase/tests-stale/`. Mọi file trong `supabase/tests/` tự được `npm run db:test` chạy (không cần đăng ký ở đâu). Nền hiện có **6 file, 101 khẳng định đều đạt**; người kiểm chứng chạy `npm run db:reset` rồi `npm run db:test`.
- Không commit khóa, mật khẩu, `.env*` có giá trị thật. Script cần `service_role` chỉ đọc từ biến môi trường, không đưa vào mã giao diện.
- Test mới là **test hành vi thật** (không thêm `assert.match` trên mã nguồn dạng văn bản). Mọi test cũ vẫn phải đạt.
- Không sửa `docs/` và `*.docx`. Task cuối mỗi đợt tạo `.multiagent/notes/sprint2-Wn-ghi-chu.md` (mục 7) liệt kê tài liệu cần cập nhật.
- Không bịa số liệu kiểm thử hay đánh dấu "đạt" khi chưa chạy. Việc không chạy được (cần Supabase, Docker, mạng): viết sẵn và ghi rõ **chưa chạy** trong ghi chú cuối đợt.
- Hai tệp tham khảo (bản nháp chưa chạy trên Postgres, **phải rà soát và sửa**, không chép nguyên): `.multiagent/briefs/dp_schema_draft.sql.txt` (3 bảng, trigger bất biến, RPC `duyet_de_xuat_gia`), `.multiagent/briefs/limit4_draft.sql.txt` (phần bổ sung đếm vé cho `tao_giu_cho_theo_suat`).

## 1. Dữ liệu mới

Theo bản nháp `dp_schema_draft.sql.txt`, với các điều chỉnh bắt buộc:

1. Bảng `QUY_TAC_GIA` (1–1 với `KHU_VUC`, `KhuVucID` UNIQUE), `DE_XUAT_GIA`, `NHAT_KY_GIA` (bất biến: trigger chặn UPDATE/DELETE, cả với `service_role` trừ khi có cơ chế rõ ràng được báo cáo).
2. Cột mới: `CHI_TIET_GIU_CHO.DonGiaChot NUMERIC(12,2)`, `GIU_CHO.NguoiDungID UUID` (gắn với tài khoản), `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP BOOLEAN NOT NULL DEFAULT FALSE`. Giới hạn vé dùng cột có sẵn `CAU_HINH_SU_KIEN.SoVeToiDaMoiDon` (mặc định 4, có CHECK hiện có).
3. **Số liệu tốc độ bán:** bảng `GHE` hiện chỉ có `TrangThai`, không có thời điểm đổi trạng thái, nên không tính được `v_actual`. Thêm cột `GHE.NgayCapNhatTrangThai TIMESTAMPTZ` (cho phép NULL) cùng trigger đặt `now()` khi `TrangThai` đổi. Đây là thay đổi cộng thêm; nêu rõ trong báo cáo.
4. Trạng thái `DE_XUAT_GIA.TrangThaiDuyet`: `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` (đề xuất bị PriceGuard chặn ghi `LoaiCanhBao` kèm audit, không áp dụng giá).
5. RLS: thành viên tổ chức đọc được dữ liệu giá của sự kiện thuộc tổ chức mình; ghi trực tiếp vào bảng chỉ qua RPC (không có chính sách `FOR ALL` cho biên tập viên). Người ẩn danh và khán giả không đọc `QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA`.

## 2. Dynamic Pricing: mô hình 5 bước (đã kiểm bằng chương trình)

Đơn vị định giá: khu vực/hạng vé (`KHU_VUC`). Giá hiện hành: `KHU_VUC.GiaVeNiemYet`.

Đầu vào mỗi chu kỳ, theo từng khu: `P0` (GiaGoc), `P_cur`, `P_min`/`P_max` (GiaSan/GiaTran), `S` (BuocNhayGia, mặc định 10.000), `Δ_max` (mặc định 0,20), `N_total` (TongSoGhe), `N_sold` (ghế `DA_BAN`), `N_hold` (vé đang giữ còn hạn), `v_actual` (vé/giờ trong cửa sổ 6 giờ gần nhất), `T_rem` (giờ còn lại đến giờ diễn), `v_target = N_total / tổng số giờ mở bán`.

1. `r = clamp((N_sold + 0,5 × N_hold) / N_total, 0, 1)`; `u = v_actual / v_target`.
2. `Δr`: nếu `r < 0,30` thì `−0,15 × (0,30 − r) / 0,30`; nếu `0,30 ≤ r ≤ 0,60` thì `0`; nếu `r > 0,60` thì `+0,30 × (r − 0,60) / 0,40`.
   `Δv = clamp(0,10 × (u − 1,0), −0,10, +0,20)`.
   `Δt`: `T_rem ≤ 72` và `r ≥ 0,70` → `+0,08`; `T_rem ≤ 72` và `r < 0,40` → `−0,12`; `72 < T_rem ≤ 168` và `r < 0,30` → `−0,05`; còn lại `0`.
3. `Δ_total = wr×Δr + wv×Δv + wt×Δt` (mặc định cả ba trọng số 1,0); `P_raw = P0 × (1 + Δ_total)`.
4. (a) `P_bounded = clamp(P_raw, P_cur×(1−Δ_max), P_cur×(1+Δ_max))`; (b) `P_rounded = round(P_bounded / S) × S`; (c) `P_propose = clamp(P_rounded, P_min, P_max)`. Chạm trần → cảnh báo `CHAM_GIA_TRAN`; chạm sàn → `CHAM_GIA_SAN`; còn lại `BINH_THUONG`.
5. Deadband: chỉ tạo đề xuất `PENDING` khi `|P_propose − P_cur| ≥ S` **và** khu chưa có đề xuất `PENDING`. Đề xuất quá TTL (2 chu kỳ = 120 phút) chuyển `EXPIRED`.

Tham số mặc định (cột của `QUY_TAC_GIA`): `Δ_max` 20%, `S` 10.000đ, ngưỡng lấp đầy thấp/cao 30%/60%, trọng số 1,0/1,0/1,0, chu kỳ tính giá 60 phút (có chế độ chạy nhanh để demo; kích hoạt thêm khi tỷ lệ lấp đầy đổi ≥ 5%).

**Bốn ví dụ chuẩn (bắt buộc là test, khớp đến từng đồng):**

| # | Đầu vào | Kết quả trung gian | Kết quả |
|---|---|---|---|
| 1 | `N_total=200`, `P0=P_cur=1.500.000`, sàn/trần 1.200.000/2.000.000, `N_sold=150`, `N_hold=10`, `u=1,6`, `T_rem=96` | `r=0,775`, `Δr=+0,13125`, `Δv=+0,06`, `Δt=0`, `P_raw=1.786.875` | đề xuất **1.790.000** (+19,33%), `BINH_THUONG` |
| 2 | `N_total=500`, `P0=1.000.000`, `P_cur=1.150.000`, sàn/trần 800.000/1.250.000, `N_sold=460`, `N_hold=20`, `u=3,2`, `T_rem=48` | `r=0,94`, `Δr=+0,255`, `Δv=+0,20`, `Δt=+0,08`, `P_raw=1.535.000`, sau biên độ `1.380.000` | đề xuất **1.250.000**, `CHAM_GIA_TRAN` |
| 3 | `N_total=400`, `P0=600.000`, `P_cur=550.000`, sàn/trần 480.000/750.000, `N_sold=40`, `N_hold=0`, `u=0,2`, `T_rem=36` | `r=0,10`, `Δr=−0,10`, `Δv=−0,08`, `Δt=−0,12`, `P_raw=420.000`, sau biên độ `440.000` | đề xuất **480.000**, `CHAM_GIA_SAN` |
| 4 | `N_total=300`, `P0=P_cur=800.000`, sàn/trần hợp lệ, `N_sold=135`, `N_hold=0`, `u=1,04`, `T_rem=120` | `r=0,45`, `Δr=0`, `Δv=+0,004`, `Δt=0`, `P_raw=803.200`, làm tròn `800.000` | **không tạo đề xuất** (chênh 0 < S) |

Kiến trúc triển khai (quyết định, đừng đổi nếu không báo cáo):
- **Engine thuần** `src/domain/pricingEngine.js` (kèm `.d.ts`): hàm tính 5 bước, không I/O, có test hành vi cho 4 ví dụ và các biên (r=0, r=1, `N_total=0`, `v_target=0`, giá sàn=giá trần).
- **Quyền gọi RPC giá:** dùng một hàm chung `co_quyen_dinh_gia(p_su_kien_id)` trả TRUE khi `auth.role() = 'service_role'` hoặc người gọi là `CHU_SO_HUU`/`QUAN_TRI` của tổ chức sở hữu sự kiện; mọi RPC giá (`luu_quy_tac_gia`, `lay_so_lieu_dinh_gia`, `luu_de_xuat_gia`, `het_han_de_xuat_gia`) dùng hàm này, không viết lại điều kiện quyền ở từng nơi. Duyệt và từ chối (`duyet_de_xuat_gia`, `tu_choi_de_xuat_gia`) **chỉ** cho người dùng thật (không cho `service_role`), vì cần `auth.uid()` để ghi người duyệt.
- **PriceGuard phía máy chủ** (RPC): mọi đề xuất, **từ bất kỳ nguồn nào** (engine, client, mô-đun khác), phải qua kiểm tra: thuộc [sàn, trần]; biên độ ≤ `Δ_max`; chênh ≥ `S`; không có `PENDING` khác; vai trò hợp lệ. Vi phạm: không áp dụng, ghi audit, trả mã lỗi rõ (AC-T4-05.1).
- **Một engine, hai cách gọi** (cùng module `pricingEngine.js`, cùng RPC): (1) nút **Chạy ngay** ở màn hình BTC chạy engine trong trình duyệt bằng phiên của BTC; (2) **chu kỳ tính giá** `scripts/run-pricing-cycle.mjs` (Node, supabase-js, đọc đúng hai biến môi trường `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`; thiếu biến thì dừng với thông báo rõ, không có giá trị mặc định), có tham số `--su-kien <id>` và `--nhanh` (bỏ chờ chu kỳ để demo). Không dùng `pg_cron` trong Sprint 2 (không chạy được trong môi trường kiểm thử của nhóm).
- **Demand Simulator:** chỉ chạy trên sự kiện có `CAU_HINH_SU_KIEN.TuyChonMoRong->>'moPhong' = 'true'`; kịch bản `ban_nhanh`, `ban_cham`, `ban_deu`; ghi ghế `DA_BAN` kèm `NgayCapNhatTrangThai` giả lập; `LyDoDeXuat` của đề xuất sinh từ dữ liệu mô phỏng phải bắt đầu bằng `[MÔ PHỎNG]` (BR-T4-02.9). Có bản chạy trong chế độ mock.
- **Áp dụng giá:** một giao dịch duy nhất cập nhật `KHU_VUC.GiaVeNiemYet`, đổi `DE_XUAT_GIA` sang `APPROVED`, ghi `NHAT_KY_GIA` (khóa lạc quan: giá hiện hành phải còn bằng `GiaHienTai` của đề xuất, nếu không lỗi 40001 → giao diện hiện 409). Tham khảo `duyet_de_xuat_gia` trong bản nháp: `auth.uid()`, kiểm vai trò, TTL, khung sàn/trần.
- **Giá chốt khi giữ chỗ:** `tao_giu_cho_theo_suat` ghi `CHI_TIET_GIU_CHO.DonGiaChot` = giá niêm yết hiện hành; giá mới chỉ áp dụng cho lần chọn sau thời điểm áp dụng (BR-T4-02.5).
- **Giá thời gian thực:** giao diện khán giả nghe thay đổi `KHU_VUC` qua Realtime theo mẫu `seatRealtimeService`; cập nhật tooltip và bảng giá không cần tải lại; mất kết nối thì hiện trạng thái đang kết nối lại (UC-T4-04). Mục tiêu độ trễ ≤ 5 giây (đo, không cam kết).

RPC dự kiến (tên có thể tinh chỉnh nhưng phải nêu trong báo cáo): `luu_quy_tac_gia`, `lay_so_lieu_dinh_gia`, `luu_de_xuat_gia` (PriceGuard), `duyet_de_xuat_gia(p_de_xuat_id, p_ghi_chu, p_gia_dieu_chinh DEFAULT NULL)`, `tu_choi_de_xuat_gia(p_de_xuat_id, p_ly_do)`, `het_han_de_xuat_gia`.

## 3. Xác minh OTP (FR-T2-01)

- OTP do **Supabase Auth** sinh và quản lý (`signInWithOtp({email, options: {shouldCreateUser: false}})` rồi `verifyOtp({email, token, type: 'email'})`). Ứng dụng **không lưu, không ghi log** mã OTP (AC-T2-01.6).
- Tham số mục tiêu (thực hiện ở mức Supabase Auth cho phép; nơi Auth không hỗ trợ thì ghi rõ trong báo cáo, không giả vờ): hiệu lực mã 5 phút; sai tối đa 5 lần/mã, quá thì hủy mã và khóa xác minh 15 phút; gửi lại cách nhau ≥ 60 giây, tối đa 3 lần/giờ/tài khoản; hiệu lực xác minh 24 giờ.
- BTC bật/tắt theo sự kiện bằng `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP` (mặc định FALSE).
- **Đã kiểm chứng trên Supabase cục bộ (không phải giả định):** (a) email phải chứa mã 6 số, nên `supabase/config.toml` đã khai báo mẫu `supabase/templates/magic_link.html` với `{{ .Token }}`, `otp_expiry = 300`, `max_frequency = "60s"` (đã có sẵn, đừng sửa trừ khi báo cáo lý do); dự án thật phải đặt mẫu email tương tự ở Dashboard; (b) token sau khi xác minh OTP có claim `amr = [{"method":"otp","timestamp":<giây>}]` và giữ nguyên `timestamp` sau khi làm mới phiên; (c) Supabase Auth **không** có khóa 15 phút sau 5 lần sai, chỉ có giới hạn tốc độ xác minh chung. Vì vậy "sai 5 lần thì khóa" chỉ là giới hạn hiển thị ở giao diện; nói rõ điều này trong báo cáo, đừng khẳng định máy chủ khóa.
- **Cổng chặn phía máy chủ:** `tao_giu_cho_theo_suat` trả 403 (lỗi `42501`) khi sự kiện yêu cầu OTP mà `auth.jwt() -> 'amr'` không có phần tử `method = 'otp'` với `timestamp` trong 24 giờ gần nhất. Viết thành một hàm nhỏ `da_xac_minh_otp()` (tách riêng để pgTAP kiểm thử được bằng cách đặt `request.jwt.claims` giả lập).
- Giao diện OTP: đếm ngược hiệu lực và thời gian gửi lại, thông báo lỗi nêu số lần còn lại, bàn phím dùng được, thông báo không chỉ dựa vào màu (AC-T2-01.9, NFR-07). Chế độ mock dùng mã cố định `123456` và **chỉ** khi `useMockData`.
- Tiêu chí: AC-T2-01.1 đến AC-T2-01.9 (xem mục 6).

## 4. Giới hạn tối đa 4 vé (FR-T2-02)

- Tính theo **tài khoản và theo sự kiện** (cộng mọi suất diễn). Số vé đang tính = tổng `CHI_TIET_GIU_CHO.SoLuong` của các `GIU_CHO` còn `ACTIVE` và chưa hết hạn của tài khoản đó (Sprint 3 sẽ cộng vé đã mua). Hết hạn giữ chỗ thì số đếm giảm.
- Giới hạn mặc định 4, BTC (`CHU_SO_HUU`, `QUAN_TRI`) đặt theo sự kiện qua cột `SoVeToiDaMoiDon` (validation theo CHECK hiện có; thay đổi có audit; chỉ áp dụng cho lần chọn sau).
- Kiểm tra **trong `tao_giu_cho_theo_suat`**, an toàn khi nhiều phiên cùng lúc: `pg_advisory_xact_lock(hashtext(user || ':' || su_kien))`, rồi đếm và so sánh (xem `limit4_draft.sql.txt`). Vượt giới hạn: lỗi `VUOT_GIOI_HAN_VE` (mã `22023`), giao diện hiện 422 kèm số vé còn được chọn.
- **Không dùng đoạn nháp như bản vá rời:** tìm định nghĩa hiện tại của `tao_giu_cho_theo_suat(p_suat_dien_id BIGINT, p_phien_id UUID, p_items JSONB)` (migration `20261005090000` và các migration sau nếu có), tạo `CREATE OR REPLACE` **toàn bộ hàm** với phần bổ sung, giữ nguyên chữ ký và hành vi cũ, rồi chạy lại mọi test cũ.
- Giao diện: bộ đếm `đã chọn x/4`, thông báo khi vượt giới hạn (nêu giới hạn và số vé còn lại), thông báo hiển thị đủ lâu (≥ 5 giây). Giữ giới hạn 4 ghế mỗi lần chọn đã có từ Sprint 1.

## 5. Use case, quy tắc nghiệp vụ (tóm tắt)

- **UC-T4-01** cấu hình: kiểm tra `sàn > 0`, `sàn ≤ giá gốc ≤ trần`, `S > 0`, `0 < Δ_max ≤ 1`, ngưỡng thấp < ngưỡng cao, trọng số ≥ 0; lưu có audit; thu hẹp khung khiến giá hiện hành nằm ngoài khung: cảnh báo, hủy đề xuất `PENDING` ngoài khung.
- **UC-T4-02** tạo đề xuất (chỉ khi sự kiện `DANG_MO_BAN` và định giá bật; thiếu dữ liệu → bỏ qua khu đó và ghi log).
- **UC-T4-03** duyệt/từ chối: duyệt (có thể chỉnh giá trong khung) hoặc từ chối; lỗi 403 (không quyền), khung/hết hạn (mã lỗi + khung hợp lệ), 409 (giá đã đổi), rollback khi lỗi giao dịch.
- **UC-T4-04** giá hiện hành thời gian thực cho khán giả. **UC-T4-05** PriceGuard (nội bộ).
- BR-T4-02.1 đến .9: giá trong [sàn, trần]; chỉ có hiệu lực sau khi BTC duyệt (không tự áp dụng); biên độ chu kỳ và deadband; một đề xuất `PENDING` mỗi khu; khóa giá khi giữ chỗ; chỉ định giá khi đang mở bán; mọi hành động nhạy cảm có audit (ai, khi nào, giá cũ/mới, tham số); làm tròn theo `S`; dữ liệu mô phỏng gắn nhãn.

## 6. Tiêu chí chấp nhận (agent phải nêu bằng chứng cho từng mã trong báo cáo)

- OTP: AC-T2-01.1 (đúng mã còn hạn → xác minh, vào bước chọn ghế); .2 (sai: hiện số lần còn lại); .3 (sai lần 5: hủy mã, khóa 15 phút); .4 (quá 5 phút bị từ chối kể cả đúng); .5 (gửi lại < 60 giây hoặc > 3 lần/giờ bị từ chối; mã mới vô hiệu mã cũ); .6 (không lưu/log OTP); .7 (gọi trực tiếp API giữ ghế khi chưa xác minh → 403); .8 (BTC bật/tắt theo sự kiện); .9 (bàn phím, responsive, không chỉ dựa vào màu).
- Giới hạn vé: AC-T2-02.1 (chọn tối đa 4); .2 (server từ chối kể cả gọi API trực tiếp); .3 (thông báo nêu giới hạn và số vé còn lại); .4 (hai phiên đồng thời không vượt); .5 (hết hạn giữ chỗ giải phóng số đếm); .6 (BTC đổi `SoVeToiDaMoiDon`, chỉ vai trò được phép, có audit); .7 (không áp dụng chéo giữa các sự kiện).
- Dynamic Pricing: AC-T4-01.1 (lưu khi sàn ≤ gốc ≤ trần, lỗi theo từng trường); AC-T4-02.1 (khớp 4 ví dụ); .2 (deadband, một `PENDING` mỗi khu); .3 (chạm trần/sàn có cảnh báo); .4 (Demand Simulator đổi kịch bản thì đề xuất đổi hướng, demo); AC-T4-03.1 (duyệt → giá đổi, có `NHAT_KY_GIA`, khán giả thấy ≤ 5 giây không tải lại); .2 (từ chối giữ giá); .3 (hai BTC duyệt cùng lúc: một thành công, một nhận 409); .4 (vai trò không đủ quyền → 403); AC-T4-04.1 (ghế đang giữ giữ `DonGiaChot`); AC-T4-05.1 (đề xuất vượt khung từ bất kỳ nguồn nào bị chặn, giá giữ nguyên, có audit).

## 7. Ghi chú cuối đợt (task cuối của mỗi đợt)

Task cuối của mỗi đợt tạo `.multiagent/notes/sprint2-Wn-ghi-chu.md` (Wn là mã đợt) gồm:

1. **Bảng tiêu chí chấp nhận:** mã AC (mục 6) / bằng chứng (đường dẫn file và dòng, hoặc tên test) / trạng thái: `gate` (test node trong `npm run check` đã đạt), `cần db:test` (có pgTAP viết sẵn, người kiểm chứng chạy `npm run db:reset` và `npm run db:test`), hoặc `chưa kiểm chứng` kèm lý do. Không ghi "đạt" cho thứ chưa chạy.
2. **Thay đổi CSDL:** tên migration, bảng, cột, trigger, hàm (chữ ký đầy đủ), chính sách RLS.
3. **Tài liệu cần cập nhật** theo thay đổi (ERD 17 bảng, đặc tả Use Case, sơ đồ tuần tự, ma trận truy vết, Test Log).
4. **Rủi ro và điểm mâu thuẫn** với đặc tả; việc dở dang.

## 8. Cách làm việc với `agentkit team` (agent đọc kỹ)

- **Cổng kiểm tra tự động là `npm run check`** (kiểm tra kiểu, test node, build). Nó **không** chạy SQL hay pgTAP. Vì vậy với migration và pgTAP, Astra và trưởng ban chấm bằng **đọc code**: viết SQL thật cẩn thận, đúng cú pháp PostgreSQL, và đối chiếu từng ràng buộc với đặc tả. Người kiểm chứng sẽ chạy `npm run db:reset` và `npm run db:test` sau khi merge.
- **Tiêu chí kiểm được bằng cách đọc code** (ví dụ "hàm dùng `co_quyen_dinh_gia`", "plan bằng số khẳng định") hoặc bằng gate (ví dụ "test engine đạt"). Mỗi task trong brief đã có tiêu chí như vậy; Astra có thể chia nhỏ hơn nhưng không bỏ tiêu chí nào.
- **Ban A** (trưởng ban architect): migration, RPC, pgTAP, engine, service, script, ghi chú. **Ban B** (trưởng ban visual): màn hình và tương tác giao diện. Task giao diện phụ thuộc task dữ liệu phải ghi `after` rõ ràng. **Không** để hai task cùng sửa một file (đặc biệt `database.types.ts`, một migration, `SeatMapSection.tsx`).
- **`solo` cho việc nhỏ và rõ** (một file, ghi chú, config); **`pair` chỉ cho việc khó** (SQL nhiều ràng buộc, công thức, cổng OTP, màn hình có luồng). Một task `pair` tốn khoảng 1,0–1,6 triệu token.
- **Commit và nhánh:** agentkit tự tạo nhánh và commit cho từng task; không tự `git push`, không đổi nhánh, không sửa `.agentkit.yaml`, không đụng `docs/`.
- **Tên migration:** một migration cho mỗi task SQL, mốc thời gian tăng dần theo brief (đợt sau lớn hơn đợt trước); không dùng lại mốc thời gian.
