import {runtimeConfig} from '../config/runtime';
import {mapAuthError} from '../domain/organizerValidation';

export type BuyerSession = {
  userId: string;
  email: string;
  fullName?: string;
  accountKind?: string;
};

const MOCK_BUYER_SESSION = 'eventticketing:mock-buyer-session';
const MOCK_ACCOUNT_KIND = 'eventticketing:mock-account-kind';

export async function getBuyerSession(): Promise<BuyerSession | null> {
  if (runtimeConfig.useMockData) {
    const raw = localStorage.getItem(MOCK_BUYER_SESSION);
    if (!raw) return null;
    const kind = localStorage.getItem(MOCK_ACCOUNT_KIND) || 'USER';
    try {
      const parsed = JSON.parse(raw) as BuyerSession;
      return {...parsed, accountKind: parsed.accountKind || kind};
    } catch {
      return {userId: 'mock-buyer', email: raw, accountKind: kind};
    }
  }
  try {
    const {requireSupabaseClient} = await import('./supabaseClient');
    const {data} = await requireSupabaseClient().auth.getSession();
    if (!data.session?.user) return null;

    let accountKind = 'USER';
    try {
      const {data: profile} = await (requireSupabaseClient() as any)
        .from('HO_SO_NGUOI_DUNG')
        .select('LoaiTaiKhoan')
        .eq('NguoiDungID', data.session.user.id)
        .maybeSingle();
      if (profile?.LoaiTaiKhoan) {
        accountKind = String(profile.LoaiTaiKhoan);
      }
    } catch {
      // Fallback to USER
    }

    return {
      userId: data.session.user.id,
      email: data.session.user.email || '',
      fullName: data.session.user.user_metadata?.full_name || '',
      accountKind,
    };
  } catch {
    return null;
  }
}

export function subscribeBuyerAuth(callback: (session: BuyerSession | null) => void): () => void {
  if (runtimeConfig.useMockData) {
    const handler = (e: StorageEvent) => {
      if (e.key === MOCK_BUYER_SESSION) {
        void getBuyerSession().then(callback);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
  let unsubscribed = false;
  let cleanup: (() => void) | undefined;
  void import('./supabaseClient').then(({requireSupabaseClient}) => {
    if (unsubscribed) return;
    try {
      const {data} = requireSupabaseClient().auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          callback(null);
        } else {
          void getBuyerSession().then((s) => {
            if (!unsubscribed) callback(s);
          });
        }
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
    const kind = localStorage.getItem(MOCK_ACCOUNT_KIND) || 'USER';
    const session: BuyerSession = {
      userId: `buyer-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
      email: cleanEmail,
      accountKind: kind,
    };
    localStorage.setItem(MOCK_BUYER_SESSION, JSON.stringify(session));
    window.dispatchEvent(new StorageEvent('storage', {key: MOCK_BUYER_SESSION}));
    return session;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const {data, error} = await requireSupabaseClient().auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) throw mapAuthError(error);

  let accountKind = 'USER';
  try {
    const {data: profile} = await (requireSupabaseClient() as any)
      .from('HO_SO_NGUOI_DUNG')
      .select('LoaiTaiKhoan')
      .eq('NguoiDungID', data.user.id)
      .maybeSingle();
    if (profile?.LoaiTaiKhoan) {
      accountKind = String(profile.LoaiTaiKhoan);
    }
  } catch {
    // fallback
  }

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
