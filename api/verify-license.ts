/**
 * Checks a license key: either the owner's private key (matched by SHA-256
 * fingerprint, never stored in clear) or a Gumroad purchase key verified
 * against Gumroad's public license endpoint. Self-contained on purpose: the
 * only imports are Node built-ins and types, so the function cannot fail to
 * resolve project modules at runtime. The pure helpers are exported for tests.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ActivationResult } from '../src/lib/gumroad';

/** From Gumroad: product → Content → "Generate a unique license key per sale" → Product ID. Public. */
export const GUMROAD_PRODUCT_ID = '';
/** How many computers one key may unlock before it is refused: a laptop, a desktop and one replacement. */
export const MAX_ACTIVATIONS = 3;
/**
 * SHA-256 of the owner's private key. To rotate: `openssl rand -hex 16`,
 * format as four groups of eight uppercase characters, hash the formatted key
 * with sha256, replace this constant.
 */
export const OWNER_KEY_SHA256 = '644b7ad9515afdfebdf1ef15df972bd86722187a9d193a21a21b2e2c680dab27';

const KEY_RE = /^[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/;

/** Gumroad keys look like 85DB262A-C19D4B06-A5335A6B-8C079166; accept sloppy pastes. */
export function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let key = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (/^[0-9A-F]{32}$/.test(key)) key = key.replace(/(.{8})(?=.)/g, '$1-');
  return KEY_RE.test(key) ? key : null;
}

export function isOwnerKey(normalizedKey: string): boolean {
  const digest = createHash('sha256').update(normalizedKey).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(OWNER_KEY_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
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

/** Turns Gumroad's license-verify response into a yes/no with a human message. */
export function interpretVerify(body: GumroadVerifyBody, maxActivations = MAX_ACTIVATIONS): ActivationResult {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, message: 'method_not_allowed' });
    return;
  }
  const raw = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const key = normalizeKey((raw as { key?: unknown } | undefined)?.key);
  if (!key) {
    res.status(400).json({ ok: false, message: 'That doesn’t look like a license key. It has four groups of eight letters and numbers, like 85DB262A-C19D4B06-A5335A6B-8C079166.' });
    return;
  }
  if (isOwnerKey(key)) {
    res.status(200).json({ ok: true, message: 'Owner access unlocked.', email: null, owner: true });
    return;
  }
  if (!GUMROAD_PRODUCT_ID) {
    res.status(503).json({ ok: false, message: "Payments aren't set up yet — check back soon." });
    return;
  }
  try {
    const upstream = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: GUMROAD_PRODUCT_ID, license_key: key, increment_uses_count: 'true' }),
    });
    const body = (await upstream.json().catch(() => ({}))) as GumroadVerifyBody;
    const result = interpretVerify(body);
    res.status(result.ok ? 200 : 403).json(result);
  } catch (err) {
    console.error('verify-license failed', err);
    res.status(502).json({ ok: false, message: "Couldn't reach Gumroad to check the key. Please try again in a minute." });
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
