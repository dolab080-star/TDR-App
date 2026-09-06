import { useEffect, useState } from 'react';
import { loadLicense, pendingSessionId, saveLicense, type License } from '../lib/license';

export type PurchaseCheck = 'idle' | 'checking' | 'confirmed' | 'failed';

interface VerifyResponse {
  paid?: boolean;
  email?: string | null;
}

/**
 * Loads the saved license and, if the page was just reached via a Stripe
 * Checkout redirect (?purchase=success&session_id=...), verifies it with
 * /api/verify-purchase and unlocks on success. The query params are always
 * stripped afterwards so refreshing the page doesn't re-verify.
 */
export function useLicense(): { license: License; purchaseCheck: PurchaseCheck; dismissPurchaseCheck: () => void } {
  const [license, setLicense] = useState<License>(loadLicense);
  const [purchaseCheck, setPurchaseCheck] = useState<PurchaseCheck>('idle');

  useEffect(() => {
    const sessionId = pendingSessionId(window.location.search);
    if (!sessionId) return;
    let cancelled = false;
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
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('purchase');
        url.searchParams.delete('session_id');
        window.history.replaceState(null, '', url.pathname + url.search);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { license, purchaseCheck, dismissPurchaseCheck: () => setPurchaseCheck('idle') };
}
