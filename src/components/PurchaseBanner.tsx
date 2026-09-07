import type { License } from '../lib/license';
import type { Activation } from '../hooks/useLicense';

interface Props {
  activation: Activation;
  license: License;
  onDismiss: () => void;
}

export function PurchaseBanner({ activation, license, onDismiss }: Props) {
  if (activation.status === 'idle' || activation.status === 'failed') return null;

  if (activation.status === 'checking') {
    return (
      <div className="progress" role="status">
        <div className="title">Checking your license key…</div>
      </div>
    );
  }

  return (
    <div className="purchase-ok">
      <div>
        <b>✅ Unlocked — everything is yours on this browser.</b>
        <p className="hint">
          Keep your license key{license.key ? <> (<code>{license.key}</code>)</> : null}; it is in your Gumroad receipt email and unlocks any other computer
          too.
        </p>
      </div>
      <div className="chips">
        <button className="btn ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
