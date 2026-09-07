/**
 * Selling through Gumroad: the buy button opens the Gumroad product, Gumroad
 * emails the buyer a license key with the receipt, and the key unlocks the
 * app (here and on any other computer). Only two values need filling in,
 * both public: the product's link and its ID from Gumroad's license-key
 * settings. No secrets, no database.
 */
export const GUMROAD = {
  /** e.g. https://yourname.gumroad.com/l/tdr */
  productUrl: '',
  /** From Gumroad: product → Content → "Generate a unique license key per sale" → Product ID */
  productId: '',
  /** How many computers one key may unlock before it is refused: a laptop, a desktop and one replacement. */
  maxActivations: 3,
};

export const isGumroadConfigured = () => GUMROAD.productUrl.length > 0 && GUMROAD.productId.length > 0;

/** Straight to checkout rather than the product page. */
export const checkoutUrl = () => `${GUMROAD.productUrl}${GUMROAD.productUrl.includes('?') ? '&' : '?'}wanted=true`;

const KEY_RE = /^[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/;

/** Gumroad keys look like 85DB262A-C19D4B06-A5335A6B-8C079166; accept sloppy pastes. */
export function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let key = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (/^[0-9A-F]{32}$/.test(key)) key = key.replace(/(.{8})(?=.)/g, '$1-');
  return KEY_RE.test(key) ? key : null;
}

export interface GumroadVerifyBody {
  success?: boolean;
  message?: string;
  uses?: number;
  purchase?: {
    email?: string;
    refunded?: boolean;
    chargebacked?: boolean;
    disputed?: boolean;
    dispute_won?: boolean;
  };
}

export interface ActivationResult {
  ok: boolean;
  message: string;
  email?: string | null;
}

/** Turns Gumroad's license-verify response into a yes/no with a human message. */
export function interpretVerify(body: GumroadVerifyBody, maxActivations = GUMROAD.maxActivations): ActivationResult {
  if (!body.success || !body.purchase) {
    return { ok: false, message: "That license key wasn't found. Check it against your Gumroad receipt email." };
  }
  const p = body.purchase;
  if (p.refunded || p.chargebacked || (p.disputed && !p.dispute_won)) {
    return { ok: false, message: 'This purchase was refunded, so its license key no longer unlocks the app.' };
  }
  if (typeof body.uses === 'number' && body.uses > maxActivations) {
    return { ok: false, message: `This key has already unlocked ${maxActivations} computers. Get in touch if that seems wrong.` };
  }
  return { ok: true, message: 'Unlocked.', email: p.email ?? null };
}

/** Asks our tiny server function to check the key with Gumroad. */
export async function activateKey(key: string): Promise<ActivationResult> {
  try {
    const res = await fetch('/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<ActivationResult>;
    return { ok: res.ok && data.ok === true, message: data.message ?? 'Something went wrong. Please try again.', email: data.email ?? null };
  } catch {
    return { ok: false, message: "Couldn't reach the license server. Check your connection and try again." };
  }
}
