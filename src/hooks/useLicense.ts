import { useCallback, useState } from 'react';
import { loadLicense, saveLicense, type License } from '../lib/license';
import { activateKey, type ActivationResult } from '../lib/gumroad';

export type Activation = { status: 'idle' } | { status: 'checking' } | { status: 'confirmed' } | { status: 'failed'; message: string };

/** Loads the saved license and unlocks the browser once a Gumroad key checks out. */
export function useLicense(): { license: License; activation: Activation; activate: (key: string) => Promise<ActivationResult>; dismiss: () => void } {
  const [license, setLicense] = useState<License>(loadLicense);
  const [activation, setActivation] = useState<Activation>({ status: 'idle' });

  const activate = useCallback(async (key: string) => {
    setActivation({ status: 'checking' });
    const result = await activateKey(key);
    if (result.ok) {
      setLicense(saveLicense(key.trim().toUpperCase(), result.email ?? null));
      setActivation({ status: 'confirmed' });
    } else {
      setActivation({ status: 'failed', message: result.message });
    }
    return result;
  }, []);

  return { license, activation, activate, dismiss: () => setActivation({ status: 'idle' }) };
}
