const FAQ: [string, string][] = [
  ['Is this made or endorsed by Tesla?', 'No. Tesla Dance Revolution ("TDR") is an independent, fan-made tool and is not affiliated with, endorsed by, or sponsored by Tesla, Inc. "Tesla" and related names/marks belong to their respective owners.'],
  ['Who is responsible if something goes wrong?', 'You are. We take no responsibility for vehicle damage, injury, traffic or parking violations, or any other consequence of running a light show, and no responsibility for copyright issues arising from music, videos, or other content you choose to use. Only use songs you have the right to use, and always park with clearance before running a show with moving parts.'],
  ['Do I need an account?', 'No. Paying on Gumroad emails you a license key straight away. Paste it into the app to unlock this browser, and paste the same key on any other computer you use.'],
  ['Is this a subscription?', "No — one payment, forever. There's nothing to cancel."],
  ['Can I get a refund?', "No — all sales are final, so try the free demo on this page first; it runs the same engine that scores your songs. If your key won't unlock or a download fails, message us through your Gumroad receipt and we'll sort it out."],
  ['Can I share my license key?', 'One key unlocks up to three computers, enough for a laptop, a desktop and a replacement. Keys posted publicly stop working and may be disabled.'],
  ['What if it doesn’t work on my car?', "The generated file follows Tesla's own light-show format and is checked against the same rules Tesla's own validator uses before you download it. If something still looks wrong, try again — regenerating costs nothing."],
  ['Does my song get uploaded anywhere?', 'No. Everything — decoding, analysis, the preview, the exported files — runs on your device. Only the payment itself goes through Gumroad.'],
];

export function QandA() {
  return (
    <section className="panel qanda">
      <h2>Questions</h2>
      <dl>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
