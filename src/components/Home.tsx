import { useState } from 'react';
import { OptionsPeek } from './OptionsPeek';
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

const SUBS: { id: Sub; label: string }[] = [
  { id: 'signin', label: '🔑 Already bought? Sign in' },
  { id: 'usb', label: '📋 Instructions & Q&A' },
  { id: 'install', label: '📲 Installing the app' },
];

const STEPS = [
  { title: 'Add your song', desc: 'Drop in an MP3 or WAV, or paste a YouTube link to name the show. Nothing is uploaded anywhere.' },
  { title: 'Preview & customize', desc: 'Watch it dance on your exact Tesla model, pick Chill, Standard or Max, tune mirrors, windows and liftgate.' },
  { title: 'Download & install', desc: 'Copy the finished show to a USB stick and run it from Toybox → Light Show in the car.' },
];

export function Home({ install }: Props) {
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [open, setOpen] = useState<Sub | null>(null);
  const [canceled, setCanceled] = useState(() => new URLSearchParams(window.location.search).get('canceled') === '1');

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

  const buyButton = (
    <button className="btn primary big" onClick={buy} disabled={buying}>
      {buying ? 'Redirecting to secure checkout…' : `Buy now — ${PRICE_DISPLAY}`}
    </button>
  );

  return (
    <div className="home">
      <nav className="sub-actions sub-header" aria-label="Quick links">
        {SUBS.map((s) => (
          <button key={s.id} className={`btn${open === s.id ? ' on' : ''}`} aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
            {s.label}
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
        <div className="sub-panel panel">
          <h3>Putting a finished show on your car</h3>
          <UsbInstructions />
          <p className="hint">
            Supported: Model S (2021+), Model 3, Model X (2021+), Model Y, Cybertruck on software 2021.44.25 or newer.
            Several shows on one stick need 2023.44.25+. Park with room around the car before running a show with moving
            parts.
          </p>
          <QandA />
          <button className="btn ghost" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}

      {canceled && (
        <div className="error">
          <div>Checkout was canceled — you were not charged. Ready when you are.</div>
          <button className="btn ghost" onClick={() => setCanceled(false)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="hero">
        <div className="hero-copy">
          <h2>Your car, dancing</h2>
          <p className="hero-sub">Drop any track in and get a beat-synced light show</p>
          <div className="hero-cta">
            <button className="btn primary big stacked" onClick={buy} disabled={buying}>
              <span>{buying ? 'Redirecting to secure checkout…' : `Buy now — ${PRICE_DISPLAY}`}</span>
              <small>One-time payment · no subscription</small>
            </button>
          </div>
          {buyError && (
            <p className="hint" style={{ color: 'var(--accent-2)' }}>
              {buyError}
            </p>
          )}
        </div>
        <OptionsPeek />
      </section>

      <DemoShowcase />

      <section className="panel steps-section">
        <h2>It's this easy</h2>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <b>
                {i + 1}. {s.title}
              </b>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel pricing-hero" id="pricing">
        <p className="eyebrow">One-time purchase · no subscription</p>
        <h2>
          Unlock it for <span className="price-accent">{PRICE_DISPLAY}</span>
        </h2>
        <ul className="check-list pricing-list">
          <li>Add your own songs and generate unlimited shows</li>
          <li>Any Tesla model, year and market</li>
          <li>Every style from Chill to Max, fully tunable</li>
          <li>Mirrors, windows, liftgate and door handles — your call</li>
          <li>Download the .fseq, the ready-made zip and the audio file</li>
          <li>Unlocked forever on this browser — no watermark</li>
        </ul>
        {buyButton}
        {buyError && (
          <p className="hint" style={{ color: 'var(--accent-2)' }}>
            {buyError}
          </p>
        )}
        <p className="hint">Secure checkout by Stripe. Your song and show never leave your device — only the payment does.</p>
      </section>
    </div>
  );
}
