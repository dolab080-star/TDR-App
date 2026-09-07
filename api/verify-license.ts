/**
 * Checks a Gumroad license key for our product. No secrets are involved:
 * the product ID is public and Gumroad's license endpoint needs no token.
 * Each successful check counts as one activation on Gumroad's side.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GUMROAD, interpretVerify, normalizeKey, type GumroadVerifyBody } from '../src/lib/gumroad';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, message: 'method_not_allowed' });
    return;
  }
  if (!GUMROAD.productId) {
    res.status(503).json({ ok: false, message: "Payments aren't set up yet — check back soon." });
    return;
  }
  const key = normalizeKey((req.body as { key?: unknown } | undefined)?.key);
  if (!key) {
    res.status(400).json({ ok: false, message: 'That doesn’t look like a license key. It has four groups of eight letters and numbers, like 85DB262A-C19D4B06-A5335A6B-8C079166.' });
    return;
  }
  try {
    const upstream = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: GUMROAD.productId, license_key: key, increment_uses_count: 'true' }),
    });
    const body = (await upstream.json().catch(() => ({}))) as GumroadVerifyBody;
    const result = interpretVerify(body);
    res.status(result.ok ? 200 : 403).json(result);
  } catch (err) {
    console.error('verify-license failed', err);
    res.status(502).json({ ok: false, message: "Couldn't reach Gumroad to check the key. Please try again in a minute." });
  }
}
