# Tesla Dance Revolution (TDR)

Drop in a song and get a Tesla Light Show generated from its beats. Everything
runs in the browser: the audio never leaves your device, and the result is a
ready-to-copy `LightShow` folder (`.fseq` + `.wav`/`.mp3`) for a USB stick.

The home page (`/`) is the storefront: an animated red Model Y dancing in the
hero, a swipeable Chill / Standard / Max showcase, the three-step process,
the price with a buy button, "Installing the app" and "Detailed instructions"
sub-panels, and a Q&A with the non-affiliation / no-liability notice. Once a
purchase is verified the same URL turns into the tool itself.

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

## Deploy

The site itself is static (`dist/`), but selling the full version needs two
small serverless functions under `api/`, so Vercel is the easiest host —
import the repository at <https://vercel.com/new> (it picks up `vercel.json`
and builds `api/*.ts` automatically) or deploy from the CLI:

```sh
npx vercel --prod
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/dolab080-star/TDR-App)

## Selling the app

The whole tool — adding a song, the preview, vehicle and closure settings,
and downloading the finished show — unlocks with a single one-time purchase
handled by Stripe Checkout. There's no account system: "buying" unlocks the
browser that completed checkout, the same local-first spirit as the rest of
the app, and the confirmation link doubles as a receipt that unlocks a new
device.

To turn payments on:

1. Create a [Stripe](https://dashboard.stripe.com/register) account (test
   mode works for trying this out — no real charges).
2. **Product catalog → Add product.** Name it (e.g. "Tesla Dance Revolution
   — Full Unlock"), set a **one-time** price of **$6.90** (the app shows
   `$6.90` from `src/lib/price.ts` — keep that constant in sync with whatever
   you charge). Copy the price's ID (`price_...`).
3. **Developers → API keys.** Copy the **secret key** (`sk_test_...` or
   `sk_live_...`) — only the secret key is needed; nothing Stripe-related
   runs in the browser.
4. In your Vercel project: **Settings → Environment Variables**, add:
   - `STRIPE_SECRET_KEY` = the secret key from step 3
   - `STRIPE_PRICE_ID` = the price ID from step 2

   (`.env.example` lists these for reference — don't commit real keys.)
5. Redeploy (env var changes need a new deployment to take effect).
6. Test the whole flow in Stripe test mode with card `4242 4242 4242 4242`,
   any future expiry/CVC, before switching to a live secret key.

Until those env vars are set, the home page's buy button shows "Payments
aren't set up yet" instead of failing silently.

To try the unlocked tool locally without paying, paste this in the browser
console and reload:

```js
localStorage.setItem('tesla-lightshow-maker.license.v1', JSON.stringify({ licensed: true, sessionId: 'cs_test_local', purchasedAt: Date.now() }));
```

`api/create-checkout-session.ts` starts a Checkout Session and redirects to
Stripe; `api/verify-purchase.ts` confirms the session actually paid before
the client unlocks anything in `localStorage` (see `src/lib/license.ts`) —
a `?session_id=` alone is never trusted as proof of payment.

## Develop

```sh
npm ci             # .npmrc enables legacy-peer-deps for you
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

Format reference: <https://github.com/teslamotors/light-show>.

Tesla Dance Revolution is an independent, fan-made tool — not affiliated
with, endorsed by, or sponsored by Tesla, Inc. Use at your own risk: no
responsibility is accepted for vehicle damage, injury, or copyright issues
arising from its use. Park with clearance around the car before running a
show with moving parts.
