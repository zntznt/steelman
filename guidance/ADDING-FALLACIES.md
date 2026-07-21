# Adding a fallacy

**You do not touch any code.** Steelman reads everything from `data/*.json`. Adding a fallacy
is append-only JSON across **four files**. The engine validates your edits at load, and five test
suites fail loudly if you break a goodwill guarantee or leave the fallacy unreachable — that's the
safety net, lean on it.

Read [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) first if you haven't. The one rule that matters:
**this app gives arguments the benefit of the doubt.** The live UI is a *positive-first checklist*
— the user confirms the virtues a sound argument has and only suspects a fallacy where a virtue is
genuinely missing. Your job is to describe those virtues clearly and wire them up.

> **The live flow is the checklist** (`src/ui.js` → `scoreChecklist`). A user pastes an argument,
> is routed to a *family*, and ticks which virtues the argument has (✓) or lacks (✗). There is also
> a sequential "interview" engine still in the codebase and still tested — steps marked
> **[sequential]** below serve it. You can skip those and the checklist will still work, but the
> sequential `coverage.test.js` will stay as-is; do the **[checklist]** steps and your fallacy is
> live.

---

## The recipe (4 files)

### 1. `data/fallacies.json` — define the fallacy

Append one object to the `fallacies` array:

```json
{
  "id": "red_herring",
  "name": "Red Herring",
  "base_rate": 1.0,
  "family": "against_the_person",
  "short": "Diverting attention to an unrelated point instead of addressing the issue.",
  "teaching": "A red herring changes the subject to something that feels relevant but isn't, leaving the original point unanswered. Bringing in genuinely related context is fine — it's only a red herring when the detour replaces the response rather than supporting it.",
  "confirm_check": "Does the response shift to a different issue and leave the original point unanswered, rather than genuinely bearing on it?"
}
```

| field | rule |
|---|---|
| `id` | lowercase `^[a-z][a-z0-9_]*$`, unique, never `"VALID"` |
| `name` | display name |
| `base_rate` | how common (1.0 typical; ~1.5 very common; ~0.8 rarer). Keep modest — see cap note. |
| `family` | **required for the checklist.** One of the existing families (see `data/families.json`), or a new one (then add its metadata in step 3). Families keep sessions short and every fallacy reachable. |
| `short` | ≤ 120 chars, one plain line |
| `teaching` | 1–3 plain sentences. **Always say when it is *not* a fallacy** (the charitable caveat). No jargon. |
| `confirm_check` | the yes-confirms question the *user* answers at the verdict. Required. |

> **base_rate cap:** every fallacy's starting probability must stay ≤ 0.15. With a dozen-ish
> fallacies near `base_rate: 1.0` you're nowhere near it; the loader rejects the bank (guardrail G7)
> if you push one too high.

### 2. `data/questions.json` — add ≥2 questions it **solely owns**

A fallacy needs at least two questions that point at it — and for the checklist, those questions must
be **distinctive**: this fallacy's `yes` weight must be the *strictly highest* among the fallacies
that question lists. A question shared equally across siblings can't single your fallacy out, so it
can't be a checklist tell. `tests/checklist.test.js` enforces "≥2 distinctive questions" and that
denying any distinctive pair accuses *your* fallacy and never a sibling.

```json
{
  "id": "q_detour_or_response",
  "text": "Does the response address the point that was raised, or shift attention to a different issue?",
  "tags": [],
  "lr": {
    "red_herring": { "yes": 4.5, "no": 0.3 },
    "VALID":       { "yes": 0.6, "no": 1.4 }
  }
}
```

**The `lr` table is the whole game.** You write only `yes`/`no` weights (multiplicative, centered on
1.0); the engine derives the charitable `maybe`/`unsure` behavior — never hand-write those. **Use
this exact recipe on your two distinctive questions** — it's the weight that reliably clears the
checklist gate (weaker `no` values fall a hair short; a real fallacy once missed by 0.01 because one
question used `no: 0.35`):

```json
"F":     { "yes": 4.5, "no": 0.3 },   // BOTH distinctive questions — yes:4.5, no:0.3
"VALID": { "yes": 0.6, "no": 1.4 }    // costs VALID a little; the exonerating reading rewards it
```

- Incriminating `yes` on F: **4.5** for distinctive questions (clamped to 3 internally; 4.5 = "as
  strong as it gets"). A 3rd/4th question may be softer (`yes: 4, no: 0.35`).
- Exonerating `no` on F: **0.3** for your two distinctive questions; ≤ 0.4 elsewhere.
- `VALID` row: incriminating side `yes` ≤ 1.0 (~0.6), exonerating side `no` ≥ 1.0 (~1.4). This is
  what lets the argument earn innocence — **required by guardrails G1/G2 or the bank won't load.**

A question *may* list several related fallacies, but for it to count as **distinctive** for yours,
yours must be the strict top weight. The simplest path: give your fallacy 2–4 questions that only it
lists. (A broad shared question is fine *in addition* — it helps family routing — but doesn't count
toward your ≥2 distinctive.)

> **Watch family crowding.** Adding a fallacy to a family that already has 3+ members makes its
> checklist a bit harder to clear (more siblings to out-rank). If your distinctive pair lands just
> under the gate (`checklist.test.js` says "no distinctive pair accused it"), strengthen to the exact
> recipe above, or give the fallacy a 3rd distinctive question.

> **Also tag ≥2 of its questions `["entry"]`.** `coverage.test.js` (the sequential flow) requires
> every fallacy to have ≥2 entry-pool questions or it fails with "ENTRY: X has only N…". Simplest:
> add `"tags": ["entry"]` to two of your distinctive questions. (Harmless to the checklist; required
> by the still-running sequential test.)

### 3. `data/families.json` — write the checklist tells **[checklist — the step that's easy to forget]**

This is the file the sequential-era guide didn't have, and the one the tests will yell about if you
skip it (`"fallacy red_herring needs ≥2 authored tells in families.json"`). Two parts:

**(a) The tells** — under `"tells"`, add ≥2 *virtues* for your fallacy, each mapping to one of its
distinctive question ids from step 2. **Phrase each as what a SOUND argument does** (positive), so
ticking ✓ is the charitable reading and ✗ (missing) is what hints at the fallacy:

```json
"tells": {
  "red_herring": [
    { "qid": "q_detour_or_response", "text": "Addresses the point raised rather than changing the subject" },
    { "qid": "q_subject_changed",    "text": "Stays on the original issue instead of pivoting to a side topic" }
  ]
}
```

- `qid` **must** be a question whose `lr` lists your fallacy with `yes > 1` (i.e. a real detector),
  and should be one of its *distinctive* ones (step 2). The test checks this.
- `text`: a positive virtue, plain and observable, ≤ ~90 chars. Not a flaw, not an accusation —
  "Engages the claim itself" ✓, not "Attacks the person" ✗.

**(b) The family** — if you reused an existing `family` in step 1, you're done. If you created a new
one, add it under `"families"` with a display name, the user-facing "what feels off?" prompt, and
≥3 routing cues (lowercase substrings the text scanner looks for in a pasted argument):

```json
{
  "id": "diversion",
  "name": "Changes the subject",
  "prompt": "It seems to dodge the point rather than answer it",
  "cues": ["what about", "let's talk about", "the real issue is", "speaking of", "anyway"]
}
```

### 4. `data/fixtures.json` — a calibration example **[sequential — optional but recommended]**

Add one fallacious example and ideally one sound near-miss. This feeds `calibration.test.js` (the
sequential flow's 0-false-accusation guarantee). Not required for the checklist to work, but it's
cheap insurance and documents the fallacy by example.

```json
{ "id": "rh_clear", "label": "red_herring",
  "argument": "Reporter: the budget has a $2M shortfall. Mayor: what about all the great parks we built last year?",
  "answers": { "q_detour_or_response": "yes", "q_subject_changed": "yes" },
  "default": "unsure" },
{ "id": "rh_nearmiss", "label": "VALID",
  "argument": "The shortfall is one-time, and the parks generate recurring revenue that closes it — here are the figures.",
  "answers": { "q_detour_or_response": "no", "q_subject_changed": "no" },
  "default": "no" }
```

---

## Run the tests: all five must pass

```bash
node tests/engine.test.js        # engine math (independent of your data)
node tests/checklist.test.js     # THE LIVE FLOW: your fallacy reachable, ≥2 distinctive virtues,
                                  #   tells valid, never misaccuses, suggestFamily routes
node tests/coverage.test.js      # sequential reachability (aggregate catch floor)
node tests/calibration.test.js   # sequential fixtures: 0 false accusations
node tests/suggestmoves.test.js  # if your fallacy has pick_label/pick_example, its cues surface it
                                  #   in "which move is it?" against the real catalog
```

**`checklist.test.js` is the one that guards routine additions now.** What its messages mean:

| message | fix |
|---|---|
| `fallacy X needs ≥2 authored tells in families.json` | do step 3(a) |
| `family Y missing metadata` / `needs ≥3 routing cues` | do step 3(b) |
| `tell … doesn't incriminate it` / `references unknown question` | the tell's `qid` must be a real question that lists X with `yes > 1` |
| `only N distinctive virtue/s` | step 2 — give X ≥2 questions it solely owns (strict top weight) |
| `no distinctive pair accused it` | X's distinctive questions are too weak or too shared; raise `yes` toward 5.0 or pick more distinctive questions |
| `denying … wrongly accused <other>` | a tell is bleeding into a sibling fallacy — make the question more distinctive to X |

If `calibration.test.js` reports a false accusation on a sound fixture, your `lr` weights are too
aggressive (or a VALID row lost its pro-innocence pull). Dial back. **The 0-false-accusation line is
sacred — never relax it to make a catch pass.**

---

## What the loader rejects (so you can't ship a gotcha)

`validateBank()` throws — the app won't start — on any of these (full list in
[ENGINE-SPEC.md §4.3](ENGINE-SPEC.md)):

- **G1** — a question's `lr.VALID.no` must be ≥ 1.0 *and* greater than the lowest fallacy `.no`. Some
  answer must be able to raise VALID; a question that can only incriminate is illegal.
- **G2** — an incriminating `yes` for a fallacy must pair with `VALID.yes ≤ 1.0`; an exonerating `no`
  must pair with `VALID.no ≥ 1.0`. Incrimination costs VALID; exoneration rewards it.
- **missing `confirm_check`** — every fallacy needs one; it keeps verdicts tentative.
- **G7** — a prior over the 0.15 cap (lower your base_rate).

These aren't style rules — they're the mechanical guarantee the app stays charitable no matter who
edits the data.

---

## Quick checklist (tear-off)

```
□ fallacies.json:  + entry with id, name, base_rate, family, short, teaching, confirm_check
□ questions.json:  + ≥2 questions this fallacy SOLELY owns (strict-top yes); use yes:4.5 no:0.3;
                     VALID row 0.6/1.4; tag ≥2 of them ["entry"]
□ families.json:   + ≥2 tells (positive virtues → its distinctive qids); new family? + metadata + ≥3 cues
□ fixtures.json:   + one fallacious + one sound near-miss   (recommended)
□ all five tests green   (engine, checklist, coverage, calibration, suggestmoves)
```
