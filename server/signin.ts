/**
 * Passwordless sign-in tokens for returning buyers. A token is only minted
 * after Stripe confirms a paid Checkout Session for the email, and it is
 * HMAC-signed with SIGNIN_SECRET so the client can't forge one. There is no
 * database: the token carries everything needed to re-create the license.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SigninClaims {
  email: string;
  sessionId: string;
  exp: number;
}

export const SIGNIN_TTL_MS = 60 * 60 * 1000;

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signToken(claims: Omit<SigninClaims, 'exp'>, secret: string, now = Date.now(), ttlMs = SIGNIN_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ email: claims.email, sessionId: claims.sessionId, exp: now + ttlMs })).toString('base64url');
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): SigninClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SigninClaims>;
    if (typeof claims.email !== 'string' || typeof claims.sessionId !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp < now) return null;
    return { email: claims.email, sessionId: claims.sessionId, exp: claims.exp };
  } catch {
    return null;
  }
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
