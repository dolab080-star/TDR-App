import { restoreUrl, type License } from '../lib/license';
import type { PurchaseCheck } from '../hooks/useLicense';

interface Props {
  status: PurchaseCheck;
  license: License;
  onDismiss: () => void;
}

export function PurchaseBanner({ status, license, onDismiss }: Props) {
  if (status === 'idle') return null;

  if (status === 'checking' || status === 'signin-checking') {
    return (
      <div className="progress" role="status">
        <div className="title">{status === 'checking' ? 'Confirming your purchase…' : 'Signing you in…'}</div>
      </div>
    );
  }

  if (status === 'failed' || status === 'signin-failed') {
    return (
      <div className="error">
        <div>
          {status === 'failed'
            ? "⚠ We couldn't confirm that purchase. If you were charged, reload this exact page — Stripe can take a few seconds to finalize it."
            : '⚠ That sign-in link is invalid or has expired (links work for one hour). Request a new one from "Already bought? Sign in" below.'}
        </div>
        <button className="btn ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  }

  if (status === 'signin-confirmed') {
    return (
      <div className="purchase-ok">
        <div>
          <b>✅ Welcome back — you're signed in on this browser.</b>
          <p className="hint">To use it on another computer, just sign in there with the same email.</p>
        </div>
        <div className="chips">
          <button className="btn ghost" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const url = restoreUrl(license);
  return (
    <div className="purchase-ok">
      <div>
        <b>✅ Purchase confirmed — everything is unlocked on this browser.</b>
        <p className="hint">
          On another computer, choose "Already bought? Sign in" and enter {license.email ? <b>{license.email}</b> : 'the email you used at checkout'} —
          we'll email you a sign-in link.
          {url && (
            <>
              {' '}
              Your receipt link also works: <code>{url}</code>
            </>
          )}
        </p>
      </div>
      <div className="chips">
        {url && (
          <button className="btn" onClick={() => void navigator.clipboard?.writeText(url)}>
            Copy link
          </button>
        )}
        <button className="btn ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
