import {getActiveEventContext, isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import type {ApiEnvelope, SeatRecord, TicketingCatalog, ZoneRecord} from '../types/ticketing';
import {apiRequest} from './apiClient';
import {requireSupabaseClient} from './supabaseClient';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) {
    throw new Error(`Không thể tải ${url}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Sprint 1 data boundary. JSON files act as the current adapter; Sprint 2/3 can
 * replace these URLs with REST endpoints without changing presentation code.
 */
export async function loadTicketingCatalog(): Promise<TicketingCatalog> {
  const active = getActiveEventContext();
  if (!runtimeConfig.useMockData && isSupabaseConfigured()) {
    const supabase = requireSupabaseClient() as any;
    let {data: zoneRows, error: zoneError} = await supabase
      .from('KHU_VUC')
      .select('KhuVucID, MaKhuVuc, TenKhuVuc, GiaVeNiemYet, MauSacHex')
      .eq('SuatDienID', active.showId)
      .order('KhuVucID');

    if (zoneError && ['42703', 'PGRST204'].includes(String(zoneError.code))) {
      const legacyResult = await supabase.from('KHU_VUC')
        .select('KhuVucID, MaKhuVuc, TenKhuVuc, GiaVeNiemYet, MauSacHex')
        .eq('SuKienID', active.eventDatabaseId).order('KhuVucID');
      zoneRows = legacyResult.data;
      zoneError = legacyResult.error;
    }
    if (zoneError) throw zoneError;

    const zones: ZoneRecord[] = (zoneRows ?? []).map((zone: any) => ({
      KhuVucID: zone.KhuVucID,
      MaKhuVuc: zone.MaKhuVuc,
      TenKhuVuc: zone.TenKhuVuc,
      GiaVeNiemYet: Number(zone.GiaVeNiemYet),
      MauSacHex: zone.MauSacHex,
    }));

    if (zones.length === 0) {
      throw new Error(
        `Supabase không có phân khu cho SuatDienID=${active.showId}.`,
      );
    }

    const zoneById = new Map(zones.map((zone) => [zone.KhuVucID, zone]));
    const zoneIds = zones.map((zone) => zone.KhuVucID);
    if (zoneIds.length === 0) return {zones, seats: []};

    const {data: seatRows, error: seatError} = await supabase
      .from('GHE')
      .select('GheID, KhuVucID, SoHang, SoGhe, MaGheDayDu, TrangThai')
      .in('KhuVucID', zoneIds)
      .order('GheID');

    if (seatError) throw seatError;

    const seats: SeatRecord[] = (seatRows ?? []).map((seat: any) => {
      const zone = zoneById.get(seat.KhuVucID);
      return {
        GheID: seat.GheID,
        KhuVucID: seat.KhuVucID,
        TenKhuVuc: zone?.TenKhuVuc,
        SoHang: seat.SoHang,
        SoGhe: seat.SoGhe,
        MaGheDayDu: seat.MaGheDayDu,
        TrangThai: seat.TrangThai as SeatRecord['TrangThai'],
        GiaVeNiemYet: zone?.GiaVeNiemYet,
      };
    });

    return {zones, seats};
  }

  if (!runtimeConfig.useMockData) {
    const eventPath = `/api/v1/events/${encodeURIComponent(active.eventId)}/shows/${encodeURIComponent(active.showSlug)}`;
    const [zonesResult, seatsResult] = await Promise.all([
      apiRequest<ApiEnvelope<ZoneRecord[]>>(`${eventPath}/zones`),
      apiRequest<ApiEnvelope<SeatRecord[]>>(`${eventPath}/seats`),
    ]);
    return {zones: zonesResult.data, seats: seatsResult.data};
  }

  const baseUrl = import.meta.env.BASE_URL || './';
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const [zones, seats] = await Promise.all([
    fetchJson<ZoneRecord[]>(`${prefix}data_zones.json`),
    fetchJson<SeatRecord[]>(`${prefix}data_seats.json`),
  ]);

  return {zones, seats};
}
