// Steelman UI — positive-first, family-routed checklist.
// All reasoning lives in the (tested) engine; this file gathers a paste, a family choice, and a
// virtue checklist, then asks the engine to score. Adding a fallacy never touches this file.
//
// Flow: paste → (cue scan suggests a family) → pick a family → confirm the argument's virtues
//       (✓ it does this / ✗ it falls short / skip) → tentative+teaching verdict.

import { loadData, scoreChecklist, suggestFamily, suggestBucket } from './engine.js';

const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

let DATA = null;       // loaded bank (incl. families, familyMeta, familyCues, tells)
let argument = '';     // the pasted argument, for reference + cue scan
let MASCOT = '';       // inline SVG markup for Steely (themed via the page's CSS variables)

// ---------- bootstrap ----------
boot();

async function boot() {
  try {
    const [fallacies, questions, families] = await Promise.all([
      fetchJSON('data/fallacies.json'),
      fetchJSON('data/questions.json'),
      fetchJSON('data/families.json'),
    ]);
    DATA = loadData(fallacies, questions, null, families);
    if (DATA.warnings?.length) console.warn('validateBank warnings:', DATA.warnings);
    // Static SVG fallback for the mascot, inlined (not <img>) so it themes via CSS vars. The p5
    // canvas (src/mascot.js) overlays this when it loads; if p5 fails, this is what shows. Either
    // way the app is unaffected. A failed fetch just means no mascot.
    MASCOT = await fetch('src/mascot.svg', { cache: 'no-cache' }).then((r) => r.ok ? r.text() : '').catch(() => '');
    const fb = document.getElementById('mascot-fallback');
    if (fb && MASCOT) fb.innerHTML = MASCOT;
    renderStart();
  } catch (err) {
    renderLoadError(err);
  }
}

async function fetchJSON(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-cache' });
  } catch (e) {
    // fetch() of local files fails under file:// — the most common "blank page" cause.
    throw new Error(
      `Could not load ${path}. If you opened index.html directly from disk, ` +
      `serve the folder instead (e.g. "python3 -m http.server" then open http://localhost:8000). ` +
      `On GitHub Pages this works automatically.`
    );
  }
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}).`);
  return res.json();
}

const clear = () => app.replaceChildren();
const familyName = (id) => DATA.familyMeta[id]?.name || id;
// Tell the mascot what stage we're on. Best-effort: if Steely (p5) didn't load, this is a no-op
// and the static SVG fallback simply stays put. The app never depends on it.
const steelyStage = (name) => { try { window.steely?.setStage(name); } catch { /* ignore */ } };

// ---------- 1. paste ----------
function renderStart() {
  clear();
  const ta = el('textarea', {
    id: 'arg',
    placeholder: 'e.g. "We can\'t trust her plan — she failed a class in college."',
    value: argument,
  });
  steelyStage('input');
  const begin = el('button', { className: 'btn btn-primary', textContent: 'Think it through →' });
  const card = el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Steelman' }),
    el('h1', { textContent: 'Is there really a fallacy, or am I just being skeptical?' }),
    el('p', {
      className: 'lede',
      textContent:
        'Paste an argument you’re unsure about. We’ll read it at its strongest first, ' +
        'note what it does well, and only point to a gap if the fair reading genuinely ' +
        'falls short. No accounts, no AI, nothing leaves your browser.',
    }),
    ta,
    el('div', { className: 'row end' }, begin),
    el('p', { className: 'muted', style: 'margin-top:1rem',
      textContent: 'Read it as charitably as you can first. Good arguments deserve a fair hearing.' }),
  );
  app.append(card);
  ta.focus();

  begin.onclick = () => {
    argument = ta.value.trim();
    if (!argument) { ta.focus(); ta.style.outline = '2px solid var(--suspect)'; return; }
    renderFamilyPick();
  };
}

// ---------- 2. pick a bucket (2-level: bucket → family). Cue scan suggests, never decides. ----------
function renderFamilyPick() {
  clear();
  steelyStage('family');
  const famSuggestion = suggestFamily(DATA, argument).top;       // strongest single family (fast path)
  const bucketSuggestion = suggestBucket(DATA, argument).top;    // likely bucket
  const order = (DATA.buckets || []).map((b) => b.id);
  const buckets = bucketSuggestion
    ? [bucketSuggestion, ...order.filter((b) => b !== bucketSuggestion)]
    : order;

  const card = el('section', { className: 'card' });
  if (argument) card.append(el('blockquote', { className: 'recall', textContent: argument }));
  card.append(el('p', { className: 'kicker', textContent: 'Where to look' }));
  card.append(el('h2', { textContent: 'What feels off about it, if anything?' }));
  card.append(el('p', { className: 'muted',
    textContent: bucketSuggestion
      ? 'A quick scan suggests a place to start — but trust your own read. Pick the kind of problem, then we’ll narrow it.'
      : 'Pick the kind of thing that feels off, then we’ll narrow it — or, if it reads fine, say so.' }));

  const opts = el('div', { className: 'family-list' });

  // Fast path: if the scan strongly points at ONE family, offer it directly at the top.
  if (famSuggestion) {
    const meta = DATA.familyMeta[famSuggestion];
    const b = el('button', { className: 'family-opt suggested' },
      el('span', { className: 'family-opt-title', textContent: meta.name }),
      el('span', { className: 'family-opt-sub', textContent: meta.prompt }),
    );
    b.onclick = () => renderChecklist(famSuggestion);
    opts.append(b);
  }

  // The buckets (each opens its families). Only highlight the suggested bucket when there's no
  // fast-path family shown above — otherwise the highlight would point at two things at once.
  const bm = Object.fromEntries((DATA.buckets || []).map((b) => [b.id, b]));
  for (const bucket of buckets) {
    const meta = bm[bucket];
    if (!meta) continue;
    const highlight = !famSuggestion && bucket === bucketSuggestion;
    const b = el('button', { className: 'family-opt' + (highlight ? ' suggested' : '') },
      el('span', { className: 'family-opt-title', textContent: meta.name }),
      el('span', { className: 'family-opt-sub', textContent: meta.prompt }),
    );
    b.onclick = () => renderBucketFamilies(bucket);
    opts.append(b);
  }

  // The goodwill escape hatch.
  const fine = el('button', { className: 'family-opt family-opt-fine' },
    el('span', { className: 'family-opt-title', textContent: 'Nothing — it seems sound' }),
    el('span', { className: 'family-opt-sub', textContent: 'Maybe you’re just being a little skeptical, and that’s okay' }),
  );
  fine.onclick = () => renderVerdict(scoreChecklist(DATA, { familyId: 'none' }));
  opts.append(fine);
  card.append(opts);

  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '↺ Start over', onclick: () => { argument = ''; renderStart(); } }),
    el('span', { className: 'muted', textContent: 'You’re looking for what holds up, not hunting for flaws.' }),
  ));
  app.append(card);
}

// ---------- 2b. pick a family within the chosen bucket ----------
function renderBucketFamilies(bucket) {
  clear();
  steelyStage('family');
  const bm = Object.fromEntries((DATA.buckets || []).map((b) => [b.id, b]));
  const famSuggestion = suggestFamily(DATA, argument).top;
  const fams = (DATA.bucketFamilies[bucket] || []);

  const card = el('section', { className: 'card' });
  if (argument) card.append(el('blockquote', { className: 'recall', textContent: argument }));
  card.append(el('p', { className: 'kicker', textContent: bm[bucket]?.name || 'Narrow it down' }));
  card.append(el('h2', { textContent: 'Which fits best?' }));

  const opts = el('div', { className: 'family-list' });
  // suggested family first if it's in this bucket
  const ordered = famSuggestion && fams.includes(famSuggestion)
    ? [famSuggestion, ...fams.filter((f) => f !== famSuggestion)]
    : fams;
  for (const fam of ordered) {
    const meta = DATA.familyMeta[fam];
    const b = el('button', { className: 'family-opt' + (fam === famSuggestion ? ' suggested' : '') },
      el('span', { className: 'family-opt-title', textContent: meta.name }),
      el('span', { className: 'family-opt-sub', textContent: meta.prompt }),
    );
    b.onclick = () => renderChecklist(fam);
    opts.append(b);
  }
  card.append(opts);

  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '← Back', onclick: renderFamilyPick }),
    el('span', { className: 'muted', textContent: 'Not sure? Back up and try a different kind.' }),
  ));
  app.append(card);
}

// ---------- 3. the positive-first virtue checklist ----------
function renderChecklist(familyId) {
  clear();
  steelyStage('checklist');
  // Collect every tell for the family's fallacies, de-duplicated by question id (a question shared
  // across siblings appears once). Each row is a virtue the user marks ✓ / ✗ / skip.
  const seen = new Set();
  const rows = [];
  for (const fid of DATA.families[familyId]) {
    for (const t of (DATA.tells[fid] || [])) {
      if (seen.has(t.qid)) continue;
      seen.add(t.qid);
      rows.push({ qid: t.qid, text: t.text });
    }
  }
  const choice = {};   // qid -> 'has' | 'lacks'  (absent = skip)

  const card = el('section', { className: 'card' });
  if (argument) card.append(el('blockquote', { className: 'recall', textContent: argument }));
  card.append(el('p', { className: 'kicker', textContent: familyName(familyId) }));
  card.append(el('h2', { textContent: 'Which of these does the argument do?' }));
  card.append(el('p', { className: 'muted',
    textContent: 'Tick ✓ for what it does well, ✗ for what it falls short on, and leave the rest blank. We start by assuming it holds up.' }));

  const list = el('div', { className: 'checklist' });
  for (const r of rows) {
    const has = el('button', { className: 'tri tri-has', textContent: '✓', title: 'It does this' });
    const lacks = el('button', { className: 'tri tri-lacks', textContent: '✗', title: 'It falls short here' });
    const row = el('div', { className: 'check-row' },
      el('span', { className: 'check-text', textContent: r.text }),
      el('span', { className: 'tri-group' }, has, lacks),
    );
    const refresh = () => {
      has.classList.toggle('on', choice[r.qid] === 'has');
      lacks.classList.toggle('on', choice[r.qid] === 'lacks');
    };
    has.onclick = () => { choice[r.qid] = choice[r.qid] === 'has' ? undefined : 'has'; refresh(); };
    lacks.onclick = () => { choice[r.qid] = choice[r.qid] === 'lacks' ? undefined : 'lacks'; refresh(); };
    list.append(row);
  }
  card.append(list);

  const see = el('button', { className: 'btn btn-primary', textContent: 'See what holds up →' });
  see.onclick = () => {
    const affirmed = Object.keys(choice).filter((q) => choice[q] === 'has');
    const denied = Object.keys(choice).filter((q) => choice[q] === 'lacks');
    renderVerdict(scoreChecklist(DATA, { familyId, affirmed, denied }), familyId);
  };
  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '← Pick a different focus', onclick: renderFamilyPick }),
    see,
  ));
  app.append(card);
}

// ---------- 4. verdicts (tentative + teaching) ----------
function renderVerdict(result, familyId) {
  clear();
  steelyStage(result.kind);   // mascot maps accuse/lean → gap, valid → holds, cynic → skeptic
  switch (result.kind) {
    case 'accuse': return renderAccuse(result);
    case 'inconclusive_lean': return renderInconclusive(result);
    case 'valid_earned': return renderValid('earned');
    case 'cynic_valid':
    default: return renderValid(familyId ? 'checked' : 'skimmed');
  }
}

function renderAccuse(result) {
  const f = DATA.fallacies[result.fallacy];
  const yes = el('button', { className: 'btn btn-primary', textContent: 'Yes — that fits' });
  const no = el('button', { className: 'btn', textContent: 'No — that’s not it' });
  const card = el('section', { className: 'card verdict-accuse' },
    el('p', { className: 'kicker', textContent: 'One thing to check' }),
    el('p', { className: 'verdict-title', textContent: `There may be a gap here — it looks like ${f.name}.` }),
    el('p', { className: 'muted', textContent: 'That’s just what we noticed — you’re the judge. Here’s what it means:' }),
    el('div', { className: 'teaching' },
      el('span', { className: 'name', textContent: f.name + '. ' }),
      document.createTextNode(f.teaching),
      el('p', { className: 'check', textContent: f.confirm_check }),
    ),
    el('div', { className: 'answers' }, yes, no),
  );
  app.append(card);
  yes.onclick = () => { steelyStage('confirmed'); renderConfirmed(f); };
  no.onclick = () => { steelyStage('cynic_after_reject'); renderCynic('rejected', f); };
}

function renderConfirmed(f) {
  clear();
  app.append(el('section', { className: 'card verdict-accuse' },
    el('p', { className: 'kicker', textContent: 'You made the call' }),
    el('p', { className: 'verdict-title', textContent: `Looks like a ${f.name}.` }),
    el('p', { textContent:
      'You confirmed it — the argument seems to lean on this rather than stand on its own merits. ' +
      'Naming it isn’t a “gotcha,” though: the underlying point might still be worth engaging once ' +
      'it’s made fairly. The generous next move is to ask for the stronger version.' }),
    el('p', { className: 'muted', textContent: 'Spotting the gap is the easy part. Steelmanning what’s left is the generous one — and the whole point here.' }),
    restartRow(),
  ));
}

function renderInconclusive(result) {
  clear();
  const f = result.leanFallacy ? DATA.fallacies[result.leanFallacy] : null;
  const lean = f
    ? `There might be something here — possibly a ${f.name} — but not enough to call it.`
    : 'There might be something here, but not enough to call it.';
  app.append(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The verdict' }),
    el('p', { className: 'verdict-title', textContent: 'Not enough to call it — and that’s okay.' }),
    el('p', { textContent: lean + ' We’d rather say “not sure” than pin a label on an argument that might be fine.' }),
    el('p', { className: 'muted', textContent: 'Trust your judgment. If it still feels off, the fair move is to ask the other person to spell out their reasoning.' }),
    restartRow(),
  ));
}

// mode: 'earned' (user affirmed ≥2 virtues → positively justified),
//       'checked' (inspected a family, nothing failed enough → not defeated),
//       'skimmed' ("none of these / seems fine" → not inspected, just stands)
function renderValid(mode) {
  clear();
  const COPY = {
    earned: {
      title: 'The argument holds up — and you confirmed why.',
      body: 'You ticked the things a sound argument does, and they checked out. This isn’t just “no fallacy found” — you actively confirmed the reasoning does its job.',
      muted: 'That’s the strongest kind of pass: not “I couldn’t fault it,” but “it does the right things.”',
    },
    checked: {
      title: 'The argument holds up.',
      body: 'You looked closely at this kind of problem and nothing rose above the benefit of the doubt. No clear fallacy here.',
      muted: 'A real result — most arguments aren’t fallacies. Disagreeing is fine; just engage the actual point.',
    },
    skimmed: {
      title: 'Nothing jumped out — it seems to stand.',
      body: 'You read it fairly and didn’t see a problem worth digging into. There’s no clear fallacy; it holds up well enough.',
      muted: 'If something still nags at you, pick the kind of problem it might be and check — but “it’s fine” is an honest answer too.',
    },
  };
  const c = COPY[mode] || COPY.checked;
  app.append(el('section', { className: 'card verdict-valid' },
    el('p', { className: 'kicker', textContent: 'The verdict' }),
    el('p', { className: 'verdict-title', textContent: c.title }),
    el('p', { textContent: c.body }),
    el('p', { className: 'muted', textContent: c.muted }),
    restartRow(),
  ));
}

function renderCynic(why, rejectedFallacy) {
  clear();
  const body = why === 'rejected'
    ? `You looked at whether it was ${rejectedFallacy.name} and decided it didn’t fit — good. ` +
      `We won’t reach for a second-best label. The argument may simply be sound, and you may just ` +
      `be reading it carefully. That’s an honest place to land.`
    : 'There may be no fallacy here at all — you might just be reading it with healthy skepticism, and that’s okay.';
  app.append(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The verdict' }),
    el('p', { className: 'verdict-title', textContent: '…or maybe it’s just healthy skepticism.' }),
    el('p', { textContent: body }),
    el('p', { className: 'muted', textContent: 'Skepticism is healthy. Treating every argument as guilty is the thing worth resisting.' }),
    restartRow(),
  ));
}

function restartRow() {
  return el('div', { className: 'row end' },
    el('button', { className: 'btn btn-primary', textContent: 'Examine another →',
      onclick: () => { argument = ''; renderStart(); } }),
  );
}

function renderLoadError(err) {
  clear();
  app.append(el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Couldn’t start' }),
    el('h1', { textContent: 'Steelman' }),
    el('p', { className: 'error', textContent: err.message || String(err) }),
  ));
}
