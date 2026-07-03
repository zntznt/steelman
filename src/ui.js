// Steelman UI — positive-first, family-routed checklist.
// All reasoning lives in the (tested) engine; this file gathers a paste, a family choice, and a
// virtue checklist, then asks the engine to score. Adding a fallacy never touches this file.
//
// Flow: paste → (cue scan suggests a family) → pick a family → confirm the argument's virtues
//       (✓ it does this / ✗ it falls short / skip) → tentative+teaching verdict.

import { loadData, scoreChecklist, suggestFamily, suggestBucket, suggestMoves } from './engine.js';

const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    // aria-*, role, and data-* aren't reflected DOM properties, so Object.assign would silently lose
    // them; route those through setAttribute. Everything else (className, textContent, onclick, …) is
    // a real property and gets assigned directly.
    if (k === 'role' || k.startsWith('aria-') || k.startsWith('data-')) n.setAttribute(k, v);
    else n[k] = v;
  }
  for (const c of kids) n.append(c);
  return n;
};

let DATA = null;       // loaded bank (incl. families, familyMeta, familyCues, tells)
let argument = '';     // the pasted argument, for reference + cue scan

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
    // Mascot is handled entirely by src/mascot.js (swaps a per-stage raster image). Nothing to do
    // here — steelyStage(...) signals it as the user moves through the app.
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
// Mount a screen and move focus to its heading. For user-initiated screen swaps this is the correct
// a11y pattern (better than aria-live announcing the whole card): it tells a screen reader where it
// now is and drops a keyboard user at the top of the new content instead of back on <body>.
function mount(card) {
  tagScreen(card);
  app.replaceChildren(card);
  const heading = card.querySelector('h1, h2, .verdict-title');
  if (heading) {
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: false });
  }
}

// Purely presentational hook for the stylesheet (no behavior, no flow). Tags a verdict card with
// screen-verdict so the CSS can give the reading spine its verdict temperament (a gilt cap on a
// holds-up, a single clay band on a suspicion) and the faint colophon wash. Non-verdict screens
// need no class; the spine is a fixed margin rule everywhere. Never throws.
function tagScreen(card) {
  const cls = card.classList;
  if (cls.contains('verdict-valid') || cls.contains('verdict-cynic') || cls.contains('verdict-accuse')) {
    cls.add('screen-verdict');
  }
}
const familyName = (id) => DATA.familyMeta[id]?.name || id;
// "a" / "an" so we never say "a Ad Hominem" — 27 of the fallacy names start with a vowel sound.
// ponytail: vowel-letter test, not phonetic; none of the names start with a silent-h or "eu-/u-as-you" word, so it holds.
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
// Tell the mascot what stage we're on. Best-effort: if the mascot art isn't present, setStage is a
// harmless no-op (the <img> stays hidden). The app never depends on it. See mascot/README.md.
const steelyStage = (name) => { try { window.steely?.setStage(name); } catch { /* ignore */ } };

// The pasted argument, echoed at the top of later screens as a reminder. A long paste must not clip
// or push the controls off-screen: clamp it to a few lines with a soft fade, and let the reader
// click to expand the whole thing. Long unbroken tokens (URLs) wrap rather than overflow sideways.
const recallBlock = (text) => {
  // The pasted argument stays a real <blockquote> (a quotation, not a button — making it a button
  // would turn the whole argument into the control's accessible name). When it's long enough to
  // clamp, we add a separate, properly labeled expand button beneath it.
  const wrap = el('div');
  const bq = el('blockquote', { className: 'recall clamped', textContent: text });
  wrap.append(bq);
  // Start clamped, then measure: the 3-line cap is what creates the overflow we're testing for, so
  // it must be applied before scrollHeight is read (an unclamped block has no overflow to detect).
  requestAnimationFrame(() => {
    if (bq.scrollHeight - bq.clientHeight <= 4) {
      bq.classList.remove('clamped');   // short paste: no clamp, no toggle needed
      return;
    }
    const btn = el('button', { className: 'btn btn-quiet recall-toggle', type: 'button',
      textContent: 'Show full argument' });
    btn.setAttribute('aria-expanded', 'false');
    btn.onclick = () => {
      const open = bq.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Show less' : 'Show full argument';
    };
    wrap.append(btn);
  });
  return wrap;
};

// ---------- 1. paste ----------
function renderStart() {
  clear();
  // The neophyte panel found the old placeholder was read as "type YOUR situation here," so 8 of 8
  // pasted a personal grievance instead of someone else's claim. The example now lives OUTSIDE the
  // box as visibly-static text (you can't overwrite it), and the box starts empty with a plain hint.
  const ta = el('textarea', {
    id: 'arg',
    placeholder: 'Paste what they said here…',
    value: argument,
  });
  steelyStage('input');
  const begin = el('button', { className: 'btn btn-primary', textContent: 'Check it →', 'aria-label': 'Check it' });
  // The panel found "argument" was heard as "a fight," "fallacy" never appeared until the very end,
  // and "Steelman" read as Iron Man. Fix: say plainly what to paste (someone else's point), name the
  // job up front, and gloss both "fallacy" and "Steelman" right here so nothing is a mystery later.
  const example = el('div', { className: 'example' },
    el('span', { className: 'example-label', textContent: 'For example, someone says:' }),
    el('p', { className: 'example-quote', textContent:
      '“We can’t trust her plan. She failed a class in college.”' }),
  );
  const card = el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Steelman' }),
    el('p', { className: 'brand-note', textContent:
      'To “steelman” is to read someone’s point at its strongest before you judge it. That’s what this does.' }),
    el('h1', { className: 'hero', textContent: 'Does this point actually hold up?' }),
    el('p', {
      className: 'lede invitation',   // `invitation` is the drop-cap target on the start screen only
      textContent:
        'Paste something another person said or wrote, the kind of thing you’re not sure about. ' +
        'We’ll start by assuming it’s fair, see what it gets right, and only point out a weak spot ' +
        'in the reasoning if there really is one. (That kind of weak spot is what people call a “fallacy.”)',
    }),
    example,
    ta,
    el('div', { className: 'row end' }, begin),
  );
  // Empty-paste error: a real, announced message, not just a silent color outline.
  const err = el('p', { id: 'arg-err', className: 'error', role: 'alert', hidden: true,
    textContent: 'Paste what someone said first, then check it.' });
  card.insertBefore(err, card.querySelector('.row.end'));
  const clearErr = () => {
    err.hidden = true;
    ta.removeAttribute('aria-invalid');
    ta.style.outline = '';
  };
  ta.addEventListener('input', clearErr);

  mount(card);
  ta.focus();

  begin.onclick = () => {
    argument = ta.value.trim();
    if (!argument) {
      err.hidden = false;
      ta.setAttribute('aria-invalid', 'true');
      ta.setAttribute('aria-describedby', 'arg-err');
      ta.style.outline = '2px solid var(--suspect)';
      ta.focus();
      return;
    }
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
  if (argument) card.append(recallBlock(argument));
  card.append(el('p', { className: 'kicker', textContent: 'Where to look' }));
  card.append(el('h1', { textContent: 'What feels wrong about it, if anything?' }));
  card.append(el('p', { className: 'muted',
    textContent: bucketSuggestion
      ? 'Here’s a place to start, but trust your own read. Pick the closest one, then we’ll narrow it.'
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
    el('span', { className: 'family-opt-title', textContent: 'Nothing. It looks fine to me' }),
    el('span', { className: 'family-opt-sub', textContent: 'Maybe it really is fine. That happens a lot.' }),
  );
  fine.onclick = () => renderVerdict(scoreChecklist(DATA, { familyId: 'none' }));
  opts.append(fine);
  card.append(opts);

  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '↺ Start over', 'aria-label': 'Start over', onclick: () => { argument = ''; renderStart(); } }),
    el('span', { className: 'muted', textContent: 'We start by trusting the argument, then look for any real problem.' }),
  ));
  mount(card);
}

// ---------- 2b. pick a family within the chosen bucket ----------
function renderBucketFamilies(bucket) {
  clear();
  steelyStage('family');
  const bm = Object.fromEntries((DATA.buckets || []).map((b) => [b.id, b]));
  const famSuggestion = suggestFamily(DATA, argument).top;
  const fams = (DATA.bucketFamilies[bucket] || []);

  const card = el('section', { className: 'card' });
  if (argument) card.append(recallBlock(argument));
  card.append(el('p', { className: 'kicker', textContent: bm[bucket]?.name || 'Narrow it down' }));
  card.append(el('h1', { textContent: 'Which fits best?' }));

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
    el('button', { className: 'btn', textContent: '← Back', 'aria-label': 'Back', onclick: renderFamilyPick }),
    el('span', { className: 'muted', textContent: 'Not sure? Back up and try a different kind.' }),
  ));
  mount(card);
}

// Lightweight relevance between a checklist row and the user's pasted argument, used ONLY to break
// ties between equal-weight rows so the most on-topic one leads. Not the engine, not routing: just
// "does this row's concern echo what the user typed." Two cheap signals are summed:
//   1. shared content words (stopwords dropped), and
//   2. shared CONCEPTS via a tiny synonym map, so a row about "how many people believe it" matches a
//      paraphrase like "everyone in my server says" even with no literal word in common. The map only
//      covers the concepts where same-weight sibling rows actually compete (crowd vs name vs old/new),
//      which is where the re-test saw a "wrong room" flicker. Returns a score; 0 with no argument.
// ponytail: a hand-rolled stopword set + a 4-concept synonym map, not an NLP lib. Tie-break only.
const STOP = new Set(('a an and are as at be by does do for from has have how in is it its not of on or '
  + 'rather than that the their them they this to was what when where which who whom why with you your '
  + 'argument claim point reason really just only made make says said say').split(' '));
// concept -> [words that signal it in the argument, words that signal it in a row]
const CONCEPTS = [
  { arg: ['everyone', 'everybody', 'all', 'most', 'people', 'popular', 'crowd', 'majority', 'trend', 'trending'],
    row: ['many', 'people', 'believe', 'agree', 'popular', 'crowd'] },                       // bandwagon
  { arg: ['expert', 'doctor', 'scientist', 'professor', 'famous', 'celebrity', 'official', 'authority'],
    row: ['name', 'backed', 'expert', 'authority'] },                                        // authority
  { arg: ['always', 'tradition', 'traditional', 'ancestors', 'generations'],
    row: ['old', 'traditional', 'lasting', 'long'] },                                        // tradition
  { arg: ['new', 'newest', 'latest', 'modern', 'cutting'],
    row: ['new', 'latest', 'newer'] },                                                       // novelty
];
function relevanceToArgument(rowText) {
  if (!argument) return 0;
  const words = (s) => new Set((String(s).toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 3 && !STOP.has(w)));
  const argWords = words(argument);
  if (!argWords.size) return 0;
  const rowWords = words(rowText);
  let score = 0;
  for (const w of rowWords) if (argWords.has(w)) score++;                                    // literal overlap
  for (const c of CONCEPTS) {                                                                // concept overlap
    const argHas = c.arg.some((w) => argWords.has(w));
    const rowHas = c.row.some((w) => rowWords.has(w));
    if (argHas && rowHas) score += 2;   // a concept match is worth more than a single literal word
  }
  return score;
}

// ---------- 3a. the "which move is it?" pick (deeper-branch redesign) ----------
// Replaces the long virtue checklist for families that have authored move content. Surfaces the 2-3
// most likely sibling fallacies from the pasted argument (suggestMoves), each as a plain label + an
// everyday example, with a "something else" that reveals the rest. Picking a move leads to a short
// confirm. This turns up to 16 thumbs into 1 pick + about 2 thumbs, with no fallacy dropped.
function renderMovePick(familyId) {
  clear();
  steelyStage('checklist');
  const fids = DATA.families[familyId];
  const { surfaced, allZero } = suggestMoves(DATA, familyId, argument);
  // Panel must-fix: when NOTHING in the argument matched a move (allZero), suggestMoves returns the
  // residual as the lone "surfaced" item. Presenting that one move as if it were a confident match
  // steered a trusting reader straight to the wrong fallacy. So on allZero we show ALL moves at once
  // with honest "nothing jumped out" framing and DON'T single one out. Only when a real cue matched
  // do we surface the few likely moves and fold the rest behind "something else".
  const showAll = allZero;
  const shown = showAll ? fids : surfaced;
  const shownSet = new Set(shown);
  const others = showAll ? [] : fids.filter((f) => !shownSet.has(f));

  const card = el('section', { className: 'card' });
  if (argument) card.append(recallBlock(argument));
  card.append(el('p', { className: 'kicker', textContent: familyName(familyId) }));
  card.append(el('h1', { textContent: 'Which of these is it doing?' }));
  card.append(el('p', { className: 'muted',
    textContent: allZero
      ? 'Nothing jumped out from your wording, so here are all of them. Pick the one that fits, or go back if none do.'
      : 'Here are the closest matches. Pick the one that fits, or open “something else” to see the rest.' }));

  const mkMove = (fid) => {
    const f = DATA.fallacies[fid];
    const b = el('button', { className: 'family-opt' },
      el('span', { className: 'family-opt-title', textContent: f.pick_label }),
      el('span', { className: 'family-opt-sub', textContent: f.pick_example }),
    );
    b.onclick = () => renderMoveConfirm(familyId, fid);
    return b;
  };

  const list = el('div', { className: 'family-list' });
  for (const fid of shown) list.append(mkMove(fid));
  card.append(list);

  if (others.length) {
    const moreList = el('div', { className: 'family-list', hidden: true });
    for (const fid of others) moreList.append(mkMove(fid));
    const toggle = el('button', { className: 'btn btn-quiet show-more',
      textContent: `Something else (${others.length} more)` });
    toggle.onclick = () => {
      moreList.hidden = !moreList.hidden;
      toggle.textContent = moreList.hidden ? `Something else (${others.length} more)` : '− Show fewer';
    };
    card.append(toggle);
    card.append(moreList);
  }

  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '← Pick a different focus', 'aria-label': 'Pick a different focus', onclick: renderFamilyPick }),
    el('span', { className: 'muted', textContent: 'We still start by trusting the argument.' }),
  ));
  mount(card);
}

// ---------- 3b. the short confirm for one picked move ----------
// Shows just the picked fallacy's own tells (about 2) as 👍/👎. Denying them feeds the SAME engine
// call the checklist would (the denied qids), so the verdict is identical to marking those rows on
// the old checklist. Safety net: if the user doesn't deny anything (so this move isn't actually
// present), offer to look at the other moves instead of forcing a verdict on a mis-pick.
function renderMoveConfirm(familyId, fid) {
  clear();
  steelyStage('checklist');
  const f = DATA.fallacies[fid];
  const tells = DATA.tells[fid] || [];
  const choice = {};   // qid -> 'has' | 'lacks' | 'na'

  const card = el('section', { className: 'card' });
  if (argument) card.append(recallBlock(argument));
  card.append(el('p', { className: 'kicker', textContent: f.pick_label }));
  card.append(el('h1', { textContent: 'Two quick checks on that.' }));
  card.append(el('p', { className: 'muted',
    textContent: 'Tap 👍 if the argument does this fair thing, 👎 if it falls short. A 👎 is the weak spot. ' +
      'Marking an honest 👎 isn’t being harsh; it’s just noticing.' }));

  // Reuse the same tri-button row interaction as the checklist (kept local for the short list).
  const makeRow = (r) => {
    const mkChoice = (kind, icon, label, cls) => {
      const b = el('button', { className: `tri ${cls}`, type: 'button' },
        el('span', { className: 'tri-icon', textContent: icon, 'aria-hidden': 'true' }),
        el('span', { className: 'tri-label', textContent: label }),
      );
      b.setAttribute('aria-label', `${label}: ${r.text}`);
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => { choice[r.qid] = choice[r.qid] === kind ? undefined : kind; refresh(); };
      return b;
    };
    const has = mkChoice('has', '👍', 'Yes, it does', 'tri-has');
    const lacks = mkChoice('lacks', '👎', 'No, it doesn’t', 'tri-lacks');
    const na = mkChoice('na', '🤷', 'Doesn’t apply', 'tri-na');
    function refresh() {
      for (const [b, k] of [[has, 'has'], [lacks, 'lacks'], [na, 'na']]) {
        const on = choice[r.qid] === k;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
    }
    return el('div', { className: 'check-row' },
      el('span', { className: 'check-text', textContent: r.text }),
      el('span', { className: 'tri-group' }, has, lacks, na),
    );
  };

  const list = el('div', { className: 'checklist' });
  for (const t of tells) list.append(makeRow({ qid: t.qid, text: t.text }));
  card.append(list);

  const see = el('button', { className: 'btn btn-primary', textContent: 'See the result →', 'aria-label': 'See the result' });
  see.onclick = () => {
    const affirmed = Object.keys(choice).filter((q) => choice[q] === 'has');
    const denied = Object.keys(choice).filter((q) => choice[q] === 'lacks');
    // Safety net (panel finding): if they denied nothing, this move probably isn't what's happening.
    // Rather than return a misleading "holds up", nudge them back to the other moves. They can still
    // force the result from there if they disagree.
    if (denied.length === 0) return renderMoveMiss(familyId, fid);
    renderVerdict(scoreChecklist(DATA, { familyId, affirmed, denied }), familyId, { affirmed, denied });
  };
  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '← Other moves', 'aria-label': 'Other moves', onclick: () => renderMovePick(familyId) }),
    see,
  ));
  mount(card);
}

// Shown when the user picked a move but didn't mark a 👎 on any of its checks, i.e. the move they
// picked probably isn't what the argument is doing. Offer the other moves, or let them proceed anyway.
function renderMoveMiss(familyId, fid) {
  clear();
  const f = DATA.fallacies[fid];
  const card = el('section', { className: 'card' });
  if (argument) card.append(recallBlock(argument));
  card.append(el('p', { className: 'kicker', textContent: 'Hmm' }));
  card.append(el('h1', { textContent: 'That might not be the move.' }));
  card.append(el('p', { textContent:
    `You didn’t mark a shortfall for “${f.pick_label}”, so it may not be what’s going on here. ` +
    'Want to look at the other moves, or is it genuinely fine?' }));
  const back = el('button', { className: 'btn btn-primary', textContent: 'See the other moves →' });
  back.onclick = () => renderMovePick(familyId);
  const fine = el('button', { className: 'btn', textContent: 'It looks fine to me' });
  fine.onclick = () => renderVerdict(scoreChecklist(DATA, { familyId: 'none' }));
  card.append(el('div', { className: 'answers' }, back, fine));
  mount(card);
}

// ---------- 3. the positive-first virtue checklist ----------
function renderChecklist(familyId) {
  // Deeper-branch redesign (deflection only, for now): instead of a wall of up to 16 virtue rows,
  // ask "which of these is it doing?" with a few plain moves surfaced from the argument, then a short
  // confirm for just that move. Same engine call, far fewer thumbs. Families without authored move
  // content fall through to the classic checklist below. See guidance/CHECKLIST-LENGTH-INVESTIGATION.md.
  const hasMoveContent = (DATA.families[familyId] || []).every((fid) => DATA.fallacies[fid]?.pick_label);
  if (hasMoveContent) return renderMovePick(familyId);

  clear();
  steelyStage('checklist');
  // Collect every tell for the family's fallacies, de-duplicated by question id (a question shared
  // across siblings appears once). Each row is a plain "Does it…?" question the user answers 👍 / 👎 / skip.
  // Carry each tell's diagnostic weight (its strongest yes-likelihood across the family's fallacies)
  // so we can lead with the most telling questions — see the progressive-disclosure split below.
  const qById = Object.fromEntries((DATA.questions || []).map((q) => [q.id, q]));
  const seen = new Set();
  const rows = [];
  for (const fid of DATA.families[familyId]) {
    for (const t of (DATA.tells[fid] || [])) {
      if (seen.has(t.qid)) continue;
      seen.add(t.qid);
      const q = qById[t.qid];
      const w = q ? Math.max(...DATA.families[familyId].map((f) => (q.lr[f] && q.lr[f].yes) || 0)) : 0;
      rows.push({ qid: t.qid, text: t.text, w, rel: relevanceToArgument(t.text) });
    }
  }
  // Sort by diagnostic weight first (most-telling leads). Within an equal-weight tie, lead with the
  // row whose wording best matches the user's own argument, so a crowd argument meets the "how many
  // believe it" row before the "famous name" one (re-test FIX1 residual: a shared family front-loaded
  // authority rows and a pure crowd argument briefly felt "wrong room"). This only reorders ties, so
  // it never changes which fallacy scores or the verdict. With no argument text, rel is 0 for all and
  // the order falls back to the original weight sort.
  rows.sort((a, b) => (b.w - a.w) || (b.rel - a.rel));

  // Progressive disclosure: a family with many tells reads as a "wall" (the neophyte re-audit). Lead
  // with the few most-telling checks; fold the rest behind a toggle. Folded checks stay scored if the
  // reader opens them, and an unanswered check is neutral either way — so this never changes a verdict.
  const LEAD = 4;
  const willFold = rows.length > 6;       // ≤6 isn't a wall; show all
  const choice = {};   // qid -> 'has' | 'lacks' | 'na'  (absent = skip; all non-has/lacks are neutral)

  const card = el('section', { className: 'card' });
  if (argument) card.append(recallBlock(argument));
  card.append(el('p', { className: 'kicker', textContent: familyName(familyId) }));
  // The neophyte panel found the positive framing inverted their model: they came hunting what's
  // BAD, the list asks about what's GOOD, and bare "yes/no" left 6 of 8 unsure which thumb meant
  // which. Fix: say plainly this is a list of things a FAIR argument does, and that a "no" is where a
  // weak spot hides. The buttons below are then self-explaining.
  card.append(el('h1', { textContent: 'Here’s what a fair argument would do. Does this one?' }));
  // The re-test found a 👎 felt like "being the cynic the app warned me about." So bless an honest 👎
  // as the careful, fair move, not cynicism. A weak spot you actually see is a finding, not a grudge.
  card.append(el('p', { className: 'muted',
    textContent: 'Tap 👍 if it does that, 👎 if it falls short there. Marking an honest 👎 isn’t being harsh; ' +
      'it’s just noticing. That’s where a weak spot would be. Answer the ones you can; many won’t apply, and that’s fine.' }));

  // Build one question row. Each choice carries its own always-visible label (under the icon), so
  // the meaning of 👍/👎 never hides on hover — the re-audit found the hover legend invisible on
  // phones. A third choice, "doesn’t apply", lets a reader confidently clear a row that can’t apply
  // to their one-liner; it maps to neutral (omitted from affirmed/denied), exactly like a skip.
  const makeRow = (r) => {
    const mkChoice = (kind, icon, label, cls) => {
      const b = el('button', { className: `tri ${cls}`, type: 'button' },
        el('span', { className: 'tri-icon', textContent: icon }),
        el('span', { className: 'tri-label', textContent: label }),
      );
      // The emoji + short label don't say WHICH question this answers, so name the button fully for
      // screen readers, hide the decorative emoji, and expose the chosen state (aria-pressed).
      b.querySelector('.tri-icon').setAttribute('aria-hidden', 'true');
      b.setAttribute('aria-label', `${label}: ${r.text}`);
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => { choice[r.qid] = choice[r.qid] === kind ? undefined : kind; refresh(); };
      return b;
    };
    // Side-anchored labels, not bare "yes/no": the panel found 6 of 8 couldn't tell what "yes" meant
    // (good? on my side? caught the bad thing?). "Yes, it does" / "No, it doesn't" pin the meaning to
    // the question itself. Engine mapping is unchanged: has → affirmed → VALID, lacks → denied → fallacy.
    const has = mkChoice('has', '👍', 'Yes, it does', 'tri-has');
    const lacks = mkChoice('lacks', '👎', 'No, it doesn’t', 'tri-lacks');
    const na = mkChoice('na', '🤷', 'Doesn’t apply', 'tri-na');
    function refresh() {
      for (const [b, k] of [[has, 'has'], [lacks, 'lacks'], [na, 'na']]) {
        const on = choice[r.qid] === k;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
    }
    return el('div', { className: 'check-row' },
      el('span', { className: 'check-text', textContent: r.text }),
      el('span', { className: 'tri-group' }, has, lacks, na),
    );
  };

  const lead = willFold ? rows.slice(0, LEAD) : rows;
  const folded = willFold ? rows.slice(LEAD) : [];

  const list = el('div', { className: 'checklist' });
  for (const r of lead) list.append(makeRow(r));
  card.append(list);

  if (folded.length) {
    const more = el('div', { className: 'checklist', hidden: true });
    for (const r of folded) more.append(makeRow(r));
    const toggle = el('button', { className: 'btn btn-quiet show-more',
      textContent: `+ Show ${folded.length} more check${folded.length > 1 ? 's' : ''}` });
    toggle.onclick = () => {
      more.hidden = !more.hidden;
      toggle.textContent = more.hidden
        ? `+ Show ${folded.length} more check${folded.length > 1 ? 's' : ''}`
        : '− Show fewer';
    };
    card.append(toggle);
    card.append(more);
  }

  const see = el('button', { className: 'btn btn-primary', textContent: 'See the result →', 'aria-label': 'See the result' });
  see.onclick = () => {
    // 'na' (doesn’t apply) and skip are both neutral — only 👍/👎 feed the engine.
    const affirmed = Object.keys(choice).filter((q) => choice[q] === 'has');
    const denied = Object.keys(choice).filter((q) => choice[q] === 'lacks');
    renderVerdict(scoreChecklist(DATA, { familyId, affirmed, denied }), familyId, { affirmed, denied });
  };
  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '← Pick a different focus', 'aria-label': 'Pick a different focus', onclick: renderFamilyPick }),
    see,
  ));
  mount(card);
}

// ---------- 4. verdicts (tentative + teaching) ----------
// `marked` carries the user's own ticks ({affirmed, denied} qid lists) so a verdict can cite them
// as its premises. The re-contracting fix for "I thought IT would tell ME": the user supplies the
// observations, the app visibly performs the one step they can't do alone: composing those
// observations into a named pattern from the catalog. Without it the verdict reads as the app
// making a call out of thin air and then handing the judging back.
function renderVerdict(result, familyId, marked = {}) {
  clear();
  steelyStage(result.kind);   // mascot maps accuse/lean → gap, valid → holds, cynic → skeptic
  switch (result.kind) {
    case 'accuse': return renderAccuse(result, marked);
    case 'inconclusive_lean': return renderInconclusive(result, marked);
    case 'valid_earned': return renderValid('earned', marked);
    case 'cynic_valid':
    default: return renderValid(familyId ? 'checked' : 'skimmed');
  }
}

// The text of a tell by qid, from any fallacy that owns it (first match). Used to echo the user's
// own ticks back on the verdict screen. A shared qid can carry different texts across fallacies;
// for an accusation we always cite the ACCUSED fallacy's own wording (see renderAccuse), this
// catch-all is only for the lean/earned screens where any owner's wording says the same thing.
function anyTellText(qid) {
  for (const ts of Object.values(DATA.tells)) {
    const t = ts.find((x) => x.qid === qid);
    if (t) return t.text;
  }
  return null;
}

// "Built from your answers" block: each cited tell echoed with the user's own call attached.
// verb: what their tick meant ('no' for a denied virtue, 'yes' for an affirmed one).
function premiseBlock(lead, texts, verb) {
  const block = el('div', { className: 'premises' },
    el('p', { className: 'premises-lead', textContent: lead }));
  for (const t of texts) {
    block.append(el('p', { className: 'premise' },
      el('span', { className: 'premise-q', textContent: `“${t}”` }),
      el('span', { className: 'premise-a', textContent: ` Your call: ${verb}.` })));
  }
  return block;
}

function renderAccuse(result, marked = {}) {
  const f = DATA.fallacies[result.fallacy];
  // The premises of this accusation are the accused fallacy's OWN tells the user marked absent.
  // (Denials of sibling tells never feed this fallacy's score, per-fallacy isolation, so citing
  // them here would misstate how the verdict was reached.)
  const deniedSet = new Set(marked.denied || []);
  const cited = (DATA.tells[result.fallacy] || []).filter((t) => deniedSet.has(t.qid));
  const yes = el('button', { className: 'btn btn-primary', textContent: 'Yes, that fits' });
  const no = el('button', { className: 'btn', textContent: 'No, that’s not it' });
  const card = el('section', { className: 'card verdict-accuse' },
    el('p', { className: 'kicker', textContent: 'One thing to check' }),
    el('h1', { className: 'verdict-title', textContent: `There may be a weak spot here. It looks like ${f.name}.` }),
  );
  if (cited.length) {
    card.append(premiseBlock('This comes from your own answers, put together:', cited.map((t) => t.text), 'no'));
    card.append(el('p', { className: 'muted', textContent:
      'Each of those is an honest observation. Together, they form a pattern with a name. You’re the judge of whether it fits:' }));
  } else {
    card.append(el('p', { className: 'muted', textContent: 'That’s just what we noticed. You’re the judge. Here’s what it means:' }));
  }
  card.append(
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
  mount(card);
  yes.onclick = () => { steelyStage('confirmed'); renderConfirmed(f); };
  no.onclick = () => { steelyStage('cynic_after_reject'); renderCynic('rejected', f); };
}

function renderConfirmed(f) {
  clear();
  mount(el('section', { className: 'card verdict-accuse' },
    el('p', { className: 'kicker', textContent: 'You made the call' }),
    el('h1', { className: 'verdict-title', textContent: `Looks like ${article(f.name)} ${f.name}.` }),
    el('p', { textContent:
      'You confirmed it. The argument depends on this instead of standing on its own. ' +
      'Naming it isn’t a way to “win,” though. The real point underneath might still be worth ' +
      'taking seriously once it’s made fairly. The fair next move is to ask for the stronger version.' }),
    el('p', { className: 'muted', textContent: 'Spotting the weak spot is the easy part. Building the strongest version of what’s left is the generous one, and the whole point here.' }),
    restartRow(),
  ));
}

function renderInconclusive(result, marked = {}) {
  clear();
  const f = result.leanFallacy ? DATA.fallacies[result.leanFallacy] : null;
  const lean = f
    ? `There might be something here, maybe ${article(f.name)} ${f.name}, but not enough to be sure.`
    : 'There might be something here, but not enough to be sure.';
  const card = el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The result' }),
    el('h1', { className: 'verdict-title', textContent: 'Not enough to be sure, and that’s fine.' }),
  );
  // Echo what they actually flagged, so "not sure" reads as an honest weighing of THEIR findings,
  // not the app shrugging them off (re-audit: the old ending "read as the app giving up").
  const flagged = (marked.denied || []).map(anyTellText).filter(Boolean).slice(0, 3);
  if (flagged.length) {
    card.append(premiseBlock('You did spot something. You marked:', flagged, 'no'));
  }
  card.append(
    el('p', { textContent: lean + ' We’d rather say “not sure” than pin a label on an argument that might be fine.' }),
    el('p', { className: 'muted', textContent: 'Trust your own read. If it still feels wrong, the fair move is to ask the other person to explain their reasoning.' }),
    restartRow(),
  );
  mount(card);
}

// mode: 'earned' (user affirmed ≥2 virtues → positively justified),
//       'checked' (inspected a family, nothing failed enough → not defeated),
//       'skimmed' ("none of these / seems fine" → not inspected, just stands)
function renderValid(mode, marked = {}) {
  clear();
  const COPY = {
    // The re-test found "it holds up" gets misread as "the other person is RIGHT and you lose," and
    // the rescue only worked if the user read the muted small print (Sam almost skipped it). Fix: put
    // the "not who's right" frame in the KICKER (read first, before the headline) AND keep the title
    // about HOW it's argued, so the gut-drop never gets a chance to land. The muted line stays for detail.
    earned: {
      kicker: 'About how it’s argued, not who’s right',
      title: 'No weak spot here. It’s argued fairly.',
      body: 'You marked the things a fair argument does, and they checked out. This isn’t just “nothing wrong found.” The way it’s argued does its job.',
      muted: 'This isn’t a ruling that the other person is right. It only means the reasoning has no obvious hole. You can still disagree; the fair way is to answer the actual point.',
    },
    checked: {
      kicker: 'About how it’s argued, not who’s right',
      title: 'No clear weak spot in how it’s argued.',
      body: 'You looked closely at this kind of problem and gave it a fair chance. The reasoning held up. Nothing clearly wrong with how the point is made.',
      muted: 'You can still think they’re wrong; just take on the actual point rather than a weak spot.',
    },
    skimmed: {
      kicker: 'About how it’s argued, not who’s right',
      title: 'Nothing jumped out. The reasoning seems fine.',
      body: 'You read it fairly and didn’t spot a problem worth digging into. Nothing clearly wrong with how it’s argued.',
      muted: 'This doesn’t crown a winner; it just means no obvious hole turned up. If something still nags at you, pick the kind of problem it might be and check.',
    },
  };
  const c = COPY[mode] || COPY.checked;
  const card = el('section', { className: 'card verdict-valid' },
    el('p', { className: 'kicker', textContent: c.kicker || 'The verdict' }),
    el('h1', { className: 'verdict-title', textContent: c.title }),
    el('p', { textContent: c.body }),
  );
  // Earned means the user vouched for specific virtues; show them their own case, not just our
  // summary of it. (Same re-contracting as the accusation screen, pointed the other way.)
  if (mode === 'earned') {
    const vouched = (marked.affirmed || []).map(anyTellText).filter(Boolean).slice(0, 3);
    const more = (marked.affirmed || []).length - vouched.length;
    if (vouched.length) {
      card.append(premiseBlock(
        more > 0 ? `The case you built for it (and ${more} more):` : 'The case you built for it:',
        vouched, 'yes'));
    }
  }
  card.append(
    el('p', { className: 'muted', textContent: c.muted }),
    restartRow(),
  );
  mount(card);
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
  mount(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The result' }),
    el('h1', { className: 'verdict-title', textContent: 'No clear problem. It seems to hold up.' }),
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
  mount(el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Couldn’t start' }),
    el('h1', { className: 'hero', textContent: 'Steelman' }),
    el('p', { className: 'error', textContent: err.message || String(err) }),
  ));
}
