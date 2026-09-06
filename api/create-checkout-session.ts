/**
 * Creates a Stripe Checkout Session for the one-time "full unlock" purchase
 * and hands the client the hosted checkout URL to redirect to.
 *
 * Requires two Vercel environment variables (see README.md "Selling the
 * app" section for how to get them):
 *   STRIPE_SECRET_KEY  sk_live_... or sk_test_...
 *   STRIPE_PRICE_ID    price_... for a one-time Price on your Product
 *
 * Nothing about the user's song or show ever passes through this endpoint;
 * it only talks to Stripe.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secretKey || !priceId) {
    res.status(503).json({ error: 'not_configured', message: 'Payments are not set up yet.' });
    return;
  }

  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const origin = `${proto}://${host}`;

  try {
    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing.html?canceled=1`,
      allow_promotion_codes: true,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session failed', err);
    res.status(502).json({ error: 'stripe_error', message: 'Could not start checkout. Please try again.' });
  }
}
