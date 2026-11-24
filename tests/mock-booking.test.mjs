import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GIOI_HAN_MAC_DINH,
  THOI_GIAN_GIU_MS,
  TRAN_VE_MOI_LUOT,
  demVeDangGiu,
  taoKhoGiuChoMoPhong,
  tinhSoLuongYeuCau,
} from '../src/domain/mockBooking.js';
import {PurchaseLimitError} from '../src/domain/purchaseLimitError.js';

const ghe = (code, zone = 'VIP') => ({ticketCode: code, zoneCode: zone});
const veDung = (quantity, zone = 'GA') => ({ticketCode: `${zone}-STAND`, zoneCode: zone, quantity});

function taoDongHo(startMs = 1_700_000_000_000) {
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
      return current;
    },
    set(ms) {
      current = ms;
    },
  };
}

function taoBoDemId() {
  let seq = 0;
  return () => `mock-${++seq}`;
}

test('hằng số mockBooking đúng spec', () => {
  assert.equal(TRAN_VE_MOI_LUOT, 4);
  assert.equal(THOI_GIAN_GIU_MS, 300_000);
  assert.equal(GIOI_HAN_MAC_DINH, 4);
});

test('tinhSoLuongYeuCau xử lý vé ngồi, vé đứng và dữ liệu không hợp lệ', () => {
  assert.equal(tinhSoLuongYeuCau([ghe('A1')]), 1);
  assert.equal(tinhSoLuongYeuCau([ghe('A1'), ghe('A2')]), 2);
  assert.equal(tinhSoLuongYeuCau([veDung(3)]), 3);
  assert.equal(tinhSoLuongYeuCau([ghe('A1'), veDung(2)]), 3);
  assert.equal(tinhSoLuongYeuCau([]), 0);
  assert.ok(Number.isNaN(tinhSoLuongYeuCau([veDung(0)])));
  assert.ok(Number.isNaN(tinhSoLuongYeuCau([veDung(-1)])));
  assert.ok(Number.isNaN(tinhSoLuongYeuCau([veDung(1.5)])));
  assert.ok(Number.isNaN(tinhSoLuongYeuCau([{ticketCode: 'GA', zoneCode: 'GA', quantity: '2'}])));
});

test('giữ 2 + 2 rồi lần thứ 3 giữ 1 vé ném PurchaseLimitError 422 với dangGiu=4, conLai=0', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  const h1 = kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [ghe('A1'), ghe('A2')],
    gioiHan: 4,
  });
  assert.equal(h1.holdId, 'mock-1');
  assert.equal(h1.status, 'ACTIVE');
  assert.equal(h1.eventId, 'EV_1');
  assert.equal(h1.expiresAt, new Date(clock.now() + THOI_GIAN_GIU_MS).toISOString());

  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [ghe('A3'), ghe('A4')],
    gioiHan: 4,
  });
  assert.equal(kho.dangGiu('user-1', 1), 4);

  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-1',
        suKienId: 1,
        suatDienId: 10,
        eventId: 'EV_1',
        items: [ghe('A5')],
        gioiHan: 4,
      }),
    (err) => {
      assert.ok(err instanceof PurchaseLimitError);
      assert.equal(err.status, 422);
      assert.equal(err.ma, 'VUOT_GIOI_HAN_VE');
      assert.equal(err.gioiHan, 4);
      assert.equal(err.dangGiu, 4);
      assert.equal(err.conLai, 0);
      assert.equal(err.chiTietHopLe, true);
      return true;
    },
  );
});

test('vé đứng quantity 3 rồi + 2 vượt giới hạn 4 (conLai=1)', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(3)],
    gioiHan: 4,
  });
  assert.equal(kho.dangGiu('user-1', 1), 3);

  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-1',
        suKienId: 1,
        suatDienId: 10,
        eventId: 'EV_1',
        items: [veDung(2)],
        gioiHan: 4,
      }),
    (err) => {
      assert.ok(err instanceof PurchaseLimitError);
      assert.equal(err.status, 422);
      assert.equal(err.gioiHan, 4);
      assert.equal(err.dangGiu, 3);
      assert.equal(err.conLai, 1);
      return true;
    },
  );
});

test('hai suất diễn cùng sự kiện cộng dồn theo tài khoản + sự kiện', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 101,
    eventId: 'EV_1',
    items: [ghe('A1'), ghe('A2')],
    gioiHan: 4,
  });
  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 102,
    eventId: 'EV_1',
    items: [ghe('B1'), ghe('B2')],
    gioiHan: 4,
  });
  assert.equal(kho.dangGiu('user-1', 1), 4);

  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-1',
        suKienId: 1,
        suatDienId: 102,
        eventId: 'EV_1',
        items: [ghe('B3')],
        gioiHan: 4,
      }),
    (err) => err instanceof PurchaseLimitError && err.dangGiu === 4 && err.conLai === 0,
  );
});

test('tài khoản khác hoặc sự kiện khác không ảnh hưởng nhau', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  kho.giuCho({
    taiKhoanId: 'user-a',
    suKienId: 1,
    suatDienId: 101,
    eventId: 'EV_1',
    items: [veDung(4)],
    gioiHan: 4,
  });

  // Tài khoản khác trên cùng sự kiện 1 vẫn giữ được
  const holdOtherUser = kho.giuCho({
    taiKhoanId: 'user-b',
    suKienId: 1,
    suatDienId: 101,
    eventId: 'EV_1',
    items: [veDung(3)],
    gioiHan: 4,
  });
  assert.equal(holdOtherUser.status, 'ACTIVE');

  // Cùng user-a nhưng sự kiện khác vẫn giữ được
  const holdOtherEvent = kho.giuCho({
    taiKhoanId: 'user-a',
    suKienId: 2,
    suatDienId: 201,
    eventId: 'EV_2',
    items: [veDung(2)],
    gioiHan: 2,
  });
  assert.equal(holdOtherEvent.status, 'ACTIVE');

  assert.equal(kho.dangGiu('user-a', 1), 4);
  assert.equal(kho.dangGiu('user-b', 1), 3);
  assert.equal(kho.dangGiu('user-a', 2), 2);
});

test('gioiHan 2 và gioiHan 6 (vẫn giữ trần 4 vé mỗi lượt, tổng tối đa 6)', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  // gioiHan = 2
  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 2,
    suatDienId: 20,
    eventId: 'EV_2',
    items: [ghe('A1'), ghe('A2')],
    gioiHan: 2,
  });
  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-1',
        suKienId: 2,
        suatDienId: 20,
        eventId: 'EV_2',
        items: [ghe('A3')],
        gioiHan: 2,
      }),
    (err) => err instanceof PurchaseLimitError && err.gioiHan === 2 && err.dangGiu === 2 && err.conLai === 0,
  );

  // gioiHan = 6: mỗi lượt tối đa 4, giữ được 4 + 2 = 6, lượt tiếp theo 1 vé vượt
  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-2',
        suKienId: 6,
        suatDienId: 60,
        eventId: 'EV_6',
        items: [veDung(5)],
        gioiHan: 6,
      }),
    (err) => {
      assert.equal(err.code, '22023');
      assert.equal(err.message, 'Moi luot chi duoc giu tu 1 den 4 ve');
      assert.equal(err instanceof PurchaseLimitError, false);
      return true;
    },
  );

  kho.giuCho({
    taiKhoanId: 'user-2',
    suKienId: 6,
    suatDienId: 60,
    eventId: 'EV_6',
    items: [veDung(4)],
    gioiHan: 6,
  });
  kho.giuCho({
    taiKhoanId: 'user-2',
    suKienId: 6,
    suatDienId: 60,
    eventId: 'EV_6',
    items: [veDung(2)],
    gioiHan: 6,
  });
  assert.equal(kho.dangGiu('user-2', 6), 6);

  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-2',
        suKienId: 6,
        suatDienId: 60,
        eventId: 'EV_6',
        items: [ghe('C1')],
        gioiHan: 6,
      }),
    (err) => err instanceof PurchaseLimitError && err.gioiHan === 6 && err.dangGiu === 6 && err.conLai === 0,
  );
});

test('đổi gioiHan sau khi giữ không sửa hold cũ, lần giữ mới dùng giới hạn mới', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  const hold1 = kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(3)],
    gioiHan: 4,
  });
  const truocKhiDoi = kho.layDanhSach()[0];
  assert.equal(truocKhiDoi.gioiHan, 4);
  assert.equal(truocKhiDoi.status, 'ACTIVE');

  // Hạ giới hạn xuống 2: hold cũ giữ 3 vé vẫn còn nguyên, lần giữ mới 1 vé báo gioiHan=2, dangGiu=3, conLai=0
  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-1',
        suKienId: 1,
        suatDienId: 10,
        eventId: 'EV_1',
        items: [ghe('A4')],
        gioiHan: 2,
      }),
    (err) => err instanceof PurchaseLimitError && err.gioiHan === 2 && err.dangGiu === 3 && err.conLai === 0,
  );

  const sauKhiDoi = kho.layDanhSach()[0];
  assert.equal(sauKhiDoi, truocKhiDoi);
  assert.equal(sauKhiDoi.holdId, hold1.holdId);
  assert.equal(sauKhiDoi.gioiHan, 4);
  assert.equal(sauKhiDoi.soLuong, 3);
  assert.equal(kho.dangGiu('user-1', 1), 3);

  // Tăng giới hạn lên 6: hold cũ vẫn 3, lần giữ mới 3 vé thành công
  const hold2 = kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(3)],
    gioiHan: 6,
  });
  assert.equal(hold2.status, 'ACTIVE');
  assert.equal(kho.dangGiu('user-1', 1), 6);
});

test('huy() giải phóng số đếm và id lạ bỏ qua không ném', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  const hold = kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(4)],
    gioiHan: 4,
  });
  assert.equal(kho.dangGiu('user-1', 1), 4);

  assert.doesNotThrow(() => kho.huy('mock-khong-ton-tai'));
  assert.doesNotThrow(() => kho.huy(''));
  assert.equal(kho.dangGiu('user-1', 1), 4);

  kho.huy(hold.holdId);
  assert.equal(kho.dangGiu('user-1', 1), 0);
  assert.equal(kho.layDanhSach()[0].status, 'RELEASED');

  // Hủy lại idempotent và có thể giữ mới ngay
  assert.doesNotThrow(() => kho.huy(hold.holdId));
  const holdMoi = kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(4)],
    gioiHan: 4,
  });
  assert.equal(holdMoi.status, 'ACTIVE');
});

test('tiến đồng hồ đến đúng mốc expiresAt và qua expiresAt thì không còn đếm', () => {
  const start = 1_700_000_000_000;
  const clock = taoDongHo(start);
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(4)],
    gioiHan: 4,
  });

  // Trước mốc hết hạn 1ms vẫn còn đếm
  clock.set(start + THOI_GIAN_GIU_MS - 1);
  assert.equal(kho.dangGiu('user-1', 1), 4);

  // Đúng tại mốc hết hạn thì coi là hết hạn (HetHanLuc > NOW())
  clock.set(start + THOI_GIAN_GIU_MS);
  assert.equal(kho.dangGiu('user-1', 1), 0);

  // Qua mốc hết hạn cũng không đếm và cho phép giữ mới
  clock.advance(5_000);
  assert.equal(kho.dangGiu('user-1', 1), 0);
  const holdMoi = kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(2)],
    gioiHan: 4,
  });
  assert.equal(holdMoi.status, 'ACTIVE');
  assert.equal(kho.dangGiu('user-1', 1), 2);
});

test('mỗi lượt 5 vé hoặc 0 vé ném lỗi 22023 nhưng không phải PurchaseLimitError', () => {
  const clock = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  for (const items of [[veDung(5)], [ghe('A1'), ghe('A2'), ghe('A3'), ghe('A4'), ghe('A5')], []]) {
    assert.throws(
      () =>
        kho.giuCho({
          taiKhoanId: 'user-1',
          suKienId: 1,
          suatDienId: 10,
          eventId: 'EV_1',
          items,
          gioiHan: 4,
        }),
      (err) => {
        assert.equal(err.code, '22023');
        assert.equal(err.message, 'Moi luot chi duoc giu tu 1 den 4 ve');
        assert.equal(err instanceof PurchaseLimitError, false);
        return true;
      },
    );
  }
});

test('gioiHan không hợp lệ fallback về 4 và demVeDangGiu thuần hoạt động độc lập', () => {
  const clock = taoDongHo(1000);
  const kho = taoKhoGiuChoMoPhong({now: clock.now, taoId: taoBoDemId()});

  kho.giuCho({
    taiKhoanId: 'user-1',
    suKienId: 1,
    suatDienId: 10,
    eventId: 'EV_1',
    items: [veDung(4)],
    gioiHan: Number.NaN,
  });
  assert.throws(
    () =>
      kho.giuCho({
        taiKhoanId: 'user-1',
        suKienId: 1,
        suatDienId: 10,
        eventId: 'EV_1',
        items: [ghe('A1')],
        gioiHan: 0,
      }),
    (err) => err instanceof PurchaseLimitError && err.gioiHan === 4 && err.dangGiu === 4 && err.conLai === 0,
  );

  const sampleHolds = [
    {taiKhoanId: 'u1', suKienId: 1, suatDienId: 1, status: 'ACTIVE', expiresAtMs: 2000, items: [ghe('A1')]},
    {taiKhoanId: 'u1', suKienId: '1', suatDienId: 2, status: 'ACTIVE', expiresAtMs: 1500, items: [veDung(2)]},
    {taiKhoanId: 'u1', suKienId: 1, suatDienId: 1, status: 'RELEASED', expiresAtMs: 2000, items: [veDung(3)]},
    {taiKhoanId: 'u1', suKienId: 1, suatDienId: 1, status: 'ACTIVE', expiresAtMs: 1000, items: [veDung(3)]},
  ];
  assert.equal(demVeDangGiu(sampleHolds, 'u1', 1, 1000), 3);
});

// ---------------------------------------------------------------------------
// Luồng giữ chỗ trước, OTP xác nhận thanh toán sau: gia hạn một lần và xác nhận thanh toán
// ---------------------------------------------------------------------------

function giuMotVe(kho, taiKhoanId = 'u1') {
  return kho.giuCho({taiKhoanId, suKienId: 1, suatDienId: 10, eventId: 'sk-1', items: [ghe('A-01')], gioiHan: 4});
}

test('giaHan thêm đúng một lần thời gian giữ; gọi lại trả hạn đã gia hạn và không gia hạn thêm', () => {
  const dongHo = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: dongHo.now, taoId: taoBoDemId()});
  const hold = giuMotVe(kho);
  dongHo.advance(290_000); // sắp hết hạn (còn 10 giây)
  const lan1 = kho.giaHan(hold.holdId);
  assert.equal(lan1.giaHanMoi, true);
  assert.equal(Date.parse(lan1.expiresAt), dongHo.now() + THOI_GIAN_GIU_MS);
  dongHo.advance(60_000);
  const lan2 = kho.giaHan(hold.holdId);
  assert.equal(lan2.giaHanMoi, false);
  assert.equal(lan2.expiresAt, lan1.expiresAt, 'không gia hạn thêm lần hai');
});

test('đã gia hạn thì quá hạn gốc vẫn xác nhận thanh toán được; quá hạn mới thì GIU_CHO_HET_HAN', () => {
  const dongHo = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: dongHo.now, taoId: taoBoDemId()});
  const hold = giuMotVe(kho);
  dongHo.advance(290_000);
  kho.giaHan(hold.holdId);
  dongHo.advance(100_000); // đã quá hạn gốc 300 giây nhưng nằm trong hạn gia hạn
  assert.equal(kho.xacNhan(hold.holdId).status, 'CONVERTED');

  const hold2 = giuMotVe(kho, 'u2');
  dongHo.advance(290_000);
  kho.giaHan(hold2.holdId);
  dongHo.advance(THOI_GIAN_GIU_MS + 1_000); // quá cả hạn gia hạn
  assert.throws(() => kho.xacNhan(hold2.holdId), (err) => err.ma === 'GIU_CHO_HET_HAN');
});

test('không gia hạn hoặc xác nhận được giữ chỗ đã hết hạn, đã hủy hoặc không tồn tại', () => {
  const dongHo = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: dongHo.now, taoId: taoBoDemId()});
  const hold = giuMotVe(kho);
  dongHo.advance(THOI_GIAN_GIU_MS + 1);
  assert.throws(() => kho.giaHan(hold.holdId), (err) => err.ma === 'GIU_CHO_HET_HAN');
  assert.throws(() => kho.xacNhan(hold.holdId), (err) => err.ma === 'GIU_CHO_HET_HAN');
  const hold2 = giuMotVe(kho, 'u2');
  kho.huy(hold2.holdId);
  assert.throws(() => kho.xacNhan(hold2.holdId), (err) => err.ma === 'GIU_CHO_HET_HAN');
  assert.throws(() => kho.giaHan('khong-co'), (err) => err.ma === 'GIU_CHO_HET_HAN');
});

test('xacNhan lặp lại thành công (idempotent) và vé đã xác nhận vẫn tính vào giới hạn sau khi hết hạn gốc', () => {
  const dongHo = taoDongHo();
  const kho = taoKhoGiuChoMoPhong({now: dongHo.now, taoId: taoBoDemId()});
  const hold = kho.giuCho({taiKhoanId: 'u1', suKienId: 1, suatDienId: 10, eventId: 'sk-1', items: [ghe('A-01'), ghe('A-02'), ghe('A-03')], gioiHan: 4});
  assert.equal(kho.xacNhan(hold.holdId).status, 'CONVERTED');
  assert.equal(kho.xacNhan(hold.holdId).daXacNhanTruoc, true);
  dongHo.advance(THOI_GIAN_GIU_MS * 3);
  assert.equal(kho.dangGiu('u1', 1), 3, 'vé đã mua không tự hết hạn');
  assert.throws(
    () => kho.giuCho({taiKhoanId: 'u1', suKienId: 1, suatDienId: 10, eventId: 'sk-1', items: [ghe('B-01'), ghe('B-02')], gioiHan: 4}),
    (err) => err instanceof PurchaseLimitError,
  );
});
