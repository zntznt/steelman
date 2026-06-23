# Fallacynator — Canonical Engine & Data-Schema Specification

**Status:** Contract. The implementation (`src/engine.js`), the JSON content banks (`data/`), and the rest of the docs all follow this document. Vanilla JS, no build step, no framework, no LLM at runtime, static GitHub Pages.

**The one load-bearing idea:** A narrowing engine is *structurally* a confirmation-bias machine — it always converges to *some* fallacy. We defeat that by making **VALID a first-class hypothesis with a strong prior (0.60) that *accrues positive evidence* and must be *beaten* by a triple gate before any fallacy is named.** Every other decision serves that thesis. See [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) for the *why*; this file is the *what*.

---

## 0. Global constants

All tunables live in ONE `CONFIG` block. The engine has zero magic numbers; all diagnostic knowledge lives in JSON.

```js
const CONFIG = {
  // --- Priors ---
  PRIOR_VALID:      0.60,  // strong innocence prior
  PRIOR_FALLACY_CAP:0.15,  // no single fallacy prior may exceed this (anti-laundering)

  // --- Numerical hygiene ---
  EPS:              1e-4,   // posterior floor; no hypothesis dies permanently
  L_MIN:            0.2,    // per-cell likelihood clamp (no near-certainty)
  L_MAX:            3.0,    // per-cell likelihood clamp
  MAX_LR_RATIO:     8.0,    // max(L)/min(L) within ONE answer row (bounded single-step impact)

  // --- Correlation damping (fixes naive-Bayes double-counting) ---
  EVIDENCE_DAMP:    0.7,    // λ: each answer's log-likelihood is raised to this power

  // --- Accusation gate (RELATIVE / ratio-based — field-size-invariant) ---
  RATIO_VALID:      1.2,    // (A2) f* must be ≥ this × P(VALID): decisively beats innocence
  RATIO_RUNNERUP:   2.5,    // (A4) f* must be ≥ this × the 2nd fallacy: we know WHICH one
  MIN_ACCUSE_MASS:  0.18,   // (A3) small absolute floor so a thin near-empty field can't accuse

  // --- VALID exits ---
  TAU_VALID:        0.75,   // earned-VALID: confident "this holds up"

  // --- Question loop control ---
  IG_MIN:           0.02,   // bits; below this, no question is worth asking (stuck)
  Q_MAX:            7,      // hard cap on questions per session
  ENTRY_R:          2,      // first R questions drawn from "entry"-tagged pool
  ENTRY_TOPK:       3,      // entry phase: sample uniformly among top-3 by info gain
  NARROW_TOPK:      2,      // narrow phase: sample among top-2 by info gain (∝ IG)

  // --- Charity (answer-noise model; see §1.4) ---
  CHARITY_UNSURE:   0.85,   // weight on the "true answer is no" branch for unsure
  MAYBE_YES_SHARE:  0.40,   // weight on "true answer is yes" for maybe (tilt charitable)

  // --- Unsure-streak guard ---
  UNSURE_STREAK:    3,      // N consecutive unsure → route to cynic exit
  UNSURE_FRACTION:  0.60,   // ≥ this fraction of answers unsure → cynic exit
};
```

---

## 1. Probability model

### 1.1 Hypothesis space

Candidate fallacies `F = {f_1, …, f_n}` loaded from `fallacies.json`. The full space adds the null hypothesis:

```
H = F ∪ {VALID}          |H| = n + 1
```

Mutually exclusive, collectively exhaustive. `VALID` absorbs "no fallacy here / the reasoning holds." It is a **peer candidate in the same probability simplex**, never a residual or a fallthrough.

### 1.2 Prior distribution

```
P₀(VALID) = PRIOR_VALID = 0.60

                            w_i
P₀(f_i) = (1 − 0.60) · ───────────       w_i = fallacy.base_rate (default 1)
                           Σ_j w_j
```

`base_rate` lets common fallacies (ad hominem) start above rare ones. **Guardrail G7** (validated at load): every `P₀(f_i) ≤ PRIOR_FALLACY_CAP (0.15)` and `Σ P₀(f_i) = 0.40`, so an author cannot "launder" a fallacy into prominence via the prior.

Worked, `n = 4`, uniform: `P₀(VALID)=0.60`, each `P₀(f_i)=0.10`. Sum = 1.0.

### 1.3 Likelihoods: a proper per-question categorical

Each question carries, for every hypothesis it discriminates, a *proper conditional distribution over the four answers*: `P(a | h)` for `a ∈ {yes, no, maybe, unsure}`, summing to 1 per hypothesis.

**Authoring stays ergonomic.** Authors author only the two anchors they have intuitions about — the pull of a firm `yes` and a firm `no` — as multiplicative weights centered on 1.0. The loader derives the coherent 4-way categorical via the answer-noise model (§1.4).

```json
"lr": {
  "ad_hominem": { "yes": 6.0, "no": 0.2 },
  "VALID":      { "yes": 0.4, "no": 1.3 }
}
```

Any hypothesis not listed is **neutral** (`yes:1.0, no:1.0`) → flat categorical → contributes nothing. Authors only list what a question discriminates.

### 1.4 From authored anchors to a coherent `P(a|h)` (answer-noise model)

```
g_yes(h) = clamp(lr[h].yes, L_MIN, L_MAX)
g_no(h)  = clamp(lr[h].no,  L_MIN, L_MAX)

P(yes    | h) ∝ g_yes(h)
P(no     | h) ∝ g_no(h)
P(maybe  | h) ∝ g_yes(h)^MAYBE_YES_SHARE · g_no(h)^(1 − MAYBE_YES_SHARE)   // tilted toward "no"
P(unsure | h) ∝ g_no(h)^CHARITY_UNSURE   · g_yes(h)^(1 − CHARITY_UNSURE)   // leans "no"
```

Then normalize across the four answers so `Σ_a P(a|h) = 1` for each `h`. Because every column is part of one normalized categorical, the update is genuinely Bayesian, **commutative/order-independent for ALL answer types**, and the §2 mutual-information formula is exact.

Charity is a property of the generative model: `maybe`/`unsure` are *defined* to read as mostly-exonerating, so ambiguity provably cannot build a case. All four columns per (question, hypothesis) are **precomputed once at load and cached**.

### 1.5 The Bayesian update (with correlation damping)

```
logP(h)  +=  EVIDENCE_DAMP · log P(a | h)        // λ-damped log-likelihood
P(h)      =  softmax over H, then floor at EPS, renormalize
```

`EVIDENCE_DAMP = λ = 0.7` discounts correlated corroboration so redundant "yes"es can't stampede a borderline-sound argument over the gate (λ=1 recovers pure naive Bayes). Multiplicative, applies to all hypotheses incl. VALID, order-independent. Each question asked at most once.

### 1.6 "maybe" / "unsure" — charitable by construction

No special-case runtime code. They are two of the four columns, defined (§1.4) to lean exonerating. **Unsure-streak guard** (§3): `UNSURE_STREAK` consecutive or ≥ `UNSURE_FRACTION` of all answers unsure → cynic exit, not the marginal fallacy.

---

## 2. Question selection

### 2.1 Mutual information

```
S = − Σ_h P(h) · log₂ P(h)
P(a) = Σ_h P(h) · P(a | h)
ExpectedPosteriorEntropy(q) = Σ_a P(a) · S_a    (S_a = entropy of damped posterior after answer a)
InfoGain(q) = S − ExpectedPosteriorEntropy(q)   = I(H;A) ≥ 0
```

If `max InfoGain < IG_MIN` → STUCK (§3). Cost `O(|unasked|·4·|H|)` per turn — trivial; ship exact MI.

### 2.2 Randomized entry + stochastic path

- **Entry phase** (first `ENTRY_R = 2`): restrict to `tags:["entry"]`, rank by IG, sample uniformly among top `ENTRY_TOPK = 3`.
- **Narrowing phase**: rank all unasked by IG, sample among top `NARROW_TOPK = 2` with probability ∝ IG.
- **Seeded RNG per session** → shareable/replayable results.

---

## 3. Stop / accuse / valid-exit conditions

Evaluated after every answer, in priority order.

### 3.1 ACCUSE (tentative) — the relative gate

```
(A1)  f* = argmax_{f ∈ F} P(f)                      leading fallacy
(A2)  P(f*) ≥ RATIO_VALID · P(VALID)    (1.2×)      decisively beats innocence (ratio, not margin)
(A3)  P(f*) ≥ MIN_ACCUSE_MASS           (0.18)      non-trivial belief (not a thin near-empty field)
(A4)  P(f*) ≥ RATIO_RUNNERUP · P(2nd f) (2.5×)      we clearly know WHICH fallacy
```

**Why ratios, not an absolute floor.** An absolute probability floor (the original `TAU_ACCUSE ≥ 0.55`) is *unreachable* once the prior mass `1 − PRIOR_VALID` is split across many fallacies: with 12 fallacies, even a clearly-incriminated one peaks near 0.4. Ratios are **field-size-invariant** — they keep working as fallacies are added (the core extensibility goal). The thesis was never "hit 50%"; it was "decisively beat innocence *and* know which fallacy," both of which are ratio conditions. Calibrated against `tests/calibration.test.js`: sound arguments peak at `f/VALID ≈ 0.07` (vast safety gap below 1.2); real fallacies reach `f/VALID ≈ 1.3–1.9` and dominate the runner-up ≥ 3×.

A single "yes" cannot satisfy A2 — it stalls *below* VALID; ~two consistent incriminating answers are needed. When A1–A4 all hold, the engine **suspects** (never asserts) `f*` and presents that fallacy's `confirm_check`. **The user makes the final call.** If they reject → cynic exit (§3.3), not a second-best accusation.

### 3.2 DECLARE VALID (earned, confident)

`P(VALID) ≥ TAU_VALID (0.75)` → "No clear fallacy — the reasoning holds up." Reached by accumulating exonerating answers. **G9** asserts `TAU_VALID > PRIOR_VALID`, so VALID can never win for free off the prior — it earns the last 0.15.

### 3.3 VALID / CYNIC EXIT (first-class outcome)

Fires when, and no accusation/earned-VALID has fired:
1. **Stalemate:** `Q_MAX` reached, no fallacy cleared the gate.
2. **No-progress halt:** VALID leads AND `max InfoGain < IG_MIN`.
3. **Unsure-dominated:** `UNSURE_STREAK` consecutive or ≥ `UNSURE_FRACTION` unsure.
4. **User rejected** the tentative fallacy's `confirm_check`.

Messaged warmly, differentiated by reason:
- VALID leads → "No clear fallacy — you might just be skeptical, and that's okay."
- A fallacy led but missed the bar → "There might be something here — possibly {f*} — but not enough to call it. Trust your judgment." **Still refuses to accuse.**

### 3.4 Priority order each turn

```
1. ACCUSE         (A1–A4)                  → tentative verdict + confirm_check
2. UNSURE-EXIT    (streak/fraction unsure) → cynic_unsure  ("you might just be skeptical")
3. DECLARE VALID  (P(VALID)≥0.75)          → earned-valid
4. CYNIC EXIT     (budget/stuck §3.3.1-2)  → cynic_valid / inconclusive_lean
5. else CONTINUE  → pickNextQuestion
```

> **Note (impl. decision):** the unsure guard is checked *before* earned-VALID. Because `unsure`
> is charitable-by-construction it nudges VALID up; a streak of shrugs could otherwise cross
> `TAU_VALID` and manufacture a confident "this holds up" the user never affirmed. "You couldn't
> tell" is the more honest verdict, so it wins. The accusation gate is **relative** (§3.1): the
> original absolute floor was unreachable in a 12-fallacy field, so it became ratio conditions
> calibrated against the fixtures. See `tests/calibration.test.js` for the live numbers.

---

## 4. Data schema

Two JSON files (+ optional `fixtures.json`). Adding a fallacy or question is **append-only, JSON-only, zero engine edits.** `validateBank()` runs at load (and in tests) and **rejects** any bank violating the guardrails.

### 4.1 `fallacies.json`

```jsonc
{
  "version": 1,
  "fallacies": [
    {
      "id": "strawman",                 // unique, /^[a-z][a-z0-9_]*$/, NOT "VALID" (reserved)
      "name": "Strawman",
      "base_rate": 1.0,                 // number > 0, default 1.0; relative prior weight
      "short": "Refuting a distorted version of the argument, not the real one.",  // ≤120 chars
      "teaching": "A strawman replaces the opponent's actual claim with a weaker, easier-to-attack version, then defeats that instead.",
      "confirm_check": "Re-read the rebuttal: is it answering the claim that was actually made, or a weaker/exaggerated version of it?"  // REQUIRED; user answers this at accusation
    }
  ]
}
```

| field | type | rule |
|---|---|---|
| `version` | int | required |
| `id` | string | required, unique, `^[a-z][a-z0-9_]*$`, not `"VALID"` |
| `name` | string | required, non-empty |
| `base_rate` | number | optional, `> 0`, default `1.0` |
| `short` | string | required, ≤ 120 chars |
| `teaching` | string | required, non-empty |
| `confirm_check` | string | **required**, non-empty |

`confirm_check` lives on the **fallacy** (the accusation is *of the fallacy*), not the question.

### 4.2 `questions.json`

```jsonc
{
  "version": 1,
  "questions": [
    {
      "id": "q_misrepresents_claim",    // unique, /^q_[a-z0-9_]*$/
      "text": "Does the rebuttal address the claim as actually made, a weaker/exaggerated version of it, or no opposing claim at all?",
      "tags": ["entry"],                // "entry" marks entry-pool questions
      "lr": {
        "strawman": { "yes": 6.0, "no": 0.2 },
        "VALID":    { "yes": 0.4, "no": 1.3 }
      }
    }
  ]
}
```

| field | type | rule |
|---|---|---|
| `version` | int | required |
| `id` | string | required, unique, `^q_[a-z0-9_]*$` |
| `text` | string | required; see G8 |
| `tags` | string[] | optional; engine reads `"entry"` |
| `lr` | object | required; keys are hypothesis ids; each value `{ "yes": number, "no": number }`, both `> 0` |

The four-way `P(a|h)` is **derived** (§1.4); authors never hand-write `maybe`/`unsure`.

### 4.3 Anti-bias guardrails (`validateBank` — hard-fail unless noted)

| # | Guardrail | Rule | Defends |
|---|---|---|---|
| **G1** | Pro-VALID reachability | Every question lists `VALID`, with `lr.VALID.no ≥ 1.0` AND `lr.VALID.no > min over fallacies of lr[f].no`. **A question that can only incriminate is illegal.** | Asymmetric questions |
| **G2** | Charitable direction | Per question: each `lr[f].yes ≥ 1.0` pairs with `lr.VALID.yes ≤ 1.0`, and `lr[f].no ≤ 1.0` pairs with `lr.VALID.no ≥ 1.0`. | Innocence must be accumulable |
| **G3** | No certainty | All clamped likelihoods strictly in `(L_MIN, L_MAX)`. No 0, no ∞. | One answer can't zero-out a candidate |
| **G4** | Bounded single-step impact | Within each derived answer row, `max/min ≤ MAX_LR_RATIO (8)` across hypotheses. | A single question can't be decisive |
| **G5** | VALID referenced everywhere | `lr` must contain `"VALID"` (covered by G1). | No silent VALID erosion |
| **G6** | Discrimination requirement | A question's `lr` must distinguish ≥ 2 hypotheses. | Anti-busywork |
| **G7** | Prior caps | `PRIOR_VALID ≥ 0.55`; `Σ P₀(f) = 0.40`; every `P₀(f) ≤ 0.15`. | Author can't pre-load a fallacy |
| **G8** | Presupposition lint | `text` checked vs banned accusatory words ("dodging", "instead of", "obviously", "really", "manipulat*", "fails to", bare "attack") unless neutral either/or. **Warn in dev, hard-fail in CI.** | Leading framing |
| **G9** | Threshold sanity | `TAU_VALID > PRIOR_VALID`; accusation can't be trivially easy. | Mis-tuned config |
| **G10** | Calibration regression | `fixtures.json` labeled sound/fallacious args replayed; **false-accusation on sound = 0**; catch-rate floor met. | Unvalidated author likelihoods |

---

## 5. Engine public API

```
loadData(fallaciesJSON, questionsJSON, fixturesJSON?) -> data   // validates + precomputes categoricals
newSession(data, seed?)        -> state
status(state)                  -> { stop, kind?, nextQuestion?, fallacy?, confirm_check?, beliefs }
answer(state, questionId, a)   -> state                          // a ∈ {yes,no,maybe,unsure}
confirmVerdict(state, accepted)-> finalOutcome                   // user's final call (§3.1)
```

`status().kind ∈ {accuse, valid_earned, cynic_valid, cynic_unsure, inconclusive_lean}`.

**Extending = data only.** Add a fallacy: append to `fallacies.json` (with `confirm_check`), reference its `id` in question `lr` tables. Add a question: append to `questions.json` with an `lr` table. The engine reads `H` and categoricals dynamically. No code changes; `validateBank` + the fixture are the only gates. See [ADDING-FALLACIES.md](ADDING-FALLACIES.md).

---

## 6. Load-bearing decisions (the contract in one breath)

1. **VALID is a first-class, 0.60-prior hypothesis that *gains* mass from exonerating answers** (G1+G2 force every question to be able to vote for innocence).
2. **`maybe`/`unsure` are columns of a proper, normalized `P(a|h)` categorical** derived from yes/no anchors via one charity-bearing noise model — genuinely Bayesian, order-independent for all answers.
3. **Accusation requires the relative gate** (f ≥ 1.2× VALID, ≥ 0.18 mass, ≥ 2.5× the runner-up fallacy) ≈ two consistent incriminating answers; **one "yes" never convicts**, and the gate stays correct as fallacies are added.
4. **`EVIDENCE_DAMP=0.7` discounts correlated corroboration** (kills naive-Bayes double-counting).
5. **Next question by exact mutual information**, top-k sampling for randomized-but-never-wasteful entry.
6. **"You might just be skeptical, and that's okay" is a first-class, frequently-reached verdict**; the user always makes the final call via `confirm_check`.
7. **Anti-bias enforced by `validateBank` (G1–G9) + calibration fixture (G10)** — the bank won't load, and tests fail, if it can convict sound arguments.

All thresholds live in one `CONFIG` block; all diagnostic knowledge lives in JSON; the engine is ~180 lines of pure functions.
