import { restoreUrl, type License } from '../lib/license';
import type { PurchaseCheck } from '../hooks/useLicense';

interface Props {
  status: PurchaseCheck;
  license: License;
  onDismiss: () => void;
}

export function PurchaseBanner({ status, license, onDismiss }: Props) {
  if (status === 'idle') return null;

  if (status === 'checking') {
    return (
      <div className="progress" role="status">
        <div className="title">Confirming your purchase…</div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="error">
        <div>
          ⚠ We couldn't confirm that purchase. If you were charged, reload this exact page — Stripe can take a few seconds to
          finalize it.
        </div>
        <button className="btn ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  }

  const url = restoreUrl(license);
  return (
    <div className="purchase-ok">
      <div>
        <b>✅ Purchase confirmed — downloads are unlocked on this browser.</b>
        {url && (
          <p className="hint">
            Save this link to unlock on another device — it doubles as your receipt: <code>{url}</code>
          </p>
        )}
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
