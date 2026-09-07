/**
 * Turns a sign-in token from an emailed link back into a license. Only the
 * signature and expiry are checked here: the token was minted by
 * request-signin after Stripe confirmed the purchase.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '../server/signin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed', ok: false });
    return;
  }

  const secret = process.env.SIGNIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'not_configured', ok: false });
    return;
  }

  const body = (req.body ?? {}) as { token?: unknown };
  const token = typeof body.token === 'string' && body.token.length < 2048 ? body.token : '';
  const claims = token ? verifyToken(token, secret) : null;
  if (!claims) {
    res.status(400).json({ error: 'invalid_token', ok: false });
    return;
  }
  res.status(200).json({ ok: true, email: claims.email, sessionId: claims.sessionId });
}
