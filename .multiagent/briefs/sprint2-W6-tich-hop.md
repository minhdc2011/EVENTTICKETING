# Đợt W6 Sprint 2: tích hợp, hồi quy và demo (ban A và ban B)

Chạy bằng `agentkit team`. **Đọc trước:** `.multiagent/briefs/sprint2-spec.md` (mục 6, 7, 8) và các ghi chú `.multiagent/notes/sprint2-W1…W5-ghi-chu.md`.

**Mục tiêu:** ba tính năng (OTP, giới hạn 4 vé, Dynamic Pricing) chạy trơn tru với nhau; có kịch bản demo và bằng chứng. **Không thêm tính năng mới.**
**WBS:** 5.1, 5.2 (phần mã). **Điều kiện đầu vào:** W1 đến W5 đã merge.

## Gợi ý chia task

| Task | Ban | Chế độ | Sau | Việc | Tiêu chí |
|---|---|---|---|---|---|
| T1 | A | pair | | Test tích hợp bằng node (chế độ mock): đăng nhập, OTP, chọn ghế tối đa 4, thấy giá hiện hành, BTC duyệt đề xuất, giá đổi, ghế đang giữ giữ giá chốt | Gate đạt; có test cho: OTP rồi vào bước chọn ghế, vượt giới hạn bị từ chối kèm số vé còn lại, đề xuất giá rồi duyệt đổi giá, `DonGiaChot` không đổi với ghế đã giữ trước khi duyệt; không sửa test cũ để cho qua |
| T2 | B | solo | T1 | Sửa mọi chỗ gãy giữa các tính năng và rà tiếp cận 4 màn hình mới (OTP, bộ đếm vé, cấu hình giá, duyệt giá) | Chỉ sửa lỗi, không thêm tính năng; tab được, có `aria-label`, focus nhìn thấy được, thông báo không chỉ dựa vào màu; test Sprint 1 vẫn đạt (hồi quy FR-T1-01 đến FR-T1-04) |
| T3 | A | solo | | `scripts/concurrency-approve.mjs` và `scripts/DEMO_SPRINT2.md` | Script: hai BTC duyệt cùng một đề xuất đồng thời, một thành công, một nhận lỗi `40001`, dữ liệu dùng một lần và dọn sạch, đọc `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`; tài liệu demo: các bước, dữ liệu mẫu, kịch bản Demand Simulator `ban_nhanh` rồi `ban_cham`, thao tác của BTC và khán giả, kết quả mong đợi từng bước, chạy được ở chế độ mock |
| T4 | A | solo | T1–T3 | Ghi chú `.multiagent/notes/sprint2-W6-ghi-chu.md` theo spec mục 7 | **Bảng AC tổng cho cả Sprint 2** (mọi mã AC ở spec mục 6, bằng chứng, trạng thái), danh sách việc người phải làm tay, tài liệu cần cập nhật |

## Ngoài phạm vi

Tính năng ngoài Sprint 2, sửa migration, sửa `.agentkit.yaml`.

## Nghiệm thu đợt (người làm sau khi merge)

`npm run check`, `npm run db:reset` rồi `npm run db:test`, chạy `scripts/concurrency-approve.mjs`, làm theo `scripts/DEMO_SPRINT2.md`, quay video demo Demand Simulator đổi kịch bản (AC-T4-02.4), mở PR `sprint2/integration` vào `main`.
