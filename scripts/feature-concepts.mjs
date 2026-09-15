// Editorial UI illustrations of capabilities OpenShifts actually has.
//
// These are recreated HTML/SVG fragments, never screenshots and never proposed
// screens. The shape is deliberate: a few small cards carrying a single number
// or sentence each, overlapping, with a focal disc bridging them. A shrunken
// app window would be unreadable at carousel size and would say less.
//
// Every value below maps to something the app really stores: a change row and
// its notice hours, an availability window, a swap decision with a timestamp,
// a week cost against a budget.

const glyphs = {
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h13a4 4 0 0 1 0 8h-1M17 20l4-4-4-4"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Zm14 6h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
};
const icon = (name, size = 40) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`;

const tile = (name, tone) => `<span class="tile ${tone}">${icon(name)}</span>`;
const pill = (text, tone = 'grey') => `<span class="pill ${tone}">${text}</span>`;
const disc = (inner, tone = 'coral') => `<span class="disc ${tone}">${inner}</span>`;

export const conceptStyles = `
.concept{--wash:#f3ded9;background:#faf7f5;color:#241f1f}
.concept.conflicts{--wash:#f4e3c4;background:#faf7f1}
.concept.swaps{--wash:#dbe2f2;background:#f4f6fb}
.concept.cost{--wash:#d8e8dd;background:#f4f8f5}
.concept:before{content:"";position:absolute;left:700px;top:120px;width:900px;height:820px;background:radial-gradient(ellipse,var(--wash),transparent 68%);filter:blur(14px)}
.concept .brand{right:80px;top:58px;color:#3a3231;font-size:19px}.concept .brand img{width:31px;height:31px}
.concept .eyebrow{top:70px;left:80px;letter-spacing:1.8px;font-size:15px;color:#8a7b74}
.concept .copy{position:absolute;left:80px;top:300px;width:540px;z-index:6}
.concept .copy h1{position:static;margin:0;font-size:72px;line-height:1.05;letter-spacing:-3.2px;font-weight:650;white-space:pre-line}
.concept .copy p{font-size:24px;line-height:1.5;color:#6b625f;max-width:440px;margin:26px 0 0}

/* A card is one fact. Label, value, and at most one piece of state. */
.mini{position:absolute;background:#fff;border-radius:30px;padding:30px 34px;z-index:2;
  box-shadow:0 2px 3px #36292906,0 14px 30px -14px #36292926,0 44px 68px -40px #36292945}
.mini .k{font-size:23px;color:#8c8582;font-weight:500;line-height:1.3}
.mini .v{font-size:52px;font-weight:600;letter-spacing:-2px;line-height:1.15;margin-top:8px;font-variant-numeric:tabular-nums}
.mini .v.sm{font-size:38px;letter-spacing:-1.2px}
.mini .s{font-size:23px;line-height:1.4;margin-top:10px;font-weight:500}
.mini .row{display:flex;align-items:center;justify-content:space-between;gap:18px}
.tile{display:grid;place-items:center;width:80px;height:80px;border-radius:24px;margin-bottom:22px}
.tile.lilac{background:#e6e2f2;color:#4b3f7a}.tile.mint{background:#cdeedd;color:#1f6444}
.tile.amber{background:#f8e7c4;color:#7d5f2e}.tile.rose{background:#f7dedd;color:#8f4149}
.tile.sky{background:#d9e5f7;color:#33527f}
.pill{display:inline-flex;align-items:center;gap:8px;border-radius:14px;padding:9px 16px;font-size:21px;font-weight:600;white-space:nowrap}
.pill.grey{background:#f2efed;color:#6b625f}.pill.mint{background:#cdeedd;color:#1f6444}
.pill.amber{background:#f8e7c4;color:#7d5f2e}.pill.rose{background:#f9d9d8;color:#993c40}
.pill.sky{background:#dbe6f8;color:#33527f}
/* The disc bridges the cards, the way a portrait does in the reference. */
.disc{position:absolute;display:grid;place-items:center;border-radius:50%;z-index:5;
  box-shadow:0 18px 40px -18px #36292955, 0 0 0 10px #ffffff}
.disc.coral{background:linear-gradient(150deg,#e9536b,#c8283f);color:#fff}
.disc.sky{background:linear-gradient(150deg,#5b7fd6,#2f4f9e);color:#fff}
.disc.mint{background:linear-gradient(150deg,#4fa377,#2b7350);color:#fff}
.disc .initials{font-size:74px;font-weight:600;letter-spacing:-2px}
.disc .pair{display:flex;align-items:center;gap:-10px}
.stack{position:absolute;z-index:5;display:flex;align-items:center}
.stack .av{width:132px;height:132px;border-radius:50%;display:grid;place-items:center;font-size:46px;font-weight:600;color:#fff;box-shadow:0 0 0 9px #fff,0 16px 34px -16px #36292955}
.stack .av.a{background:linear-gradient(150deg,#e9536b,#c8283f)}
.stack .av.b{background:linear-gradient(150deg,#5b7fd6,#2f4f9e);margin-left:-34px}
.bar{height:12px;border-radius:7px;background:#f0edec;margin-top:16px;overflow:hidden}
.bar span{display:block;height:100%;border-radius:7px;background:#4fa377}
`;

/**
 * The card that carries the product's whole argument, shared with the cover so
 * the README and the first carousel slide say the same thing in the same shape.
 */
export const renderChangeLog = () => `<section class="mini changelog" aria-label="Conceptual record of a change made after publishing">
  <div class="k">Changed after publishing</div>
  <div class="s">Fri 06:00–14:00 moved from Alex to Sam.</div>
  <div class="row" style="margin-top:20px">${pill('Ric · 2h ago')}${pill('9h notice', 'amber')}</div>
</section>`;

const concepts = {
  publish: () => `
    <section class="mini m1" aria-label="Conceptual published week">
      ${tile('send', 'lilac')}
      <div class="k">Published</div>
      <div class="v">Mon 09:12</div>
    </section>
    <section class="mini m2" aria-label="Conceptual count of changes since publishing">
      <div class="k">Changes since publishing</div>
      <div class="v">1</div>
      <div class="row" style="margin-top:16px">${pill('Shown on the team’s page', 'sky')}</div>
    </section>
    ${disc('<span class="initials">RP</span>')}
    <section class="mini m3" aria-label="Conceptual notice given">
      <div class="k">Notice given</div>
      <div class="v">9h</div>
    </section>
    <section class="mini m4" aria-label="Conceptual change entry">
      <div class="k">What changed</div>
      <div class="s">Fri 06:00–14:00 moved from Alex Moss to Sam Doyle.</div>
      <div class="row" style="margin-top:18px">${pill('Ric Pallaoro')}${pill('2h ago')}</div>
    </section>`,

  conflicts: () => `
    <section class="mini m1" aria-label="Conceptual stated availability">
      ${tile('ban', 'rose')}
      <div class="k">Priya said</div>
      <div class="v sm">Wed 13:00–23:00</div>
      <div class="row" style="margin-top:16px">${pill('Can’t work', 'rose')}</div>
    </section>
    <section class="mini m2" aria-label="Conceptual conflict raised at assignment">
      <div class="row"><div class="k">Assigning</div>${pill('Blocked', 'rose')}</div>
      <div class="v sm">Wed 14:00–19:00</div>
    </section>
    ${disc('<span style="font-size:96px">' + icon('alert', 96) + '</span>', 'coral')}
    <section class="mini m3" aria-label="Conceptual rest rule warning">
      ${tile('clock', 'amber')}
      <div class="k">Rest after a close</div>
      <div class="v">7h</div>
      <div class="row" style="margin-top:14px">${pill('Rule is 11h', 'amber')}</div>
    </section>
    <section class="mini m4" aria-label="Conceptual conflict message">
      <div class="k">Before the week goes out</div>
      <div class="s">Priya Raman said they are not available 13:00–23:00 on this day.</div>
    </section>`,

  swaps: () => `
    <section class="mini m1" aria-label="Conceptual shift offered up">
      <div class="k">Offered up</div>
      <div class="v sm">Alex Moss</div>
      <div class="row" style="margin-top:14px">${pill('Tue 09:12')}</div>
    </section>
    <section class="mini m2" aria-label="Conceptual shift claimed">
      <div class="row"><div><div class="k">Claimed by</div><div class="v sm">Sam Doyle</div></div>${pill('Tue 11:40', 'sky')}</div>
    </section>
    <div class="stack"><span class="av a">AM</span><span class="av b">SD</span></div>
    <section class="mini m3" aria-label="Conceptual shift changing hands">
      ${tile('swap', 'sky')}
      <div class="k">The shift</div>
      <div class="v sm">Sat 17:00–22:00</div>
    </section>
    <section class="mini m4" aria-label="Conceptual swap approval">
      <div class="row"><div><div class="k">Approved by</div><div class="v sm">Ric Pallaoro</div></div>${pill('✓ Tue 14:02', 'mint')}</div>
      <div class="s" style="color:#8c8582;font-weight:400">Written into the week’s record.</div>
    </section>`,

  cost: () => `
    <section class="mini m1" aria-label="Conceptual scheduled hours">
      ${tile('calendar', 'lilac')}
      <div class="k">Scheduled</div>
      <div class="v">80.5h</div>
    </section>
    <section class="mini m2" aria-label="Conceptual overtime rule">
      <div class="row"><div><div class="k">Overtime after</div><div class="v">40h</div></div>${pill('1.5×', 'grey')}</div>
    </section>
    ${disc('<span>' + icon('wallet', 96) + '</span>', 'mint')}
    <section class="mini m3" aria-label="Conceptual wage cost against budget">
      <div class="k">Wage cost</div>
      <div class="v">£1,082</div>
      <div class="bar"><span style="width:77%"></span></div>
      <div class="row" style="margin-top:14px"><span class="k" style="font-size:20px">of £1,400</span>${pill('Within budget', 'mint')}</div>
    </section>
    <section class="mini m4" aria-label="Conceptual per-person cost line">
      <div class="k">Alex Moss</div>
      <div class="row"><div class="v sm">30.5h</div>${pill('£460', 'grey')}</div>
    </section>`,
};

// Positions live per concept so each cluster can breathe differently while
// keeping the same 2x2-with-a-bridge reading order.
export const conceptLayout = `
.publish .m1{left:690px;top:168px;width:390px}
.publish .m2{left:1150px;top:288px;width:390px}
.publish .disc{left:930px;top:398px;width:284px;height:284px}
.publish .m3{left:668px;top:548px;width:304px}
.publish .m4{left:1006px;top:672px;width:534px}

.conflicts .m1{left:672px;top:172px;width:400px}
.conflicts .m2{left:1120px;top:240px;width:420px}
.conflicts .disc{left:968px;top:372px;width:290px;height:290px}
.conflicts .m3{left:660px;top:556px;width:360px}
.conflicts .m4{left:1052px;top:668px;width:490px}

.swaps .m1{left:700px;top:180px;width:360px}
.swaps .m2{left:1108px;top:228px;width:432px}
.swaps .stack{left:952px;top:392px}
.swaps .m3{left:668px;top:548px;width:370px}
.swaps .m4{left:1054px;top:640px;width:488px}

.cost .m1{left:700px;top:176px;width:340px}
.cost .m2{left:1092px;top:228px;width:448px}
.cost .disc{left:948px;top:360px;width:286px;height:286px}
.cost .m3{left:660px;top:544px;width:440px}
.cost .m4{left:1140px;top:672px;width:400px}
`;

export function renderConcept(id) {
  if (!Object.hasOwn(concepts, id)) throw new Error(`Unknown feature concept: ${id}`);
  return concepts[id]();
}
