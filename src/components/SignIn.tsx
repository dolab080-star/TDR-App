import { useState, type FormEvent } from 'react';
import { requestSignin } from '../lib/signin';

interface Props {
  onClose?: () => void;
}

export function SignIn({ onClose }: Props) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    const result = await requestSignin(email.trim());
    setMessage(result.message);
    setState(result.ok ? 'sent' : 'error');
  };

  return (
    <div className="panel signin">
      <h3>Already bought? Sign in</h3>
      <p className="hint">
        Enter the email you used at checkout and we'll send you a sign-in link — it unlocks this computer, no password needed.
      </p>
      {state === 'sent' ? (
        <p className="purchase-ok" role="status">
          {message}
        </p>
      ) : (
        <form className="signin-row" onSubmit={submit}>
          <input
            className="select"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Purchase email"
            disabled={state === 'sending'}
          />
          <button className="btn primary" type="submit" disabled={state === 'sending' || !email.trim()}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
      {state === 'error' && (
        <p className="hint" style={{ color: 'var(--accent-2)' }} role="alert">
          {message}
        </p>
      )}
      {onClose && (
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}
