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
      {state === 'sent' ? (
        <div className="signin-row">
          <p className="purchase-ok" role="status">
            {message}
          </p>
          {onClose && (
            <button className="btn ghost" type="button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      ) : (
        <form className="signin-row" onSubmit={submit}>
          <label className="signin-label" htmlFor="signin-email">
            🔑 Already bought? Enter the email you paid with:
          </label>
          <input
            id="signin-email"
            className="select"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === 'sending'}
          />
          <button className="btn primary" type="submit" disabled={state === 'sending' || !email.trim()}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {onClose && (
            <button className="btn ghost" type="button" onClick={onClose}>
              Close
            </button>
          )}
        </form>
      )}
      {state === 'error' && (
        <p className="hint" style={{ color: 'var(--accent-2)', margin: '8px 0 0' }} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
