import { describe, expect, it } from 'vitest';
import { durationMismatch, parseYouTubeId, youtubeWatchUrl } from '../src/lib/youtube';

describe('parseYouTubeId', () => {
  const id = 'dQw4w9WgXcQ';
  const good = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${id}`,
    `https://music.youtube.com/watch?v=${id}&list=RDAMVM123`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc123`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}?autoplay=1`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `youtube.com/watch?v=${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
    id,
  ];
  for (const url of good) {
    it(`accepts ${url.trim()}`, () => expect(parseYouTubeId(url)).toBe(id));
  }

  const bad = [
    '',
    'hello world',
    'https://vimeo.com/123456',
    'https://www.youtube.com/playlist?list=PL123456',
    'https://www.youtube.com/@RickAstleyYT',
    'https://www.youtube.com/watch?v=tooshort',
    'https://www.youtube.com/watch?v=waytoolongid123',
    'https://evil.example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
  ];
  for (const url of bad) {
    it(`rejects ${JSON.stringify(url)}`, () => expect(parseYouTubeId(url)).toBeNull());
  }

  it('builds a canonical watch url', () => {
    expect(youtubeWatchUrl(id)).toBe(`https://www.youtube.com/watch?v=${id}`);
  });
});

describe('durationMismatch', () => {
  it('flags different edits but tolerates small differences', () => {
    expect(durationMismatch(212, 214)).toBe(false);
    expect(durationMismatch(212, 250)).toBe(true);
    expect(durationMismatch(null, 250)).toBe(false);
    expect(durationMismatch(0, 250)).toBe(false);
  });
});
