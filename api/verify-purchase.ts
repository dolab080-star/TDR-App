/**
 * Confirms a Stripe Checkout Session actually completed with a paid status.
 * The client calls this once, right after Stripe redirects back with
 * ?session_id=..., before unlocking downloads in localStorage — the session
 * id alone is not proof of payment, so we always ask Stripe.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : undefined;
  if (!sessionId || !sessionId.startsWith('cs_')) {
    res.status(400).json({ error: 'bad_request', paid: false });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    res.status(503).json({ error: 'not_configured', paid: false });
    return;
  }

  try {
    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.status(200).json({
      paid: session.payment_status === 'paid',
      email: session.customer_details?.email ?? null,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('verify-purchase failed', err);
    res.status(404).json({ error: 'not_found', paid: false });
  }
}
