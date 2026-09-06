import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLicense, pendingSessionId, restoreUrl, saveLicense } from '../src/lib/license';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  };
}

describe('license', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
  });

  it('starts unlicensed and persists a purchase', () => {
    expect(loadLicense()).toEqual({ licensed: false });
    const license = saveLicense('cs_test_123', 'buyer@example.com');
    expect(license.licensed).toBe(true);
    expect(license.sessionId).toBe('cs_test_123');
    const reloaded = loadLicense();
    expect(reloaded.licensed).toBe(true);
    expect(reloaded.sessionId).toBe('cs_test_123');
    expect(reloaded.email).toBe('buyer@example.com');
  });

  it('ignores corrupted or tampered storage', () => {
    localStorage.setItem('tesla-lightshow-maker.license.v1', 'not json');
    expect(loadLicense()).toEqual({ licensed: false });
    localStorage.setItem('tesla-lightshow-maker.license.v1', JSON.stringify({ licensed: false, sessionId: 'cs_fake' }));
    expect(loadLicense()).toEqual({ licensed: false });
  });

  it('builds a restore link only when licensed with a session id', () => {
    expect(restoreUrl({ licensed: false }, 'https://example.com')).toBeNull();
    expect(restoreUrl({ licensed: true }, 'https://example.com')).toBeNull();
    const url = restoreUrl({ licensed: true, sessionId: 'cs_abc' }, 'https://example.com');
    expect(url).toBe('https://example.com/?purchase=success&session_id=cs_abc');
  });

  it('parses a pending session id only from a genuine success redirect', () => {
    expect(pendingSessionId('?purchase=success&session_id=cs_test_1')).toBe('cs_test_1');
    expect(pendingSessionId('?purchase=success')).toBeNull();
    expect(pendingSessionId('?session_id=cs_test_1')).toBeNull();
    expect(pendingSessionId('?purchase=success&session_id=not-a-session')).toBeNull();
    expect(pendingSessionId('')).toBeNull();
  });
});
