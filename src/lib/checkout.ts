/** Shared Stripe Checkout starter, used by the home page's buy buttons. */
export interface CheckoutResult {
  ok: boolean;
  url?: string;
  message?: string;
}

export async function startCheckout(): Promise<CheckoutResult> {
  try {
    const res = await fetch('/api/create-checkout-session', { method: 'POST' });
    const data = (await res.json()) as { url?: string; error?: string };
    if (res.ok && data.url) return { ok: true, url: data.url };
    if (data.error === 'not_configured') return { ok: false, message: "Payments aren't set up yet — check back soon." };
    return { ok: false, message: 'Could not start checkout. Please try again in a moment.' };
  } catch {
    return { ok: false, message: 'Could not reach the checkout server. Check your connection and try again.' };
  }
}
