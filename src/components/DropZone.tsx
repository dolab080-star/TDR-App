import { useRef, useState, type DragEvent } from 'react';

interface Props {
  onFile: (file: File) => void;
  onDemo: () => void;
  disabled?: boolean;
  /** Override the headline, e.g. when a YouTube link has been attached. */
  heading?: string;
  /** Hide the explanatory steps (used once a link has been attached). */
  compact?: boolean;
  /** Hide the demo button, e.g. when a specific song is already linked. */
  hideDemo?: boolean;
}

export function DropZone({ onFile, onDemo, disabled, heading, compact, hideDemo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div>
      <div
        className={`dropzone${active ? ' active' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        aria-label="Choose a song"
      >
        <div className="icon">🎵</div>
        <h2>{heading ?? 'Drop a song here'}</h2>
        <p>MP3, WAV, M4A, FLAC, OGG… anything your browser can play. Nothing is uploaded; everything runs on this device.</p>
        {!hideDemo && (
          <>
            <p className="or">or</p>
            <button
              className="btn demo"
              onClick={(e) => {
                e.stopPropagation();
                onDemo();
              }}
              disabled={disabled}
            >
              ▶ Try it with a built-in demo beat
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {!compact && (
      <div className="steps">
        <div className="step">
          <b>1. Pick a song</b>
          <span>We find the tempo, beats, bars, kicks, snares, hi-hats and the loud and quiet sections.</span>
        </div>
        <div className="step">
          <b>2. Preview the show</b>
          <span>Watch the lights dance on the car, tweak the style and which closures may move.</span>
        </div>
        <div className="step">
          <b>3. Copy to a USB stick</b>
          <span>Download a ready-made LightShow folder, plug it in, then Toybox → Light Show → Schedule Show.</span>
        </div>
      </div>
      )}
    </div>
  );
}
