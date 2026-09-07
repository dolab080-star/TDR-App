import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLicense, saveLicense } from '../src/lib/license';

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

  it('starts unlicensed and persists a verified key', () => {
    expect(loadLicense()).toEqual({ licensed: false });
    const license = saveLicense('85DB262A-C19D4B06-A5335A6B-8C079166', 'buyer@example.com');
    expect(license.licensed).toBe(true);
    const reloaded = loadLicense();
    expect(reloaded.licensed).toBe(true);
    expect(reloaded.key).toBe('85DB262A-C19D4B06-A5335A6B-8C079166');
    expect(reloaded.email).toBe('buyer@example.com');
  });

  it('ignores corrupted, tampered or keyless storage', () => {
    localStorage.setItem('tesla-lightshow-maker.license.v2', 'not json');
    expect(loadLicense()).toEqual({ licensed: false });
    localStorage.setItem('tesla-lightshow-maker.license.v2', JSON.stringify({ licensed: false, key: 'x' }));
    expect(loadLicense()).toEqual({ licensed: false });
    localStorage.setItem('tesla-lightshow-maker.license.v2', JSON.stringify({ licensed: true }));
    expect(loadLicense()).toEqual({ licensed: false });
  });
});
