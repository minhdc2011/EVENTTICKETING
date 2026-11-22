import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PRICING_DEFAULTS,
  computePriceProposal,
  deltaFill,
  deltaTime,
  deltaVelocity,
  fillRate,
  ruleFromQuyTacGia,
} from '../src/domain/pricingEngine.js';

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);

const rule = (basePrice, floor, ceiling) => ({ basePrice, floor, ceiling });

describe('ví dụ chuẩn', () => {
  it('ví dụ 1: 1.790.000 BINH_THUONG', () => {
    const res = computePriceProposal({
      rule: rule(1500000, 1200000, 2000000),
      currentPrice: 1500000,
      totalSeats: 200,
      soldSeats: 150,
      heldSeats: 10,
      velocityRatio: 1.6,
      hoursRemaining: 96,
    });
    near(res.intermediate.fillRate, 0.775, 'r');
    near(res.intermediate.deltaFill, 0.13125, 'Δr');
    near(res.intermediate.deltaVelocity, 0.06, 'Δv');
    near(res.intermediate.deltaTime, 0, 'Δt');
    near(res.intermediate.rawPrice, 1786875, 'raw');
    assert.strictEqual(res.proposedPrice, 1790000);
    assert.strictEqual(res.alertType, 'BINH_THUONG');
    assert.strictEqual(res.shouldPropose, true);
    assert.ok(Math.abs(res.changeRatio - 0.1933) < 1e-4);
  });

  it('ví dụ 2: 1.250.000 CHAM_GIA_TRAN', () => {
    const res = computePriceProposal({
      rule: rule(1000000, 800000, 1250000),
      currentPrice: 1150000,
      totalSeats: 500,
      soldSeats: 460,
      heldSeats: 20,
      velocityRatio: 3.2,
      hoursRemaining: 48,
    });
    near(res.intermediate.fillRate, 0.94, 'r');
    near(res.intermediate.deltaFill, 0.255, 'Δr');
    near(res.intermediate.deltaVelocity, 0.2, 'Δv');
    near(res.intermediate.deltaTime, 0.08, 'Δt');
    near(res.intermediate.rawPrice, 1535000, 'raw');
    near(res.intermediate.boundedPrice, 1380000, 'bounded');
    assert.strictEqual(res.proposedPrice, 1250000);
    assert.strictEqual(res.alertType, 'CHAM_GIA_TRAN');
    assert.strictEqual(res.shouldPropose, true);
  });

  it('ví dụ 3: 480.000 CHAM_GIA_SAN', () => {
    const res = computePriceProposal({
      rule: rule(600000, 480000, 750000),
      currentPrice: 550000,
      totalSeats: 400,
      soldSeats: 40,
      heldSeats: 0,
      velocityRatio: 0.2,
      hoursRemaining: 36,
    });
    near(res.intermediate.fillRate, 0.1, 'r');
    near(res.intermediate.deltaFill, -0.1, 'Δr');
    near(res.intermediate.deltaVelocity, -0.08, 'Δv');
    near(res.intermediate.deltaTime, -0.12, 'Δt');
    near(res.intermediate.rawPrice, 420000, 'raw');
    near(res.intermediate.boundedPrice, 440000, 'bounded');
    assert.strictEqual(res.proposedPrice, 480000);
    assert.strictEqual(res.alertType, 'CHAM_GIA_SAN');
    assert.strictEqual(res.shouldPropose, true);
  });

  it('ví dụ 4: không tạo đề xuất (chênh 0 < S)', () => {
    const res = computePriceProposal({
      rule: rule(800000, 600000, 1000000),
      currentPrice: 800000,
      totalSeats: 300,
      soldSeats: 135,
      heldSeats: 0,
      velocityRatio: 1.04,
      hoursRemaining: 120,
    });
    near(res.intermediate.fillRate, 0.45, 'r');
    near(res.intermediate.deltaFill, 0, 'Δr');
    near(res.intermediate.deltaVelocity, 0.004, 'Δv');
    near(res.intermediate.deltaTime, 0, 'Δt');
    near(res.intermediate.rawPrice, 803200, 'raw');
    assert.strictEqual(res.intermediate.roundedPrice, 800000);
    assert.strictEqual(res.shouldPropose, false);
    assert.deepStrictEqual(res.skipReasons, ['CHENH_LECH_DUOI_BUOC_NHAY']);
    assert.strictEqual(res.alertType, 'BINH_THUONG');
  });
});

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const val of Object.values(obj)) deepFreeze(val);
  }
  return obj;
}

function assertAllNumbersFinite(value, path = 'root') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `Non-finite number at ${path}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertAllNumbersFinite(item, `${path}[${idx}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertAllNumbersFinite(v, `${path}.${k}`);
    }
  }
}

describe('tỷ lệ lấp đầy và các hàm thành phần', () => {
  it('r=0, r=1 và clamp khi sold + 0.5*hold > total', () => {
    assert.strictEqual(fillRate(100, 0, 0), 0);
    assert.strictEqual(fillRate(100, 100, 0), 1);
    assert.strictEqual(fillRate(100, 90, 40), 1);
    assert.strictEqual(fillRate(100, 120, 0), 1);
    assert.strictEqual(fillRate(0, 10, 0), null);
    assert.strictEqual(fillRate(100, -1, 0), null);

    near(deltaFill(0), -0.15, 'Δr tại r=0');
    near(deltaFill(1), 0.3, 'Δr tại r=1');
  });

  it('các mốc ngưỡng lấp đầy 0.30, 0.60 và ngưỡng tùy biến', () => {
    near(deltaFill(0.299), -0.0005, 'dưới 0.30');
    assert.strictEqual(deltaFill(0.3), 0);
    assert.strictEqual(deltaFill(0.301), 0);
    assert.strictEqual(deltaFill(0.599), 0);
    assert.strictEqual(deltaFill(0.6), 0);
    near(deltaFill(0.601), 0.00075, 'trên 0.60');

    // Ngưỡng tùy biến 0.20 / 0.80
    near(deltaFill(0.1, 0.2, 0.8), -0.075, 'tùy biến dưới low');
    assert.strictEqual(deltaFill(0.2, 0.2, 0.8), 0);
    assert.strictEqual(deltaFill(0.8, 0.2, 0.8), 0);
    near(deltaFill(0.9, 0.2, 0.8), 0.15, 'tùy biến trên high');
  });

  it('trọng số và ngưỡng tùy biến trong computePriceProposal', () => {
    const res = computePriceProposal({
      rule: {
        basePrice: 1000000,
        floor: 500000,
        ceiling: 2000000,
        lowFill: 0.2,
        highFill: 0.8,
        wFill: 2,
        wVelocity: 0.5,
        wTime: 0,
      },
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 90,
      heldSeats: 0,
      velocityRatio: 2,
      hoursRemaining: 48,
    });
    near(res.intermediate.deltaFill, 0.15, 'Δr tùy biến');
    near(res.intermediate.deltaVelocity, 0.1, 'Δv');
    near(res.intermediate.deltaTime, 0.08, 'Δt');
    near(res.intermediate.deltaTotal, 0.35, 'Δtotal có trọng số');
    near(res.intermediate.rawPrice, 1350000, 'raw');
    near(res.intermediate.boundedPrice, 1200000, 'bounded');
    assert.strictEqual(res.proposedPrice, 1200000);
    assert.strictEqual(res.shouldPropose, true);
  });

  it('các mốc thời gian T=72, 72.01, 168, 168.01', () => {
    assert.strictEqual(deltaTime(72, 0.7), 0.08);
    assert.strictEqual(deltaTime(72, 0.699), 0);
    assert.strictEqual(deltaTime(72, 0.4), 0);
    assert.strictEqual(deltaTime(72, 0.399), -0.12);

    assert.strictEqual(deltaTime(72.01, 0.8), 0);
    assert.strictEqual(deltaTime(72.01, 0.35), 0);
    assert.strictEqual(deltaTime(72.01, 0.3), 0);
    assert.strictEqual(deltaTime(72.01, 0.299), -0.05);

    assert.strictEqual(deltaTime(168, 0.299), -0.05);
    assert.strictEqual(deltaTime(168, 0.3), 0);

    assert.strictEqual(deltaTime(168.01, 0.1), 0);
  });

  it('Δv clamp ở -0.10 và +0.20, hỗ trợ actualVelocity/targetVelocity', () => {
    assert.strictEqual(deltaVelocity(0), -0.1);
    assert.strictEqual(deltaVelocity(-1), -0.1);
    assert.strictEqual(deltaVelocity(1), 0);
    assert.strictEqual(deltaVelocity(3), 0.2);
    assert.strictEqual(deltaVelocity(5), 0.2);

    const res = computePriceProposal({
      rule: rule(1000000, 700000, 1500000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 50,
      heldSeats: 0,
      actualVelocity: 30,
      targetVelocity: 10,
      hoursRemaining: 100,
    });
    near(res.intermediate.u, 3, 'u từ actual/target');
    near(res.intermediate.deltaVelocity, 0.2, 'Δv clamp +0.20');
    assert.strictEqual(res.proposedPrice, 1200000);
  });
});

describe('biên dữ liệu thiếu, vô hiệu và bất biến đầu vào', () => {
  it('totalSeats=0 hoặc âm → KHONG_CO_GHE, không NaN', () => {
    for (const totalSeats of [0, -5]) {
      const res = computePriceProposal({
        rule: rule(1000000, 700000, 1500000),
        currentPrice: 1000000,
        totalSeats,
        soldSeats: 0,
        heldSeats: 0,
        velocityRatio: 1,
        hoursRemaining: 100,
      });
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['KHONG_CO_GHE']);
      assert.strictEqual(res.intermediate.fillRate, null);
      assertAllNumbersFinite(res);
    }
  });

  it('targetVelocity=0 là số hợp lệ, khác thiếu dữ liệu → Δv=0, warning KHONG_CO_TOC_DO_KY_VONG, vẫn tính tiếp', () => {
    const res = computePriceProposal({
      rule: rule(1000000, 700000, 1500000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 90,
      heldSeats: 0,
      actualVelocity: 5,
      targetVelocity: 0,
      hoursRemaining: 100,
    });
    assertAllNumbersFinite(res);
    assert.strictEqual(res.intermediate.u, null);
    assert.strictEqual(res.intermediate.deltaVelocity, 0);
    assert.ok(res.warnings.includes('KHONG_CO_TOC_DO_KY_VONG'));
    near(res.intermediate.deltaFill, 0.225, 'Δr khi r=0.9');
    assert.strictEqual(res.proposedPrice, 1200000);
    assert.strictEqual(res.shouldPropose, true);
  });

  it('targetVelocity=5 với actualVelocity null/undefined/"" → bỏ qua THIEU_DU_LIEU_TOC_DO, warning KHONG_CO_SO_LIEU_TOC_DO', () => {
    for (const actualVelocity of [null, undefined, '']) {
      const res = computePriceProposal({
        rule: rule(1000000, 700000, 1500000),
        currentPrice: 1000000,
        totalSeats: 100,
        soldSeats: 90,
        heldSeats: 0,
        targetVelocity: 5,
        actualVelocity,
        hoursRemaining: 100,
      });
      assertAllNumbersFinite(res);
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['THIEU_DU_LIEU_TOC_DO']);
      assert.ok(res.warnings.includes('KHONG_CO_SO_LIEU_TOC_DO'));
      assert.strictEqual(res.intermediate.fillRate, 0.9);
      assert.strictEqual(res.intermediate.u, null);
      assert.strictEqual(res.intermediate.deltaVelocity, null);
    }
  });

  it('targetVelocity=0 với actualVelocity thiếu (null/undefined/"") → vẫn tính giá 1200000 và đề xuất', () => {
    for (const actualVelocity of [null, undefined, '']) {
      const res = computePriceProposal({
        rule: rule(1000000, 700000, 1500000),
        currentPrice: 1000000,
        totalSeats: 100,
        soldSeats: 90,
        heldSeats: 0,
        targetVelocity: 0,
        actualVelocity,
        hoursRemaining: 100,
      });
      assertAllNumbersFinite(res);
      assert.strictEqual(res.intermediate.u, null);
      assert.strictEqual(res.intermediate.deltaVelocity, 0);
      assert.ok(res.warnings.includes('KHONG_CO_TOC_DO_KY_VONG'));
      assert.strictEqual(res.proposedPrice, 1200000);
      assert.strictEqual(res.shouldPropose, true);
    }
  });

  it('targetVelocity thiếu (null/undefined/"", không có velocityRatio) dù actualVelocity thiếu hay hợp lệ → bỏ qua THIEU_DU_LIEU_TOC_DO', () => {
    for (const targetVelocity of [undefined, null, '']) {
      for (const actualVelocity of [null, undefined, '', 5]) {
        const res = computePriceProposal({
          rule: rule(1000000, 700000, 1500000),
          currentPrice: 1000000,
          totalSeats: 100,
          soldSeats: 90,
          heldSeats: 0,
          targetVelocity,
          actualVelocity,
          hoursRemaining: 100,
        });
        assertAllNumbersFinite(res);
        assert.strictEqual(res.shouldPropose, false);
        assert.strictEqual(res.proposedPrice, null);
        assert.deepStrictEqual(res.skipReasons, ['THIEU_DU_LIEU_TOC_DO']);
        assert.ok(res.warnings.includes('KHONG_CO_TOC_DO_KY_VONG'));
        assert.strictEqual(res.intermediate.fillRate, 0.9);
        assert.strictEqual(res.intermediate.u, null);
        assert.strictEqual(res.intermediate.deltaVelocity, null);
      }
    }
  });

  it('rule.active=false → QUY_TAC_KHONG_KICH_HOAT', () => {
    const res = computePriceProposal({
      rule: { ...rule(1000000, 700000, 1500000), active: false },
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 90,
      velocityRatio: 2,
      hoursRemaining: 48,
    });
    assert.strictEqual(res.shouldPropose, false);
    assert.strictEqual(res.proposedPrice, null);
    assert.deepStrictEqual(res.skipReasons, ['QUY_TAC_KHONG_KICH_HOAT']);
  });

  it('đầu vào NaN, chuỗi rác, null, giá âm, floor>ceiling → không NaN/Infinity, báo DU_LIEU_KHONG_HOP_LE', () => {
    const badCases = [
      null,
      undefined,
      { rule: null, currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: rule(NaN, 500000, 1500000), currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: rule(-1000, 500000, 1500000), currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: rule(1000000, 1200000, 900000), currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: rule(1000000, 500000, 1500000), currentPrice: 'abc', totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: rule(1000000, 500000, 1500000), currentPrice: Infinity, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: rule(1000000, 500000, 1500000), currentPrice: 1000000, totalSeats: 100, soldSeats: 'xyz', hoursRemaining: 50 },
      { rule: rule(1000000, 500000, 1500000), currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: -1 },
      { rule: { ...rule(1000000, 500000, 1500000), step: 0 }, currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
      { rule: { ...rule(1000000, 500000, 1500000), maxChange: 'bad' }, currentPrice: 1000000, totalSeats: 100, soldSeats: 10, hoursRemaining: 50 },
    ];
    for (const input of badCases) {
      const res = computePriceProposal(input);
      assertAllNumbersFinite(res);
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_KHONG_HOP_LE']);
    }
  });

  it('không sửa đổi (mutate) đầu vào bị freeze sâu', () => {
    const rawInput = {
      rule: { basePrice: 1000000, floor: 700000, ceiling: 1500000, step: 10000 },
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 80,
      heldSeats: 5,
      velocityRatio: 1.5,
      hoursRemaining: 48,
      hasPendingProposal: false,
    };
    const snapshot = structuredClone(rawInput);
    deepFreeze(rawInput);
    const res = computePriceProposal(rawInput);
    assert.strictEqual(res.shouldPropose, true);
    assert.deepStrictEqual(rawInput, snapshot);
  });

  it('ruleFromQuyTacGia ánh xạ chuỗi NUMERIC và lấy mặc định khi thiếu cột', () => {
    assert.deepStrictEqual(PRICING_DEFAULTS, {
      maxChange: 0.2,
      step: 10000,
      lowFill: 0.3,
      highFill: 0.6,
      wFill: 1,
      wVelocity: 1,
      wTime: 1,
    });

    const mapped = ruleFromQuyTacGia({
      GiaGoc: '1500000.00',
      GiaSan: '1200000.00',
      GiaTran: '2000000.00',
      BuocNhayGia: '20000.00',
      BienDoToiDaMoiChuKy: '0.1500',
      NguongLapDayThap: '0.2500',
      NguongLapDayCao: '0.6500',
      TrongSoLapDay: '1.2000',
      TrongSoTocDoBan: '0.8000',
      TrongSoThoiGian: '0.5000',
      TrangThaiKichHoat: false,
    });
    assert.deepStrictEqual(mapped, {
      basePrice: 1500000,
      floor: 1200000,
      ceiling: 2000000,
      step: 20000,
      maxChange: 0.15,
      lowFill: 0.25,
      highFill: 0.65,
      wFill: 1.2,
      wVelocity: 0.8,
      wTime: 0.5,
      active: false,
    });

    const withDefaults = ruleFromQuyTacGia({
      GiaGoc: '800000',
      GiaSan: '600000',
      GiaTran: '1000000',
    });
    assert.deepStrictEqual(withDefaults, {
      basePrice: 800000,
      floor: 600000,
      ceiling: 1000000,
      step: PRICING_DEFAULTS.step,
      maxChange: PRICING_DEFAULTS.maxChange,
      lowFill: PRICING_DEFAULTS.lowFill,
      highFill: PRICING_DEFAULTS.highFill,
      wFill: PRICING_DEFAULTS.wFill,
      wVelocity: PRICING_DEFAULTS.wVelocity,
      wTime: PRICING_DEFAULTS.wTime,
      active: true,
    });

    const missingPrices = ruleFromQuyTacGia({});
    assert.strictEqual(missingPrices.basePrice, null);
    assert.strictEqual(missingPrices.floor, null);
    assert.strictEqual(missingPrices.ceiling, null);
  });
});

describe('hồi quy dữ liệu tốc độ sai, tràn số và ràng buộc QUY_TAC_GIA', () => {
  const baseInput = (overrides = {}) => ({
    rule: rule(1000000, 700000, 1500000),
    currentPrice: 1000000,
    totalSeats: 100,
    soldSeats: 50,
    heldSeats: 0,
    hoursRemaining: 100,
    ...overrides,
  });

  it('velocityRatio sai (bad, -1, Infinity, NaN) → DU_LIEU_TOC_DO_KHONG_HOP_LE', () => {
    for (const velocityRatio of ['bad', -1, Infinity, NaN]) {
      const res = computePriceProposal(baseInput({ velocityRatio }));
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_TOC_DO_KHONG_HOP_LE']);
      assertAllNumbersFinite(res);
    }
  });

  it('targetVelocity sai (-5, x) khi thiếu velocityRatio → DU_LIEU_TOC_DO_KHONG_HOP_LE', () => {
    for (const targetVelocity of [-5, 'x']) {
      const res = computePriceProposal(baseInput({ targetVelocity, actualVelocity: 5 }));
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_TOC_DO_KHONG_HOP_LE']);
      assertAllNumbersFinite(res);
    }
  });

  it('targetVelocity=5 với actualVelocity sai (-1, abc) → DU_LIEU_TOC_DO_KHONG_HOP_LE', () => {
    for (const actualVelocity of [-1, 'abc']) {
      const res = computePriceProposal(baseInput({ targetVelocity: 5, actualVelocity }));
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_TOC_DO_KHONG_HOP_LE']);
      assertAllNumbersFinite(res);
    }
  });

  it('tràn số phép chia u (actualVelocity=1e308, targetVelocity=1e-308) → TRAN_SO_KHI_TINH, u=null', () => {
    const res = computePriceProposal(baseInput({ actualVelocity: 1e308, targetVelocity: 1e-308 }));
    assert.strictEqual(res.shouldPropose, false);
    assert.strictEqual(res.proposedPrice, null);
    assert.deepStrictEqual(res.skipReasons, ['TRAN_SO_KHI_TINH']);
    assert.strictEqual(res.intermediate.u, null);
    assertAllNumbersFinite(res);
  });

  it('tràn số trọng số (wFill=1e308 tại r=0.9) → TRAN_SO_KHI_TINH, rawPrice là null', () => {
    const res = computePriceProposal(
      baseInput({
        rule: { ...rule(1000000, 700000, 1500000), wFill: 1e308 },
        soldSeats: 90,
        velocityRatio: 1,
      }),
    );
    assert.strictEqual(res.shouldPropose, false);
    assert.strictEqual(res.proposedPrice, null);
    assert.deepStrictEqual(res.skipReasons, ['TRAN_SO_KHI_TINH']);
    assert.ok(Number.isFinite(res.intermediate.deltaTotal));
    assert.strictEqual(res.intermediate.rawPrice, null);
    assertAllNumbersFinite(res);
  });

  it('tràn số rawPrice với giá lớn khoảng 1.5e308 (floor <= basePrice <= ceiling) → TRAN_SO_KHI_TINH', () => {
    const res = computePriceProposal(
      baseInput({
        rule: rule(1.5e308, 1e308, 1.6e308),
        currentPrice: 1.5e308,
        soldSeats: 90,
        velocityRatio: 1,
      }),
    );
    assert.strictEqual(res.shouldPropose, false);
    assert.strictEqual(res.proposedPrice, null);
    assert.deepStrictEqual(res.skipReasons, ['TRAN_SO_KHI_TINH']);
    assert.strictEqual(res.intermediate.rawPrice, null);
    assertAllNumbersFinite(res);
  });

  it('ràng buộc QUY_TAC_GIA: maxChange > 1 (2, 1.0000001) → DU_LIEU_KHONG_HOP_LE', () => {
    for (const maxChange of [2, 1.0000001]) {
      const res = computePriceProposal(
        baseInput({
          rule: { ...rule(1000000, 700000, 1500000), maxChange },
          velocityRatio: 1,
        }),
      );
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_KHONG_HOP_LE']);
      assertAllNumbersFinite(res);
    }
  });

  it('maxChange=1 hợp lệ (bounded có thể chạm 0) → vẫn tính và mọi số hữu hạn', () => {
    const res = computePriceProposal(
      baseInput({
        rule: { ...rule(1000000, 500000, 1500000), maxChange: 1, wFill: 10 },
        soldSeats: 0,
        velocityRatio: 1,
      }),
    );
    near(res.intermediate.boundedPrice, 0, 'bounded');
    assert.strictEqual(res.proposedPrice, 500000);
    assert.strictEqual(res.shouldPropose, true);
    assert.deepStrictEqual(res.skipReasons, []);
    assertAllNumbersFinite(res);
  });

  it('ràng buộc QUY_TAC_GIA: basePrice < floor hoặc basePrice > ceiling → DU_LIEU_KHONG_HOP_LE', () => {
    for (const badRule of [rule(600000, 700000, 1500000), rule(1600000, 700000, 1500000)]) {
      const res = computePriceProposal(baseInput({ rule: badRule, velocityRatio: 1 }));
      assert.strictEqual(res.shouldPropose, false);
      assert.strictEqual(res.proposedPrice, null);
      assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_KHONG_HOP_LE']);
      assertAllNumbersFinite(res);
    }
  });

  it('ruleFromQuyTacGia với BienDoToiDaMoiChuKy="2" → computePriceProposal bỏ qua DU_LIEU_KHONG_HOP_LE', () => {
    const mapped = ruleFromQuyTacGia({
      GiaGoc: '1000000',
      GiaSan: '700000',
      GiaTran: '1500000',
      BienDoToiDaMoiChuKy: '2',
    });
    const res = computePriceProposal(baseInput({ rule: mapped, velocityRatio: 1 }));
    assert.strictEqual(res.shouldPropose, false);
    assert.strictEqual(res.proposedPrice, null);
    assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_KHONG_HOP_LE']);
    assertAllNumbersFinite(res);
  });
});

describe('sàn=trần, deadband, PENDING và AC6 vượt biên độ', () => {
  it('sàn=trần: xét trần trước khi rounded ≥ trần, và CHAM_GIA_SAN khi rounded < sàn', () => {
    const up = computePriceProposal({
      rule: rule(1000000, 1000000, 1000000),
      currentPrice: 900000,
      totalSeats: 100,
      soldSeats: 80,
      heldSeats: 0,
      velocityRatio: 2,
      hoursRemaining: 48,
    });
    assert.strictEqual(up.proposedPrice, 1000000);
    assert.strictEqual(up.alertType, 'CHAM_GIA_TRAN');
    assert.strictEqual(up.outOfRangeClamped, true);
    assert.ok(up.warnings.includes('SAN_BANG_TRAN'));

    const exact = computePriceProposal({
      rule: rule(1000000, 1000000, 1000000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 50,
      heldSeats: 0,
      velocityRatio: 1,
      hoursRemaining: 100,
    });
    assert.strictEqual(exact.proposedPrice, 1000000);
    assert.strictEqual(exact.alertType, 'CHAM_GIA_TRAN');
    assert.strictEqual(exact.outOfRangeClamped, false);
    assert.strictEqual(exact.shouldPropose, false);
    assert.ok(exact.warnings.includes('SAN_BANG_TRAN'));

    const down = computePriceProposal({
      rule: rule(1000000, 1000000, 1000000),
      currentPrice: 1100000,
      totalSeats: 100,
      soldSeats: 10,
      heldSeats: 0,
      velocityRatio: 0.2,
      hoursRemaining: 36,
    });
    assert.strictEqual(down.proposedPrice, 1000000);
    assert.strictEqual(down.alertType, 'CHAM_GIA_SAN');
    assert.strictEqual(down.outOfRangeClamped, true);
    assert.ok(down.warnings.includes('SAN_BANG_TRAN'));
  });

  it('proposed == Pcur, chênh đúng S (đề xuất), chênh S-1 (không đề xuất) và hasPendingProposal', () => {
    const same = computePriceProposal({
      rule: rule(1000000, 800000, 1200000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 50,
      velocityRatio: 1,
      hoursRemaining: 100,
    });
    assert.strictEqual(same.proposedPrice, 1000000);
    assert.strictEqual(same.shouldPropose, false);
    assert.deepStrictEqual(same.skipReasons, ['CHENH_LECH_DUOI_BUOC_NHAY']);

    const exactStep = computePriceProposal({
      rule: rule(1000000, 800000, 1200000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 50,
      velocityRatio: 1.1,
      hoursRemaining: 100,
    });
    assert.strictEqual(exactStep.proposedPrice, 1010000);
    assert.strictEqual(exactStep.shouldPropose, true);
    assert.deepStrictEqual(exactStep.skipReasons, []);

    const belowStep = computePriceProposal({
      rule: rule(1000000, 800000, 1009999),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 50,
      velocityRatio: 1.1,
      hoursRemaining: 100,
    });
    assert.strictEqual(belowStep.proposedPrice, 1009999);
    assert.strictEqual(belowStep.shouldPropose, false);
    assert.deepStrictEqual(belowStep.skipReasons, ['CHENH_LECH_DUOI_BUOC_NHAY']);

    const pending = computePriceProposal({
      rule: rule(1000000, 800000, 1200000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 80,
      velocityRatio: 2,
      hoursRemaining: 48,
      hasPendingProposal: true,
    });
    assert.strictEqual(pending.proposedPrice, 1200000);
    assert.strictEqual(pending.shouldPropose, false);
    assert.deepStrictEqual(pending.skipReasons, ['DA_CO_DE_XUAT_PENDING']);

    const bothSkips = computePriceProposal({
      rule: rule(1000000, 800000, 1200000),
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 50,
      velocityRatio: 1,
      hoursRemaining: 100,
      hasPendingProposal: true,
    });
    assert.strictEqual(bothSkips.shouldPropose, false);
    assert.deepStrictEqual(bothSkips.skipReasons, [
      'CHENH_LECH_DUOI_BUOC_NHAY',
      'DA_CO_DE_XUAT_PENDING',
    ]);
  });

  it('AC6: làm tròn hoặc sàn/trần đẩy giá vượt biên độ giữ nguyên thứ tự bước và bật exceedsMaxChange', () => {
    // Ca 1: làm tròn theo S=70000 đẩy 800000 -> 770000 (giảm 23% > Δmax=20%)
    const roundExceed = computePriceProposal({
      rule: { basePrice: 1000000, floor: 500000, ceiling: 2000000, step: 70000, maxChange: 0.2 },
      currentPrice: 1000000,
      totalSeats: 100,
      soldSeats: 5,
      heldSeats: 0,
      velocityRatio: 0,
      hoursRemaining: 24,
    });
    near(roundExceed.intermediate.boundedPrice, 800000, 'bounded');
    assert.strictEqual(roundExceed.intermediate.roundedPrice, 770000);
    assert.strictEqual(roundExceed.proposedPrice, 770000);
    assert.strictEqual(roundExceed.exceedsMaxChange, true);
    assert.ok(roundExceed.warnings.includes('VUOT_BIEN_DO_SAU_LAM_TRON_HOAC_CHAN'));

    // Ca 2: sàn ép giá vượt biên độ (Pcur=500000, floor=700000, Δmax=0.2)
    const floorExceed = computePriceProposal({
      rule: { basePrice: 700000, floor: 700000, ceiling: 1000000, step: 10000, maxChange: 0.2 },
      currentPrice: 500000,
      totalSeats: 100,
      soldSeats: 10,
      heldSeats: 0,
      velocityRatio: 0.2,
      hoursRemaining: 36,
    });
    assert.ok(floorExceed.intermediate.boundedPrice <= 600000);
    assert.ok(floorExceed.intermediate.roundedPrice <= 600000);
    assert.strictEqual(floorExceed.proposedPrice, 700000);
    assert.strictEqual(floorExceed.alertType, 'CHAM_GIA_SAN');
    assert.strictEqual(floorExceed.outOfRangeClamped, true);
    assert.strictEqual(floorExceed.exceedsMaxChange, true);
    assert.ok(floorExceed.warnings.includes('VUOT_BIEN_DO_SAU_LAM_TRON_HOAC_CHAN'));
    assert.ok(floorExceed.warnings.includes('GIA_HIEN_HANH_NGOAI_KHUNG'));
  });
});

describe('regression làm tròn tại ngưỡng S/2', () => {
  const thresholdInput = (overrides) => ({
    rule: rule(1000000, 700000, 1500000),
    currentPrice: 1000000,
    totalSeats: 100,
    soldSeats: 50,
    hoursRemaining: 100,
    ...overrides,
  });

  it('velocityRatio=1.049999996 dưới ngưỡng S/2 → roundedPrice=1000000, không đề xuất', () => {
    const res = computePriceProposal(thresholdInput({ velocityRatio: 1.049999996 }));
    near(res.intermediate.rawPrice, 1004999.9996, 'raw');
    assert.strictEqual(res.intermediate.roundedPrice, 1000000);
    assert.strictEqual(res.proposedPrice, 1000000);
    assert.strictEqual(res.shouldPropose, false);
    assert.ok(res.skipReasons.includes('CHENH_LECH_DUOI_BUOC_NHAY'));
  });

  it('velocityRatio=1.050000004 trên ngưỡng S/2 → roundedPrice=1010000, đề xuất', () => {
    const res = computePriceProposal(thresholdInput({ velocityRatio: 1.050000004 }));
    near(res.intermediate.rawPrice, 1005000.0004, 'raw');
    assert.strictEqual(res.intermediate.roundedPrice, 1010000);
    assert.strictEqual(res.proposedPrice, 1010000);
    assert.strictEqual(res.shouldPropose, true);
    assert.deepStrictEqual(res.skipReasons, []);
  });

  it('lặp lại ngưỡng S/2 qua actualVelocity/targetVelocity (target=1)', () => {
    const below = computePriceProposal(thresholdInput({ actualVelocity: 1.049999996, targetVelocity: 1 }));
    near(below.intermediate.rawPrice, 1004999.9996, 'raw below');
    assert.strictEqual(below.intermediate.roundedPrice, 1000000);
    assert.strictEqual(below.proposedPrice, 1000000);
    assert.strictEqual(below.shouldPropose, false);
    assert.ok(below.skipReasons.includes('CHENH_LECH_DUOI_BUOC_NHAY'));

    const above = computePriceProposal(thresholdInput({ actualVelocity: 1.050000004, targetVelocity: 1 }));
    near(above.intermediate.rawPrice, 1005000.0004, 'raw above');
    assert.strictEqual(above.intermediate.roundedPrice, 1010000);
    assert.strictEqual(above.proposedPrice, 1010000);
    assert.strictEqual(above.shouldPropose, true);
    assert.deepStrictEqual(above.skipReasons, []);
  });
});

describe('actualVelocity sai ở mọi nhánh', () => {
  const base = (overrides = {}) => ({
    rule: rule(1000000, 700000, 1500000),
    currentPrice: 1000000,
    totalSeats: 100,
    soldSeats: 90,
    hoursRemaining: 100,
    ...overrides,
  });

  it('trả DU_LIEU_TOC_DO_KHONG_HOP_LE với ["bad", -1, NaN, Infinity] ở mọi nhánh', () => {
    const badValues = ['bad', -1, NaN, Infinity];
    const branches = [
      { targetVelocity: 0 },
      {},
      { targetVelocity: 5 },
      { velocityRatio: 1 },
    ];
    for (const actualVelocity of badValues) {
      for (const branch of branches) {
        const res = computePriceProposal(base({ ...branch, actualVelocity }));
        assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_TOC_DO_KHONG_HOP_LE']);
        assert.strictEqual(res.shouldPropose, false);
        assert.strictEqual(res.proposedPrice, null);
        assertAllNumbersFinite(res);
      }
    }
  });

  it('ca kiểm executive: targetVelocity=0, actualVelocity="bad" không còn cho 1200000', () => {
    const res = computePriceProposal(base({ targetVelocity: 0, actualVelocity: 'bad' }));
    assert.notStrictEqual(res.proposedPrice, 1200000);
    assert.strictEqual(res.proposedPrice, null);
    assert.strictEqual(res.shouldPropose, false);
    assert.deepStrictEqual(res.skipReasons, ['DU_LIEU_TOC_DO_KHONG_HOP_LE']);
  });
});

describe('ca kiểm executive review 3', () => {
  const execBase = (overrides = {}) => ({
    rule: rule(1000000, 700000, 1500000),
    currentPrice: 1000000,
    totalSeats: 100,
    soldSeats: 90,
    heldSeats: 0,
    hoursRemaining: 100,
    ...overrides,
  });

  it('thiếu toàn bộ dữ liệu tốc độ → bỏ qua THIEU_DU_LIEU_TOC_DO, proposedPrice=null (không phải 1200000)', () => {
    const res = computePriceProposal(execBase());
    assert.notStrictEqual(res.proposedPrice, 1200000);
    assert.strictEqual(res.proposedPrice, null);
    assert.strictEqual(res.shouldPropose, false);
    assert.deepStrictEqual(res.skipReasons, ['THIEU_DU_LIEU_TOC_DO']);
    assert.ok(res.warnings.includes('KHONG_CO_TOC_DO_KY_VONG'));
    assert.strictEqual(res.intermediate.fillRate, 0.9);
    assert.strictEqual(res.intermediate.u, null);
    assertAllNumbersFinite(res);
  });

  it('targetVelocity=5 thiếu actualVelocity → bỏ qua THIEU_DU_LIEU_TOC_DO, proposedPrice=null (không phải 1200000)', () => {
    const res = computePriceProposal(execBase({ targetVelocity: 5 }));
    assert.notStrictEqual(res.proposedPrice, 1200000);
    assert.strictEqual(res.proposedPrice, null);
    assert.strictEqual(res.shouldPropose, false);
    assert.deepStrictEqual(res.skipReasons, ['THIEU_DU_LIEU_TOC_DO']);
    assert.ok(res.warnings.includes('KHONG_CO_SO_LIEU_TOC_DO'));
    assert.strictEqual(res.intermediate.fillRate, 0.9);
    assert.strictEqual(res.intermediate.u, null);
    assertAllNumbersFinite(res);
  });

  it('velocityRatio="" kèm targetVelocity=5 và actualVelocity thiếu → cũng phải bỏ qua', () => {
    const res = computePriceProposal(execBase({ velocityRatio: '', targetVelocity: 5 }));
    assert.notStrictEqual(res.proposedPrice, 1200000);
    assert.strictEqual(res.proposedPrice, null);
    assert.strictEqual(res.shouldPropose, false);
    assert.deepStrictEqual(res.skipReasons, ['THIEU_DU_LIEU_TOC_DO']);
    assert.ok(res.warnings.includes('KHONG_CO_SO_LIEU_TOC_DO'));
    assert.strictEqual(res.intermediate.fillRate, 0.9);
    assert.strictEqual(res.intermediate.u, null);
    assertAllNumbersFinite(res);
  });
});
