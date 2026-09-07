import { describe, expect, it } from 'vitest';
import { interpretVerify, normalizeKey } from '../src/lib/gumroad';

describe('normalizeKey', () => {
  it('accepts real keys, sloppy pastes and dashless keys', () => {
    expect(normalizeKey('85DB262A-C19D4B06-A5335A6B-8C079166')).toBe('85DB262A-C19D4B06-A5335A6B-8C079166');
    expect(normalizeKey('  85db262a-c19d4b06-a5335a6b-8c079166 ')).toBe('85DB262A-C19D4B06-A5335A6B-8C079166');
    expect(normalizeKey('85DB262AC19D4B06A5335A6B8C079166')).toBe('85DB262A-C19D4B06-A5335A6B-8C079166');
    expect(normalizeKey('85DB262A C19D4B06 A5335A6B 8C079166')).toBe('85DB262A-C19D4B06-A5335A6B-8C079166');
  });

  it('rejects junk', () => {
    expect(normalizeKey('')).toBeNull();
    expect(normalizeKey('hello')).toBeNull();
    expect(normalizeKey('85DB262A-C19D4B06-A5335A6B')).toBeNull();
    expect(normalizeKey('ZZZZZZZZ-ZZZZZZZZ-ZZZZZZZZ-ZZZZZZZZ')).toBeNull();
    expect(normalizeKey(42)).toBeNull();
  });
});

describe('interpretVerify', () => {
  const good = { success: true, uses: 1, purchase: { email: 'buyer@example.com', refunded: false, chargebacked: false, disputed: false } };

  it('unlocks a paid, unrefunded purchase and reports the email', () => {
    expect(interpretVerify(good, 10)).toEqual({ ok: true, message: 'Unlocked.', email: 'buyer@example.com' });
  });

  it('refuses unknown keys, refunds, chargebacks and lost disputes', () => {
    expect(interpretVerify({ success: false, message: 'nope' }, 10).ok).toBe(false);
    expect(interpretVerify({ ...good, purchase: { ...good.purchase, refunded: true } }, 10).ok).toBe(false);
    expect(interpretVerify({ ...good, purchase: { ...good.purchase, chargebacked: true } }, 10).ok).toBe(false);
    expect(interpretVerify({ ...good, purchase: { ...good.purchase, disputed: true, dispute_won: false } }, 10).ok).toBe(false);
    expect(interpretVerify({ ...good, purchase: { ...good.purchase, disputed: true, dispute_won: true } }, 10).ok).toBe(true);
  });

  it('stops a key after too many activations', () => {
    expect(interpretVerify({ ...good, uses: 10 }, 10).ok).toBe(true);
    expect(interpretVerify({ ...good, uses: 11 }, 10).ok).toBe(false);
  });
});
