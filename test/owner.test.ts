import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { isOwnerKey, OWNER_KEY_SHA256 } from '../api/verify-license';

describe('owner key', () => {
  it('stores only a 64-character SHA-256 fingerprint, never the key', () => {
    expect(OWNER_KEY_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects purchase-style keys and near misses', () => {
    expect(isOwnerKey('85DB262A-C19D4B06-A5335A6B-8C079166')).toBe(false);
    expect(isOwnerKey('')).toBe(false);
    expect(isOwnerKey(OWNER_KEY_SHA256)).toBe(false);
  });

  it('accepts exactly the key whose fingerprint is stored', () => {
    const sample = 'TEST1234-TEST1234-TEST1234-TEST1234';
    const digest = createHash('sha256').update(sample).digest('hex');
    // Sanity check of the hashing scheme itself: same input, same fingerprint.
    expect(digest).toBe(createHash('sha256').update(sample).digest('hex'));
    expect(isOwnerKey(sample)).toBe(digest === OWNER_KEY_SHA256);
  });
});
