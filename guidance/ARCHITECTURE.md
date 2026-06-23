# Architecture

A static site. No build step, no framework, no dependencies, no server, no AI at runtime. It runs
entirely in the browser and is hosted on GitHub Pages. Everything the engine knows lives in
`data/*.json`; the engine itself is ~300 lines of pure functions.

## File map

```
fallacynator/
├── index.html              # shell: one <main> the UI renders into
├── .nojekyll               # tells GitHub Pages to serve files raw (no Jekyll preprocessing)
├── data/
│   ├── fallacies.json      # the fallacy catalog (definitions, teaching copy, confirm checks)
│   ├── questions.json      # the diagnostic questions + their lr weight tables
│   └── fixtures.json       # labeled sound/fallacious arguments for the calibration test
├── src/
│   ├── engine.js           # ALL the reasoning. Pure functions. Imported by UI + tests.
│   ├── ui.js               # render-from-state controller. No reasoning lives here.
│   └── styles.css          # the calm aesthetic
├── tests/
│   ├── engine.test.js      # the math, vs ENGINE-SPEC.md traces, on a fixed tiny bank
│   └── calibration.test.js # the real data/: 0 false accusations + catch-rate floor (G10)
└── guidance/               # these docs
    ├── ENGINE-SPEC.md        # the canonical contract (the WHAT — math, schema, guardrails)
    ├── DESIGN-PRINCIPLES.md  # the WHY (read this first)
    ├── ADDING-FALLACIES.md   # the HOW (extend via data, no code)
    └── ARCHITECTURE.md       # this file (the MAP)
```

## Data flow

```
data/*.json ──fetch──▶ engine.loadData() ──▶ data object (validated, categoricals precomputed)
                                                  │
                                       ui.boot() newSession(data)
                                                  │
              ┌───────────────────────────────────┴───────────────────────────────┐
              ▼                                                                     │
        ui renders ◀── status(state) ──┐                                           │
              │                          │  {stop:false, nextQuestion}              │
        user clicks an answer            │  or terminal {stop:true, kind, ...}      │
              │                          │                                          │
              └── answer(state, qid, a) ─┴──────────────────────────────────────────┘
                                                  │
                                        (loops until a terminal verdict)
```

The UI never decides what happens next. It calls `status(state)`, gets back either a question to
show or a verdict to render, and that's it. Every goodwill guarantee lives in the engine, which is
why the engine — not the UI — is what the tests cover.

## The engine in one paragraph

Beliefs are a probability distribution over `{VALID} ∪ {each fallacy}`, kept in log-space. Each
question carries a small `lr` table (yes/no weights per hypothesis); at load these are expanded
into proper 4-way categorical distributions `P(answer | hypothesis)` with `maybe`/`unsure` derived
to be charitable. Answering a question is a damped Bayesian update. The next question is chosen by
mutual information (which question best separates the live hypotheses), with top-k sampling so
sessions open differently. After every answer the engine checks, in priority order: accuse (only if
the triple gate is cleared) → unsure-dominated exit → earned-VALID → stalemate/stuck exit. Full
math in [ENGINE-SPEC.md](ENGINE-SPEC.md).

## The engine's public API

```js
loadData(fallaciesJSON, questionsJSON, fixturesJSON?) // validate + precompute → data
newSession(data, seed?)                               // → state (seed optional, for replay)
status(state)        // → {stop:false, nextQuestion, beliefs} | {stop:true, kind, ...}
answer(state, qid, a)// a ∈ {yes,no,maybe,unsure}; mutates + returns state
confirmVerdict(state, accepted) // user's final call on a tentative accusation
beliefs(state)       // → {hypothesis: probability} snapshot (used by tests/UI)
```

`status().kind` ∈ `accuse` · `valid_earned` · `cynic_valid` · `cynic_unsure` · `inconclusive_lean`.

## Running it

**Locally** — the app `fetch()`es JSON, which the browser blocks under `file://`. So serve it:

```bash
cd fallacynator
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` by double-click shows a clear "serve the folder instead" message rather than
a blank page — that failure is handled, not swallowed.)

**Tests** — plain Node, no framework:

```bash
node tests/engine.test.js
node tests/calibration.test.js
```

**Hosting** — push to GitHub and enable Pages on the default branch. `.nojekyll` is already there.
No build, no Actions required; Pages serves the files as-is.

## Why these choices (the lazy path)

- **No framework / no build.** It's a few screens and a pure-function engine. A bundler would be
  pure overhead. Native ES modules load in the browser and in Node 26 unchanged, so the same
  `engine.js` is imported by the app and the tests with zero config.
- **Data-driven engine.** The whole "extensible for future fallacies" requirement is met by
  reading JSON. Adding a fallacy is a data edit; the engine code never changes.
- **Guardrails in the loader, not in review.** Anti-bias is enforced mechanically (`validateBank` +
  the calibration test) so it survives contributors who never read the principles doc.
