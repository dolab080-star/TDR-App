/**
 * Selling through Gumroad (browser side): the buy button opens the Gumroad
 * product, Gumroad emails the buyer a license key with the receipt, and the
 * key unlocks the app here and on any other computer. The key check itself
 * lives in api/verify-license.ts, which also holds the product ID.
 */
export const GUMROAD = {
  /** e.g. https://yourname.gumroad.com/l/tdr */
  productUrl: '',
};

export const isGumroadConfigured = () => GUMROAD.productUrl.length > 0;

/** Straight to checkout rather than the product page. */
export const checkoutUrl = () => `${GUMROAD.productUrl}${GUMROAD.productUrl.includes('?') ? '&' : '?'}wanted=true`;

export interface ActivationResult {
  ok: boolean;
  message: string;
  email?: string | null;
  /** True for the owner's private key, which skips Gumroad and the activation limit. */
  owner?: boolean;
}

/** Asks our server function to check the key (owner key or Gumroad purchase). */
export async function activateKey(key: string): Promise<ActivationResult> {
  let res: Response;
  try {
    res = await fetch('/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
  } catch {
    return { ok: false, message: "Couldn't reach the license server. Check your connection and try again." };
  }
  const data = (await res.json().catch(() => null)) as Partial<ActivationResult> | null;
  if (!data || typeof data.ok !== 'boolean') {
    return { ok: false, message: `The license server answered with HTTP ${res.status} instead of a result. Please try again in a minute.` };
  }
  return { ok: res.ok && data.ok, message: data.message ?? 'Something went wrong. Please try again.', email: data.email ?? null, owner: data.owner === true };
}
