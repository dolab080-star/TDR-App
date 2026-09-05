import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loadYouTubeApi, parseYouTubeId, youtubeWatchUrl, ytErrorMessage, type LinkedVideo, type YTErrorCode, type YTPlayer } from '../lib/youtube';
import { formatDuration } from '../lib/tesla/validator';

interface Props {
  video: LinkedVideo | null;
  onVideo: (v: LinkedVideo | null) => void;
  /** Keep the metadata lookup running while true, without showing the panel. */
  hidden?: boolean;
}

const ERROR_ID = 'yt-link-error';

export function YouTubeLink({ video, onVideo, hidden }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [errorCode, setErrorCode] = useState<YTErrorCode | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(text);
    if (!id) {
      setError('That does not look like a YouTube link. Try the share link from the video page.');
      return;
    }
    setError(null);
    onVideo({ id, url: youtubeWatchUrl(id), title: null, author: null, duration: null });
  };

  // Focus the new panel's heading once a video is linked, so keyboard/SR users
  // land somewhere sensible after the form is replaced.
  useEffect(() => {
    if (video) titleRef.current?.focus();
  }, [video?.id]);

  // Mount the official player for the linked video and read its metadata.
  // This effect is keyed only on the video id and Props.hidden is cosmetic
  // (see App.tsx), so the lookup survives the caller navigating away from the
  // "idle" screen (e.g. the user drops the audio file before the title loads).
  useEffect(() => {
    if (!video || !mountRef.current) return;
    let cancelled = false;
    setPlayerState('loading');
    setErrorCode(undefined);
    const mount = mountRef.current;
    mount.innerHTML = '';
    const holder = document.createElement('div');
    mount.appendChild(holder);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(holder, {
          videoId: video.id,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: (ev) => {
              if (cancelled) return;
              const data = ev.target.getVideoData();
              const duration = ev.target.getDuration();
              setPlayerState('ready');
              onVideo({
                id: video.id,
                url: video.url,
                title: data?.title || null,
                author: data?.author || null,
                duration: duration > 0 ? duration : null,
              });
            },
            onError: (ev) => {
              if (cancelled) return;
              setErrorCode(ev.data);
              setPlayerState('failed');
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setPlayerState('failed');
      });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* player may already be gone */
      }
      playerRef.current = null;
      mount.innerHTML = '';
    };
    // Only re-run when the video id changes, not when metadata arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  if (!video) {
    if (hidden) return null;
    return (
      <div className="panel yt">
        <h3>Start from a YouTube link</h3>
        <form className="yt-form" onSubmit={submit}>
          <input
            ref={inputRef}
            className="select"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="YouTube link"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
          />
          <button className="btn primary" type="submit">
            Link song
          </button>
        </form>
        {error && (
          <p id={ERROR_ID} className="hint yt-error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          We use the link to preview the song, name the show and check your audio file matches. YouTube does not allow apps to
          download the audio, and the car plays the song from the USB stick, so you will still add the audio file itself.
        </p>
      </div>
    );
  }

  const titleKnown = video.title != null;
  return (
    <div className="panel yt" hidden={hidden}>
      <div className="songbar">
        <div aria-live="polite">
          <h3 style={{ marginBottom: 4 }} ref={titleRef} tabIndex={-1}>
            Linked song
          </h3>
          <div className="title">{video.title ?? (playerState === 'loading' ? 'Loading title…' : 'YouTube video')}</div>
          <div className="meta">
            {video.author && <>{video.author} · </>}
            {video.duration != null && <>{formatDuration(video.duration).replace(/\.\d+$/, '')} · </>}
            <a href={video.url} target="_blank" rel="noreferrer">
              Open on YouTube
            </a>
          </div>
        </div>
        <button
          className="btn ghost"
          onClick={() => {
            onVideo(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          Change link
        </button>
      </div>
      <div className="yt-player" ref={mountRef} />
      {playerState === 'failed' && (
        <p className="hint yt-error" role="status">
          {ytErrorMessage(errorCode)} {titleKnown ? 'The link is still used for naming.' : 'Your show will be named after the audio file instead.'}
        </p>
      )}
      <p className="hint" role="status">
        <b>Next:</b> drop the audio file for this song below, for example the MP3 you bought or ripped from your own CD. Use the
        same version as the video so the lights line up.
      </p>
    </div>
  );
}
