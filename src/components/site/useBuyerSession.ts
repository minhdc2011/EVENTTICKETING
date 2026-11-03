import {useCallback, useEffect, useState} from 'react';
import {getBuyerSession, signOutBuyer, subscribeBuyerAuth, type BuyerSession} from '../../services/buyerAuthService';

/** Buyer session + sign-out for the shared header (same behaviour as the catalog). */
export function useBuyerSession() {
  const [session, setSession] = useState<BuyerSession | null>(null);

  useEffect(() => {
    let active = true;
    void getBuyerSession().then((value) => {
      if (active) setSession(value);
    });
    const unsubscribe = subscribeBuyerAuth(setSession);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await signOutBuyer();
    setSession(await getBuyerSession());
  }, []);

  return {session, signOut};
}
