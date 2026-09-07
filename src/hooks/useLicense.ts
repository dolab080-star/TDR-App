import { useEffect, useState } from 'react';
import { loadLicense, pendingSessionId, saveLicense, type License } from '../lib/license';
import { pendingSigninToken, verifySignin } from '../lib/signin';

export type PurchaseCheck = 'idle' | 'checking' | 'confirmed' | 'failed' | 'signin-checking' | 'signin-confirmed' | 'signin-failed';

interface VerifyResponse {
  paid?: boolean;
  email?: string | null;
}

/**
 * Loads the saved license and, if the page was reached via a Stripe Checkout
 * redirect (?purchase=success&session_id=...) or an emailed sign-in link
 * (?signin=<token>), verifies it with the API and unlocks on success. The
 * query params are always stripped afterwards so a refresh doesn't re-verify.
 */
export function useLicense(): { license: License; purchaseCheck: PurchaseCheck; dismissPurchaseCheck: () => void } {
  const [license, setLicense] = useState<License>(loadLicense);
  const [purchaseCheck, setPurchaseCheck] = useState<PurchaseCheck>('idle');

  useEffect(() => {
    const search = window.location.search;
    const sessionId = pendingSessionId(search);
    const token = sessionId ? null : pendingSigninToken(search);
    if (!sessionId && !token) return;
    let cancelled = false;

    const strip = (...params: string[]) => {
      const url = new URL(window.location.href);
      for (const p of params) url.searchParams.delete(p);
      window.history.replaceState(null, '', url.pathname + url.search);
    };

    if (sessionId) {
      setPurchaseCheck('checking');
      fetch(`/api/verify-purchase?session_id=${encodeURIComponent(sessionId)}`)
        .then((r) => r.json() as Promise<VerifyResponse>)
        .then((data) => {
          if (cancelled) return;
          if (data.paid) {
            setLicense(saveLicense(sessionId, data.email ?? null));
            setPurchaseCheck('confirmed');
          } else {
            setPurchaseCheck('failed');
          }
        })
        .catch(() => {
          if (!cancelled) setPurchaseCheck('failed');
        })
        .finally(() => strip('purchase', 'session_id'));
    } else if (token) {
      setPurchaseCheck('signin-checking');
      verifySignin(token)
        .then((data) => {
          if (cancelled) return;
          if (data.ok && data.sessionId) {
            setLicense(saveLicense(data.sessionId, data.email ?? null));
            setPurchaseCheck('signin-confirmed');
          } else {
            setPurchaseCheck('signin-failed');
          }
        })
        .catch(() => {
          if (!cancelled) setPurchaseCheck('signin-failed');
        })
        .finally(() => strip('signin'));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return { license, purchaseCheck, dismissPurchaseCheck: () => setPurchaseCheck('idle') };
}
