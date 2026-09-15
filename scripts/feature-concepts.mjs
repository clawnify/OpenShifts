// Editorial UI illustrations of capabilities OpenShifts actually has.
//
// Recreated HTML/SVG, never screenshots and never proposed screens. The shape
// follows the shared process: one main floating panel, one smaller related
// panel overlapping it with a clear front-to-back order, enlarged labels and
// simplified content so it reads at carousel size.
//
// Each one shows an INTERACTION rather than a static screen: a cursor at the
// point of the click, the drag, or the edit, with the control in its pressed or
// active state. A still panel says what exists; a cursor says what you do.
//
// Every value maps to something the app really stores: a `changes` row and its
// notice hours, an `availability` window, a `swaps` decision with its
// timestamp, a week cost against `weeks.budget`.

const glyphs = {
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h13a4 4 0 0 1 0 8h-1M17 20l4-4-4-4"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Zm14 6h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`;

const badge = (text, tone = 'grey') => `<span class="badge ${tone}">${text}</span>`;
const avatar = (initials, tone = '') => `<span class="av ${tone}">${initials}</span>`;

/**
 * Pointers, drawn rather than imported so they stay sharp at any size and carry
 * a white keyline that reads over a tinted cell, an ink button and white alike.
 *
 * Use the cursor the action would actually show. An arrow over a shift being
 * dragged is wrong in the same way a hand over a button would be, and it is the
 * detail that decides whether the illustration reads as an interaction at all.
 * The hotspots differ: the arrow points from its top-left, the closed hand
 * grips from its centre, so they are positioned against different anchors.
 */
const CURSORS = {
  // Clicking: the standard arrow.
  arrow: `<svg width="46" height="54" viewBox="0 0 24 28">
    <path d="M3.2 2.1 19.4 12.4l-7.05 1.16 3.86 8.06-3.2 1.53-3.86-8.06-4.35 4.62z"
      fill="#ffffff" stroke="#1b1a19" stroke-width="1.7" stroke-linejoin="round"/>
  </svg>`,
  // Dragging: the closed hand, mid-grip.
  grabbing: `<svg width="52" height="54" viewBox="0 0 24 25">
    <path d="M5 12.4c0-1.1 1-1.9 2-1.6l.9.3V8.3a1.6 1.6 0 0 1 3.2 0v-.6a1.6 1.6 0 0 1 3.2 0v.8a1.6 1.6 0 0 1 3.2 0v6a5.9 5.9 0 0 1-5.9 5.9h-1.1c-2.7 0-4.7-1.4-5.8-3.8l-1.3-3a2 2 0 0 1-.4-1.2z"
      fill="#ffffff" stroke="#1b1a19" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M11.1 10.9V8.3m3.2 2.6V7.7m3.2 3.2V8.5" stroke="#1b1a19" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
  </svg>`,
};
const cursor = (kind = 'arrow') => `<span class="cursor ${kind}" aria-hidden="true">${CURSORS[kind]}</span>`;
/** The soft ring under a pointer that has just pressed something. */
const press = () => `<span class="press" aria-hidden="true"></span>`;

export const conceptStyles = `
.concept{--wash:#f0dcdc;background:#faf7f5;color:#241f1f}
.concept.conflicts{--wash:#f4e3c4;background:#faf7f1}
.concept.swaps{--wash:#dbe2f2;background:#f4f6fb}
.concept.cost{--wash:#d8e8dd;background:#f4f8f5}
.concept:before{content:"";position:absolute;left:690px;top:130px;width:900px;height:800px;background:radial-gradient(ellipse,var(--wash),transparent 68%);filter:blur(14px)}
.concept:after{content:"";position:absolute;width:860px;height:96px;left:640px;top:858px;background:radial-gradient(ellipse,#2b232320,transparent 65%);filter:blur(26px)}
.concept .brand{right:80px;top:58px;color:#3a3231;font-size:19px}.concept .brand img{width:31px;height:31px}
.concept .eyebrow{top:70px;left:80px;letter-spacing:1.8px;font-size:15px;color:#8a7b74}
.concept .copy{position:absolute;left:80px;top:296px;width:540px;z-index:2}
.concept .copy h1{position:static;margin:0;font-size:72px;line-height:1.05;letter-spacing:-3.2px;font-weight:650;white-space:pre-line}
.concept .copy p{font-size:24px;line-height:1.5;color:#6b625f;max-width:445px;margin:26px 0 0}

/* A panel floats; the edge is a soft drop, never a painted border. */
.ui{position:absolute;background:#fff;border-radius:26px;padding:34px 38px;overflow:hidden;
  font-size:22px;line-height:1.4;
  box-shadow:0 2px 3px #36292908,0 16px 34px -15px #3629292e,0 46px 72px -40px #36292950}
.ui h2,.ui h3,.ui p{margin:0}
.ui h2{font-size:31px;line-height:1.2;letter-spacing:-.8px;font-weight:650}
.ui h3{font-size:24px;letter-spacing:-.3px;font-weight:600}
.k{font-size:16px;letter-spacing:1.1px;text-transform:uppercase;color:#9b948f;font-weight:600}
.muted{color:#8c8582}.small{font-size:18px}
.row{display:flex;align-items:center;gap:14px}
.between{display:flex;align-items:center;justify-content:space-between;gap:18px}
.rule{height:1px;background:#f1eeec;margin:26px 0}
.badge{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:8px 14px;font-size:18px;font-weight:600;white-space:nowrap}
.badge.grey{background:#f2efed;color:#6b625f}.badge.mint{background:#cdeedd;color:#1f6444}
.badge.amber{background:#f8e7c4;color:#7d5f2e}.badge.rose{background:#f9d9d8;color:#993c40}
.badge.sky{background:#dbe6f8;color:#33527f}
.av{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;font-size:17px;font-weight:650;color:#fff;flex-shrink:0;background:#b2534f}
.av.b{background:#3f5da8}.av.c{background:#4b7a5c}
.tile{display:grid;place-items:center;width:56px;height:56px;border-radius:17px;flex-shrink:0}
.tile.lilac{background:#e6e2f2;color:#4b3f7a}.tile.sky{background:#d9e5f7;color:#33527f}
.tile.amber{background:#f8e7c4;color:#7d5f2e}.tile.rose{background:#f7dedd;color:#8f4149}
.tnum{font-variant-numeric:tabular-nums}

/* Controls, so a pressed button actually looks pressed. */
.btn{display:inline-flex;align-items:center;gap:11px;border-radius:13px;padding:15px 24px;font-size:21px;font-weight:550}
.btn.ink{background:#241f1f;color:#fff}
.btn.ink.down{background:#000;transform:translateY(1px)}
.btn.quiet{background:#fff;color:#6b625f;box-shadow:inset 0 0 0 1.5px #eae6e4}
.field{border-radius:13px;padding:14px 18px;font-size:23px;background:#fff;box-shadow:inset 0 0 0 1.5px #eae6e4;display:flex;align-items:center;gap:2px}
.field.active{box-shadow:inset 0 0 0 2px #c8283f,0 0 0 5px #f7e2e5}
.caret{display:inline-block;width:2.5px;height:28px;background:#241f1f;margin-left:3px}

/* The pointer and its press ring. */
.cursor{position:absolute;z-index:40;filter:drop-shadow(0 6px 10px rgba(40,30,30,.3))}
.press{position:absolute;z-index:39;width:104px;height:104px;border-radius:50%;
  background:radial-gradient(circle,rgba(36,31,31,.16),rgba(36,31,31,0) 62%)}
/* A chip held mid-drag: lifted, tilted, and slightly transparent. */
.ghost{position:absolute;z-index:38;opacity:.92;transform:rotate(-5deg) scale(1.04);
  box-shadow:0 20px 36px -12px #36292966}

/* Shift chips, the app's own language. */
.chip{border-radius:11px;padding:12px 14px;font-size:19px;line-height:1.25;border-left:4px solid;background:#fff}
.chip .t{display:block;font-weight:600}
.chip .s{display:block;font-size:16px;color:#8c8582;margin-top:4px}
.chip.morning{border-color:#d98240;background:#fdf1e7}
.chip.day{border-color:#4b8f66;background:#eaf5ee}
.chip.night{border-color:#6f5fae;background:#eeecf8}
.chip.blocked{border-color:#c8283f;background:#fbe9e9}

/* 01 Publishing */
.publish .main{left:672px;top:186px;width:742px;transform:rotate(-2.4deg)}
.publish .shiftline{display:grid;grid-template-columns:56px 1fr auto;gap:18px;align-items:center;padding:17px 0;border-top:1px solid #f4f1f0}
.publish .shiftline:first-of-type{border-top:0}
.publish .foot{margin-top:28px;padding-top:26px;border-top:1px solid #f1eeec}
.publish .aside{left:1006px;top:716px;width:512px;transform:rotate(2.6deg);z-index:30}
/* Tip of the pointer lands on the Publish button, which is drawn pressed. */
.publish .cursor{left:1300px;top:624px}
.publish .press{left:1252px;top:578px}

/* 02 Conflicts */
.conflicts .main{left:664px;top:182px;width:756px;transform:rotate(-2.4deg)}
.conflicts .grid{display:grid;grid-template-columns:150px repeat(3,1fr);gap:12px;margin-top:24px}
.conflicts .hd{font-size:18px;color:#9b948f;font-weight:600;padding-bottom:6px}
.conflicts .who{font-size:21px;font-weight:550;display:flex;align-items:center;gap:12px}
.conflicts .cell{min-height:86px;border-radius:12px;background:#faf8f7}
.conflicts .cell.drop{background:#fbe9e9;box-shadow:inset 0 0 0 2px #e07b83}
.conflicts .aside{left:952px;top:678px;width:520px;transform:rotate(2.6deg);z-index:30}
/* The held chip sits over the cell it is being dropped on, pointer at its edge. */
.conflicts .ghost{left:1006px;top:318px;width:170px}
.conflicts .cursor{left:1108px;top:356px}

/* 03 Swaps */
.swaps .main{left:668px;top:180px;width:748px;transform:rotate(-2.4deg)}
.swaps .people{display:flex;align-items:center;gap:20px;margin-top:26px;font-size:23px}
.swaps .arrow{color:#b3aca9}
.swaps .reason{margin-top:24px;padding:20px 22px;background:#f7f5f4;border-radius:14px;font-size:20px;color:#6b625f;line-height:1.45}
.swaps .acts{display:flex;gap:14px;margin-top:30px}
.swaps .aside{left:980px;top:654px;width:496px;transform:rotate(2.6deg);z-index:30}
.swaps .trail{position:relative;padding-left:32px;margin-top:22px}
.swaps .trail:before{content:"";position:absolute;left:3px;top:8px;width:10px;height:10px;border-radius:50%;background:#8f9dc4;box-shadow:0 0 0 5px #eef1f8}
.swaps .trail:after{content:"";position:absolute;left:7.5px;top:28px;bottom:-20px;width:1px;background:#e2e7f1}
.swaps .trail:last-child:after{display:none}
.swaps .trail strong{display:block;font-size:21px;font-weight:550}
.swaps .trail span{color:#8f8a87;font-size:17px}
.swaps .cursor{left:846px;top:582px}
.swaps .press{left:810px;top:546px}

/* 04 Labour cost */
.cost .main{left:668px;top:184px;width:744px;transform:rotate(-2.4deg)}
.cost .total{display:flex;align-items:baseline;gap:16px;margin-top:20px}
.cost .total strong{font-size:62px;letter-spacing:-2.4px;font-weight:600;font-variant-numeric:tabular-nums}
.cost .bar{height:12px;border-radius:7px;background:#f0edec;margin:26px 0 12px;overflow:hidden}
.cost .bar span{display:block;height:100%;border-radius:7px;background:#4b8f66}
.cost .budget{display:flex;align-items:center;gap:18px;margin-top:28px;padding-top:26px;border-top:1px solid #f1eeec}
.cost .aside{left:988px;top:660px;width:488px;transform:rotate(2.6deg);z-index:30}
.cost .line{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-top:1px solid #f4f1f0;font-size:21px}
.cost .line:first-of-type{border-top:0}
`;

/**
 * The card the cover shares with the publish concept, so the README and the
 * first carousel slide make the same argument in the same shape.
 */
export const renderChangeLog = () => `<section class="ui changelog" aria-label="Conceptual record of a change made after publishing">
  <div class="k">Changed after publishing</div>
  <p style="font-size:23px;margin-top:14px">Fri 06:00–14:00 moved from Alex Moss to Sam Doyle.</p>
  <div class="row" style="margin-top:20px">${badge('Ric Pallaoro')}${badge('2h ago')}${badge('9h notice', 'amber')}</div>
</section>`;

const concepts = {
  publish: () => `
    <section class="ui main" aria-label="Conceptual week being published">
      <div class="between">
        <div><h2>Week of 14 September</h2><p class="small muted" style="margin-top:6px">13 shifts · 80.5h scheduled</p></div>
        ${badge('Draft', 'amber')}
      </div>
      <div style="margin-top:26px">
        <div class="shiftline">${avatar('AM')}<div><div style="font-weight:550">Alex Moss</div><div class="small muted tnum">Mon 07:00–16:00 · Kitchen</div></div><span class="chip morning"><span class="t">Morning</span></span></div>
        <div class="shiftline">${avatar('SD', 'b')}<div><div style="font-weight:550">Sam Doyle</div><div class="small muted tnum">Mon 08:00–15:00 · Barista</div></div><span class="chip day"><span class="t">Day</span></span></div>
        <div class="shiftline">${avatar('PR', 'c')}<div><div style="font-weight:550">Priya Raman</div><div class="small muted tnum">Tue 10:00–18:00 · Front of house</div></div><span class="chip night"><span class="t">Night</span></span></div>
      </div>
      <div class="between foot">
        <p class="small muted">Once it is out, every change is recorded.</p>
        <span class="btn ink down">${icon('send', 22)}Publish week</span>
      </div>
    </section>
    ${press()}${cursor()}
    ${renderChangeLog().replace('class="ui changelog"', 'class="ui aside"')}`,

  conflicts: () => `
    <section class="ui main" aria-label="Conceptual shift being dragged onto a day the person cannot work">
      <div class="between"><h2>Week 38 · Front of house</h2>${badge('Conflict', 'rose')}</div>
      <div class="grid">
        <div></div><div class="hd">Tue 15</div><div class="hd">Wed 16</div><div class="hd">Thu 17</div>
        <div class="who">${avatar('PR', 'c')}Priya</div>
        <div class="cell" style="padding:10px"><span class="chip day" style="display:block"><span class="t">Day</span><span class="s tnum">10:00–18:00</span></span></div>
        <div class="cell drop"></div>
        <div class="cell"></div>
        <div class="who">${avatar('SD', 'b')}Sam</div>
        <div class="cell"></div>
        <div class="cell" style="padding:10px"><span class="chip morning" style="display:block"><span class="t">Morning</span><span class="s tnum">08:00–12:30</span></span></div>
        <div class="cell"></div>
      </div>
      <div class="row" style="margin-top:26px;padding:18px 20px;border-radius:14px;background:#f8f0de;color:#7d5f2e;align-items:flex-start">
        <span style="flex-shrink:0;margin-top:2px">${icon('alert', 26)}</span>
        <span style="font-size:20px;line-height:1.45">Priya Raman said they are not available 13:00–23:00 on this day.</span>
      </div>
    </section>
    <span class="chip blocked ghost" style="display:block;padding:14px 16px"><span class="t">Afternoon</span><span class="s tnum">14:00–19:00</span></span>
    ${cursor('grabbing')}
    <section class="ui aside" aria-label="Conceptual stated availability">
      <div class="between"><div class="row"><span class="tile rose">${icon('ban', 26)}</span><div><div class="k">Priya said</div><h3 style="margin-top:6px">Wednesday</h3></div></div>${badge('Can’t work', 'rose')}</div>
      <p class="tnum" style="font-size:30px;font-weight:600;letter-spacing:-.8px;margin-top:20px">13:00 – 23:00</p>
    </section>`,

  swaps: () => `
    <section class="ui main" aria-label="Conceptual swap being approved">
      <div class="between"><div class="row"><span class="tile sky">${icon('swap', 26)}</span><h2>Swap request</h2></div>${badge('Waiting', 'amber')}</div>
      <p class="tnum" style="font-size:31px;font-weight:600;letter-spacing:-.7px;margin-top:24px">Sat 19 Sep · 17:00–22:00</p>
      <div class="people">${avatar('AM')}<span>Alex Moss</span><span class="arrow">${icon('swap', 26)}</span>${avatar('SD', 'b')}<span>Sam Doyle</span></div>
      <div class="reason">“Can’t make Saturday evening — Sam has offered to take it.”</div>
      <div class="acts"><span class="btn ink down">${icon('check', 22)}Approve</span><span class="btn quiet">Decline</span></div>
    </section>
    ${press()}${cursor()}
    <section class="ui aside" aria-label="Conceptual swap trail">
      <div class="k">The trail</div>
      <div class="trail"><strong>Offered up</strong><span>Alex Moss · Tue 09:12</span></div>
      <div class="trail"><strong>Claimed</strong><span>Sam Doyle · Tue 11:40</span></div>
      <div class="trail"><strong>Approved</strong><span>Ric Pallaoro · Tue 14:02</span></div>
    </section>`,

  cost: () => `
    <section class="ui main" aria-label="Conceptual weekly wage cost with the budget being edited">
      <div class="between"><div class="row"><span class="tile lilac">${icon('wallet', 26)}</span><h2>Wage cost this week</h2></div>${badge('Within budget', 'mint')}</div>
      <div class="total"><strong>£1,082</strong><span class="muted" style="font-size:22px">80.5h scheduled</span></div>
      <div class="bar"><span style="width:77%"></span></div>
      <div class="between"><span class="muted small tnum">£318 left</span><span class="muted small tnum">77% of budget</span></div>
      <div class="budget">
        <span class="k" style="flex-shrink:0">Week budget</span>
        <span class="field tnum" style="min-width:220px">£1,400</span>
      </div>
    </section>
    <section class="ui aside" aria-label="Conceptual per-person cost lines">
      <div class="k">Where it goes</div>
      <div style="margin-top:14px">
        <div class="line"><div>Alex Moss<div class="small muted tnum">30.5h · Kitchen</div></div><span class="tnum" style="font-weight:600">£460</span></div>
        <div class="line"><div>Sam Doyle<div class="small muted tnum">29.8h · Barista</div></div><span class="tnum" style="font-weight:600">£369</span></div>
      </div>
    </section>`,
};

export function renderConcept(id) {
  if (!Object.hasOwn(concepts, id)) throw new Error(`Unknown feature concept: ${id}`);
  return concepts[id]();
}

// Kept as a named export so the build script's import list does not change.
export const conceptLayout = '';
