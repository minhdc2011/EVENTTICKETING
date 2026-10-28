/**
 * @file seatRealtime.js
 * Domain utilities for show-scoped seat realtime updates and payload validation.
 *
 * Architectural Note:
 * Supabase Realtime postgres_changes supports `filter: 'column=in.(...)'` with up to 100
 * items per filter. It also allows registering multiple filtered subscriptions on a single channel.
 * For a show with zone IDs, we construct server-side `KhuVucID=in.(...)` filters in chunks of at
 * most 100 on exactly one channel. This ensures:
 * 1. Network efficiency: Only seat updates for the active show's zones are transmitted over the wire.
 * 2. Bounded resources: Exactly one channel is maintained per show, avoiding channel exhaustion.
 * 3. Defense in depth: The client-side membership set verifies that any delivered payload strictly
 *    belongs to the active show before emitting it to the UI.
 * 4. Zero-zone safety: When a show has no zones, no global unfiltered subscription is created;
 *    instead, a deterministic non-error ready state (CONNECTED) is reported with zero network egress.
 */

export const MAX_ZONE_FILTER_SIZE = 100;

export const VALID_SEAT_STATUSES = new Set([
  'TRONG',
  'DA_BAN',
  'DANG_GIU',
  'KHONG_MO_BAN',
]);

/**
 * Validates if a string is a legitimate database seat status.
 * @param {unknown} status
 * @returns {boolean}
 */
export function isValidSeatStatus(status) {
  return typeof status === 'string' && VALID_SEAT_STATUSES.has(status);
}

/**
 * Normalizes and validates a zone ID.
 * @param {unknown} val
 * @returns {number|null}
 */
export function normalizeZoneId(val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) && val > 0 ? val : null;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val.trim());
    return Number.isInteger(num) && num > 0 ? num : null;
  }
  return null;
}

/**
 * Splits an array into chunks of at most `size` elements.
 * @template T
 * @param {T[]} items
 * @param {number} [size=100]
 * @returns {T[][]}
 */
export function chunkArray(items, size = MAX_ZONE_FILTER_SIZE) {
  if (!Array.isArray(items) || items.length === 0 || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Builds a server-side Realtime 'in' filter string for a group of zone IDs.
 * @param {number[]} zoneIds
 * @returns {string}
 */
export function buildZoneInFilter(zoneIds) {
  if (!Array.isArray(zoneIds) || zoneIds.length === 0) return '';
  return `KhuVucID=in.(${zoneIds.join(',')})`;
}

/**
 * Defensively extracts the seat row from a Supabase payload or raw object.
 * @param {unknown} payload
 * @returns {Record<string, any>|null}
 */
export function extractSeatRow(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if ('new' in payload && payload.new && typeof payload.new === 'object') {
    return payload.new;
  }
  return payload;
}

/**
 * Determines whether a zone ID belongs to the active show's resolved zones.
 * @param {unknown} zoneId
 * @param {ReadonlySet<number>|null|undefined} allowedZoneIds
 * @returns {boolean}
 */
export function isSeatInShow(zoneId, allowedZoneIds) {
  const normalized = normalizeZoneId(zoneId);
  if (normalized === null || !allowedZoneIds) return false;
  return allowedZoneIds.has(normalized);
}

/**
 * Maps and validates a realtime payload into a typed SeatStatusEvent.
 * Drops malformed payloads or updates for seats outside the active show.
 *
 * @param {unknown} payload
 * @param {object} options
 * @param {ReadonlySet<number>} options.allowedZoneIds
 * @param {string} options.eventId
 * @param {ReadonlyMap<number, string>} [options.zoneCodesById]
 * @returns {import('../types/ticketing').SeatStatusEvent|null}
 */
export function mapRealtimeSeatPayload(payload, options = {}) {
  const row = extractSeatRow(payload);
  if (!row || typeof row !== 'object') return null;

  const zoneId = normalizeZoneId(row.KhuVucID);
  if (zoneId === null) return null;

  const allowedZoneIds = options.allowedZoneIds;
  if (!allowedZoneIds || !allowedZoneIds.has(zoneId)) return null;

  const seatCode = typeof row.MaGheDayDu === 'string' ? row.MaGheDayDu.trim() : '';
  if (!seatCode) return null;

  if (!isValidSeatStatus(row.TrangThai)) return null;

  const zoneCode =
    (options.zoneCodesById && options.zoneCodesById.get(zoneId)) ||
    (typeof row.MaKhuVuc === 'string' ? row.MaKhuVuc.trim() : '') ||
    '';

  const occurredAt =
    (payload && typeof payload.commit_timestamp === 'string' && payload.commit_timestamp) ||
    new Date().toISOString();

  const seatId =
    typeof row.GheID === 'number' || (typeof row.GheID === 'string' && row.GheID.trim())
      ? row.GheID
      : undefined;

  return {
    type: 'SEAT_STATUS_CHANGED',
    eventId: options.eventId || '',
    seatId,
    seatCode,
    zoneCode,
    status: row.TrangThai,
    occurredAt,
  };
}

/**
 * Resolves zone IDs belonging to a specific show from Supabase.
 * Handles both the current schema (SuatDienID) and legacy fallback (SuKienID).
 *
 * @param {any} supabase
 * @param {number} showId
 * @param {number} [eventDatabaseId]
 * @returns {Promise<Array<{KhuVucID: number, MaKhuVuc?: string}>>}
 */
export async function fetchShowZones(supabase, showId, eventDatabaseId) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('Supabase client is not available or invalid');
  }

  let {data, error} = await supabase
    .from('KHU_VUC')
    .select('KhuVucID, MaKhuVuc')
    .eq('SuatDienID', showId)
    .order('KhuVucID');

  if (error && ['42703', 'PGRST204'].includes(String(error.code))) {
    const legacyResult = await supabase
      .from('KHU_VUC')
      .select('KhuVucID, MaKhuVuc')
      .eq('SuKienID', eventDatabaseId)
      .order('KhuVucID');
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    KhuVucID: Number(row.KhuVucID),
    MaKhuVuc: typeof row.MaKhuVuc === 'string' ? row.MaKhuVuc : '',
  }));
}

/**
 * Manages the scoped Supabase realtime subscription lifecycle.
 * Ensures:
 * - Zones are resolved before receiving changes
 * - Server-side `KhuVucID=in.(...)` filters chunked at <= 100 values
 * - Single channel on public.GHE per show
 * - Zero-zone safety: does not subscribe globally if show has 0 zones; reports CONNECTED
 * - Defense in depth: client-side zone membership check
 * - Race-safe cleanup: cancelling during async setup removes channel cleanly
 * - Honest connection status reporting
 *
 * @param {object} params
 * @param {any} params.supabase
 * @param {import('../config/runtime').ActiveEventContext} params.active
 * @param {(event: import('../types/ticketing').SeatStatusEvent) => void} params.listener
 * @param {(status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR') => void} [params.onConnectionStatus]
 * @param {typeof fetchShowZones} [params.fetchZones]
 * @returns {() => void}
 */
export function subscribeToSeatUpdatesWithClient({
  supabase,
  active,
  listener,
  onConnectionStatus = () => undefined,
  fetchZones = fetchShowZones,
}) {
  let stopped = false;
  let channel = null;

  onConnectionStatus('CONNECTING');

  const channelUuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const channelTopic = `show-${active.showId}-seats-${channelUuid}`;

  (async () => {
    try {
      const zoneRows = await fetchZones(supabase, active.showId, active.eventDatabaseId);
      if (stopped) return;

      const allowedZoneIds = new Set();
      const zoneCodesById = new Map();
      const zoneIdList = [];

      for (const row of zoneRows) {
        if (row && row.KhuVucID != null) {
          const id = Number(row.KhuVucID);
          if (!Number.isNaN(id) && id > 0) {
            allowedZoneIds.add(id);
            zoneIdList.push(id);
            if (row.MaKhuVuc) {
              zoneCodesById.set(id, String(row.MaKhuVuc));
            }
          }
        }
      }

      if (stopped) return;

      // Zero-zone safety guard:
      // If the show has no zones configured, do NOT create a global unfiltered GHE subscription.
      // Report deterministic CONNECTED (ready/idle) status with zero network egress.
      if (allowedZoneIds.size === 0) {
        onConnectionStatus('CONNECTED');
        return;
      }

      let ch = supabase.channel(channelTopic);

      // Handler shared across chunks; enforces client-side defense in depth
      const handlePayload = (payload) => {
        if (stopped) return;
        const event = mapRealtimeSeatPayload(payload, {
          allowedZoneIds,
          eventId: active.eventId,
          zoneCodesById,
        });
        if (event) {
          listener(event);
        }
      };

      // Chunk zone IDs into groups of at most MAX_ZONE_FILTER_SIZE (100)
      const zoneChunks = chunkArray(zoneIdList, MAX_ZONE_FILTER_SIZE);
      for (const chunk of zoneChunks) {
        const filterStr = buildZoneInFilter(chunk);
        ch = ch.on(
          'postgres_changes',
          {event: 'UPDATE', schema: 'public', table: 'GHE', filter: filterStr},
          handlePayload,
        );
      }

      ch = ch.subscribe((status) => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          onConnectionStatus('CONNECTED');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onConnectionStatus('ERROR');
        } else if (status === 'CLOSED') {
          onConnectionStatus('DISCONNECTED');
        }
      });

      channel = ch;

      // Handle race condition where unsubscribe was called while channel was subscribing
      if (stopped) {
        if (ch && typeof supabase.removeChannel === 'function') {
          void supabase.removeChannel(ch);
        }
        channel = null;
      }
    } catch (error) {
      if (!stopped) {
        onConnectionStatus('ERROR');
      }
    }
  })();

  return () => {
    stopped = true;
    if (channel) {
      if (typeof supabase?.removeChannel === 'function') {
        void supabase.removeChannel(channel);
      }
      channel = null;
    }
  };
}
