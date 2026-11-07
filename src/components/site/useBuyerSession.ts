import {useCallback, useEffect, useState} from 'react';
import {
  refreshBuyerSession,
  signOutBuyer,
  subscribeBuyerAuth,
  type BuyerSession,
} from '../../services/buyerAuthService';

/** Buyer session + sign-out for the shared header. The subscription is the only source of truth. */
export function useBuyerSession() {
  const [session, setSession] = useState<BuyerSession | null>(null);

  useEffect(() => subscribeBuyerAuth(setSession), []);

  const signOut = useCallback(async () => {
    await signOutBuyer();
    setSession(null);
    void refreshBuyerSession();
  }, []);

  return {session, signOut};
}
