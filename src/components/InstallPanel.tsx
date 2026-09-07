import { useState } from 'react';
import type { InstallPlatform, InstallState } from '../hooks/useInstallPrompt';

interface Props {
  install: InstallState;
  onClose?: () => void;
}

const TABS: { id: InstallPlatform; label: string }[] = [
  { id: 'ios', label: 'iPhone / iPad' },
  { id: 'android', label: 'Android' },
  { id: 'desktop', label: 'Computer' },
];

export function InstallPanel({ install, onClose }: Props) {
  const [tab, setTab] = useState<InstallPlatform>(install.platform);
  if (install.installed) {
    return (
      <div className="panel install">
        <div className="songbar">
          <div>
            <h3 style={{ marginBottom: 4 }}>Installed</h3>
            <p className="hint" style={{ margin: 0 }}>
              You are running the installed app. It works offline; songs never leave your device.
            </p>
          </div>
          {onClose && (
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="panel install">
      <div className="songbar">
        <div>
          <h3 style={{ marginBottom: 4 }}>Get it as an app</h3>
          <p className="hint" style={{ margin: 0 }}>
            Installs like a normal app: its own icon, full screen, works offline. Not just a browser shortcut.
          </p>
        </div>
        <div className="chips">
          {install.canInstall && (
            <button className="btn primary" onClick={() => void install.promptInstall()}>
              ⬇ Install now
            </button>
          )}
          {onClose && (
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
      <div className="seg" role="tablist" style={{ marginTop: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ios' && (
        <ol className="steps-list">
          <li>
            Open this page in <b>Safari</b> (other iPhone browsers cannot install apps).
          </li>
          <li>
            Tap the <b>Share</b> button (the square with an arrow at the bottom of the screen).
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>Open “Light Show” from your home screen. It runs full screen and offline.</li>
        </ol>
      )}
      {tab === 'android' && (
        <ol className="steps-list">
          <li>
            Open this page in <b>Chrome</b> (Edge and Samsung Internet work too).
          </li>
          <li>
            {install.canInstall ? (
              <>
                Tap <b>Install now</b> above, or
              </>
            ) : (
              <>Wait a moment for the install banner, or</>
            )}{' '}
            tap the <b>⋮ menu</b> and choose <b>Install app</b> (older versions say “Add to Home screen”, then “Install”).
          </li>
          <li>Confirm. The app appears in your app drawer and home screen like any other app.</li>
        </ol>
      )}
      {tab === 'desktop' && (
        <ol className="steps-list">
          <li>
            In <b>Chrome</b> or <b>Edge</b>, click the install icon at the right end of the address bar (a monitor with a down arrow).
          </li>
          <li>
            Or open the browser menu and choose <b>Install Tesla Dance Revolution</b> / <b>Apps → Install this site as an app</b>.
          </li>
          <li>It opens in its own window and shows up in your Start menu, Dock or Launchpad.</li>
        </ol>
      )}
      <p className="hint">
        Tip: on a phone, save the song file to your device first (Files app or Downloads), then pick it in the app. The finished show downloads as a zip you can
        copy to a USB stick from a computer.
      </p>
    </div>
  );
}
