import { useState } from 'react';
import { HeroCar } from './HeroCar';
import { StyleShowcase } from './StyleShowcase';
import type { Pace } from '../lib/car3d/choreo';
import { InstallPanel } from './InstallPanel';
import { UsbInstructions } from './UsbInstructions';
import { QandA } from './QandA';
import { PRICE_DISPLAY } from '../lib/price';
import { startCheckout } from '../lib/checkout';
import type { InstallState } from '../hooks/useInstallPrompt';

interface Props {
  install: InstallState;
}

const PACES: { id: Pace; label: string }[] = [
  { id: 'chill', label: 'Chill' },
  { id: 'standard', label: 'Standard' },
  { id: 'max', label: 'Max' },
];

const STEPS = [
  { title: 'Add your song', desc: 'Drop in an MP3 or WAV, or paste a YouTube link to name the show. Nothing is uploaded anywhere.' },
  { title: 'Preview & customize', desc: 'Watch it dance on your exact Tesla model, pick Chill, Standard or Max, tune mirrors, windows and liftgate.' },
  { title: 'Download & install', desc: 'Copy the finished show to a USB stick and run it from Toybox → Light Show in the car.' },
];

export function Home({ install }: Props) {
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [open, setOpen] = useState<'install' | 'usb' | null>(null);
  const [pace, setPace] = useState<Pace>('standard');
  const [heroMode, setHeroMode] = useState<'photo' | '3d'>('photo');
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
          <h2>Your car, dancing to your song.</h2>
          <p className="hero-sub">
            Drop any track in and get a beat-synced Tesla light show — headlights, turn signals, even the mirrors and
            windows — timed to every kick, snare and drop. Built for the 2026 Model Y and every other Tesla.
          </p>
          <div className="hero-cta">
            {buyButton}
            <span className="hint">One-time payment · no subscription · runs on your device</span>
          </div>
          {buyError && (
            <p className="hint" style={{ color: 'var(--accent-2)' }}>
              {buyError}
            </p>
          )}
        </div>
        <div className="hero-car-wrap">
          <div className={`hero-media${heroMode === '3d' ? ' is-3d' : ''}`}>
            <HeroCar pace={pace} mode={heroMode} />
          </div>
          <div className="pace-chips" role="group" aria-label="Dance intensity">
            {PACES.map((p) => (
              <button key={p.id} className={`chip${pace === p.id ? ' on' : ''}`} aria-pressed={pace === p.id} onClick={() => setPace(p.id)}>
                {p.label}
              </button>
            ))}
            <button className="chip mode-chip" aria-pressed={heroMode === '3d'} onClick={() => setHeroMode(heroMode === '3d' ? 'photo' : '3d')}>
              {heroMode === '3d' ? '📷 Photo' : '🧊 Spin it in 3D'}
            </button>
          </div>
          <p className="hint hero-3d-hint">
            {heroMode === '3d' ? 'Generic 2026 Model Y · drag to spin · no sound, just the moves' : '2026 Model Y · no sound, just the moves'}
          </p>
        </div>
      </section>

      <StyleShowcase />

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

        <div className="sub-actions">
          <button className={`btn${open === 'install' ? ' on' : ''}`} onClick={() => setOpen(open === 'install' ? null : 'install')}>
            📲 Installing the app
          </button>
          <button className={`btn${open === 'usb' ? ' on' : ''}`} onClick={() => setOpen(open === 'usb' ? null : 'usb')}>
            📋 Detailed instructions
          </button>
        </div>
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
            <button className="btn ghost" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        )}
      </section>

      <QandA />
    </div>
  );
}
