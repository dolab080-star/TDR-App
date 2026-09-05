# Tesla Light Show Maker

Drop in a song and get a Tesla Light Show generated from its beats. Everything
runs in the browser: the audio never leaves your device, and the result is a
ready-to-copy `LightShow` folder (`.fseq` + `.wav`/`.mp3`) for a USB stick.

## How it works

1. **Decode** the song with the Web Audio API at 44.1 kHz (Tesla's required rate).
2. **Analyse** it in a Web Worker:
   - log-frequency spectrogram and spectral flux (onset strength),
   - tempo via autocorrelation with a tempo prior and octave correction,
   - beats via the Ellis dynamic-programming tracker (the librosa formulation),
   - downbeats by scoring the four bar phases on low-frequency hits and spectral change,
   - kick / snare / hi-hat onsets from three frequency bands,
   - song structure via a Foote novelty curve over bar-level features, labelled
     quiet / groove / loud, with build detection before louder sections.
3. **Choreograph** a 48-channel, 20 ms/frame show. Each section gets a program by
   energy tier that assigns roles to light groups: brake lights on kicks, fogs on
   snares, signature lights on hi-hats, turn signals alternating or chasing around
   the car on beats, plate/reverse on downbeats, Channels 4–6 as a decaying glow or
   slow breathing, headlights on drops. Builds speed up strobes into a half-beat
   blackout and an all-on hit; the finale is an all-on flash with a two-second fade.
4. **Export** an FSEQ v2.0 uncompressed file that passes Tesla's `validator.py`
   rules, plus the audio, zipped into a `LightShow` folder with instructions.

Only the exact xLights value codes the vehicle understands are emitted
(on/off, 500/1000/2000 ms ramps, closure Open/Dance/Close/Stop), Aux Park and
Side Markers are driven as one group because Model 3/Y OR them together, and
Channel 4 is always written with Channels 5/6 because it sets their ramp.

### Moving parts

Closures are opt-in and conservative. Defaults: charge port (open, rainbow LED,
close) and mirrors (fold on drops, unfold after). Optional: windows (one dance
episode ≤ 20 s, then close), liftgate (open at start, one dance, close at the
end) and Model S door handles. Falcon and front doors are never commanded.
Command counts stay within the per-show limits from Tesla's README, and the
"must be open before it can dance" and travel-time rules are respected.

## Develop

```sh
npm install --legacy-peer-deps
npm run dev        # http://localhost:5173
npm test           # vitest: fseq encoder, validator, generator, beat tracker
npm run build      # typecheck + production build in dist/
```

The `src/lib` folder is pure TypeScript with no DOM dependencies, so the
analysis and generator run identically in Node (tests) and in the worker.

- `src/lib/tesla` – channel map, value codes, FSEQ writer/reader, validator
- `src/lib/audio` – FFT, features, onsets, tempo/beat tracking, sections, pipeline
- `src/lib/show` – frame buffer, choreography, closures, preview simulation
- `src/lib/export` – WAV encoder, container sniffing, zip packaging
- `src/lib/demo` – a synthesized demo track so the app can be tried instantly

## Playing a show on the car

1. Format a USB stick as exFAT or FAT32 (not NTFS).
2. Copy the `LightShow` folder from the zip to the root of the stick. It must
   contain matching `name.fseq` and `name.wav`/`name.mp3` files.
3. No `TeslaCam` folder or firmware/map update files on the stick.
4. Plug it into a front USB / USB-C or glovebox port, wait a few seconds.
5. Toybox → Light Show → Schedule Show, pick the custom show.

Supported: Model S (2021+), Model 3, Model X (2021+), Model Y, Cybertruck on
software 2021.44.25+. Several shows on one stick need 2023.44.25+.

Format reference: <https://github.com/teslamotors/light-show>. Not affiliated
with Tesla. Park with clearance around the car before running a show with
moving parts.
