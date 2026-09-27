/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_DATA?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_EVENT_DATABASE_ID?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_EVENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.html?raw' {
  const content: string;
  export default content;
}
