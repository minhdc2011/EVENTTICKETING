import {runtimeConfig} from '../config/runtime';
import type {SeatStatusEvent} from '../types/ticketing';

type SeatUpdateListener = (event: SeatStatusEvent) => void;

export function subscribeToSeatUpdates(listener: SeatUpdateListener): () => void {
  if (runtimeConfig.useMockData) return () => undefined;

  const eventId = encodeURIComponent(runtimeConfig.eventId);
  const sameOriginSocketUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  const socketOrigin = runtimeConfig.websocketUrl || sameOriginSocketUrl;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let reconnectAttempt = 0;
  let stopped = false;

  const connect = () => {
    socket = new WebSocket(`${socketOrigin}/ws/events/${eventId}/seats`);

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
    });

    socket.addEventListener('message', (message) => {
      try {
        const event = JSON.parse(String(message.data)) as SeatStatusEvent;
        if (event.type === 'SEAT_STATUS_CHANGED' && event.eventId === runtimeConfig.eventId) {
          listener(event);
        }
      } catch (error) {
        console.warn('Bỏ qua thông điệp WebSocket không hợp lệ:', error);
      }
    });

    socket.addEventListener('close', () => {
      if (stopped) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 15_000);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    });
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    socket?.close(1000, 'Client disconnected');
  };
}
