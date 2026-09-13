/**
 * Owner access: one private key that unlocks the app for its owner without
 * a Gumroad purchase and without counting toward the activation limit.
 * Only the SHA-256 fingerprint lives here, so the key itself is never in the
 * repository. To rotate it: `openssl rand -hex 16`, format as four groups
 * of eight uppercase characters, hash the formatted key with sha256, and
 * replace the constant. Server-side only (uses node:crypto).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const OWNER_KEY_SHA256 = '644b7ad9515afdfebdf1ef15df972bd86722187a9d193a21a21b2e2c680dab27';

export function isOwnerKey(normalizedKey: string): boolean {
  const digest = createHash('sha256').update(normalizedKey).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(OWNER_KEY_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
}
