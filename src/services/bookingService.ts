import {runtimeConfig} from '../config/runtime';
import type {ApiEnvelope, CreateHoldRequest, HoldRecord} from '../types/ticketing';
import {apiRequest} from './apiClient';

const HOLD_DURATION_MS = 300_000;

export async function createSeatHold(request: CreateHoldRequest): Promise<HoldRecord> {
  if (!runtimeConfig.useMockData) {
    const result = await apiRequest<ApiEnvelope<HoldRecord>>('/api/v1/holds', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return result.data;
  }

  return {
    holdId: `mock-${crypto.randomUUID()}`,
    eventId: request.eventId,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + HOLD_DURATION_MS).toISOString(),
    items: request.items,
  };
}

export async function releaseSeatHold(holdId: string): Promise<void> {
  if (runtimeConfig.useMockData || holdId.startsWith('mock-')) return;
  await apiRequest(`/api/v1/holds/${encodeURIComponent(holdId)}`, {method: 'DELETE'});
}
