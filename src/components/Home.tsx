import { useState } from 'react';
import { OptionsGallery } from './OptionsGallery';
import { DemoShowcase } from './DemoShowcase';
import { InstallPanel } from './InstallPanel';
import { UsbInstructions } from './UsbInstructions';
import { QandA } from './QandA';
import { SignIn } from './SignIn';
import { PRICE_DISPLAY } from '../lib/price';
import { startCheckout } from '../lib/checkout';
import type { InstallState } from '../hooks/useInstallPrompt';

interface Props {
  install: InstallState;
}

type Sub = 'install' | 'usb' | 'signin';

const SUBS: { id: Sub; icon: string; label: string; short: string }[] = [
  { id: 'signin', icon: '🔑', label: 'Already bought? Sign in', short: 'Sign in' },
  { id: 'usb', icon: '📋', label: 'Instructions & Q&A', short: 'Instructions & Q&A' },
  { id: 'install', icon: '📲', label: 'Installing the app', short: 'Install app' },
];

export function Home({ install }: Props) {
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [open, setOpen] = useState<Sub | null>(null);
  const [canceled, setCanceled] = useState(() => new URLSearchParams(window.location.search).get('canceled') === '1');
  /** Instructions and Installing take over the page; Sign in is a single line and stays inline. */
  const fullPage = open === 'usb' || open === 'install';

  const buy = async () => {
    setBuying(true);
    setBuyError(null);
    const result = await startCheckout();
    if (result.ok && result.url) {
      window.location.href = result.url;
      return;
    }
    setBuyError(result.message ?? 'Something went wrong.');
    setBuying(false);
  };


  return (
    <div className="home">
      <nav className="sub-actions sub-header" aria-label="Quick links">
        {SUBS.map((s) => (
          <button key={s.id} className={`btn${open === s.id ? ' on' : ''}`} aria-expanded={open === s.id} aria-label={s.label} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className="emoji" aria-hidden="true">
              {s.icon}
            </span>
            <span className="label-full">{s.label}</span>
            <span className="label-short">{s.short}</span>
          </button>
        ))}
      </nav>
      {open === 'signin' && (
        <div className="sub-panel">
          <SignIn onClose={() => setOpen(null)} />
        </div>
      )}
      {open === 'install' && (
        <div className="sub-panel">
          <InstallPanel install={install} onClose={() => setOpen(null)} />
        </div>
      )}
      {open === 'usb' && (
        <div className="sub-panel sub-stack">
          <div className="panel">
            <h3>Putting a finished show on your car</h3>
            <UsbInstructions />
          </div>
          <QandA />
          <button className="btn ghost" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}

      {canceled && !fullPage && (
        <div className="error">
          <div>Checkout was canceled — you were not charged. Ready when you are.</div>
          <button className="btn ghost" onClick={() => setCanceled(false)}>
            Dismiss
          </button>
        </div>
      )}

      <DemoShowcase hidden={fullPage} />

      {!fullPage && <OptionsGallery />}

      <section className="buy-section" id="pricing" hidden={fullPage}>
        <button className="btn primary big stacked" onClick={buy} disabled={buying}>
          <span>{buying ? 'Redirecting to secure checkout…' : `Buy now — ${PRICE_DISPLAY}`}</span>
          <small>One-time payment · no subscription</small>
        </button>
        {buyError && (
          <p className="hint" style={{ color: 'var(--accent-2)' }}>
            {buyError}
          </p>
        )}
      </section>
    </div>
  );
}
