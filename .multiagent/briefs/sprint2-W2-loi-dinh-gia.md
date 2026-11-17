# Đợt W2 Sprint 2: lõi định giá (ban A)

Chạy bằng `agentkit team`. **Đọc trước:** `.multiagent/briefs/sprint2-spec.md`, nhất là mục 2 (mô hình 5 bước, 4 ví dụ chuẩn, kiến trúc), mục 7 và 8.

**Mục tiêu:** engine tính giá có test, RPC có PriceGuard phía máy chủ, Demand Simulator, dịch vụ client và script chu kỳ. Không làm giao diện và không làm duyệt giá (đợt W3).
**WBS:** 4.1, 4.4, 4.5, 4.6. **Điều kiện đầu vào:** W1 đã merge (có 3 bảng giá, `GHE.NgayCapNhatTrangThai`, RLS); migration mới nhất `20261112110000`.

## Gợi ý chia task

| Task | Ban | Chế độ | Sau | Việc | Tiêu chí |
|---|---|---|---|---|---|
| T1 | A | pair | | `src/domain/pricingEngine.js`, `pricingEngine.d.ts`, `tests/pricing-engine.test.mjs` | Gate đạt; module không có I/O (không import service hay `fetch`); test khớp **đúng 4 ví dụ chuẩn** của spec mục 2 (đầu ra 1.790.000; 1.250.000 `CHAM_GIA_TRAN`; 480.000 `CHAM_GIA_SAN`; không đề xuất); test các biên: `r=0`, `r=1`, `N_total=0`, `v_target=0`, giá sàn bằng giá trần, đề xuất bằng giá hiện hành; làm tròn theo `S` |
| T2 | A | pair | | Migration `20261113090000_sprint2_pricing_rpc.sql`: `co_quyen_dinh_gia`, `luu_quy_tac_gia`, `lay_so_lieu_dinh_gia`, `luu_de_xuat_gia` (PriceGuard), `het_han_de_xuat_gia` | Mọi RPC giá gọi `co_quyen_dinh_gia` (đúng khi `auth.role() = 'service_role'` hoặc `CHU_SO_HUU`/`QUAN_TRI` của tổ chức), không lặp điều kiện quyền; `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ... FROM PUBLIC, anon`, `GRANT ... TO authenticated, service_role`; `luu_de_xuat_gia` kiểm đủ năm điều (trong [sàn, trần], biên độ ≤ `Δ_max`, chênh ≥ `S`, không có `PENDING` khác, quyền) và ghi lý do chặn khi từ chối; `het_han_de_xuat_gia` đổi `PENDING` quá 120 phút sang `EXPIRED`; không lấy danh tính người dùng từ tham số |
| T3 | A | pair | T2 | Migration `20261113100000_sprint2_demand_simulator.sql`: `mo_phong_nhu_cau(p_su_kien_id, p_kich_ban)` | `SECURITY DEFINER` (vì `GHE` đã khóa ghi trực tiếp); chỉ chạy khi `CAU_HINH_SU_KIEN.TuyChonMoRong->>'moPhong' = 'true'`, ngược lại báo lỗi; ba kịch bản `ban_nhanh`, `ban_cham`, `ban_deu` đổi `GHE.TrangThai` qua hàm; dữ liệu mô phỏng nhận biết được (`LyDoDeXuat` bắt đầu bằng `[MÔ PHỎNG]` ở luồng đề xuất); dùng `co_quyen_dinh_gia` |
| T4 | A | solo | T1, T2 | `src/services/pricingService.ts` (gọi RPC) và nhánh mock | Gate đạt; tên RPC và tham số khớp migration T2/T3; nhánh mock khi `useMockData` lưu `localStorage`, dữ liệu gắn nhãn mô phỏng; có test hành vi cho phần logic thuần của mock |
| T5 | A | solo | T1, T2 | `scripts/run-pricing-cycle.mjs` | Đọc đúng `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` (thiếu thì dừng, thông báo rõ, không có giá trị mặc định); tham số `--su-kien <id>` và `--nhanh`; dùng `pricingEngine.js` và các RPC; không ghi khóa ra file hay log |
| T6 | A | pair | T2, T3 | pgTAP `supabase/tests/sprint2_pricing_rpc.sql` | `plan(N)` đúng số khẳng định; tự tạo fixture; phủ: chặn vượt khung, vượt biên độ, deadband, trùng `PENDING`, vai trò sai nhận `42501`, `service_role` chạy được, hết hạn, mô phỏng bị từ chối khi không bật cờ |
| T7 | A | solo | T1–T6 | Ghi chú `.multiagent/notes/sprint2-W2-ghi-chu.md` theo spec mục 7 | Có bảng AC (AC-T4-02.1, .2, .3, .4, AC-T4-05.1), chữ ký đầy đủ các RPC, tài liệu cần cập nhật |

## Ngoài phạm vi

Giao diện BTC và khán giả, RPC duyệt và từ chối, OTP, giới hạn vé, `pg_cron`.

## Nghiệm thu đợt (người làm sau khi merge)

`npm run db:reset` rồi `npm run db:test`; thử `node scripts/run-pricing-cycle.mjs --su-kien 1 --nhanh` trên CSDL cục bộ (đặt hai biến môi trường từ `npm run db:status`).
