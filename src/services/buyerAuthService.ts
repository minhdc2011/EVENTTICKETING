import {runtimeConfig} from '../config/runtime';
import {mapAuthError} from '../domain/organizerValidation';
import {
  ACCOUNT_PORTALS,
  authorizePortalSignIn,
  createAuthChangeHandler,
  loadPortalSession,
  MOCK_ACCOUNT_PROFILES_KEY,
  readMockAccountKind,
  registerMockAccount,
} from '../domain/accountAccess';

export type BuyerSession = {
  userId: string;
  email: string;
  fullName?: string;
  accountKind?: string;
};

const MOCK_BUYER_SESSION = 'eventticketing:mock-buyer-session';

export async function getBuyerSession(): Promise<BuyerSession | null> {
  if (runtimeConfig.useMockData) {
    return loadPortalSession<BuyerSession>({
      portal: ACCOUNT_PORTALS.BUYER,
      loadSession: readMockBuyerSessionBase,
      loadProfile: (base) => readMockAccountKind(localStorage, base.email),
    });
  }
  try {
    const {requireSupabaseClient} = await import('./supabaseClient');
    const client = requireSupabaseClient();
    return await loadPortalSession<BuyerSession>({
      portal: ACCOUNT_PORTALS.BUYER,
      loadSession: async () => {
        const {data} = await client.auth.getSession();
        const user = data.session?.user;
        if (!user) return null;
        // fullName is display-only and never decides the role.
        return {userId: user.id, email: user.email || '', fullName: user.user_metadata?.full_name || ''};
      },
      loadProfile: (base) =>
        (client as any)
          .from('HO_SO_NGUOI_DUNG')
          .select('LoaiTaiKhoan')
          .eq('NguoiDungID', base.userId)
          .maybeSingle(),
    });
  } catch {
    return null;
  }
}

function readMockBuyerSessionBase(): BuyerSession | null {
  const raw = localStorage.getItem(MOCK_BUYER_SESSION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BuyerSession> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.email) return null;
    return {userId: parsed.userId || 'mock-buyer', email: parsed.email, fullName: parsed.fullName};
  } catch {
    return {userId: 'mock-buyer', email: raw};
  }
}

export function subscribeBuyerAuth(callback: (session: BuyerSession | null) => void): () => void {
  let unsubscribed = false;
  const handle = createAuthChangeHandler<BuyerSession>({
    resolveSession: getBuyerSession,
    emit: callback,
    isActive: () => !unsubscribed,
  });
  if (runtimeConfig.useMockData) {
    const handler = (e: StorageEvent) => {
      if (e.key === MOCK_BUYER_SESSION || e.key === MOCK_ACCOUNT_PROFILES_KEY) {
        void handle({});
      }
    };
    window.addEventListener('storage', handler);
    return () => {
      unsubscribed = true;
      window.removeEventListener('storage', handler);
    };
  }
  let cleanup: (() => void) | undefined;
  void import('./supabaseClient').then(({requireSupabaseClient}) => {
    if (unsubscribed) return;
    try {
      const {data} = requireSupabaseClient().auth.onAuthStateChange((_event, session) => {
        void handle(session?.user ? session : null);
      });
      cleanup = () => data.subscription.unsubscribe();
    } catch {
      // Supabase unconfigured or error
    }
  });
  return () => {
    unsubscribed = true;
    if (cleanup) cleanup();
  };
}

export async function signInBuyer(email: string, password: string): Promise<BuyerSession> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@') || password.length < 6) {
    throw new Error('Email hoặc mật khẩu chưa hợp lệ (mật khẩu tối thiểu 6 ký tự).');
  }
  if (runtimeConfig.useMockData) {
    const accountKind = await authorizePortalSignIn({
      portal: ACCOUNT_PORTALS.BUYER,
      loadProfile: () => readMockAccountKind(localStorage, cleanEmail),
      revokeSession: () => localStorage.removeItem(MOCK_BUYER_SESSION),
    });
    const session: BuyerSession = {
      userId: `buyer-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
      email: cleanEmail,
      accountKind,
    };
    localStorage.setItem(MOCK_BUYER_SESSION, JSON.stringify(session));
    window.dispatchEvent(new StorageEvent('storage', {key: MOCK_BUYER_SESSION}));
    return session;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const client = requireSupabaseClient();
  const {data, error} = await client.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) throw mapAuthError(error);

  const accountKind = await authorizePortalSignIn({
    portal: ACCOUNT_PORTALS.BUYER,
    loadProfile: () =>
      (client as any)
        .from('HO_SO_NGUOI_DUNG')
        .select('LoaiTaiKhoan')
        .eq('NguoiDungID', data.user.id)
        .maybeSingle(),
    revokeSession: async () => {
      const {error: signOutError} = await client.auth.signOut();
      if (!signOutError) return;
      try {
        await client.auth.signOut({scope: 'local'});
      } catch {
        // getBuyerSession still returns null for a wrong-portal account.
      }
    },
  });

  return {
    userId: data.user.id,
    email: data.user.email || cleanEmail,
    fullName: data.user.user_metadata?.full_name || '',
    accountKind,
  };
}

export async function signUpBuyer(
  email: string,
  password: string,
  fullName?: string,
): Promise<{session: BuyerSession | null; requiresEmailConfirmation: boolean}> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@') || password.length < 6) {
    throw new Error('Email hoặc mật khẩu chưa hợp lệ (mật khẩu tối thiểu 6 ký tự).');
  }
  if (runtimeConfig.useMockData) {
    registerMockAccount(localStorage, cleanEmail);
    const session: BuyerSession = {
      userId: `buyer-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
      email: cleanEmail,
      fullName: fullName?.trim(),
      accountKind: 'USER',
    };
    localStorage.setItem(MOCK_BUYER_SESSION, JSON.stringify(session));
    window.dispatchEvent(new StorageEvent('storage', {key: MOCK_BUYER_SESSION}));
    return {session, requiresEmailConfirmation: false};
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {data, error} = await requireSupabaseClient().auth.signUp({
    email: cleanEmail,
    password,
    options: fullName ? {data: {full_name: fullName.trim()}} : undefined,
  });
  if (error) throw mapAuthError(error);
  const session = data.session?.user
    ? {
        userId: data.session.user.id,
        email: data.session.user.email || cleanEmail,
        fullName: fullName?.trim(),
        accountKind: 'USER',
      }
    : null;
  return {
    session,
    requiresEmailConfirmation: !data.session,
  };
}

export async function signOutBuyer(): Promise<void> {
  if (runtimeConfig.useMockData) {
    localStorage.removeItem(MOCK_BUYER_SESSION);
    window.dispatchEvent(new StorageEvent('storage', {key: MOCK_BUYER_SESSION}));
    return;
  }
  try {
    const {requireSupabaseClient} = await import('./supabaseClient');
    await requireSupabaseClient().auth.signOut();
  } catch (err) {
    console.warn('Đăng xuất người mua vé hoàn tất:', err);
  }
}
