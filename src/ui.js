// Fallacynator UI — a thin render-from-state controller.
// All reasoning lives in the (tested) engine; this file just asks status(state),
// renders one screen, and feeds answers back. Adding a fallacy never touches this file.

import { loadData, newSession, answer, status, confirmVerdict, CONFIG } from './engine.js';

const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const esc = (s) => String(s);

// answer labels — charitable phrasing, in the order the engine expects
const ANSWER_LABELS = [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['maybe', 'Kind of'],
  ['unsure', "I can't tell"],
];

let DATA = null;       // loaded bank
let session = null;    // current engine state
let argument = '';     // the text the user pasted, for recall

// ---------- bootstrap ----------
boot();

async function boot() {
  try {
    const [fallacies, questions] = await Promise.all([
      fetchJSON('data/fallacies.json'),
      fetchJSON('data/questions.json'),
    ]);
    DATA = loadData(fallacies, questions);
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

// ---------- screens ----------
function clear() { app.replaceChildren(); }

function renderStart() {
  clear();
  const ta = el('textarea', {
    id: 'arg',
    placeholder: 'e.g. "We can\'t trust her plan — she failed a class in college."',
    value: argument,
  });
  const begin = el('button', { className: 'btn btn-primary', textContent: 'Think it through →' });
  const card = el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Fallacynator' }),
    el('h1', { textContent: 'Is there a fallacy, or am I just being cynical?' }),
    el('p', {
      className: 'lede',
      textContent:
        'Paste an argument you’re unsure about. We’ll think it through together — ' +
        'starting from the assumption that it’s sound, and only flagging a problem if the ' +
        'evidence really holds up. No accounts, no AI, nothing leaves your browser.',
    }),
    ta,
    el('div', { className: 'row end' }, begin),
    el('p', { className: 'muted', style: 'margin-top:1rem',
      textContent: 'Tip: read it as charitably as you can first. Good arguments deserve a fair hearing.' }),
  );
  app.append(card);
  ta.focus();

  begin.onclick = () => {
    argument = ta.value.trim();
    if (!argument) { ta.focus(); ta.style.outline = '2px solid var(--suspect)'; return; }
    session = newSession(DATA);
    advance();
  };
}

// ask the engine what's next and render it
function advance() {
  const st = status(session);
  if (!st.stop) return renderQuestion(st.nextQuestion);
  switch (st.kind) {
    case 'accuse': return renderAccuse(st);
    case 'valid_earned': return renderValid('earned');
    case 'cynic_valid': return renderValid('lead');
    case 'cynic_unsure': return renderCynic('unsure');
    case 'inconclusive_lean': return renderInconclusive(st);
    default: return renderValid('lead');
  }
}

function progressPips(asked) {
  const wrap = el('div', { className: 'progress' });
  for (let i = 0; i < CONFIG.Q_MAX; i++) {
    wrap.append(el('div', { className: 'pip' + (i < asked ? ' on' : '') }));
  }
  return wrap;
}

function renderQuestion(q) {
  clear();
  const card = el('section', { className: 'card' });
  card.append(progressPips(session.answers.length));
  if (argument) card.append(el('blockquote', { className: 'recall', textContent: argument }));
  card.append(el('p', { className: 'kicker', textContent: 'Let’s look at one thing' }));
  card.append(el('p', { className: 'question-text', textContent: q.text }));

  const answers = el('div', { className: 'answers' });
  for (const [val, label] of ANSWER_LABELS) {
    const b = el('button', { className: 'btn', textContent: label });
    b.onclick = () => { answer(session, q.id, val); advance(); };
    answers.append(b);
  }
  card.append(answers);
  card.append(el('div', { className: 'row between' },
    el('button', { className: 'btn', textContent: '↺ Start over', onclick: renderStart }),
    el('span', { className: 'muted', textContent: '“Kind of” and “I can’t tell” lean toward giving the argument the benefit of the doubt.' }),
  ));
  app.append(card);
}

function renderAccuse(st) {
  clear();
  const f = DATA.fallacies[st.fallacy];
  const yes = el('button', { className: 'btn btn-primary', textContent: 'Yes — that fits' });
  const no = el('button', { className: 'btn', textContent: 'No — that’s not it' });
  const card = el('section', { className: 'card verdict-accuse' },
    el('p', { className: 'kicker', textContent: 'A tentative thought' }),
    el('p', { className: 'verdict-title', textContent: `This might be leaning toward ${f.name}.` }),
    el('p', { className: 'muted', textContent: 'It’s only a suspicion — you’re the judge. Here’s what that means:' }),
    el('div', { className: 'teaching' },
      el('span', { className: 'name', textContent: f.name + '. ' }),
      document.createTextNode(f.teaching),
      el('p', { className: 'check', textContent: f.confirm_check }),
    ),
    el('div', { className: 'answers' }, yes, no),
  );
  app.append(card);

  yes.onclick = () => {
    confirmVerdict(session, true);
    renderConfirmed(f);
  };
  no.onclick = () => {
    confirmVerdict(session, false);
    renderCynic('rejected', f);
  };
}

function renderConfirmed(f) {
  clear();
  app.append(el('section', { className: 'card verdict-accuse' },
    el('p', { className: 'kicker', textContent: 'You made the call' }),
    el('p', { className: 'verdict-title', textContent: `Looks like a ${f.name}.` }),
    el('p', {},
      'You confirmed it — the argument seems to rest on this rather than on its own merits. ' +
      'Naming a fallacy isn’t a “gotcha,” though: the underlying point might still be worth ' +
      'engaging once it’s argued fairly.'),
    el('p', { className: 'muted', textContent: 'Spotting the flaw is the easy part. Steelmanning what’s left is the generous one.' }),
    restartRow(),
  ));
}

function renderValid(reason) {
  clear();
  const lede = reason === 'earned'
    ? 'You worked through it, and the reasoning holds up. No clear fallacy here — the argument earns a fair hearing.'
    : 'Nothing rose above the benefit of the doubt. There’s no clear fallacy here — the argument holds up well enough.';
  app.append(el('section', { className: 'card verdict-valid' },
    el('p', { className: 'kicker', textContent: 'The verdict' }),
    el('p', { className: 'verdict-title', textContent: 'The argument holds up.' }),
    el('p', { textContent: lede }),
    el('p', { className: 'muted', textContent: 'That’s a real result — most arguments aren’t fallacies. Disagreeing is fine; just engage the actual point.' }),
    restartRow(),
  ));
}

function renderCynic(why, rejectedFallacy) {
  clear();
  let body;
  if (why === 'rejected') {
    body = `You looked at the suspicion of ${rejectedFallacy.name} and decided it didn’t fit — ` +
      `good. We won’t reach for a second-best accusation. The argument may simply be sound, ` +
      `and you may just be a little skeptical. That’s an honest place to land.`;
  } else {
    body = 'You weren’t sure on most of these, and that’s okay. We won’t manufacture a verdict ' +
      'out of uncertainty. There may be no fallacy here at all — you might just be feeling skeptical.';
  }
  app.append(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The verdict' }),
    el('p', { className: 'verdict-title', textContent: '…or maybe you’re just being a little cynical.' }),
    el('p', { textContent: body }),
    el('p', { className: 'muted', textContent: 'Skepticism is healthy. Treating every argument as guilty is the thing worth resisting.' }),
    restartRow(),
  ));
}

function renderInconclusive(st) {
  clear();
  const f = st.leanFallacy ? DATA.fallacies[st.leanFallacy] : null;
  const lean = f
    ? `There might be something here — possibly a ${f.name} — but not enough to call it.`
    : 'There might be something here, but not enough to call it.';
  app.append(el('section', { className: 'card verdict-cynic' },
    el('p', { className: 'kicker', textContent: 'The verdict' }),
    el('p', { className: 'verdict-title', textContent: 'Inconclusive — and that’s allowed.' }),
    el('p', { textContent: lean + ' We’d rather say “not sure” than accuse an argument that might be fine.' }),
    el('p', { className: 'muted', textContent: 'Trust your judgment. If it still feels off, the fair move is to ask the other person to spell out their reasoning.' }),
    restartRow(),
  ));
}

function restartRow() {
  return el('div', { className: 'row end' },
    el('button', { className: 'btn btn-primary', textContent: 'Examine another →', onclick: () => { argument = ''; renderStart(); } }),
  );
}

function renderLoadError(err) {
  clear();
  app.append(el('section', { className: 'card' },
    el('p', { className: 'kicker', textContent: 'Couldn’t start' }),
    el('h1', { textContent: 'Fallacynator' }),
    el('p', { className: 'error', textContent: err.message || String(err) }),
  ));
}
