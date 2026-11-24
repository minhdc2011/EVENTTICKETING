import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import {getFallbackCatalog, loadPublicEvent} from './eventService';
import {layGiuChoDaMuaMoPhong} from './bookingService';
import {requireSupabaseClient} from './supabaseClient';
import {chuanHoaVe} from '../domain/veDaMua.js';
import type {MyTicket} from '../domain/veDaMua';

export type {MyTicket};

async function veMoPhong(userId: string): Promise<MyTicket[]> {
  const out: MyTicket[] = [];
  for (const hold of layGiuChoDaMuaMoPhong(userId)) {
    let tenSuKien = hold.eventId;
    let diaDiem: string | null = null;
    let tenSanVanDong: string | null = null;
    let tenSuat: string | null = null;
    let batDauLuc: string | null = null;
    let suKienSlug: string | null = null;
    let posterUrl: string | null = null;
    try {
      const event = await loadPublicEvent(hold.eventId);
      tenSuKien = event.name;
      diaDiem = event.address || null;
      tenSanVanDong = event.venueName || null;
      tenSuat = event.selectedShow?.name ?? null;
      batDauLuc = event.selectedShow?.startsAt ?? event.startsAt;
      suKienSlug = event.slug;
      posterUrl = event.posterUrl ?? null;
    } catch {
      // Giữ tên tạm theo mã sự kiện nếu không đọc lại được.
    }
    const zones = (() => {
      try {
        return getFallbackCatalog(suKienSlug ?? hold.eventId).zones;
      } catch {
        return [];
      }
    })();
    hold.items.forEach((item, idx) => {
      const zone = zones.find((z) => z.MaKhuVuc === item.zoneCode);
      const match = /^(.+)-([A-Za-z]+)-(\d+)$/.exec(item.ticketCode ?? '');
      const laGhe = Boolean(match);
      const ve = chuanHoaVe({
        veId: `${hold.holdId}-${idx}`,
        holdId: hold.holdId,
        maVe: item.ticketCode || `${item.zoneCode}-${hold.holdId.slice(-6)}-${idx + 1}`,
        soLuong: laGhe ? 1 : (item.quantity ?? 1),
        muaLuc: hold.muaLucMs ? new Date(hold.muaLucMs).toISOString() : null,
        donGia: item.DonGiaChot ?? zone?.GiaVeNiemYet ?? null,
        suKienSlug,
        tenSuKien,
        posterUrl,
        diaDiem,
        tenSanVanDong,
        suatSlug: null,
        tenSuat,
        batDauLuc,
        maKhuVuc: item.zoneCode,
        tenKhuVuc: zone?.TenKhuVuc ?? item.zoneCode,
        soHang: laGhe ? match![2] : null,
        soGhe: laGhe ? match![3] : null,
      });
      if (ve) out.push(ve);
    });
  }
  return out.sort((a, b) => (b.muaLuc ?? '').localeCompare(a.muaLuc ?? ''));
}

/** Danh sách vé đã mua của tài khoản đang đăng nhập (mới nhất trước). */
export async function loadMyTickets(userId: string): Promise<MyTicket[]> {
  if (runtimeConfig.useMockData || !isSupabaseConfigured()) return veMoPhong(userId);
  const supabase = requireSupabaseClient();
  const {data, error} = await supabase.rpc('ve_cua_toi');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map(chuanHoaVe).filter((v): v is MyTicket => v !== null);
}
