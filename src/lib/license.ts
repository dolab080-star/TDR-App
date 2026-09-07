/**
 * Client-side "license" for the one-time purchase. There is no account
 * system or database — a verified Gumroad license key unlocks the browser
 * it was entered in, and the same key unlocks any other computer.
 */

export interface License {
  licensed: boolean;
  key?: string;
  email?: string | null;
  purchasedAt?: number;
}

const KEY = 'tesla-lightshow-maker.license.v2';
const UNLICENSED: License = { licensed: false };

export function loadLicense(): License {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return UNLICENSED;
    const parsed = JSON.parse(raw) as Partial<License>;
    return parsed.licensed === true && typeof parsed.key === 'string' ? { licensed: true, key: parsed.key, email: parsed.email ?? null, purchasedAt: parsed.purchasedAt } : UNLICENSED;
  } catch {
    return UNLICENSED;
  }
}

export function saveLicense(key: string, email: string | null): License {
  const license: License = { licensed: true, key, email, purchasedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(license));
  } catch {
    /* private mode or storage full: the unlock still applies for this page load */
  }
  return license;
}
