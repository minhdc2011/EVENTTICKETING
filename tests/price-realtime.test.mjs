import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import esbuild from 'esbuild';

import {
  LEGACY_NO_SUAT_KEY,
  PRICE_MOCK_EVENT,
  fetchScopeZonePrices,
  isValidPrice,
  khopMaPhamViNghiemNgat,
  kiemTraGhiLocalStorage,
  mapRealtimePricePayload,
  phatThongBaoGiaMock,
  subscribeToMockPriceUpdates,
  subscribeToPriceUpdatesWithClient,
} from '../src/domain/priceRealtime.js';
import {
  createMockState,
  deXuatTuDong,
  duyetDeXuatGia,
  tuChoiDeXuatGia,
} from '../src/domain/mockPricing.js';
import {
  DEMO_KHU_IDS,
  DEMO_NGUOI_DUNG,
  DEMO_SUAT_ID,
  DEMO_SU_KIEN_ID,
  khoiTaoDemoPricing,
} from '../src/domain/pricingMockDemo.js';
import {taoKhoPhienMock} from '../src/domain/pricingServiceCore.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFakeSupabase() {
  const calls = {channels: [], on: [], removed: []};
  let subscribeCb = null;
  const handlers = [];
  const supabase = {
    channel(topic) {
      calls.channels.push(topic);
      const ch = {
        on(type, filter, handler) {
          calls.on.push({type, filter});
          handlers.push(handler);
          return ch;
        },
        subscribe(cb) {
          subscribeCb = cb;
          return ch;
        },
      };
      return ch;
    },
    removeChannel(ch) {
      calls.removed.push(ch);
      return Promise.resolve('ok');
    },
  };
  return {
    supabase,
    calls,
    status: (s) => subscribeCb(s),
    deliver: (payload) => handlers.forEach((h) => h(payload)),
  };
}

const scope = {suKienId: 1, suatDienId: 10};
const row = (id, gia, extra = {}) => ({
  KhuVucID: id,
  SuKienID: 1,
  SuatDienID: 10,
  GiaVeNiemYet: gia,
  ...extra,
});
const payload = (r) => ({new: r, commit_timestamp: '2026-01-01T00:00:00Z'});

describe('nhánh thật', () => {
  const allowedZoneIds = new Set([1, 2]);
  const opts = {allowedZoneIds, ...scope};

  it('isValidPrice chỉ nhận số hữu hạn > 0', () => {
    assert.equal(isValidPrice(100), true);
    for (const v of [0, -1, NaN, Infinity, '100', null, undefined]) {
      assert.equal(isValidPrice(v), false);
    }
  });

  it('lọc phạm vi: khu lạ hoặc SuatDienID lệch bị bỏ', () => {
    assert.equal(mapRealtimePricePayload(payload(row(99, 100)), opts), null);
    assert.equal(mapRealtimePricePayload(payload(row(1, 100, {SuatDienID: 11})), opts), null);
    assert.equal(mapRealtimePricePayload(payload(row(1, 100, {SuKienID: 2})), opts), null);
  });

  it('payload lỗi bị bỏ', () => {
    assert.equal(mapRealtimePricePayload(null, opts), null);
    assert.equal(mapRealtimePricePayload({}, opts), null);
    assert.equal(mapRealtimePricePayload(payload(row(1, -5)), opts), null);
    assert.equal(mapRealtimePricePayload(payload(row(1, NaN)), opts), null);
    for (const bad of ['', 'abc', '0', '-5']) {
      assert.equal(mapRealtimePricePayload(payload(row(1, bad)), opts), null);
    }
    assert.equal(mapRealtimePricePayload(payload({GiaVeNiemYet: 100}), opts), null);
  });

  it('chấp nhận giá dạng chuỗi số và chuyển thành số', () => {
    const event = mapRealtimePricePayload(payload(row(1, '100.50')), opts);
    assert.equal(event.gia, 100.5);
  });

  it('cập nhật hợp lệ, bỏ qua khi giá không đổi', () => {
    const event = mapRealtimePricePayload(payload(row(1, 150)), {
      ...opts,
      lastPrices: new Map([[1, 100]]),
    });
    assert.deepEqual(event, {
      type: 'ZONE_PRICE_CHANGED',
      suKienId: 1,
      suatDienId: 10,
      khuVucId: 1,
      gia: 150,
      occurredAt: '2026-01-01T00:00:00Z',
      nguon: 'REALTIME',
    });
    assert.equal(
      mapRealtimePricePayload(payload(row(1, 100)), {...opts, lastPrices: new Map([[1, 100]])}),
      null,
    );
  });

  it('không có khu thì không gọi channel và báo CONNECTED', async () => {
    const fake = createFakeSupabase();
    const statuses = [];
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => assert.fail('không được phát'),
      onConnectionStatus: (s) => statuses.push(s),
      fetchZonePrices: async () => [],
    });
    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'CONNECTED']);
    assert.equal(fake.calls.channels.length, 0);
  });

  it('một channel, filter chia nhóm <= 100, phát cập nhật hợp lệ', async () => {
    const fake = createFakeSupabase();
    const events = [];
    const rows = Array.from({length: 120}, (_, i) => row(i + 1, 100));
    let snapshot = null;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      onSnapshot: (p) => (snapshot = p),
      fetchZonePrices: async () => rows,
    });
    await flush();
    assert.equal(fake.calls.channels.length, 1);
    assert.equal(fake.calls.on.length, 2);
    assert.ok(fake.calls.on.every((c) => c.filter.table === 'KHU_VUC' && c.filter.event === 'UPDATE'));
    assert.equal(snapshot.get(5), 100);

    fake.deliver(payload(row(5, 200)));
    fake.deliver(payload(row(5, 200))); // trùng giá
    fake.deliver(payload(row(999, 300))); // khu lạ
    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, 5);
    assert.equal(events[0].nguon, 'REALTIME');
  });

  it('CLOSED rồi SUBSCRIBED thì đọc lại và phát RESYNC chỉ cho khu đổi giá', async () => {
    const fake = createFakeSupabase();
    const events = [];
    const statuses = [];
    let fetches = 0;
    let current = [row(1, 100), row(2, 200)];
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
      fetchZonePrices: async () => {
        fetches += 1;
        return current;
      },
    });
    await flush();
    assert.equal(fetches, 1);
    fake.status('SUBSCRIBED'); // resync đầu tiên, giá chưa đổi
    await flush();
    assert.equal(fetches, 2);
    assert.equal(events.length, 0);
    fake.status('CLOSED');
    current = [row(1, 100), row(2, 250)];
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(fetches, 3);
    assert.deepEqual(statuses, [
      'CONNECTING',
      'CONNECTED',
      'CONNECTED',
      'DISCONNECTED',
      'CONNECTED',
      'CONNECTED',
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, 2);
    assert.equal(events[0].gia, 250);
    assert.equal(events[0].nguon, 'RESYNC');
  });

  it('cập nhật rơi vào khoảng giữa lần đọc đầu và SUBSCRIBED đầu tiên vẫn được bù', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: async () => {
        fetches += 1;
        return [row(1, fetches === 1 ? 100 : 120)];
      },
    });
    await flush();
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].nguon, 'RESYNC');
    assert.equal(events[0].gia, 120);
  });

  it('fetchZonePrices trả giá chuỗi NUMERIC thì không sinh sự kiện giả và vẫn bắt được đổi giá', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: async () => {
        fetches += 1;
        return [row(1, fetches < 3 ? '100.00' : '150.00'), row(2, 'abc')];
      },
    });
    await flush();
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(events.length, 0);
    fake.deliver(payload(row(1, 100))); // cùng giá, dạng số
    assert.equal(events.length, 0);
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].gia, 150);
  });

  it('resync thành công sau lỗi resync thì trạng thái trở lại CONNECTED', async () => {
    const fake = createFakeSupabase();
    const statuses = [];
    let fetches = 0;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => undefined,
      onConnectionStatus: (s) => statuses.push(s),
      fetchZonePrices: async () => {
        fetches += 1;
        if (fetches === 2) throw new Error('boom');
        return [row(1, 100)];
      },
    });
    await flush();
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(statuses.at(-1), 'ERROR');
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(fetches, 3);
    assert.equal(statuses.at(-1), 'CONNECTED');
  });

  it('CHANNEL_ERROR/TIMED_OUT báo ERROR rồi đọc lại khi SUBSCRIBED', async () => {
    for (const bad of ['CHANNEL_ERROR', 'TIMED_OUT']) {
      const fake = createFakeSupabase();
      const events = [];
      const statuses = [];
      let fetches = 0;
      subscribeToPriceUpdatesWithClient({
        supabase: fake.supabase,
        scope,
        listener: (e) => events.push(e),
        onConnectionStatus: (s) => statuses.push(s),
        fetchZonePrices: async () => {
          fetches += 1;
          return [row(1, fetches < 3 ? 100 : 130)];
        },
      });
      await flush();
      fake.status('SUBSCRIBED');
      await flush();
      fake.status(bad);
      assert.equal(statuses.at(-1), 'ERROR');
      fake.status('SUBSCRIBED');
      await flush();
      assert.equal(fetches, 3);
      assert.equal(statuses.at(-1), 'CONNECTED');
      assert.equal(events.length, 1);
      assert.equal(events[0].nguon, 'RESYNC');
      assert.equal(events[0].gia, 130);
    }
  });

  it('gọi unsubscribe hai lần chỉ gỡ channel một lần', async () => {
    const fake = createFakeSupabase();
    const unsubscribe = subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => undefined,
      fetchZonePrices: async () => [row(1, 100)],
    });
    await flush();
    unsubscribe();
    unsubscribe();
    assert.equal(fake.calls.removed.length, 1);
  });

  it('resync không ghi đè giá realtime mới hơn bằng bản đọc cũ', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    let release;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: () => {
        fetches += 1;
        if (fetches === 1) return Promise.resolve([row(1, 100), row(2, 200)]);
        return new Promise((resolve) => (release = () => resolve([row(1, 100), row(2, 200)])));
      },
    });
    await flush();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    fake.deliver(payload(row(2, 300)));
    release();
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].nguon, 'REALTIME');
    assert.equal(events[0].gia, 300);
    fake.deliver(payload(row(2, 300))); // trùng giá
    assert.equal(events.length, 1);
  });

  it('resync không ghi đè bằng bản đọc cũ khi nhận realtime trùng giá cache trong lúc resync', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    let release;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: () => {
        fetches += 1;
        if (fetches === 1) return Promise.resolve([row(1, 100)]);
        return new Promise((resolve) => (release = () => resolve([row(1, 150)])));
      },
    });
    await flush();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    fake.deliver(payload(row(1, 100)));
    release();
    await flush();
    assert.equal(events.length, 0);

    fake.deliver(payload(row(1, 100)));
    assert.equal(events.length, 0);
    fake.deliver(payload(row(1, 150)));
    assert.equal(events.length, 1);
    assert.equal(events[0].nguon, 'REALTIME');
    assert.equal(events[0].gia, 150);
  });

  it('realtime trùng giá ở khu khác không chặn resync cho khu còn lại', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    let release;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: () => {
        fetches += 1;
        if (fetches === 1) return Promise.resolve([row(1, 100), row(2, 200)]);
        return new Promise((resolve) => (release = () => resolve([row(1, 150), row(2, 250)])));
      },
    });
    await flush();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    fake.deliver(payload(row(2, 200)));
    release();
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, 1);
    assert.equal(events[0].nguon, 'RESYNC');
    assert.equal(events[0].gia, 150);
  });

  it('resync lỗi thì ERROR và lần SUBSCRIBED sau thử đọc lại', async () => {
    const fake = createFakeSupabase();
    const events = [];
    const statuses = [];
    let fetches = 0;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
      fetchZonePrices: async () => {
        fetches += 1;
        if (fetches === 2) throw new Error('boom');
        return [row(1, fetches === 1 ? 100 : 150)];
      },
    });
    await flush();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(statuses.at(-1), 'ERROR');
    assert.equal(events.length, 0);
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(fetches, 3);
    assert.equal(events.length, 1);
    assert.equal(events[0].nguon, 'RESYNC');
    assert.equal(events[0].gia, 150);
  });

  it('unsubscribe khi fetch chưa xong thì không tạo channel và không phát', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let release;
    const unsubscribe = subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: () => new Promise((resolve) => (release = () => resolve([row(1, 100)]))),
    });
    unsubscribe();
    release();
    await flush();
    assert.equal(fake.calls.channels.length, 0);
    assert.equal(events.length, 0);
  });

  it('cleanup gỡ channel và bỏ phản hồi resync cũ', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    let release;
    const unsubscribe = subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: () => {
        fetches += 1;
        if (fetches === 1) return Promise.resolve([row(1, 100)]);
        return new Promise((resolve) => (release = () => resolve([row(1, 999)])));
      },
    });
    await flush();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    unsubscribe();
    release();
    await flush();
    assert.equal(fake.calls.removed.length, 1);
    assert.equal(events.length, 0);
    fake.deliver(payload(row(1, 500)));
    assert.equal(events.length, 0);
  });

  it('lỗi fetch thì báo ERROR', async () => {
    const fake = createFakeSupabase();
    const statuses = [];
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => undefined,
      onConnectionStatus: (s) => statuses.push(s),
      fetchZonePrices: async () => {
        throw new Error('boom');
      },
    });
    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'ERROR']);
    assert.equal(fake.calls.channels.length, 0);
  });

  it('fetchScopeZonePrices fallback SuKienID khi thiếu cột SuatDienID', async () => {
    const used = [];
    const supabase = {
      from() {
        let col = '';
        const q = {
          select: () => q,
          eq(c) {
            col = c;
            used.push(c);
            return q;
          },
          order: () =>
            col === 'SuatDienID'
              ? Promise.resolve({data: null, error: {code: '42703'}})
              : Promise.resolve({data: [{KhuVucID: '3', GiaVeNiemYet: '120'}], error: null}),
        };
        return q;
      },
    };
    const rows = await fetchScopeZonePrices(supabase, scope);
    assert.deepEqual(used, ['SuatDienID', 'SuKienID']);
    assert.equal(rows[0].KhuVucID, 3);
    assert.equal(rows[0].GiaVeNiemYet, 120);
    assert.equal(rows[0][LEGACY_NO_SUAT_KEY], true);
  });

  it('khopMaPhamViNghiemNgat: null/thiếu phía dòng không bao giờ khớp khi phạm vi có giá trị', () => {
    assert.equal(khopMaPhamViNghiemNgat(null, 1), false);
    assert.equal(khopMaPhamViNghiemNgat(undefined, 1), false);
    assert.equal(khopMaPhamViNghiemNgat('1', 1), true);
    assert.equal(khopMaPhamViNghiemNgat(2, 1), false);
    assert.equal(khopMaPhamViNghiemNgat(null, null), true);
    assert.equal(khopMaPhamViNghiemNgat(5, undefined), true);
  });

  it('mapRealtimePricePayload: thiếu hoặc null SuKienID/SuatDienID, hoặc SuatDienID lệch thì không phát', () => {
    const map = (r) => mapRealtimePricePayload(payload(r), opts);
    assert.equal(map({KhuVucID: 1, GiaVeNiemYet: 150}), null);
    assert.equal(map(row(1, 150, {SuKienID: null})), null);
    assert.equal(map(row(1, 150, {SuatDienID: null})), null);
    assert.equal(map(row(1, 150, {SuatDienID: 11})), null);
    assert.equal(map(row(1, 150)).gia, 150);
    // Nhánh schema cũ: bỏ kiểm tra SuatDienID có chủ đích, SuKienID vẫn bắt buộc.
    const legacy = {...opts, boQuaSuatDien: true};
    assert.equal(mapRealtimePricePayload(payload(row(1, 150, {SuatDienID: null})), legacy).gia, 150);
    assert.equal(mapRealtimePricePayload(payload(row(1, 150, {SuKienID: null})), legacy), null);
  });

  it('payload thiếu định danh phạm vi không phát mà kích hoạt đọc xác minh lại', async () => {
    const bads = [
      {KhuVucID: 1, GiaVeNiemYet: 150},
      row(1, 150, {SuKienID: null}),
      row(1, 150, {SuatDienID: null}),
    ];
    for (const bad of bads) {
      const fake = createFakeSupabase();
      const events = [];
      let fetches = 0;
      subscribeToPriceUpdatesWithClient({
        supabase: fake.supabase,
        scope,
        listener: (e) => events.push(e),
        fetchZonePrices: async () => {
          fetches += 1;
          return [row(1, 100)];
        },
      });
      await flush();
      fake.deliver(payload(bad));
      assert.equal(events.length, 0);
      await flush();
      assert.equal(fetches, 2); // đã đọc lại để xác minh
      assert.equal(events.length, 0); // DB vẫn 100: không có gì để phát
    }

    // Đọc lại thấy giá thật đã đổi thì phát bằng nguồn RESYNC, không phải REALTIME.
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: async () => {
        fetches += 1;
        return [row(1, fetches === 1 ? 100 : 150)];
      },
    });
    await flush();
    fake.deliver(payload({KhuVucID: 1, GiaVeNiemYet: 999}));
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].nguon, 'RESYNC');
    assert.equal(events[0].gia, 150);
  });

  it('payload SuatDienID lệch thì bị bỏ, không đọc lại; payload hợp lệ thì phát', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => events.push(e),
      fetchZonePrices: async () => {
        fetches += 1;
        return [row(1, 100)];
      },
    });
    await flush();
    fake.deliver(payload(row(1, 150, {SuatDienID: 11})));
    await flush();
    assert.equal(events.length, 0);
    assert.equal(fetches, 1);
    fake.deliver(payload(row(1, '150.00')));
    assert.equal(events.length, 1);
    assert.equal(events[0].nguon, 'REALTIME');
    assert.equal(events[0].gia, 150);
  });

  it('dòng đọc thiếu SuKienID/SuatDienID không được nhận vào phạm vi', async () => {
    const fake = createFakeSupabase();
    let snapshot = null;
    subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => undefined,
      onSnapshot: (p) => (snapshot = p),
      fetchZonePrices: async () => [
        row(1, 100),
        row(2, 100, {SuatDienID: null}),
        row(3, 100, {SuKienID: null}),
        {KhuVucID: 4, GiaVeNiemYet: 100},
      ],
    });
    await flush();
    assert.deepEqual([...snapshot.keys()], [1]);
  });

  it('schema cũ (fetch lỗi 42703): bỏ kiểm tra SuatDienID có chủ đích, vẫn phát và vẫn kiểm SuKienID', async () => {
    const fake = createFakeSupabase();
    const selects = [];
    const supabase = {
      ...fake.supabase,
      from() {
        let col = '';
        const q = {
          select: (s) => {
            selects.push(s);
            return q;
          },
          eq(c) {
            col = c;
            return q;
          },
          order: () =>
            col === 'SuatDienID'
              ? Promise.resolve({data: null, error: {code: '42703'}})
              : Promise.resolve({data: [{KhuVucID: 1, SuKienID: 1, GiaVeNiemYet: '100'}], error: null}),
        };
        return q;
      },
    };
    const events = [];
    let snapshot = null;
    subscribeToPriceUpdatesWithClient({
      supabase,
      scope,
      listener: (e) => events.push(e),
      onSnapshot: (p) => (snapshot = p),
    });
    await flush();
    assert.equal(snapshot.get(1), 100);
    assert.ok(!selects.at(-1).includes('SuatDienID'));
    fake.deliver(payload({KhuVucID: 1, SuKienID: 1, GiaVeNiemYet: 120}));
    assert.equal(events.length, 1);
    assert.equal(events[0].gia, 120);
    fake.deliver(payload({KhuVucID: 1, SuKienID: 2, GiaVeNiemYet: 130}));
    assert.equal(events.length, 1);
  });

  it('listener gọi unsubscribe ở sự kiện resync đầu tiên thì khu thứ hai không được phát', async () => {
    const fake = createFakeSupabase();
    const events = [];
    let fetches = 0;
    let unsubscribe = null;
    unsubscribe = subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: (e) => {
        events.push(e);
        unsubscribe();
      },
      fetchZonePrices: async () => {
        fetches += 1;
        return fetches === 1 ? [row(1, 100), row(2, 200)] : [row(1, 110), row(2, 210)];
      },
    });
    await flush();
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, 1);
    assert.equal(events[0].nguon, 'RESYNC');
    assert.equal(fake.calls.removed.length, 1);
  });

  it('onSnapshot gọi unsubscribe thì không tạo channel', async () => {
    const fake = createFakeSupabase();
    const statuses = [];
    let unsubscribe = null;
    unsubscribe = subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => assert.fail('không được phát'),
      onConnectionStatus: (s) => statuses.push(s),
      onSnapshot: () => unsubscribe(),
      fetchZonePrices: async () => [row(1, 100)],
    });
    await flush();
    assert.equal(fake.calls.channels.length, 0);
    assert.deepEqual(statuses, ['CONNECTING']);
  });

  it('onConnectionStatus gọi unsubscribe ở CONNECTED thì không resync', async () => {
    const fake = createFakeSupabase();
    let fetches = 0;
    let unsubscribe = null;
    unsubscribe = subscribeToPriceUpdatesWithClient({
      supabase: fake.supabase,
      scope,
      listener: () => assert.fail('không được phát'),
      onConnectionStatus: (s) => {
        if (s === 'CONNECTED') unsubscribe();
      },
      fetchZonePrices: async () => {
        fetches += 1;
        return [row(1, fetches === 1 ? 100 : 500)];
      },
    });
    await flush();
    fake.status('SUBSCRIBED');
    await flush();
    assert.equal(fetches, 1);
    assert.equal(fake.calls.removed.length, 1);
  });
});

describe('nhánh mock', () => {
  const MOCK_KEY = 'eventticketing.pricing.mock.v1';
  const MOCK_NOW = '2026-11-20T10:00:00.000Z';
  const mockScope = {suKienId: DEMO_SU_KIEN_ID, suatDienId: DEMO_SUAT_ID};

  function taoStorageGia({throwOnSet = false, throwOnGet = false} = {}) {
    const map = new Map();
    return {
      map,
      getItem(k) {
        if (throwOnGet) throw new Error('SecurityError');
        return map.has(k) ? map.get(k) : null;
      },
      setItem(k, v) {
        if (throwOnSet) throw new Error('QuotaExceededError');
        map.set(k, v);
      },
    };
  }

  function taoKhoMock(storage) {
    return taoKhoPhienMock({
      khoa: MOCK_KEY,
      taoState: (s) => createMockState(s),
      layKhoMacDinh: () => storage,
    });
  }

  function taoStorageEvent(key) {
    return Object.assign(new Event('storage'), {key});
  }

  it('cùng tab phát khi duyetDeXuatGia trả DA_DUYET', async () => {
    const storage = taoStorageGia();
    const kho = taoKhoMock(storage);
    const target = new EventTarget();

    let phien = kho.moPhien({storage, now: MOCK_NOW});
    const demoState = khoiTaoDemoPricing(phien.state, MOCK_NOW);
    kho.luuPhien(phien, demoState);

    const events = [];
    const statuses = [];
    let snapshot = null;
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      canWriteStorage: () => kiemTraGhiLocalStorage(storage, MOCK_KEY),
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
      onSnapshot: (m) => (snapshot = m),
    });

    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'CONNECTED']);
    assert.equal(snapshot.get(DEMO_KHU_IDS[0]), 1500000);

    phien = kho.moPhien({storage, now: MOCK_NOW});
    const prop = deXuatTuDong(phien.state, DEMO_KHU_IDS[0], MOCK_NOW);
    assert.equal(prop.result.ketQua, 'DA_LUU');
    const approved = duyetDeXuatGia(
      prop.state,
      {deXuatId: prop.result.deXuatId, ghiChu: 'Duyệt test', nguoiDung: DEMO_NGUOI_DUNG},
      MOCK_NOW,
    );
    assert.equal(approved.result.ketQua, 'DA_DUYET');
    kho.luuPhien(phien, approved.state);

    phatThongBaoGiaMock(target, {
      khuVucId: approved.result.khuVucId,
      giaMoi: approved.result.giaMoi,
    });
    await flush();

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'ZONE_PRICE_CHANGED');
    assert.equal(events[0].suKienId, DEMO_SU_KIEN_ID);
    assert.equal(events[0].suatDienId, DEMO_SUAT_ID);
    assert.equal(events[0].khuVucId, DEMO_KHU_IDS[0]);
    assert.equal(events[0].gia, approved.result.giaMoi);
    assert.equal(events[0].nguon, 'MOCK');
    unsubscribe();
  });

  it('sự kiện storage giữa tab phát diff, lọc phạm vi và chấp nhận key null', async () => {
    const storage = taoStorageGia();
    const kho = taoKhoMock(storage);
    const target = new EventTarget();

    let phien = kho.moPhien({storage, now: MOCK_NOW});
    const demoState = khoiTaoDemoPricing(phien.state, MOCK_NOW);
    demoState.khuVuc[888001] = {SuKienID: DEMO_SU_KIEN_ID + 1, SuatDienID: DEMO_SUAT_ID, GiaVeNiemYet: 300000};
    demoState.khuVuc[888002] = {SuKienID: DEMO_SU_KIEN_ID, SuatDienID: DEMO_SUAT_ID + 1, GiaVeNiemYet: 400000};
    kho.luuPhien(phien, demoState);

    const events = [];
    let snapshot = null;
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onSnapshot: (m) => (snapshot = m),
    });

    await flush();
    assert.equal(snapshot.has(888001), false);
    assert.equal(snapshot.has(888002), false);

    // Key lạ phải bị bỏ qua
    const otherState = structuredClone(kho.moPhien({storage, now: MOCK_NOW}).state);
    otherState.khuVuc[DEMO_KHU_IDS[0]].GiaVeNiemYet = 1650000;
    otherState.khuVuc[888001].GiaVeNiemYet = 350000;
    storage.setItem(MOCK_KEY, JSON.stringify(otherState));
    target.dispatchEvent(taoStorageEvent('unrelated.key'));
    await flush();
    assert.equal(events.length, 0);

    // Đúng storageKey -> phát đúng khu trong phạm vi
    target.dispatchEvent(taoStorageEvent(MOCK_KEY));
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, DEMO_KHU_IDS[0]);
    assert.equal(events[0].gia, 1650000);

    // key null (storage.clear()) cũng kích hoạt diff
    const nextState = structuredClone(otherState);
    nextState.khuVuc[DEMO_KHU_IDS[1]].GiaVeNiemYet = 920000;
    storage.setItem(MOCK_KEY, JSON.stringify(nextState));
    target.dispatchEvent(taoStorageEvent(null));
    await flush();
    assert.equal(events.length, 2);
    assert.equal(events[1].khuVucId, DEMO_KHU_IDS[1]);
    assert.equal(events[1].gia, 920000);
    unsubscribe();
  });

  it('chỉ đề xuất hoặc từ chối (giá không đổi) thì không phát', async () => {
    const storage = taoStorageGia();
    const kho = taoKhoMock(storage);
    const target = new EventTarget();

    let phien = kho.moPhien({storage, now: MOCK_NOW});
    kho.luuPhien(phien, khoiTaoDemoPricing(phien.state, MOCK_NOW));

    const events = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
    });
    await flush();

    // Chỉ tạo đề xuất -> giá niêm yết giữ nguyên
    phien = kho.moPhien({storage, now: MOCK_NOW});
    const prop = deXuatTuDong(phien.state, DEMO_KHU_IDS[0], MOCK_NOW);
    assert.equal(prop.result.ketQua, 'DA_LUU');
    kho.luuPhien(phien, prop.state);
    phatThongBaoGiaMock(target, {khuVucId: DEMO_KHU_IDS[0]});
    target.dispatchEvent(taoStorageEvent(MOCK_KEY));
    await flush();
    assert.equal(events.length, 0);

    // Từ chối đề xuất -> giá niêm yết vẫn giữ nguyên
    phien = kho.moPhien({storage, now: MOCK_NOW});
    const rej = tuChoiDeXuatGia(
      phien.state,
      {deXuatId: prop.result.deXuatId, lyDo: 'Không tăng', nguoiDung: DEMO_NGUOI_DUNG},
      MOCK_NOW,
    );
    assert.equal(rej.result.ketQua, 'DA_TU_CHOI');
    kho.luuPhien(phien, rej.state);
    phatThongBaoGiaMock(target, {khuVucId: DEMO_KHU_IDS[0]});
    target.dispatchEvent(taoStorageEvent(MOCK_KEY));
    await flush();
    assert.equal(events.length, 0);
    unsubscribe();
  });

  it('tab mới đọc được giá đã duyệt ngay lúc khởi tạo', async () => {
    const storage = taoStorageGia();
    const kho = taoKhoMock(storage);

    let phien = kho.moPhien({storage, now: MOCK_NOW});
    kho.luuPhien(phien, khoiTaoDemoPricing(phien.state, MOCK_NOW));
    phien = kho.moPhien({storage, now: MOCK_NOW});
    const prop = deXuatTuDong(phien.state, DEMO_KHU_IDS[0], MOCK_NOW);
    const approved = duyetDeXuatGia(
      prop.state,
      {deXuatId: prop.result.deXuatId, ghiChu: 'OK', nguoiDung: DEMO_NGUOI_DUNG},
      MOCK_NOW,
    );
    kho.luuPhien(phien, approved.state);

    let tabMoiSnapshot = null;
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      eventTarget: new EventTarget(),
      storageKey: MOCK_KEY,
      listener: () => undefined,
      onSnapshot: (m) => (tabMoiSnapshot = m),
    });
    await flush();
    assert.equal(tabMoiSnapshot.get(DEMO_KHU_IDS[0]), approved.result.giaMoi);
    unsubscribe();
  });

  it('storage null hoặc BO_NHO thì báo LOCAL_ONLY, không bao giờ CONNECTED', async () => {
    const kho = taoKhoMock(null);
    const target = new EventTarget();
    let phien = kho.moPhien({storage: null, now: MOCK_NOW});
    kho.luuPhien(phien, khoiTaoDemoPricing(phien.state, MOCK_NOW));

    const statuses = [];
    const events = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage: null, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
    });
    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(statuses.includes('CONNECTED'), false);

    // Chuyển từ LOCAL_STORAGE sang BO_NHO giữa chừng cũng phải chuyển sang LOCAL_ONLY
    const target2 = new EventTarget();
    let mode = 'LOCAL_STORAGE';
    let price = 100000;
    const statuses2 = [];
    const events2 = [];
    const unsubscribe2 = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => ({
        state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: price}}},
        meta: {luuTru: mode},
      }),
      canWriteStorage: () => true,
      eventTarget: target2,
      storageKey: MOCK_KEY,
      listener: (e) => events2.push(e),
      onConnectionStatus: (s) => statuses2.push(s),
    });
    await flush();
    mode = 'BO_NHO';
    price = 120000;
    phatThongBaoGiaMock(target2, {khuVucId: 1, giaMoi: 120000});
    await flush();
    assert.deepEqual(statuses2, ['CONNECTING', 'CONNECTED', 'LOCAL_ONLY']);
    assert.equal(events2.length, 1);
    assert.equal(events2[0].gia, 120000);

    unsubscribe();
    unsubscribe2();
  });

  it('readState ném lỗi thì báo ERROR', async () => {
    const statuses = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        throw new Error('read failed');
      },
      eventTarget: new EventTarget(),
      storageKey: MOCK_KEY,
      listener: () => undefined,
      onConnectionStatus: (s) => statuses.push(s),
    });
    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'ERROR']);
    unsubscribe();
  });

  it('cleanup gỡ listener và bỏ các lần đọc đang dở', async () => {
    const target = new EventTarget();
    const events = [];
    let price = 100000;
    let releaseSecondRead;
    let reads = 0;

    const unsubscribe = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: () => {
        reads += 1;
        if (reads === 1) {
          return Promise.resolve({
            state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: price}}},
            meta: {luuTru: 'LOCAL_STORAGE'},
          });
        }
        return new Promise((resolve) => {
          releaseSecondRead = () =>
            resolve({
              state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: 250000}}},
              meta: {luuTru: 'LOCAL_STORAGE'},
            });
        });
      },
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
    });
    await flush();

    // Bắt đầu lần đọc thứ 2 nhưng cleanup trước khi resolve
    phatThongBaoGiaMock(target, {khuVucId: 1, giaMoi: 250000});
    unsubscribe();
    releaseSecondRead();
    await flush();

    // Phát thêm sau cleanup cũng không trigger đọc hay phát sự kiện
    const readsBefore = reads;
    price = 300000;
    phatThongBaoGiaMock(target, {khuVucId: 1, giaMoi: 300000});
    target.dispatchEvent(taoStorageEvent(MOCK_KEY));
    await flush();

    assert.equal(reads, readsBefore);
    assert.equal(events.length, 0);
  });

  it('eventTarget null (không có window) thì luôn báo LOCAL_ONLY, không bao giờ CONNECTED', async () => {
    const storage = taoStorageGia();
    const kho = taoKhoMock(storage);
    let phien = kho.moPhien({storage, now: MOCK_NOW});
    kho.luuPhien(phien, khoiTaoDemoPricing(phien.state, MOCK_NOW));

    const statuses = [];
    let snapshot = null;
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      eventTarget: null,
      storageKey: MOCK_KEY,
      listener: () => assert.fail('không có eventTarget thì không thể nhận sự kiện'),
      onConnectionStatus: (s) => statuses.push(s),
      onSnapshot: (m) => (snapshot = m),
    });
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(statuses.includes('CONNECTED'), false);
    assert.equal(snapshot.get(DEMO_KHU_IDS[0]), 1500000);
    unsubscribe();
  });

  it('ghi localStorage lỗi khi duyetDeXuatGia: lần đọc sau báo LOCAL_ONLY và cập nhật cùng tab vẫn tới', async () => {
    const storage = taoStorageGia({throwOnSet: true});
    const kho = taoKhoMock(storage);
    const target = new EventTarget();

    // Gieo trực tiếp dữ liệu ban đầu vào kho để lần đọc đầu đọc được từ localStorage (CONNECTED).
    const demoState = khoiTaoDemoPricing(createMockState(), MOCK_NOW);
    storage.map.set(MOCK_KEY, JSON.stringify(demoState));

    const events = [];
    const statuses = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      canWriteStorage: () => true,
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
    });
    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'CONNECTED']);

    let phien = kho.moPhien({storage, now: MOCK_NOW});
    const prop = deXuatTuDong(phien.state, DEMO_KHU_IDS[0], MOCK_NOW);
    assert.equal(prop.result.ketQua, 'DA_LUU');
    const approved = duyetDeXuatGia(
      prop.state,
      {deXuatId: prop.result.deXuatId, ghiChu: 'Duyệt khi hết quota', nguoiDung: DEMO_NGUOI_DUNG},
      MOCK_NOW,
    );
    assert.equal(approved.result.ketQua, 'DA_DUYET');
    kho.luuPhien(phien, approved.state);
    assert.equal(phien.meta.luuTru, 'BO_NHO');

    phatThongBaoGiaMock(target, {
      khuVucId: approved.result.khuVucId,
      giaMoi: approved.result.giaMoi,
    });
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'CONNECTED', 'LOCAL_ONLY']);
    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, DEMO_KHU_IDS[0]);
    assert.equal(events[0].gia, approved.result.giaMoi);
    assert.equal(events[0].nguon, 'MOCK');
    unsubscribe();
  });

  it('tab chỉ đọc: getItem được nhưng setItem lỗi thì LOCAL_ONLY, không bao giờ CONNECTED', async () => {
    const storage = taoStorageGia({throwOnSet: true});
    const kho = taoKhoMock(storage);
    const target = new EventTarget();
    storage.map.set(MOCK_KEY, JSON.stringify(khoiTaoDemoPricing(createMockState(), MOCK_NOW)));

    const statuses = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        assert.equal(p.meta.luuTru, 'LOCAL_STORAGE');
        return {state: p.state, meta: p.meta};
      },
      canWriteStorage: () => kiemTraGhiLocalStorage(storage, MOCK_KEY),
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: () => undefined,
      onConnectionStatus: (s) => statuses.push(s),
    });
    await flush();
    target.dispatchEvent(taoStorageEvent(MOCK_KEY));
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'LOCAL_ONLY']);
    unsubscribe();
  });

  it('kiemTraGhiLocalStorage: null, setItem ném lỗi, kho hoạt động, thiếu removeItem', () => {
    assert.equal(kiemTraGhiLocalStorage(null, MOCK_KEY), false);
    assert.equal(kiemTraGhiLocalStorage(undefined, MOCK_KEY), false);
    assert.equal(kiemTraGhiLocalStorage(taoStorageGia({throwOnSet: true}), MOCK_KEY), false);

    const removed = [];
    const map = new Map();
    const ok = {
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => {
        removed.push(k);
        map.delete(k);
      },
    };
    assert.equal(kiemTraGhiLocalStorage(ok, MOCK_KEY), true);
    assert.deepEqual(removed, [`${MOCK_KEY}.__probe`]);
    assert.equal(map.size, 0);

    const thieuRemove = taoStorageGia();
    assert.equal(kiemTraGhiLocalStorage(thieuRemove, MOCK_KEY), true);
    assert.equal(thieuRemove.map.has(MOCK_KEY), false);
  });

  it('localStorage.getItem ném SecurityError thì báo LOCAL_ONLY ngay từ đầu', async () => {
    const storage = taoStorageGia({throwOnGet: true});
    const kho = taoKhoMock(storage);
    const target = new EventTarget();

    const phien = kho.moPhien({storage, now: MOCK_NOW});
    assert.equal(phien.meta.luuTru, 'BO_NHO');
    kho.luuPhien(phien, khoiTaoDemoPricing(phien.state, MOCK_NOW));

    const statuses = [];
    const events = [];
    let snapshot = null;
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: mockScope,
      readState: async () => {
        const p = kho.moPhien({storage, now: MOCK_NOW});
        return {state: p.state, meta: p.meta};
      },
      canWriteStorage: () => kiemTraGhiLocalStorage(storage, MOCK_KEY),
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
      onSnapshot: (m) => (snapshot = m),
    });
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(statuses.includes('CONNECTED'), false);
    assert.equal(snapshot.get(DEMO_KHU_IDS[0]), 1500000);

    const p2 = kho.moPhien({storage, now: MOCK_NOW});
    const prop = deXuatTuDong(p2.state, DEMO_KHU_IDS[0], MOCK_NOW);
    const approved = duyetDeXuatGia(
      prop.state,
      {deXuatId: prop.result.deXuatId, ghiChu: 'OK', nguoiDung: DEMO_NGUOI_DUNG},
      MOCK_NOW,
    );
    kho.luuPhien(p2, approved.state);
    phatThongBaoGiaMock(target, {khuVucId: approved.result.khuVucId, giaMoi: approved.result.giaMoi});
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(events.length, 1);
    assert.equal(events[0].gia, approved.result.giaMoi);
    unsubscribe();
  });

  it('đọc lại thành công sau lỗi readState ban đầu thì phát snapshot rồi mới diff ở lần sau', async () => {
    const target = new EventTarget();
    const statuses = [];
    const snapshots = [];
    const events = [];
    let shouldFail = true;
    let price = 100000;

    const unsubscribe = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => {
        if (shouldFail) throw new Error('read failed');
        return {
          state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: price}}},
          meta: {luuTru: 'LOCAL_STORAGE'},
        };
      },
      canWriteStorage: () => true,
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onConnectionStatus: (s) => statuses.push(s),
      onSnapshot: (m) => snapshots.push(m),
    });
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'ERROR']);
    assert.equal(snapshots.length, 0);
    assert.equal(events.length, 0);

    // Phục hồi: lần đọc thành công đầu tiên phát snapshot và chuyển CONNECTED, chưa phát diff
    shouldFail = false;
    phatThongBaoGiaMock(target, {});
    await flush();

    assert.deepEqual(statuses, ['CONNECTING', 'ERROR', 'CONNECTED']);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].get(1), 100000);
    assert.equal(events.length, 0);

    // Lần cập nhật kế tiếp mới diff so với snapshot đã phục hồi
    price = 135000;
    phatThongBaoGiaMock(target, {khuVucId: 1, giaMoi: 135000});
    await flush();

    assert.equal(events.length, 1);
    assert.equal(events[0].khuVucId, 1);
    assert.equal(events[0].gia, 135000);
    assert.equal(events[0].nguon, 'MOCK');
    unsubscribe();
  });

  it('pricingService.ts không gọi phatThongBaoGiaMockAnToan khi lưu cấu hình, mô phỏng, chạy định giá, hết hạn hay từ chối', async () => {
    const src = await readFile(new URL('../src/services/pricingService.ts', import.meta.url), 'utf8');
    const sliceFn = (name) => {
      const start = src.indexOf(`export async function ${name}(`);
      assert.ok(start !== -1, `Không tìm thấy ${name}`);
      const next = src.indexOf('\nexport async function ', start + 1);
      return next === -1 ? src.slice(start) : src.slice(start, next);
    };

    for (const fn of [
      'luuCauHinhGia',
      'moPhongNhuCau',
      'chayDinhGiaNgay',
      'hetHanDeXuat',
      'tuChoiDeXuatGia',
    ]) {
      const body = sliceFn(fn);
      assert.doesNotMatch(body, /phatThongBaoGiaMock/, `${fn} không được phát thông báo giá mock`);
    }

    const duyetBody = sliceFn('duyetDeXuatGia');
    assert.match(
      duyetBody,
      /if\s*\(result\.ketQua === 'DA_DUYET'\)\s*\{\s*phatThongBaoGiaMockAnToan\(/,
    );
    const khoiTaoBody = sliceFn('khoiTaoDemoDinhGia');
    assert.match(khoiTaoBody, /phatThongBaoGiaMockAnToan\(/);
  });

  it('priceRealtimeService.ts có đường đọc core store khi ép options.useMockData=true', async () => {
    const src = await readFile(
      new URL('../src/services/priceRealtimeService.ts', import.meta.url),
      'utf8',
    );
    assert.match(src, /taoKhoPhienMock/);
    assert.match(src, /runtimeConfig\.useMockData && storageKey === KHOA_LUU_TRU_MO_PHONG/);
  });

  it(`PRICE_MOCK_EVENT khớp tên sự kiện '${PRICE_MOCK_EVENT}'`, () => {
    assert.equal(PRICE_MOCK_EVENT, 'eventticketing:pricing-mock-changed');
  });

  it('custom readState trả LOCAL_STORAGE nhưng không truyền canWriteStorage -> LOCAL_ONLY, không bao giờ CONNECTED', async () => {
    const target = new EventTarget();
    const statuses = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => ({
        state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: 100000}}},
        meta: {luuTru: 'LOCAL_STORAGE'},
      }),
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: () => undefined,
      onConnectionStatus: (s) => statuses.push(s),
    });
    await flush();
    assert.deepEqual(statuses, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(statuses.includes('CONNECTED'), false);
    unsubscribe();
  });

  it('khu mock thiếu SuatDienID hoặc SuKienID không được đọc vào snapshot hay phát khi diff', async () => {
    const target = new EventTarget();
    let khuVuc = {
      1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: 100000},
      2: {SuKienID: 1, GiaVeNiemYet: 200000}, // thiếu SuatDienID
      3: {SuKienID: 1, SuatDienID: null, GiaVeNiemYet: 300000},
      4: {SuatDienID: 10, GiaVeNiemYet: 400000}, // thiếu SuKienID
      5: {SuKienID: null, SuatDienID: 10, GiaVeNiemYet: 500000},
    };
    let snapshot = null;
    const events = [];
    const unsubscribe = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => ({state: {khuVuc}, meta: {luuTru: 'LOCAL_STORAGE'}}),
      canWriteStorage: () => true,
      eventTarget: target,
      storageKey: MOCK_KEY,
      listener: (e) => events.push(e),
      onSnapshot: (m) => (snapshot = m),
    });
    await flush();
    assert.deepEqual([...snapshot.keys()], [1]);
    assert.equal(snapshot.get(1), 100000);

    khuVuc = {
      ...khuVuc,
      2: {SuKienID: 1, GiaVeNiemYet: 250000},
      3: {SuKienID: 1, SuatDienID: null, GiaVeNiemYet: 350000},
    };
    phatThongBaoGiaMock(target, {});
    await flush();
    assert.equal(events.length, 0);
    unsubscribe();
  });

  it('nhánh mock: onSnapshot / onConnectionStatus / listener gọi unsubscribe thì dừng ngay, không phát thêm', async () => {
    // 1) onSnapshot gọi unsubscribe -> không báo LOCAL_ONLY/CONNECTED
    const statuses1 = [];
    let unsub1 = null;
    unsub1 = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => ({
        state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: 100000}}},
        meta: {luuTru: 'LOCAL_STORAGE'},
      }),
      canWriteStorage: () => true,
      eventTarget: new EventTarget(),
      storageKey: MOCK_KEY,
      listener: () => assert.fail('không được phát'),
      onConnectionStatus: (s) => statuses1.push(s),
      onSnapshot: () => unsub1(),
    });
    await flush();
    assert.deepEqual(statuses1, ['CONNECTING']);

    // 2) onConnectionStatus gọi unsubscribe ở CONNECTED trong lần diff -> không phát sự kiện giá
    const target2 = new EventTarget();
    let price2 = 100000;
    const events2 = [];
    let unsub2 = null;
    unsub2 = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => ({
        state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: price2}}},
        meta: {luuTru: 'LOCAL_STORAGE'},
      }),
      canWriteStorage: () => true,
      eventTarget: target2,
      storageKey: MOCK_KEY,
      listener: (e) => events2.push(e),
      onConnectionStatus: (s) => {
        if (s === 'CONNECTED') unsub2();
      },
    });
    await flush();
    price2 = 150000;
    phatThongBaoGiaMock(target2, {});
    await flush();
    assert.equal(events2.length, 0);

    // 3) listener gọi unsubscribe ở khu 1 -> khu 2 không được phát
    const target3 = new EventTarget();
    let prices3 = {1: 100000, 2: 200000};
    const events3 = [];
    let unsub3 = null;
    unsub3 = subscribeToMockPriceUpdates({
      scope: {suKienId: 1, suatDienId: 10},
      readState: async () => ({
        state: {
          khuVuc: {
            1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: prices3[1]},
            2: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: prices3[2]},
          },
        },
        meta: {luuTru: 'LOCAL_STORAGE'},
      }),
      canWriteStorage: () => true,
      eventTarget: target3,
      storageKey: MOCK_KEY,
      listener: (e) => {
        events3.push(e);
        unsub3();
      },
    });
    await flush();
    prices3 = {1: 110000, 2: 220000};
    phatThongBaoGiaMock(target3, {});
    await flush();
    assert.equal(events3.length, 1);
    assert.equal(events3[0].khuVucId, 1);
  });

  it('priceRealtimeService.ts: ưu tiên canWriteStorage, custom readState thiếu canWriteStorage -> LOCAL_ONLY', async () => {
    const entry = fileURLToPath(new URL('../src/services/priceRealtimeService.ts', import.meta.url));
    const built = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      define: {'import.meta.env': JSON.stringify({VITE_USE_MOCK_DATA: 'true'})},
    });
    const modUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
    const {subscribeToPriceUpdates} = await import(modUrl);

    // 1) custom readState trả LOCAL_STORAGE, không truyền canWriteStorage -> LOCAL_ONLY
    const target1 = new EventTarget();
    const statuses1 = [];
    const unsub1 = subscribeToPriceUpdates(
      () => undefined,
      (s) => statuses1.push(s),
      {
        useMockData: true,
        scope: {suKienId: 1, suatDienId: 10},
        readState: async () => ({
          state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: 100000}}},
          meta: {luuTru: 'LOCAL_STORAGE'},
        }),
        eventTarget: target1,
        storageKey: MOCK_KEY,
      },
    );
    await flush();
    assert.deepEqual(statuses1, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(statuses1.includes('CONNECTED'), false);
    unsub1();

    // 2) custom readState với kho chỉ đọc (setItem ném lỗi) + canWriteStorage=kiemTraGhiLocalStorage -> LOCAL_ONLY
    const readOnlyStorage = taoStorageGia({throwOnSet: true});
    const kho = taoKhoMock(readOnlyStorage);
    readOnlyStorage.map.set(MOCK_KEY, JSON.stringify(khoiTaoDemoPricing(createMockState(), MOCK_NOW)));
    const statuses2 = [];
    const unsub2 = subscribeToPriceUpdates(
      () => undefined,
      (s) => statuses2.push(s),
      {
        useMockData: true,
        scope: mockScope,
        readState: async () => {
          const p = kho.moPhien({storage: readOnlyStorage, now: MOCK_NOW});
          assert.equal(p.meta.luuTru, 'LOCAL_STORAGE');
          return {state: p.state, meta: p.meta};
        },
        canWriteStorage: () => kiemTraGhiLocalStorage(readOnlyStorage, MOCK_KEY),
        eventTarget: new EventTarget(),
        storageKey: MOCK_KEY,
      },
    );
    await flush();
    assert.deepEqual(statuses2, ['CONNECTING', 'LOCAL_ONLY']);
    assert.equal(statuses2.includes('CONNECTED'), false);
    unsub2();

    // 3) custom readState trả LOCAL_STORAGE + canWriteStorage=() => true -> CONNECTED
    const statuses3 = [];
    const unsub3 = subscribeToPriceUpdates(
      () => undefined,
      (s) => statuses3.push(s),
      {
        useMockData: true,
        scope: {suKienId: 1, suatDienId: 10},
        readState: async () => ({
          state: {khuVuc: {1: {SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: 100000}}},
          meta: {luuTru: 'LOCAL_STORAGE'},
        }),
        canWriteStorage: () => true,
        eventTarget: new EventTarget(),
        storageKey: MOCK_KEY,
      },
    );
    await flush();
    assert.deepEqual(statuses3, ['CONNECTING', 'CONNECTED']);
    unsub3();
  });
});
