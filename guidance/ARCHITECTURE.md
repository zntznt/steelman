# Architecture

A static site. No build step, no framework, no dependencies, no server, no AI at runtime. It runs
entirely in the browser and is hosted on GitHub Pages. Everything the engine knows lives in
`data/*.json`; the engine itself is ~400 lines of pure functions.

> **The live flow is the positive-first checklist (v2), presented as a two-pane "Reading Desk"** (a
> pinned sidebar with the argument and step receipts, plus a right pane running the flow; see
> `src/styles.css` and `src/ui.js`). The UI drives:
> paste → `suggestBucket()`/`suggestFamily()` scan for keyword cues and suggest a bucket or family
> (user overrides freely) → the user picks a bucket, then a family within it (or "Nothing, it seems
> sound") → for families with authored move content, `suggestMoves()` surfaces the 2-3 likely sibling
> fallacies as a "which of these is it doing?" pick before the checks; families without move content
> go straight to the checklist → a checklist of that family's (or picked move's) **virtues** (what a
> sound argument does), each marked "Yes, it does" / "No, it doesn't" / "Doesn't apply" →
> `scoreChecklist()` feeds the Bayesian engine and returns a tentative+teaching verdict.
>
> The sequential, Akinator-style interview (`status()`/`pickNextQuestion()`/`answer()`) is still in
> the engine and still tested, but the UI no longer uses it. It struggled to surface thin fallacies
> (~6/13 reliably); the checklist catches 13/13 on two denied virtues because the user routes and all
> evidence enters at once. See `tests/checklist.test.js` for the live contract.
>
> **Positive validation is the goodwill thesis realized:** marking a virtue "Yes, it does" is evidence
> FOR the argument (the engine answers that question "no"); marking it "No, it doesn't" is evidence
> for the fallacy ("yes"); "Doesn't apply" (like skipping) is no signal. The user confirms soundness
> like a fair juror and can actively defend an argument, guilt only emerges where a virtue is marked
> absent. `data/families.json` holds the bucket/family metadata, routing cues, and per-fallacy virtue
> "tells" (each mapped to a question id); each fallacy's own move-pick content
> (`pick_label`/`pick_example`/`move_keywords`/`cues`) lives alongside it in `data/fallacies.json`.

## File map

```
steelman/
├── index.html              # shell: a <div id="app"> the UI renders into
├── .nojekyll               # tells GitHub Pages to serve files raw (no Jekyll preprocessing)
├── data/
│   ├── fallacies.json      # the fallacy catalog (definitions, teaching copy, confirm checks,
│   │                       #   each fallacy's own move-pick content)
│   ├── questions.json      # the diagnostic questions + their lr weight tables
│   ├── families.json       # bucket/family metadata, routing cues, per-fallacy checklist "tells"
│   ├── fixtures.json       # labeled sound/fallacious arguments for the calibration test
│   ├── taxonomy.json       # tooling input for tools/merge-catalog.mjs; not fetched at runtime
│   └── blind-corpus.json   # tooling input for tools/wrongroom-sweep.mjs; not fetched at runtime
├── src/
│   ├── engine.js           # ALL the reasoning. Pure functions. Imported by UI + tests.
│   ├── ui.js               # render-from-state controller. No reasoning lives here.
│   ├── styles.css          # the calm aesthetic
│   └── mascot.js           # optional mascot image-swapper; currently unwired, index.html
│                            #   doesn't load it (see mascot/README.md)
├── tests/
│   ├── engine.test.js       # the math, vs ENGINE-SPEC.md traces, on a fixed tiny bank
│   ├── checklist.test.js    # the live checklist flow, on the real catalog
│   ├── coverage.test.js     # sequential-engine reachability & catch floor (auto-derived paths)
│   ├── calibration.test.js  # sequential-engine fixtures: 0 false accusations + catch-rate floor (G10)
│   └── suggestmoves.test.js # the "which move is it?" surfacing, on the real catalog
├── tools/                  # dev scripts, not shipped to the app
│   ├── merge-catalog.mjs    # merges a catalog-expansion result into data/{fallacies,questions,families}.json
│   ├── routing-measure.mjs  # measures suggestFamily/suggestBucket/suggestMoves accuracy on a labeled corpus
│   └── wrongroom-sweep.mjs  # checks no family/answer combination ever misaccuses
└── guidance/               # these docs (plus dated panel/audit reports and investigation
                             #   writeups not listed here; see the guidance/ folder directly)
    ├── HOW-IT-DECIDES.md     # plain walkthrough of the verdict (the WHAT, for humans)
    ├── WHY-THESE-WEIGHTS.md  # the rationale behind the lr weight values
    ├── ENGINE-SPEC.md        # the canonical contract (the WHAT: math, schema, guardrails)
    ├── DESIGN-PRINCIPLES.md  # the WHY (read this first)
    ├── ADDING-FALLACIES.md   # the HOW (extend via data, no code)
    └── ARCHITECTURE.md       # this file (the MAP)
```

## Data flow

**The live checklist flow (what `ui.js` actually calls):** a one-shot pipeline per screen, not a
stateful loop. Each `render*()` function calls straight into the engine and mounts the result; there
is no persistent session object being mutated across an interactive question-answer cycle.

```
data/*.json ──fetch──▶ engine.loadData() ──▶ DATA (validated, categoricals precomputed)
                                                  │
                                     ui.boot() renders the start screen
                                                  │
                user pastes → suggestBucket()/suggestFamily() suggest, user picks a bucket then family
                                                  │
                (families with move content) suggestMoves() suggests, user picks a move
                                                  │
                user marks each check "Yes, it does" / "No, it doesn't" / "Doesn't apply"
                                                  │
                                scoreChecklist() ──▶ {kind, fallacy?, leanFallacy?, beliefs}
                                                  │
                                       ui renders the verdict screen
```

**The sequential engine's internal loop (still in the engine, still tested, not called by the live
UI):**

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

Neither flow lets the UI decide what happens next: it calls into the engine and renders whatever
comes back. Every goodwill guarantee lives in the engine, which is why the engine, not the UI, is
what the tests cover.

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
loadData(fallaciesJSON, questionsJSON, fixturesJSON?, familiesJSON?) // validate + precompute → data

// called by the live UI:
suggestBucket(data, text)   // → {top, ...} likely bucket, or top:null if the scan is unsure
suggestFamily(data, text)   // → {top, ...} likely single family (the fast path), or top:null
suggestMoves(data, familyId, text) // → {surfaced, allZero} likely sibling fallacies in a family
scoreChecklist(data, {familyId, affirmed?, denied?}) // → {kind, fallacy?, leanFallacy?, beliefs}
CONFIG.CHECKLIST_RATIO_VALID // the ratio threshold scoreChecklist uses to decide when to accuse

// still in the engine, still tested, no longer called by the live UI:
newSession(data, seed?)                               // → state (seed optional, for replay)
status(state)        // → {stop:false, nextQuestion, beliefs} | {stop:true, kind, ...}
answer(state, qid, a)// a ∈ {yes,no,maybe,unsure}; mutates + returns state
confirmVerdict(state, accepted) // user's final call on a tentative accusation
beliefs(state)       // → {hypothesis: probability} snapshot (used by tests)
```

`status().kind` (sequential path) ∈ `accuse` · `valid_earned` · `cynic_valid` · `cynic_unsure` ·
`inconclusive_lean`. `scoreChecklist().kind` (live path) ∈ the same set minus `cynic_unsure`, which
only the interactive sequential loop can reach.

## Running it

**Locally** — the app `fetch()`es JSON, which the browser blocks under `file://`. So serve it:

```bash
cd steelman
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` by double-click shows a clear "serve the folder instead" message rather than
a blank page — that failure is handled, not swallowed.)

**Tests** — plain Node, no framework:

```bash
node tests/engine.test.js        # the inference math (fixed tiny bank)
node tests/checklist.test.js     # the live checklist flow, on the real catalog
node tests/coverage.test.js      # every fallacy is reachable & catchable (sequential path, auto-derived paths)
node tests/calibration.test.js   # hand-written sound/fallacious fixtures: 0 false accusations (sequential path)
node tests/suggestmoves.test.js  # the "which move is it?" surfacing, on the real catalog
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

## Scaling to a large catalog

The current design (flat field of fallacies, info-gain question selection, a small "entry" pool)
is comfortable up to roughly **30–40 fallacies**. The constraint is the question budget:

- To catch fallacy F, the engine must ask ~2–3 of F's questions *before* the validity prior
  consolidates from "no" answers on unrelated dimensions.
- With a fixed budget (`Q_MAX`) and N fallacies, the share of the budget that can land on any one
  fallacy shrinks as N grows. Past ~40, no fixed small budget can both survey the field and
  confirm a suspect.

**Empirically ruled out:** "engine coverage probing" — forcing the narrowing phase to give every
unprobed fallacy a turn. It was tried and it *reduces* catch rate (it spends the budget exonerating
the 30+ fallacies the argument *isn't*, pumping VALID, before reaching the guilty one's questions).
Breadth is the enemy in a small budget; more fallacies makes it strictly worse. Don't re-attempt it.

**The scalable design is hierarchical (family-based) routing:**
1. Add a `family` field to each fallacy (`relevance`, `causation`, `ambiguity`, `emotion`,
   `authority`, `induction`, …) — a handful of families covering all fallacies.
2. A small set of broad **entry questions routes the argument to a family** (cheap: ~2–3 questions
   to localize "this is a relevance problem" vs "a causal problem").
3. Only the **3–8 fallacies in the matched family** are then probed deeply. The deep phase runs
   against a *small* field again, so a ~7-question session works at any catalog size.

This keeps sessions short and every fallacy reachable regardless of N. It's a real engine + schema
change (new field, two-phase selection, re-tuning).

> **Tried at N=13, and it was net-negative — wait for scale.** Family routing was actually built
> and measured against this 13-fallacy catalog: `family` field, summed family beliefs, two-phase
> (route-then-localize) selection, one router question per family. Result: it *improved* per-fallacy
> coverage (more families became catchable) but *dropped* overall calibration catch (78% → ~58%,
> and as low as 10% when the entry phase was widened to ask every router). **Why:** routing pays a
> fixed cost — ~F router questions to localize — that only pays back when the deep field is *much*
> smaller than the flat field. At 13 fallacies in 4 families, localizing 13→3 doesn't save enough to
> cover the routing overhead; the flat engine is simply faster. The crossover is somewhere around
> **40–60 fallacies**, where localizing (say) 100→6 clearly wins. So: keep the flat engine until the
> catalog is large enough that routing's overhead is amortized, then bring back the routing work
> (it's in git history — search commits for "family-based routing"). Don't re-derive this; it cost a
> long session to confirm.

`tests/coverage.test.js` guards the migration: it must keep the aggregate catch above the floor and
not regress any working fallacy. Until you cross the routing threshold, the rule in
[ADDING-FALLACIES.md](ADDING-FALLACIES.md) §2b (≥2 entry-pool questions per fallacy) is what keeps
additions catchable.

### Known-weak fallacies (today)

A handful of fallacies (`false_dilemma`, `slippery_slope`, `appeal_to_nature`, `strawman`,
`false_cause`, `bandwagon`) catch below the per-fallacy floor on their textbook instances — they're
correct and reachable, but the flat engine can't always surface their questions within the budget.
They're listed in `KNOWN_WEAK` in `coverage.test.js` so the build stays green, while a *new* weak
fallacy or a *regression* in a working one still fails. The fix for these specific ones (short of
routing) is more *distinctive* dedicated questions — ones whose "yes" doesn't also pull a sibling
fallacy up. Shrinking `KNOWN_WEAK` and raising `AGGREGATE_FLOOR` is the ongoing hardening ratchet.
