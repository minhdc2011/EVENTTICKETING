import {getActiveEventContext, isSupabaseConfigured, runtimeConfig, type ActiveEventContext} from '../config/runtime';
import type {SeatStatusEvent} from '../types/ticketing';
import {requireSupabaseClient} from './supabaseClient';
import {
  fetchShowZones,
  mapRealtimeSeatPayload,
  subscribeToSeatUpdatesWithClient,
  type ZoneSummaryRow,
} from '../domain/seatRealtime.js';

export type SeatUpdateListener = (event: SeatStatusEvent) => void;
export type RealtimeConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type ConnectionStatusListener = (status: RealtimeConnectionStatus) => void;

export interface SeatRealtimeOptions {
  supabaseClient?: any;
  activeContext?: ActiveEventContext;
  useMockData?: boolean;
  fetchZones?: (
    supabase: any,
    showId: number,
    eventDatabaseId?: number,
  ) => Promise<ZoneSummaryRow[]>;
}

export {fetchShowZones, mapRealtimeSeatPayload, subscribeToSeatUpdatesWithClient};

export function subscribeToSeatUpdates(
  listener: SeatUpdateListener,
  onConnectionStatus: ConnectionStatusListener = () => undefined,
  options?: SeatRealtimeOptions,
): () => void {
  const active = options?.activeContext ?? getActiveEventContext();
  const useMockData = options?.useMockData ?? runtimeConfig.useMockData;

  if (useMockData) {
    onConnectionStatus('CONNECTED');
    return () => undefined;
  }

  const hasConfiguredSupabase = options?.supabaseClient != null || isSupabaseConfigured();

  if (hasConfiguredSupabase) {
    try {
      const supabase = options?.supabaseClient ?? requireSupabaseClient();
      return subscribeToSeatUpdatesWithClient({
        supabase,
        active,
        listener,
        onConnectionStatus,
        fetchZones: options?.fetchZones ?? fetchShowZones,
      });
    } catch {
      onConnectionStatus('ERROR');
      return () => undefined;
    }
  }

  const eventId = encodeURIComponent(active.eventId);
  const sameOriginSocketUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
      : '';
  const socketOrigin = runtimeConfig.websocketUrl || sameOriginSocketUrl;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let reconnectAttempt = 0;
  let stopped = false;

  const connect = () => {
    onConnectionStatus('CONNECTING');
    socket = new WebSocket(`${socketOrigin}/ws/events/${eventId}/seats`);

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      onConnectionStatus('CONNECTED');
    });

    socket.addEventListener('message', (message) => {
      try {
        const event = JSON.parse(String(message.data)) as SeatStatusEvent;
        if (event.type === 'SEAT_STATUS_CHANGED' && event.eventId === active.eventId) {
          listener(event);
        }
      } catch (error) {
        console.warn('Bỏ qua thông điệp WebSocket không hợp lệ:', error);
      }
    });

    socket.addEventListener('close', () => {
      if (stopped) return;
      onConnectionStatus('DISCONNECTED');
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 15_000);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    });

    socket.addEventListener('error', () => onConnectionStatus('ERROR'));
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    socket?.close(1000, 'Client disconnected');
  };
}
