/**
 * YouTube link helpers. We never download media from YouTube (their terms
 * forbid it and the car needs the audio file on the USB stick anyway); the
 * link is used to identify the song, preview it in the official embedded
 * player, name the show and sanity-check the audio file's duration.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract the 11-character video id from any common YouTube URL form. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (ID_RE.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, '');
  const check = (id: string | null | undefined) => (id && ID_RE.test(id) ? id : null);
  if (host === 'youtu.be') return check(url.pathname.split('/')[1]);
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'watch') return check(url.searchParams.get('v'));
  if (['shorts', 'embed', 'live', 'v', 'e'].includes(parts[0])) return check(parts[1]);
  return check(url.searchParams.get('v'));
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export interface LinkedVideo {
  id: string;
  url: string;
  title: string | null;
  author: string | null;
  /** Seconds, once the player has reported it. */
  duration: number | null;
}

/** True when the audio file is clearly a different edit than the video. */
export function durationMismatch(videoS: number | null, audioS: number, toleranceS = 5): boolean {
  if (videoS == null || videoS <= 0) return false;
  return Math.abs(videoS - audioS) > toleranceS;
}

// ---- IFrame Player API loader ----------------------------------------------

export interface YTPlayer {
  getVideoData(): { title: string; author: string; video_id: string };
  getDuration(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  host?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Load https://www.youtube.com/iframe_api once and resolve with the YT namespace. */
export function loadYouTubeApi(timeoutMs = 10000): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      apiPromise = null;
      reject(new Error('YouTube player did not load'));
    }, timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube player unavailable'));
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      apiPromise = null;
      reject(new Error('YouTube player script blocked'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}
