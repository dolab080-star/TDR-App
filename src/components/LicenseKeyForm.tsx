import { useState, type FormEvent } from 'react';
import type { ActivationResult } from '../lib/gumroad';

interface Props {
  onActivate: (key: string) => Promise<ActivationResult>;
  onClose?: () => void;
}

export function LicenseKeyForm({ onActivate, onClose }: Props) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onActivate(key);
    if (!result.ok) setError(result.message);
    setBusy(false);
  };

  return (
    <div className="panel signin">
      <form className="signin-row" onSubmit={submit}>
        <label className="signin-label" htmlFor="license-key">
          🔑 Already bought? Paste your license key:
        </label>
        <input
          id="license-key"
          className="select mono"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="85DB262A-C19D4B06-A5335A6B-8C079166"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={busy}
        />
        <button className="btn primary" type="submit" disabled={busy || !key.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        {onClose && (
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        )}
      </form>
      {error && (
        <p className="hint" style={{ color: 'var(--accent-2)', margin: '8px 0 0' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
