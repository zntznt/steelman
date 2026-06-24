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
// "a" / "an" so we never say "a Ad Hominem" — 27 of the fallacy names start with a vowel sound.
// ponytail: vowel-letter test, not phonetic; none of the names start with a silent-h or "eu-/u-as-you" word, so it holds.
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
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
  const begin = el('button', { className: 'btn btn-primary', textContent: 'Start →' });
  // The re-audit found three regressions here: "best version of it" read as a promise to rewrite
  // the user's text; the goodwill was piled on so thick it read as preachy; "argument" was heard as
  // "a fight". Fix: one plain promise (not three nudges), a gloss on "argument", concrete actions,
  // and "type or paste" / "stays on your phone" for phone-first users.
  const card = el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Steelman' }),
    el('h1', { textContent: 'Is something really wrong with this argument, or am I just being doubtful?' }),
    el('p', {
      className: 'lede',
      textContent:
        'Type or paste a point someone is making. We’ll assume it’s fair to start, see what it gets ' +
        'right, and only flag a weak spot if there really is one. No account, no AI. It stays on your device.',
    }),
    ta,
    el('div', { className: 'row end' }, begin),
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
  card.append(el('h2', { textContent: 'What feels wrong about it, if anything?' }));
  card.append(el('p', { className: 'muted',
    textContent: bucketSuggestion
      ? 'Here’s a place to start — but trust your own read. Pick the closest one, then we’ll narrow it.'
      : 'Pick the closest one, then we’ll narrow it. (If it seems fine, you can say that too.)' }));

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
    el('span', { className: 'family-opt-title', textContent: 'Nothing — it looks fine to me' }),
    el('span', { className: 'family-opt-sub', textContent: 'Maybe it really is fine. That happens a lot.' }),
  );
  fine.onclick = () => renderVerdict(scoreChecklist(DATA, { familyId: 'none' }));
  opts.append(fine);
  card.append(opts);

  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '↺ Start over', onclick: () => { argument = ''; renderStart(); } }),
    el('span', { className: 'muted', textContent: 'We start by trusting the argument, then look for any real problem.' }),
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
  // across siblings appears once). Each row is a plain "Does it…?" question the user answers 👍 / 👎 / skip.
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
  card.append(el('h2', { textContent: 'For each one, does the argument do this?' }));
  // We start out trusting the argument. Two short sentences, no em-dashes (the re-audit found slow
  // and ESL readers lose the thread at " — "). The reassurance answers the panel's "skip-fear".
  card.append(el('p', { className: 'muted',
    textContent: 'Answer the ones you can. Many won’t apply to your example, and that’s normal — it won’t change the result.' }));

  const list = el('div', { className: 'checklist' });
  for (const r of rows) {
    // Each choice carries its own always-visible label (under the icon), so the meaning of 👍/👎
    // never hides on hover — the re-audit found the hover legend invisible on phones. A third
    // choice, "doesn’t apply", lets a reader confidently clear a row that can’t apply to their
    // one-liner. It maps to neutral (omitted from affirmed/denied), exactly like a skip.
    const mkChoice = (kind, icon, label, cls) => {
      const b = el('button', { className: `tri ${cls}` },
        el('span', { className: 'tri-icon', textContent: icon }),
        el('span', { className: 'tri-label', textContent: label }),
      );
      b.onclick = () => { choice[r.qid] = choice[r.qid] === kind ? undefined : kind; refresh(); };
      return b;
    };
    const has = mkChoice('has', '👍', 'yes', 'tri-has');
    const lacks = mkChoice('lacks', '👎', 'no', 'tri-lacks');
    const na = mkChoice('na', '—', 'doesn’t apply', 'tri-na');
    const row = el('div', { className: 'check-row' },
      el('span', { className: 'check-text', textContent: r.text }),
      el('span', { className: 'tri-group' }, has, lacks, na),
    );
    function refresh() {
      has.classList.toggle('on', choice[r.qid] === 'has');
      lacks.classList.toggle('on', choice[r.qid] === 'lacks');
      na.classList.toggle('on', choice[r.qid] === 'na');
    }
    list.append(row);
  }
  card.append(list);

  const see = el('button', { className: 'btn btn-primary', textContent: 'See the result →' });
  see.onclick = () => {
    // 'na' (doesn’t apply) and skip are both neutral — only 👍/👎 feed the engine.
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
    el('p', { className: 'verdict-title', textContent: `There may be a weak spot here — it looks like ${f.name}.` }),
    el('p', { className: 'muted', textContent: 'That’s just what we noticed — you’re the judge. Here’s what it means:' }),
    el('div', { className: 'teaching' },
      el('span', { className: 'name', textContent: f.name + '. ' }),
      // Teach the word "fallacy" exactly once, attached to a concrete example the user is looking
      // at — not in the intro, where the neophyte panel found it bounced off everyone cold.
      el('span', { className: 'aside', textContent: '(a weak spot like this is what people call a “fallacy”) ' }),
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
    el('p', { className: 'verdict-title', textContent: `Looks like ${article(f.name)} ${f.name}.` }),
    el('p', { textContent:
      'You confirmed it — the argument depends on this instead of standing on its own. ' +
      'Naming it isn’t a way to “win,” though: the real point underneath might still be worth ' +
      'taking seriously once it’s made fairly. The fair next move is to ask for the stronger version.' }),
    el('p', { className: 'muted', textContent: 'Spotting the weak spot is the easy part. Building the strongest version of what’s left is the generous one — and the whole point here.' }),
    restartRow(),
  ));
}

function renderInconclusive(result) {
  clear();
  const f = result.leanFallacy ? DATA.fallacies[result.leanFallacy] : null;
  const lean = f
    ? `There might be something here — maybe ${article(f.name)} ${f.name} — but not enough to be sure.`
    : 'There might be something here, but not enough to be sure.';
  app.append(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The result' }),
    el('p', { className: 'verdict-title', textContent: 'Not enough to be sure — and that’s fine.' }),
    el('p', { textContent: lean + ' We’d rather say “not sure” than pin a label on an argument that might be fine.' }),
    el('p', { className: 'muted', textContent: 'Trust your own read. If it still feels wrong, the fair move is to ask the other person to explain their reasoning.' }),
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
      title: 'It makes sense — and you confirmed why.',
      body: 'You marked the things a good argument does, and they checked out. This isn’t just “nothing wrong found” — you actually confirmed the reasoning does its job.',
      muted: 'That’s the best kind of pass: not “I couldn’t find a problem,” but “it does the right things.”',
    },
    checked: {
      title: 'It makes sense.',
      body: 'You looked closely at this kind of problem, and we gave it a fair chance — and it held up. Nothing clearly wrong here.',
      muted: 'A real result — most arguments are fine. Disagreeing is okay; just answer the actual point.',
    },
    skimmed: {
      title: 'Nothing jumped out — it seems fine.',
      body: 'You read it fairly and didn’t spot a problem worth digging into. Nothing clearly wrong; it makes sense well enough.',
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
  // Re-audit: the old "maybe it’s just you reading carefully" landed as a polite scold ("calm down,
  // you imagined it"). Reframe as a finding about the ARGUMENT, and keep the reassurance about the
  // reader separate and genuinely on their side.
  const body = why === 'rejected'
    ? `You looked at whether it was ${rejectedFallacy.name} and decided it didn’t fit. ` +
      `We won’t reach for a second-best label. The reasoning seems to hold, and checking it was the right move.`
    : 'We couldn’t find a clear problem here. The reasoning seems to hold up.';
  app.append(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The result' }),
    el('p', { className: 'verdict-title', textContent: 'No clear problem — it seems to hold up.' }),
    el('p', { textContent: body }),
    el('p', { className: 'muted', textContent: 'Checking was worth doing. Nothing here needs you to back down.' }),
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
