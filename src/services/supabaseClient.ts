import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import type {Database} from '../types/database.types';

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;

  if (!client) {
    client = createClient<Database>(
      runtimeConfig.supabaseUrl,
      runtimeConfig.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: {eventsPerSecond: 10},
        },
      },
    );
  }

  return client;
}

export function requireSupabaseClient(): SupabaseClient<Database> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. Hãy cấu hình .env.local.',
    );
  }
  return supabase;
}
