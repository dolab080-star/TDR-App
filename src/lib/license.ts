/**
 * Client-side "license" for the one-time purchase. There is no account
 * system or server-side database in this app — a purchase unlocks downloads
 * on the browser that completed checkout, the same way the rest of the app
 * keeps everything local to the device. The restore link (built from the
 * saved Stripe Checkout session id) is the closest thing to a license key:
 * visiting it re-runs verification and unlocks a new browser/device.
 */

export interface License {
  licensed: boolean;
  sessionId?: string;
  email?: string | null;
  purchasedAt?: number;
}

const KEY = 'tesla-lightshow-maker.license.v1';
const UNLICENSED: License = { licensed: false };

export function loadLicense(): License {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return UNLICENSED;
    const parsed = JSON.parse(raw) as Partial<License>;
    return parsed.licensed === true ? { licensed: true, sessionId: parsed.sessionId, email: parsed.email ?? null, purchasedAt: parsed.purchasedAt } : UNLICENSED;
  } catch {
    return UNLICENSED;
  }
}

export function saveLicense(sessionId: string, email: string | null): License {
  const license: License = { licensed: true, sessionId, email, purchasedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(license));
  } catch {
    /* private mode or storage full: the unlock still applies for this page load */
  }
  return license;
}

/** The link that re-unlocks this purchase on any browser/device. */
export function restoreUrl(license: License, origin = window.location.origin): string | null {
  if (!license.licensed || !license.sessionId) return null;
  return `${origin}/?purchase=success&session_id=${encodeURIComponent(license.sessionId)}`;
}

/** Parse a `?purchase=success&session_id=...` redirect from Stripe Checkout. */
export function pendingSessionId(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('purchase') !== 'success') return null;
  const id = params.get('session_id');
  return id && id.startsWith('cs_') ? id : null;
}
