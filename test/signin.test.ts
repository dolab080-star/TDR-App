import { describe, expect, it } from 'vitest';
import { normalizeEmail, SIGNIN_TTL_MS, signToken, verifyToken } from '../server/signin';
import { appOrigin } from '../server/origin';
import { pendingSigninToken } from '../src/lib/signin';

const SECRET = 'test-secret-please-change';
const NOW = 1_800_000_000_000;

describe('sign-in tokens', () => {
  it('round-trips claims and expires after the TTL', () => {
    const token = signToken({ email: 'buyer@example.com', sessionId: 'cs_test_123' }, SECRET, NOW);
    expect(verifyToken(token, SECRET, NOW + 1000)).toEqual({ email: 'buyer@example.com', sessionId: 'cs_test_123', exp: NOW + SIGNIN_TTL_MS });
    expect(verifyToken(token, SECRET, NOW + SIGNIN_TTL_MS + 1)).toBeNull();
  });

  it('rejects tampering, wrong secrets and garbage', () => {
    const token = signToken({ email: 'buyer@example.com', sessionId: 'cs_test_123' }, SECRET, NOW);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ email: 'thief@example.com', sessionId: 'cs_test_123', exp: NOW + SIGNIN_TTL_MS })).toString('base64url');
    expect(verifyToken(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifyToken(`${payload}.${sig.slice(0, -2)}AA`, SECRET, NOW)).toBeNull();
    expect(verifyToken(token, 'another-secret', NOW)).toBeNull();
    expect(verifyToken('', SECRET, NOW)).toBeNull();
    expect(verifyToken('a.b.c', SECRET, NOW)).toBeNull();
    expect(verifyToken('not-base64.!!', SECRET, NOW)).toBeNull();
  });

  it('only fits the URL-safe alphabet so links survive email clients', () => {
    const token = signToken({ email: 'buyer+tag@example.com', sessionId: 'cs_test_123' }, SECRET, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(pendingSigninToken(`?signin=${encodeURIComponent(token)}`)).toBe(token);
  });
});

describe('normalizeEmail', () => {
  it('trims, lowercases and rejects junk', () => {
    expect(normalizeEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${'x'.repeat(250)}@e.com`)).toBeNull();
  });
});

describe('pendingSigninToken', () => {
  it('ignores missing or malformed tokens', () => {
    expect(pendingSigninToken('')).toBeNull();
    expect(pendingSigninToken('?signin=')).toBeNull();
    expect(pendingSigninToken('?signin=abc')).toBeNull();
    expect(pendingSigninToken('?signin=<script>.x')).toBeNull();
    expect(pendingSigninToken('?purchase=success&session_id=cs_1')).toBeNull();
  });
});

describe('appOrigin', () => {
  it('prefers configuration over request headers', () => {
    const headers = { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' };
    expect(appOrigin(headers, { APP_URL: 'https://tdr.example/' } as NodeJS.ProcessEnv)).toBe('https://tdr.example');
    expect(appOrigin(headers, { VERCEL_PROJECT_PRODUCTION_URL: 'tdr.vercel.app' } as NodeJS.ProcessEnv)).toBe('https://tdr.vercel.app');
    expect(appOrigin(headers, {} as NodeJS.ProcessEnv)).toBe('http://evil.example');
    expect(appOrigin({}, {} as NodeJS.ProcessEnv)).toBe('https://localhost');
  });
});
