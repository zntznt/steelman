// Steelman UI: the Reading Desk. Positive-first, family-routed checklist.
// All reasoning lives in the (tested) engine; this file gathers a paste, a family choice, and a
// virtue checklist, then asks the engine to score. Adding a fallacy never touches this file.
//
// Layout: a two-pane desk. The pasted argument is pinned in a left sidebar for the whole session,
// with step "receipts" accumulating beneath it, while the right pane walks the picker flow.
//
// Flow: paste -> (cue scan suggests a family) -> pick a family -> confirm the argument's virtues
//       (yes it does this / no it falls short / doesn't apply) -> tentative + teaching verdict.
//
// The engine, the flow logic, the suggestion gating, the fold thresholds and the tri-state
// neutrality are unchanged from the prior version. This is a reskin of the DOM, not a refactor of
// the decisions.

import { loadData, scoreChecklist, suggestFamily, suggestBucket, suggestMoves, CONFIG } from './engine.js';

const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    // aria-*, role, and data-* aren't reflected DOM properties, so Object.assign would silently lose
    // them; route those through setAttribute. Everything else (className, textContent, onclick, ...) is
    // a real property and gets assigned directly.
    if (k === 'role' || k.startsWith('aria-') || k.startsWith('data-')) n.setAttribute(k, v);
    else if (k === 'style') n.style.cssText = v;   // a plain string of inline declarations
    else n[k] = v;
  }
  for (const c of kids) n.append(c);
  return n;
};

let DATA = null;       // loaded bank (incl. families, familyMeta, familyCues, tells)
let argument = '';     // the pasted argument, for reference + cue scan

// The sidebar's step receipts. The only persistent UI state the desk adds: what the reader picked
// at each step. Every value here is derivable from what the flow already passes between screens; we
// keep it in one place so the pinned sidebar can show it on every screen. Reset on restart.
let receipt = { family: '', move: '', checks: '' };
const resetReceipt = () => { receipt = { family: '', move: '', checks: '' }; };

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
    // fetch() of local files fails under file://. That is the most common "blank page" cause.
    throw new Error(
      `Could not load ${path}. If you opened index.html directly from disk, ` +
      `serve the folder instead (e.g. "python3 -m http.server" then open http://localhost:8000). ` +
      `On GitHub Pages this works automatically.`
    );
  }
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}).`);
  return res.json();
}

const familyName = (id) => DATA.familyMeta[id]?.name || id;
// "a" / "an" so we never say "a Ad Hominem". Many of the fallacy names start with a vowel sound.
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// ---------- the desk shell ----------
// Mount a screen: build the two-pane desk (pinned sidebar + right pane), replace the app, then move
// focus to the pane's heading. For user-initiated screen swaps this is the correct a11y pattern:
// it tells a screen reader where it now is and drops a keyboard user at the top of the new content.
// `now` is the active step index (0..3) or null on the start screen.
function mountDesk(paneNodes, now) {
  const pane = el('section', { className: 'pane' });
  pane.setAttribute('role', 'main');
  for (const nd of paneNodes) if (nd) pane.append(nd);
  const desk = el('div', { className: 'desk' }, buildRail(now), pane);
  app.replaceChildren(desk);
  const heading = pane.querySelector('h1');
  if (heading) {
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: false });
  }
}

const STEP_LABELS = ['Where to look', 'Which move', 'Two checks', 'The verdict'];

// The pinned sidebar: brand block, the argument as an italic Fraunces quote (once pasted), then the
// step receipts and a quiet "start over". On the start screen (now === null, no argument) it shows
// only the brand block: a placeholder here confused first-time readers, so there isn't one.
function buildRail(now) {
  const rail = el('aside', { className: 'rail' });
  rail.setAttribute('aria-label', 'The argument and your progress');

  const brand = el('div', { className: 'rail-brand' },
    el('div', { className: 'rail-mark', textContent: 'Steelman' }),
    el('div', { className: 'rail-tag', textContent: 'A fair reading' }),
  );
  // A compact "step N / 4" counter, shown only on mobile (CSS) where the receipt list is hidden.
  if (argument && now != null) {
    brand.append(el('div', { className: 'rail-step', textContent: `step ${now + 1} / 4` }));
  }
  rail.append(brand);

  if (argument) {
    rail.append(railArgument(argument));
    rail.append(el('div', { className: 'rail-note',
      textContent: 'The argument, exactly as you pasted it. It stays here the whole time.' }));
  }

  // Receipts + start-over live at the bottom, above a hairline rule.
  const foot = el('div', { className: 'rail-foot' });
  if (argument) {
    const values = [receipt.family, receipt.move, receipt.checks, ''];
    for (let i = 0; i < 4; i++) {
      const value = values[i] || '';
      const isNow = i === now;
      const done = !!value && i < now;
      const row = el('div', { className: 'receipt' + (isNow ? ' is-now' : '') + (done ? ' is-done' : '') });
      if (!(isNow || done || value)) row.classList.add('is-future');
      row.append(el('span', { className: 'receipt-num', textContent: done ? '✓' : '0' + (i + 1),
        'aria-hidden': 'true' }));
      row.append(el('span', { className: 'receipt-label', textContent: STEP_LABELS[i] }));
      const valText = isNow && !value ? 'now' : value;
      if (valText) {
        row.append(el('span', { className: 'receipt-value' + (isNow && !value ? ' is-now-tag' : ''),
          textContent: valText }));
      }
      foot.append(row);
    }
    const over = el('button', { className: 'rail-restart link', type: 'button',
      textContent: '↺ Start over', 'aria-label': 'Start over',
      onclick: () => { argument = ''; resetReceipt(); renderStart(); } });
    foot.append(over);
  } else {
    // Start screen: the four steps sit dim and unnumbered-into-the-future so the desk reads as a plan.
    for (let i = 0; i < 4; i++) {
      const row = el('div', { className: 'receipt is-future' },
        el('span', { className: 'receipt-num', textContent: '0' + (i + 1), 'aria-hidden': 'true' }),
        el('span', { className: 'receipt-label', textContent: STEP_LABELS[i] }),
      );
      foot.append(row);
    }
  }
  rail.append(foot);
  return rail;
}

// The pinned argument as an italic Fraunces quote. A long paste must not push the receipts off the
// bottom of the rail, so clamp it to ~8 lines and offer a "Show full argument" toggle. Long unbroken
// tokens (URLs) wrap rather than overflow sideways.
function railArgument(text) {
  const wrap = el('div', { className: 'rail-quote-wrap' });
  const quote = el('blockquote', { className: 'rail-quote clamped', textContent: `“${text}”` });
  wrap.append(quote);
  requestAnimationFrame(() => {
    if (quote.scrollHeight - quote.clientHeight <= 4) {
      quote.classList.remove('clamped');   // short paste: no clamp, no toggle
      return;
    }
    const btn = el('button', { className: 'rail-expand link', type: 'button',
      textContent: 'Show full argument' });
    btn.setAttribute('aria-expanded', 'false');
    btn.onclick = () => {
      const open = quote.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Show less' : 'Show full argument';
    };
    wrap.append(btn);
  });
  return wrap;
}

// ---------- right-pane building blocks ----------
// Every screen opens the same way: a mono uppercase kicker, a Fraunces h1, then a muted intro line.
function paneHead(kicker, title, muted, opts = {}) {
  const nodes = [el('p', { className: 'kicker', textContent: kicker })];
  const h1 = el('h1', { className: 'pane-title' + (opts.big ? ' pane-title--big' : ''), textContent: title });
  if (opts.titleClass) h1.classList.add(opts.titleClass);
  nodes.push(h1);
  if (muted) nodes.push(el('p', { className: 'pane-intro', textContent: muted }));
  return nodes;
}

// A ruled list row (family pick, bucket families, move pick). `num`/`numColor`/`badge`/`fine` shape
// the leading numeral and the "· suggested" / "it's fine" treatments. The whole row is the button.
function pickRow({ num, kind, title, sub, badge, onPick }) {
  const numSpan = el('span', { className: 'pick-num', textContent: num, 'aria-hidden': 'true' });
  const titleSpan = el('span', { className: 'pick-title', textContent: title });
  if (badge) titleSpan.append(el('span', { className: 'pick-badge', textContent: ' ' + badge }));
  const row = el('button', { className: 'pick-row' + (kind ? ' pick-row--' + kind : ''), type: 'button' },
    numSpan, titleSpan, el('span', { className: 'pick-sub', textContent: sub }),
  );
  row.onclick = onPick;
  return row;
}

function pickList(rows) {
  const list = el('div', { className: 'picker' });
  for (const r of rows) list.append(r);
  return list;
}

// A right-aligned or between footer for the pane. `back` is an underlined link, `note` a faint hint,
// `primary` the ink call-to-action.
function paneFoot({ back, note, primary }) {
  const foot = el('div', { className: 'pane-foot' });
  if (back) {
    foot.append(el('button', { className: 'link link-back', type: 'button', textContent: back.label,
      'aria-label': back.label.replace(/^[^A-Za-z]+/, ''), onclick: back.onClick }));
  }
  if (note) foot.append(el('span', { className: 'pane-note', textContent: note }));
  if (primary) {
    foot.append(el('button', { className: 'btn btn-primary', type: 'button', textContent: primary.label,
      'aria-label': primary.label.replace(/\s*→$/, ''), onclick: primary.onClick }));
  }
  return foot;
}

// ---------- 1. paste ----------
function renderStart() {
  resetReceipt();
  const ta = el('textarea', { id: 'arg', className: 'paste', placeholder: 'Paste what they said here…',
    value: argument });
  const begin = el('button', { className: 'btn btn-primary', type: 'button', textContent: 'Check it →',
    'aria-label': 'Check it' });

  const example = el('div', { className: 'example' },
    el('span', { className: 'example-label', textContent: 'For example, someone says' }),
    el('span', { className: 'example-quote', textContent:
      '“We can’t trust her plan. She failed a class in college.”' }),
  );

  const err = el('p', { id: 'arg-err', className: 'error', role: 'alert', hidden: true,
    textContent: 'Paste what someone said first, then check it.' });

  const nodes = [
    el('h1', { className: 'pane-title pane-title--hero', textContent: 'Does this point actually hold up?' }),
    el('p', { className: 'pane-intro pane-intro--wide', textContent:
      'Paste something another person said or wrote, the kind of thing you’re not sure about. ' +
      'We’ll start by assuming it’s fair, see what it gets right, and only point out a weak ' +
      'spot in the reasoning if there really is one.' }),
    el('p', { className: 'pane-gloss', textContent:
      'That kind of weak spot is what people call a “fallacy.” To “steelman” is to ' +
      'read someone’s point at its strongest before you judge it.' }),
    example,
    ta,
    err,
    el('div', { className: 'pane-foot pane-foot--end' }, begin),
  ];
  mountDesk(nodes, null);
  ta.focus();

  const clearErr = () => {
    err.hidden = true;
    ta.removeAttribute('aria-invalid');
    ta.classList.remove('is-invalid');
  };
  ta.addEventListener('input', clearErr);

  begin.onclick = () => {
    argument = ta.value.trim();
    if (!argument) {
      err.hidden = false;
      ta.setAttribute('aria-invalid', 'true');
      ta.setAttribute('aria-describedby', 'arg-err');
      ta.classList.add('is-invalid');
      ta.focus();
      return;
    }
    renderFamilyPick();
  };
}

// ---------- 2. pick a bucket (2-level: bucket -> family). Cue scan suggests, never decides. ----------
function renderFamilyPick() {
  resetReceipt();
  const famSuggestion = suggestFamily(DATA, argument).top;       // strongest single family (fast path)
  const bucketSuggestion = suggestBucket(DATA, argument).top;    // likely bucket
  const order = (DATA.buckets || []).map((b) => b.id);
  const buckets = bucketSuggestion
    ? [bucketSuggestion, ...order.filter((b) => b !== bucketSuggestion)]
    : order;

  const rows = [];
  let n = 0;

  // Fast path: if the scan strongly points at ONE family, offer it directly at the top.
  if (famSuggestion) {
    const meta = DATA.familyMeta[famSuggestion];
    rows.push(pickRow({ num: String(++n), kind: 'suggested', title: meta.name, sub: meta.prompt,
      badge: '· suggested', onPick: () => renderChecklist(famSuggestion) }));
  }

  // The buckets (each opens its families). Only highlight the suggested bucket when there's no
  // fast-path family shown above. Otherwise the highlight would point at two things at once.
  const bm = Object.fromEntries((DATA.buckets || []).map((b) => [b.id, b]));
  for (const bucket of buckets) {
    const meta = bm[bucket];
    if (!meta) continue;
    const highlight = !famSuggestion && bucket === bucketSuggestion;
    rows.push(pickRow({ num: String(++n), kind: highlight ? 'suggested' : '', title: meta.name,
      sub: meta.prompt || '', badge: highlight ? '· suggested' : '',
      onPick: () => {
        const fams = DATA.bucketFamilies[bucket] || [];
        if (fams.length === 1) return renderChecklist(fams[0]);
        renderBucketFamilies(bucket);
      } }));
  }

  // The goodwill escape hatch.
  rows.push(pickRow({ num: '✓', kind: 'fine', title: 'Nothing. It looks fine to me',
    sub: 'Maybe it really is fine. That happens a lot.',
    onPick: () => renderVerdict(scoreChecklist(DATA, { familyId: 'none' }), null, {}) }));

  const nodes = [
    ...paneHead('Where to look', 'What feels wrong about it, if anything?',
      bucketSuggestion
        ? 'Here’s a place to start, but trust your own read. Pick the closest one, then we’ll narrow it.'
        : 'Pick the closest one, then we’ll narrow it. (If it seems fine, you can say that too.)'),
    pickList(rows),
    paneFoot({ note: 'We start by trusting the argument, then look for any real problem.' }),
  ];
  mountDesk(nodes, 0);
}

// ---------- 2b. pick a family within the chosen bucket ----------
function renderBucketFamilies(bucket) {
  resetReceipt();
  const bm = Object.fromEntries((DATA.buckets || []).map((b) => [b.id, b]));
  const famSuggestion = suggestFamily(DATA, argument).top;
  const fams = (DATA.bucketFamilies[bucket] || []);
  const ordered = famSuggestion && fams.includes(famSuggestion)
    ? [famSuggestion, ...fams.filter((f) => f !== famSuggestion)]
    : fams;

  const rows = ordered.map((fam, i) => {
    const meta = DATA.familyMeta[fam];
    const hl = fam === famSuggestion;
    return pickRow({ num: String(i + 1), kind: hl ? 'suggested' : '', title: meta.name, sub: meta.prompt,
      badge: hl ? '· suggested' : '', onPick: () => renderChecklist(fam) });
  });

  const nodes = [
    ...paneHead(bm[bucket]?.name || 'Narrow it down', 'Which fits best?', 'Pick the closest one.'),
    pickList(rows),
    paneFoot({ back: { label: '← Pick a different focus', onClick: renderFamilyPick },
      note: 'We still start by trusting the argument.' }),
  ];
  mountDesk(nodes, 0);
}

// Lightweight relevance between a checklist row and the user's pasted argument, used ONLY to break
// ties between equal-weight rows so the most on-topic one leads. Not the engine, not routing: just
// "does this row's concern echo what the user typed." Returns a score; 0 with no argument.
const STOP = new Set(('a an and are as at be by does do for from has have how in is it its not of on or '
  + 'rather than that the their them they this to was what when where which who whom why with you your '
  + 'argument claim point reason really just only made make says said say').split(' '));
const CONCEPTS = [
  { arg: ['everyone', 'everybody', 'all', 'most', 'people', 'popular', 'crowd', 'majority', 'trend', 'trending'],
    row: ['many', 'people', 'believe', 'agree', 'popular', 'crowd'] },
  { arg: ['expert', 'doctor', 'scientist', 'professor', 'famous', 'celebrity', 'official', 'authority'],
    row: ['name', 'backed', 'expert', 'authority'] },
  { arg: ['always', 'tradition', 'traditional', 'ancestors', 'generations'],
    row: ['old', 'traditional', 'lasting', 'long'] },
  { arg: ['new', 'newest', 'latest', 'modern', 'cutting'],
    row: ['new', 'latest', 'newer'] },
];
function relevanceToArgument(rowText) {
  if (!argument) return 0;
  const words = (s) => new Set((String(s).toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 3 && !STOP.has(w)));
  const argWords = words(argument);
  if (!argWords.size) return 0;
  const rowWords = words(rowText);
  let score = 0;
  for (const w of rowWords) if (argWords.has(w)) score++;
  for (const c of CONCEPTS) {
    const argHas = c.arg.some((w) => argWords.has(w));
    const rowHas = c.row.some((w) => rowWords.has(w));
    if (argHas && rowHas) score += 2;
  }
  return score;
}

// ---------- 3a. the "which move is it?" pick ----------
// Surfaces the 2-3 most likely sibling fallacies from the pasted argument (suggestMoves), each as a
// plain label + an everyday example, with a "something else" that reveals the rest. Picking a move
// leads to a short confirm.
function renderMovePick(familyId) {
  receipt.family = familyName(familyId);
  receipt.move = '';
  receipt.checks = '';
  const fids = DATA.families[familyId];
  const { surfaced, allZero } = suggestMoves(DATA, familyId, argument);
  // When NOTHING in the argument matched a move (allZero), show ALL moves at once with honest "nothing
  // jumped out" framing and DON'T single one out. Only when a real cue matched do we surface the few
  // likely moves and fold the rest behind "something else". Engine-mandated behavior, kept as-is.
  const showAll = allZero;
  const shown = showAll ? fids : surfaced;
  const shownSet = new Set(shown);
  const others = showAll ? [] : fids.filter((f) => !shownSet.has(f));

  const mkMove = (fid, i) => {
    const f = DATA.fallacies[fid];
    return pickRow({ num: String(i + 1), title: f.pick_label, sub: f.pick_example,
      onPick: () => renderMoveConfirm(familyId, fid) });
  };

  const list = el('div', { className: 'picker' });
  shown.forEach((fid, i) => list.append(mkMove(fid, i)));

  const nodes = [
    ...paneHead(familyName(familyId), 'Which of these is it doing?',
      allZero
        ? 'Nothing jumped out from your wording, so here are all of them. Pick the one that fits, or go back if none do.'
        : 'Here are the closest matches. Pick the one that fits, or open “something else” to see the rest.'),
    list,
  ];

  if (others.length) {
    const moreList = el('div', { className: 'picker picker--more', hidden: true });
    others.forEach((fid, i) => moreList.append(mkMove(fid, shown.length + i)));
    const toggle = el('button', { className: 'link link-toggle', type: 'button',
      textContent: `Something else (${others.length} more)` });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.onclick = () => {
      const open = moreList.hidden;
      moreList.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '− Show fewer' : `Something else (${others.length} more)`;
    };
    nodes.push(toggle, moreList);
  }

  nodes.push(paneFoot({ back: { label: '← Pick a different focus', onClick: renderFamilyPick },
    note: 'We still start by trusting the argument.' }));
  mountDesk(nodes, 1);
}

// ---------- the tri-state segmented control (shared by all checks screens) ----------
// Replaces the old emoji chips with a text-only segmented control: one wrapper, three buttons.
// Clicking a selected option deselects it (tri-state toggle). Keeps the aria-pressed + full aria-label.
function checkCard(row, choice, onChange) {
  const mkBtn = (kind, label, cls) => {
    const b = el('button', { className: `seg-btn ${cls}`, type: 'button', textContent: label });
    b.setAttribute('aria-label', `${label}: ${row.text}`);
    b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { choice[row.qid] = choice[row.qid] === kind ? undefined : kind; refresh(); onChange?.(); };
    return b;
  };
  const yes = mkBtn('has', 'Yes, it does', 'seg-yes');
  const no = mkBtn('lacks', 'No, it doesn’t', 'seg-no');
  const na = mkBtn('na', 'Doesn’t apply', 'seg-na');
  function refresh() {
    for (const [b, k] of [[yes, 'has'], [no, 'lacks'], [na, 'na']]) {
      const on = choice[row.qid] === k;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  refresh();   // reflect any carried-forward choice
  return el('div', { className: 'check-card' },
    el('span', { className: 'check-q', textContent: row.text }),
    el('span', { className: 'seg' }, yes, no, na),
  );
}

// ---------- 3b. the short confirm for one picked move ----------
function renderMoveConfirm(familyId, fid) {
  const f = DATA.fallacies[fid];
  receipt.move = f.pick_label;
  const tells = DATA.tells[fid] || [];
  const choice = {};   // qid -> 'has' | 'lacks' | 'na'

  const list = el('div', { className: 'checks' });
  for (const t of tells) list.append(checkCard({ qid: t.qid, text: t.text }, choice));

  const see = () => {
    const affirmed = Object.keys(choice).filter((q) => choice[q] === 'has');
    const denied = Object.keys(choice).filter((q) => choice[q] === 'lacks');
    // Safety net: if they denied nothing, this move probably isn't what's happening. Rather than
    // return a misleading "holds up", nudge them back to the other moves.
    if (denied.length === 0) return renderMoveMiss(familyId, fid);
    renderVerdict(scoreChecklist(DATA, { familyId, affirmed, denied }), familyId, { affirmed, denied });
  };

  const nodes = [
    ...paneHead(f.pick_label, 'Two quick checks on that.',
      'Mark “yes” if the argument does this fair thing, “no” if it falls short. A ' +
      '“no” is the weak spot. Marking an honest “no” isn’t being harsh; it’s just noticing.'),
    list,
    paneFoot({ back: { label: '← Other moves', onClick: () => renderMovePick(familyId) },
      primary: { label: 'See the result →', onClick: see } }),
  ];
  mountDesk(nodes, 2);
}

// Shown when the user picked a move but didn't mark a "no" on any of its checks: the move probably
// isn't what the argument is doing. Offer the other moves, or let them proceed anyway.
function renderMoveMiss(familyId, fid) {
  const f = DATA.fallacies[fid];
  const nodes = [
    ...paneHead('Hmm', 'That might not be the move.', ''),
    el('p', { className: 'pane-body', textContent:
      `You didn’t mark a shortfall for “${f.pick_label}”, so it may not be what’s going on ` +
      'here. Want to look at the other moves, or is it genuinely fine?' }),
    (() => {
      const g = el('div', { className: 'action-row' });
      g.append(el('button', { className: 'btn btn-primary', type: 'button',
        textContent: 'See the other moves →', onclick: () => renderMovePick(familyId) }));
      g.append(el('button', { className: 'btn btn-secondary', type: 'button',
        textContent: 'It looks fine to me',
        onclick: () => renderVerdict(scoreChecklist(DATA, { familyId: 'none' }), null, {}) }));
      return g;
    })(),
  ];
  mountDesk(nodes, 1);
}

// "Make sure": from the inconclusive-lean screen, the user zooms in on ONE close candidate to settle
// it. Any tells they already denied are pre-marked, so a second honest denial pushes it over the
// naming line; if they instead affirm the rest, it stays "holds up" and they've confirmed it does NOT
// fit, just as valuable. Same engine, same goodwill framing.
function renderMakeSure(familyId, fid, priorDenied = [], leanBack = null) {
  const f = DATA.fallacies[fid];
  const tells = DATA.tells[fid] || [];
  const priorSet = new Set(priorDenied.filter((q) => tells.some((t) => t.qid === q)));
  const choice = {};
  for (const q of priorSet) choice[q] = 'lacks';   // carry forward the denial that made it a candidate

  const savedReceipt = { ...receipt };
  receipt.move = f.pick_label || f.name;

  const list = el('div', { className: 'checks' });
  for (const t of tells) list.append(checkCard({ qid: t.qid, text: t.text }, choice));

  const see = () => {
    const affirmed = Object.keys(choice).filter((q) => choice[q] === 'has');
    const denied = Object.keys(choice).filter((q) => choice[q] === 'lacks');
    renderVerdict(scoreChecklist(DATA, { familyId, affirmed, denied }), familyId, { affirmed, denied });
  };
  const back = () => {
    receipt = savedReceipt;   // restore the lean verdict's own receipts
    if (leanBack) leanBack();
    else renderVerdict(scoreChecklist(DATA, { familyId, denied: priorDenied }), familyId, { denied: priorDenied });
  };

  const nodes = [
    ...paneHead('A closer look', `Is it ${article(f.name)} ${f.name}?`,
      'A few checks on just this one. Mark “yes” if the argument does the fair thing, ' +
      '“no” if it falls short. If it does them all, it holds up here, and you’ll have made sure.'),
    list,
    paneFoot({ back: { label: '← Back', onClick: back },
      primary: { label: 'See the result →', onClick: see } }),
  ];
  mountDesk(nodes, 2);
}

// ---------- 3. the positive-first virtue checklist (classic path) ----------
function renderChecklist(familyId) {
  // Deeper-branch redesign (deflection only, for now): families with authored move content use the
  // "which move is it?" pick instead of a wall of virtue rows. Families without it fall through here.
  const hasMoveContent = (DATA.families[familyId] || []).every((fid) => DATA.fallacies[fid]?.pick_label);
  if (hasMoveContent) return renderMovePick(familyId);

  receipt.family = familyName(familyId);
  receipt.move = 'Direct checks';
  receipt.checks = '';

  // Collect every tell for the family's fallacies, de-duplicated by question id. Carry each tell's
  // diagnostic weight so we can lead with the most telling questions.
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
  // Sort by diagnostic weight, breaking ties toward the row that best echoes the argument. This only
  // reorders ties, so it never changes which fallacy scores or the verdict.
  rows.sort((a, b) => (b.w - a.w) || (b.rel - a.rel));

  const LEAD = 4;
  const willFold = rows.length > 6;       // <=6 isn't a wall; show all
  const choice = {};

  const lead = willFold ? rows.slice(0, LEAD) : rows;
  const folded = willFold ? rows.slice(LEAD) : [];

  const list = el('div', { className: 'checks' });
  for (const r of lead) list.append(checkCard(r, choice));

  const nodes = [
    ...paneHead(familyName(familyId), 'Here’s what a fair argument would do. Does this one?',
      'Mark “yes” if it does that, “no” if it falls short there. Marking an honest ' +
      '“no” isn’t being harsh; it’s just noticing. That’s where a weak spot would ' +
      'be. Answer the ones you can; many won’t apply, and that’s fine.'),
    list,
  ];

  if (folded.length) {
    const more = el('div', { className: 'checks checks--more', hidden: true });
    for (const r of folded) more.append(checkCard(r, choice));
    const label = () => `+ Show ${folded.length} more check${folded.length > 1 ? 's' : ''}`;
    const toggle = el('button', { className: 'link link-toggle', type: 'button', textContent: label() });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.onclick = () => {
      const open = more.hidden;
      more.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '− Show fewer' : label();
    };
    nodes.push(toggle, more);
  }

  const see = () => {
    const affirmed = Object.keys(choice).filter((q) => choice[q] === 'has');
    const denied = Object.keys(choice).filter((q) => choice[q] === 'lacks');
    renderVerdict(scoreChecklist(DATA, { familyId, affirmed, denied }), familyId, { affirmed, denied });
  };
  nodes.push(paneFoot({ back: { label: '← Pick a different focus', onClick: renderFamilyPick },
    primary: { label: 'See the result →', onClick: see } }));
  mountDesk(nodes, 2);
}

// ---------- 4. verdicts (tentative + teaching) ----------
// `marked` carries the user's own ticks ({affirmed, denied} qid lists) so a verdict can cite them as
// its premises: the user supplies the observations, the app performs the one step they can't do
// alone, composing those observations into a named pattern from the catalog.
function renderVerdict(result, familyId, marked = {}) {
  if (marked.affirmed || marked.denied) {
    receipt.checks = `${(marked.affirmed || []).length} yes · ${(marked.denied || []).length} no`;
  }
  // The "seems fine" skim path never picks a family; label its first receipt so the trail still reads.
  if (!familyId) receipt.family = 'Looks fine';
  switch (result.kind) {
    case 'accuse': return renderAccuse(result, marked, familyId);
    case 'inconclusive_lean': return renderInconclusive(result, marked, familyId);
    case 'valid_earned': return renderValid('earned', marked, result, familyId);
    case 'cynic_valid':
    default: return renderValid(familyId ? 'checked' : 'skimmed', marked, result, familyId);
  }
}

// The text of a tell by qid, from any fallacy that owns it (first match). Used to echo the user's own
// ticks back on the lean/earned screens where any owner's wording says the same thing.
function anyTellText(qid) {
  for (const ts of Object.values(DATA.tells)) {
    const t = ts.find((x) => x.qid === qid);
    if (t) return t.text;
  }
  return null;
}

// The line scale (replaces the old fill bars). The engine names a fallacy by a RATIO threshold, not
// by "biggest raw belief", so we plot the ONE thing that decides the verdict: how far the leading
// suspicion reached toward the naming line. A gilt tick sits at the fixed line; a dot shows the reach.
const WEIGH_LINE = 66;   // percent of the track where the gilt "name a weak spot" threshold sits
const reachOf = (P, fid) => ((P[fid] ?? 0) / (P.VALID || 1)) / CONFIG.CHECKLIST_RATIO_VALID;

// The candidates that actually moved on a lean (the split): reach well above the flat baseline. Used
// both for the split scale and the "make sure" buttons, so they always agree. Empty for non-leans.
function weighSplitCandidates(result, familyId) {
  const P = result?.beliefs;
  if (result?.kind !== 'inconclusive_lean' || !P || !DATA.families[familyId]) return [];
  return DATA.families[familyId]
    .map((f) => [f, reachOf(P, f)])
    .filter(([, r]) => r >= 0.25)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f]) => f);
}

// One scale row: name, a track with the gilt line and a reach dot, an end label. `tone` is one of
// 'named' (rust, crossed), 'held' (green), 'partway' (neutral).
function scaleRow(fid, reach, endLabel, tone) {
  const dotLeft = Math.max(2, Math.min(97, reach * WEIGH_LINE));
  const track = el('span', { className: 'scale-track' },
    el('span', { className: 'scale-line' }),
    el('span', { className: 'scale-tick' }),
    el('span', { className: 'scale-dot', style: `left:${dotLeft.toFixed(1)}%` }),
  );
  return el('div', { className: 'scale-row scale-' + tone },
    el('span', { className: 'scale-name', textContent: fid ? DATA.fallacies[fid].name : 'Nothing here' }),
    track,
    el('span', { className: 'scale-end', textContent: endLabel }),
  );
}

function scaleBlock(result, familyId) {
  const P = result.beliefs;
  if (!P || !familyId || !DATA.families[familyId]) return null;
  const fids = DATA.families[familyId];
  const ranked = fids.map((f) => [f, reachOf(P, f)]).sort((a, b) => b[1] - a[1]);
  const [leadId, leadReach] = ranked[0] || [null, 0];
  if (!leadId) return null;

  const wrap = el('div', { className: 'scale' });
  const ends = el('div', { className: 'scale-ends' },
    el('span', { className: 'scale-ends-mid' },
      el('span', { textContent: 'held up' }),
      el('span', { textContent: 'named' }),
    ),
  );

  if (result.kind === 'inconclusive_lean') {
    const ids = weighSplitCandidates(result, familyId);
    const show = (ids.length ? ids : [leadId]).map((f) => [f, reachOf(P, f)]);
    wrap.append(el('p', { className: 'scale-lead', textContent: 'How the suspicion split:' }));
    for (const [fid, r] of show) wrap.append(scaleRow(fid, r, 'partway', 'partway'));
    wrap.append(ends);
    wrap.append(el('p', { className: 'scale-note', textContent:
      show.length > 1
        ? 'Each came partway. None crossed the line, and the concern is split between them, so we name neither.'
        : 'It came partway but stayed short of the line, so nothing was named.' }));
    return wrap;
  }

  const named = result.kind === 'accuse';
  const nameLead = named || leadReach >= 0.5;   // don't spotlight a barely-moved sibling on a holds-up
  wrap.append(el('p', { className: 'scale-lead', textContent:
    named ? 'How far it crossed the line:' : 'How close it came to a weak spot:' }));
  wrap.append(scaleRow(nameLead ? leadId : null, leadReach, named ? 'named' : 'held up',
    named ? 'named' : 'held'));
  wrap.append(ends);

  const others = ranked.length - 1;
  let note = named ? 'It crossed the line, so we named a weak spot.'
                   : 'It stayed short of the line, so nothing was named.';
  if (nameLead && others > 0) {
    note += ` The other ${others === 1 ? 'possibility' : others + ' possibilities'} in this group stayed further back. Each was weighed on its own.`;
  } else if (!nameLead) {
    note += ` All ${ranked.length} possibilities in this group were weighed on their own. None came close.`;
  }
  wrap.append(el('p', { className: 'scale-note', textContent: note }));
  return wrap;
}

// The premises block: each cited tell echoed with the user's own call attached. `call` is 'no' for a
// denied virtue, 'yes' for an affirmed one.
function premiseBlock(lead, texts, call) {
  const block = el('div', { className: 'premises' },
    el('p', { className: 'premises-lead', textContent: lead }));
  for (const t of texts) {
    block.append(el('p', { className: 'premise' },
      el('span', { className: 'premise-q', textContent: `“${t}” ` }),
      el('span', { className: 'premise-call premise-call--' + call, textContent: `your call: ${call}` })));
  }
  return block;
}

function renderAccuse(result, marked = {}, familyId = null) {
  const f = DATA.fallacies[result.fallacy];
  // The premises of this accusation are the accused fallacy's OWN tells the user marked absent.
  const deniedSet = new Set(marked.denied || []);
  const cited = (DATA.tells[result.fallacy] || []).filter((t) => deniedSet.has(t.qid));

  const nodes = [
    ...paneHead('One thing to check', `There may be a weak spot here. It looks like ${f.name}.`, '',
      { big: true, titleClass: 'title-accuse' }),
  ];
  const scale = scaleBlock(result, familyId);
  if (scale) nodes.push(scale);
  if (cited.length) {
    nodes.push(premiseBlock('This comes from your own answers, put together:', cited.map((t) => t.text), 'no'));
    nodes.push(el('p', { className: 'pane-body', textContent:
      'Each of those is an honest observation. Together, they form a pattern with a name.' }));
  } else {
    nodes.push(el('p', { className: 'pane-body', textContent:
      'That’s just what we noticed. You’re the judge.' }));
  }
  // Teach the word "fallacy" folded into a details, attached to the concrete example on screen.
  const teach = el('details', { className: 'teach' },
    el('summary', { className: 'teach-summary', textContent: `What “${f.name}” means` }),
    el('p', { className: 'teach-body' },
      document.createTextNode(f.teaching + ' '),
      el('span', { className: 'teach-aside', textContent:
        '(A weak spot like this is what people call a “fallacy.”)' }),
    ),
  );
  nodes.push(teach);
  nodes.push(el('p', { className: 'teach-check', textContent:
    `${f.confirm_check} You’re the judge of whether it fits.` }));

  const actions = el('div', { className: 'action-row' });
  const yes = el('button', { className: 'btn btn-rust', type: 'button', textContent: 'Yes, that fits' });
  const no = el('button', { className: 'btn btn-secondary', type: 'button', textContent: 'No, that’s not it' });
  yes.onclick = () => renderConfirmed(f);
  no.onclick = () => renderCynic('rejected', f);
  actions.append(yes, no);
  nodes.push(actions);

  mountDesk(nodes, 3);
}

function renderConfirmed(f) {
  const nodes = [
    ...paneHead('You made the call', `Looks like ${article(f.name)} ${f.name}.`, '',
      { big: true, titleClass: 'title-accuse' }),
    el('p', { className: 'pane-body', textContent:
      'You confirmed it. The argument depends on this instead of standing on its own. Naming it isn’t ' +
      'a way to “win,” though. The real point underneath might still be worth taking seriously ' +
      'once it’s made fairly. The fair next move is to ask for the stronger version.' }),
    el('p', { className: 'pane-body pane-body--muted', textContent:
      'Spotting the weak spot is the easy part. Building the strongest version of what’s left is the ' +
      'generous one, and the whole point here.' }),
    restartRow(),
  ];
  mountDesk(nodes, 3);
}

function renderInconclusive(result, marked = {}, familyId = null) {
  const f = result.leanFallacy ? DATA.fallacies[result.leanFallacy] : null;
  const lean = f
    ? `There might be something here, maybe ${article(f.name)} ${f.name}, but not enough to be sure.`
    : 'There might be something here, but not enough to be sure.';

  const nodes = [
    ...paneHead('It comes down to one thing', 'Almost. One check would settle it.', '',
      { big: true }),
  ];
  const flagged = (marked.denied || []).map(anyTellText).filter(Boolean).slice(0, 3);
  if (flagged.length) nodes.push(premiseBlock('You did spot something. You marked:', flagged, 'no'));
  nodes.push(el('p', { className: 'pane-body', textContent:
    lean + ' It did not cross the line on its own, but you can settle it.' }));
  const scale = scaleBlock(result, familyId);
  if (scale) nodes.push(scale);

  const leanBack = () => renderVerdict(result, familyId, marked);

  // Path 1, "take a closer look": zoom into one close candidate for a focused check.
  const closeIds = weighSplitCandidates(result, familyId);
  if (closeIds.length) {
    nodes.push(el('p', { className: 'action-lead', textContent:
      'Take a closer look at whichever felt closest:' }));
    const g = el('div', { className: 'action-row' });
    for (const fid of closeIds) {
      g.append(el('button', { className: 'btn btn-secondary', type: 'button',
        textContent: DATA.fallacies[fid].name,
        onclick: () => renderMakeSure(familyId, fid, marked.denied || [], leanBack) }));
    }
    nodes.push(g);
  }

  // Path 2, "just call it": the forced fork. The engine will not manufacture certainty, but the user
  // can and should decide. Never leaves them stranded.
  const forkFallacy = DATA.fallacies[result.leanFallacy || closeIds[0]];
  if (forkFallacy) {
    nodes.push(el('p', { className: 'action-lead', textContent:
      'Or make the call yourself, it is a fair one to make:' }));
    const g = el('div', { className: 'action-row' });
    const yes = el('button', { className: 'btn btn-secondary', type: 'button',
      textContent: `Yes, it leans on ${forkFallacy.name}`, onclick: () => renderConfirmed(forkFallacy) });
    const no = el('button', { className: 'btn btn-secondary', type: 'button',
      textContent: 'No, the point holds up', onclick: () => renderCynic('rejected', forkFallacy) });
    g.append(yes, no);
    nodes.push(g);
  }

  nodes.push(restartRow());
  mountDesk(nodes, 3);
}

// mode: 'earned' (user affirmed virtues -> positively justified), 'checked' (inspected a family,
// nothing failed enough), 'skimmed' ("seems fine" -> not inspected, just stands). result + familyId
// drive the scale, shown only on the inspected paths (earned / checked), never on skimmed.
function renderValid(mode, marked = {}, result = null, familyId = null) {
  const COPY = {
    earned: {
      title: 'No weak spot here. It’s argued fairly.',
      body: 'You marked the things a fair argument does, and they checked out. This isn’t just ' +
        '“nothing wrong found.” The way it’s argued does its job.',
      muted: 'This isn’t a ruling that the other person is right. It only means the reasoning has no ' +
        'obvious hole. You can still disagree; the fair way is to answer the actual point.',
    },
    checked: {
      title: 'No clear weak spot in how it’s argued.',
      body: 'You looked closely at this kind of problem and gave it a fair chance. The reasoning held up. ' +
        'Nothing clearly wrong with how the point is made.',
      muted: 'You can still think they’re wrong; just take on the actual point rather than a weak spot.',
    },
    skimmed: {
      title: 'Nothing jumped out. The reasoning seems fine.',
      body: 'You read it fairly and didn’t spot a problem worth digging into. Nothing clearly wrong ' +
        'with how it’s argued.',
      muted: 'This doesn’t crown a winner; it just means no obvious hole turned up. If something still ' +
        'nags at you, pick the kind of problem it might be and check.',
    },
  };
  const c = COPY[mode] || COPY.checked;
  const nodes = [
    ...paneHead('About how it’s argued, not who’s right', c.title, '',
      { big: true, titleClass: 'title-valid' }),
    el('p', { className: 'pane-body', textContent: c.body }),
  ];
  if (mode !== 'skimmed') {
    const scale = scaleBlock(result || {}, familyId);
    if (scale) nodes.push(scale);
  }
  // Earned means the user vouched for specific virtues; show them their own case.
  if (mode === 'earned') {
    const vouched = (marked.affirmed || []).map(anyTellText).filter(Boolean).slice(0, 3);
    const more = (marked.affirmed || []).length - vouched.length;
    if (vouched.length) {
      nodes.push(premiseBlock(
        more > 0 ? `The case you built for it (and ${more} more):` : 'The case you built for it:',
        vouched, 'yes'));
    }
  }
  nodes.push(el('p', { className: 'pane-body pane-body--muted', textContent: c.muted }));
  nodes.push(restartRow());
  mountDesk(nodes, 3);
}

function renderCynic(why, rejectedFallacy) {
  const body = why === 'rejected'
    ? `You looked at whether it was ${rejectedFallacy.name} and decided it didn’t fit. ` +
      'We won’t reach for a second-best label. The reasoning seems to hold, and checking it was the right move.'
    : 'We couldn’t find a clear problem here. The reasoning seems to hold up.';
  const nodes = [
    ...paneHead('The result', 'No clear problem. It seems to hold up.', '',
      { big: true, titleClass: 'title-valid' }),
    el('p', { className: 'pane-body', textContent: body }),
    el('p', { className: 'pane-body pane-body--muted', textContent:
      'Checking was worth doing. Nothing here needs you to back down.' }),
    restartRow(),
  ];
  mountDesk(nodes, 3);
}

function restartRow() {
  const row = el('div', { className: 'pane-foot pane-foot--end' });
  row.append(el('button', { className: 'btn btn-primary', type: 'button', textContent: 'Examine another →',
    'aria-label': 'Examine another', onclick: () => { argument = ''; resetReceipt(); renderStart(); } }));
  return row;
}

function renderLoadError(err) {
  const nodes = [
    ...paneHead('Couldn’t start', 'Steelman', ''),
    el('p', { className: 'error', textContent: err.message || String(err) }),
  ];
  mountDesk(nodes, null);
}
