import {getActiveEventContext, isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import type {SeatStatusEvent} from '../types/ticketing';
import {requireSupabaseClient} from './supabaseClient';

type SeatUpdateListener = (event: SeatStatusEvent) => void;
export type RealtimeConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type ConnectionStatusListener = (status: RealtimeConnectionStatus) => void;

export function subscribeToSeatUpdates(
  listener: SeatUpdateListener,
  onConnectionStatus: ConnectionStatusListener = () => undefined,
): () => void {
  const active = getActiveEventContext();
  if (runtimeConfig.useMockData) {
    onConnectionStatus('CONNECTED');
    return () => undefined;
  }

  if (isSupabaseConfigured()) {
    const supabase = requireSupabaseClient();
    onConnectionStatus('CONNECTING');
    const channel = supabase
      .channel(`show-${active.showId}-seats-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {event: 'UPDATE', schema: 'public', table: 'GHE'},
        (payload) => {
          const seat = payload.new as {
            GheID?: number;
            MaGheDayDu?: string;
            TrangThai?: SeatStatusEvent['status'];
          };
          if (!seat.MaGheDayDu || !seat.TrangThai) return;
          listener({
            type: 'SEAT_STATUS_CHANGED',
            eventId: active.eventId,
            seatId: seat.GheID,
            seatCode: seat.MaGheDayDu,
            zoneCode: '',
            status: seat.TrangThai,
            occurredAt: new Date().toISOString(),
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onConnectionStatus('CONNECTED');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onConnectionStatus('ERROR');
        else if (status === 'CLOSED') onConnectionStatus('DISCONNECTED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }

  const eventId = encodeURIComponent(active.eventId);
  const sameOriginSocketUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
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
