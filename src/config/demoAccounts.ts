/**
 * Tài khoản DEMO dùng cho nút "Đăng nhập nhanh" (chỉ hiện khi VITE_DEMO_QUICK_LOGIN=true).
 * Chỉ dành cho môi trường demo/thử nghiệm: mật khẩu nằm trong mã giao diện nên ai mở trang cũng thấy.
 * Tạo hai tài khoản này trên CSDL thật bằng `node scripts/seed-demo-accounts.mjs`; chế độ mock chấp nhận sẵn.
 * TẮT cờ (đặt VITE_DEMO_QUICK_LOGIN khác 'true') trước khi dùng cho dữ liệu thật.
 */
export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO_BUYER = {email: 'buyer@demo.vn', password: DEMO_PASSWORD} as const;
export const DEMO_ORGANIZER = {email: 'organizer@demo.vn', password: DEMO_PASSWORD} as const;
