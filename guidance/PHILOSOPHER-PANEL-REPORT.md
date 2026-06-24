# Philosopher Panel Evaluation — Steelman

*Four philosophers (informal logic, epistemology, rhetoric/charity, formal logic) drove the real engine across a test battery; chair synthesized. Captured 2026-06-24.*

# PANEL CHAIR'S SYNTHESIS — "Steelman" / Fallacynator

*Chair: philosopher of logic. Synthesizing four independent evaluations (informal logic, epistemology, rhetoric/charity, formal logic), each ~35-43 live runs against `src/engine.js`. I re-ran the three contested findings myself before signing off; results cited inline as [CHAIR-VERIFIED].*

---

## 1. VERDICT

The diagnostic **core** holds up philosophically — definitions are Walton-grade, sibling fallacies are cleanly separable, and the goodwill prior genuinely protects sound arguments from honest false accusation. But the **app as a user actually operates it does not hold up**: following its own checklist instructions whitewashes roughly three of every four clear fallacies. The logic is sound; the interaction that feeds the logic is broken. Right now it is a fair juror that reliably acquits the guilty.

---

## 2. WHAT MAKES SENSE (genuine strengths)

**S1 — Sound arguments are safe from honest false accusation. All four lenses confirmed this independently, and it is the app's most important property.** Every category-B sound argument and category-C near-miss returned "holds up": mechanism-backed causal (smoking→cancer), valid modus ponens, modus tollens, relevant IPCC/cardiologist citation, genuine binary, well-sampled poll, *supported* slippery-slope worry, legitimate conflict-of-interest objection. The formal logician's hardest traps cleared correctly — a **biconditional misread as affirming-the-consequent (C1)** and a **20-heads streak as a legitimate Bayesian bias update vs. gambler's fallacy (C3)** both held up. The repo's own calibration test independently shows 0/40 false confirmed-accusations.

**S2 — Sibling separability is excellent.** No `qid` is shared across two fallacies; denying a fallacy's own tells targets exactly that fallacy (informal logic: 19/19). The Walton trio resolves cleanly: ad_hominem / poisoning_the_well (pre-emptive timing) / genetic_fallacy (origin/history) / tu_quoque / circumstantial all hit the right target. AC vs. DA, post_hoc vs. correlation_causation, gambler's vs. base-rate vs. regression vs. survivorship all discriminate. This is the formal/epistemic backbone and it is real.

**S3 — The threshold is well-separated and non-arbitrary.** Epistemology measured a clean empty gap: 1 denied virtue → f1/VALID ≈ 0.040-0.059 (always holds up); 2 denials of the *same* fallacy → ≈ 0.180-0.280 (always accuse). The 0.16 gate sits squarely in the gap. "One absent virtue is never enough to accuse" is real and uniform across all 21 families — the correct defeasible-reasoning stance.

**S4 — The tells and `confirm_check` prompts are textbook-accurate and charitable.** Phrased as *virtues a sound argument has*, not gotchas. Each teaching text states both the fallacy and its non-fallacious twin (weak_analogy vs. false_analogy vs. apples_to_oranges genuinely distinct). Affirmation is real Bayesian counter-evidence: affirming a fallacy's own virtue flips accuse→holds-up, while affirming an *unrelated* sibling's virtue does not rescue it (epistemology).

---

## 3. WHAT DOES NOT (ranked)

### CRITICAL

**C-1 — Honest sibling-affirmation whitewashes 9 of 12 clear fallacies. [CHAIR-VERIFIED]**
This is the panel's headline failure and the one place the lenses initially *disagreed* — so I re-ran it. The UI (`src/ui.js:210-224`) renders the **union of the whole family's virtues** as one checklist and instructs: *"Tick ✓ for what it does well, ✗ for what it falls short on, leave the rest blank."* A fair juror reading a blatant ad hominem honestly denies ad_hominem's 3 virtues **and** affirms the 8 sibling virtues the argument genuinely satisfies (it didn't strawman, didn't tu quoque…). Those honest affirmations of *true* virtues mathematically drown the denials.

My re-run of the exact scenario:

| guilty fallacy | honest juror (deny own + affirm true siblings) | prosecutor (deny only) |
|---|---|---|
| ad_hominem (3 tells) | **HOLDS UP** | ACCUSE ad_hominem |
| strawman (2) | **HOLDS UP** | ACCUSE strawman |
| appeal_to_authority (3) | **HOLDS UP** | ACCUSE appeal_to_authority |
| post_hoc (2) | **HOLDS UP** | ACCUSE post_hoc |
| hasty_generalization, gamblers, red_herring, equivocation, weak_analogy | **HOLDS UP** (×5) | ACCUSE (each) |
| slippery_slope (3), circular_reasoning (3), false_dilemma (3) | ACCUSE (survives) | ACCUSE |

**9/12 whitewashed; the only 3 survivors are the fallacies that happen to own 3 virtues.** The catch is reachable *only* by behaving like a prosecutor — deny the bad, refuse to credit anything — which is precisely the cynical posture the positive-first design exists to prevent. The interaction and the math are in direct tension.
*Fix:* per-fallacy gating. Decide accuse/lean for each fallacy using **only that fallacy's own affirmed/denied virtues**; a sibling's affirmation must not raise VALID against an unrelated fallacy (mirror the family-local renormalization the code already does for cross-family isolation, one level down). Add the missing regression test: *"denying any fallacy's two tells must still accuse it even when every other virtue in the family is affirmed."* The suite only tests the single-denial rescue (`tests/checklist.test.js:120`), never a legitimate 2-denial catch under honest sibling-affirmation.

> **Note on disagreement:** informal_logic, epistemology, and formal_logic each reported "no whitewash under honest marking." That is because all three marked as *prosecutors* (deny-only). rhetoric_charity marked as the UI literally instructs (deny + affirm true siblings) and found the whitewash. Both are correct about what they ran; the app ships the instruction that produces the whitewash. This is not a contradiction in the findings — it is a measurement of where the defect lives: **in the seam between the UI's instruction and the engine's family-pooled gate.**

**C-2 — Family naming trap routes false_dilemma into a whitewash. [CHAIR-VERIFIED]**
Two confusingly-named families: `false_choices` = **"Forces a narrow choice"** (members: false_equivalence, perfect_solution, middle_ground) and `presumption` = **"Assumes what it should establish"** (members: **false_dilemma**, circular_reasoning, argument_from_incredulity). A user hunting a false dilemma overwhelmingly picks "Forces a narrow choice" — but false_dilemma **is not in it**. My re-run: pick `false_choices`, deny false_dilemma's three tells → **`cynic_valid`**. A textbook false dilemma declared sound by a name that actively points the wrong way. (Informal logic notes this is the one case that fooled its own battery — strong evidence a real user will be too.)
*Fix:* move false_dilemma into `false_choices`, or rename the families so neither collides with how people think about either/or framing. Audit: "does every fallacy's lay name lead a naive user to the family that contains it?"

**C-3 — Two distinct fallacies (one tell each) are reported "holds up." [CHAIR-VERIFIED]**
Even under *prosecutor* marking. My re-run: family `against_the_person`, deny 1 ad_hominem tell + 1 strawman tell → **`cynic_valid` (VALID=0.755)**. The argument *"My opponent, a draft-dodging coward, wants open borders — meaning zero immigration law"* is simultaneously poisoning-the-well and a strawman, yet "holds up." Cause: the "innocence beaten" test runs per-leading-fallacy, so evidence for *distinct* fallacies never aggregates against VALID. An argument with two independent relevance failures is *less* justified than one, yet scores as sound. There's a wrong discontinuity: 2-distinct → sound, but 3-distinct → lean ([CHAIR-VERIFIED]: deny 1 each of three siblings → `inconclusive_lean ad_hominem`).
*Fix:* add a family-level aggregate check — `P(any family fallacy)/P(VALID)` — and if it clears a (higher) bar while no single fallacy dominates, return `inconclusive_lean`, not `cynic_valid`. "≥2 distinct denials → at least a lean." Note C-3 and C-1 share a root: **evidence is pooled the wrong way.** A per-fallacy fix for C-1 plus an aggregate-floor fix for C-3 are complementary, not redundant.

### MAJOR

**M-1 — Cue routing misroutes more than it helps; all four lenses measured it independently and agreed.** Accuracy: informal 2/14 family, formal 5/13 (1/5 on statistics), rhetoric 2/12 exact + 6/12 no-suggestion + 4/12 wrong. The recurring false attractor is `formal_conditional`, whose cues `"if "`, `"then "`, `"so it must"` are near-universal English — they steal slippery_slope, appeal_to_authority, post_hoc, and the regression case. `weak_induction` and `causal` share 7 identical cues; `ambiguity`'s `"true "` caught "it's true because it's true." Because the suggestion renders as a highlighted fast-path, a novice who trusts it lands in the wrong family — which feeds C-1/C-2/C-3.
*Fix:* drop/down-weight ultra-generic cues; weight by specificity (a cue in N families counts 1/N); require ≥2 distinct cue hits before surfacing a suggestion; add cues for the no-hit fallacies and for statistical language ("overdue", "in a row", "streak", "rare", "regress", "survivors", "ever since"). At 2/14, an unsorted list beats the current suggester.

**M-2 — `formal_conditional` mixes two valid forms (MP, MT) and two fallacies (AC, DA) under one checklist with no orienting line.** Formal logic: a valid modus tollens, if confused with denying-the-antecedent, can be nudged into a wrong `accuse denying_the_antecedent` (F2). The tell text is accurate; the family layout invites the mismark.
*Fix:* a one-line family preamble — "Valid moves (affirming the antecedent, denying the consequent) are fine; you're only looking for the reversed moves (AC/DA)."

**M-3 — Overlapping causal taxonomy undermines the "know WHICH one" thesis.** `false_cause` lives in `weak_induction` but its teaching text describes *both* post_hoc and correlation→causation, which are a separate `causal` family. A post-hoc argument routed to `weak_induction` accuses false_cause; routed to `causal` accuses post_hoc — two names for one error, both "succeed."
*Fix:* fold `false_cause` into `causal` as the genus, or drop it for the three species. Don't ship the umbrella and its parts in different families.

### MINOR

**m-1 — `cynic_valid` is overloaded; `valid_earned` is never returned. [CHAIR-VERIFIED]** Skipping everything and affirming every virtue (VALID=0.999 in my re-run) return the *same* label that also means "skeptic ran out of objections." Epistemically distinct (positively justified vs. merely-not-defeated). *Fix:* return `valid_earned` when virtues are affirmed and VALID clears `TAU_VALID`; let the UI say "you confirmed N virtues, this positively holds up" vs. "nothing flagged."

**m-2 — "Accuse" while VALID is still the modal hypothesis reads as incoherent.** With 2 denials the engine accuses though VALID can still be ~0.71-0.78 (the *ratio* gate, not argmax, is the thesis). Internally consistent, but a naive reader seeing "VALID 78%" beside "this commits false_cause" is confused. *Fix:* surface the family-local VALID share — "the ratio of evidence tipped past our innocence bar, though validity is still plausible."

**m-3 — Verdict copy conflates validity with truth.** A valid-but-unsound argument with a false premise ("moon is cheese…") returns "holds up." Honest scope of a *fallacy* checker, but copy should say it certifies the *reasoning move*, not premise truth.

**m-4 — Deny-all lean is base-rate-driven, not denial-driven** (irrelevant_appeal deny-all leans appeal_to_emotion by base_rate). Defensible tiebreak; minor.

**m-5 — Stale calibration comment** (`engine.js:43-50`): describes a 51-fallacy catalog; the bank now has 73. Gate still safe in the gap, but documented numbers (1-denial ≈0.083 / 2-denial ≈0.251) no longer match measured (≈0.059 / ≈0.180). Re-measure and re-center; consider nudging `CHECKLIST_RATIO_VALID` toward the new midpoint.

**m-6 — `scoreChecklist` silently drops unknown qids** (returns "holds up" with no warning). Can't surface in the live UI, but tripped the formal logician's own harness. Add a dev-mode warn/assert that affirmed/denied qids belong to the chosen family.

---

## 4. CROSS-CUTTING THEMES (panel consensus)

1. **The engine is honest; all charity lives in the interaction.** Unanimous: the engine sees no argument text — `scoreChecklist` is a pure function of which virtues a juror ticks. The "0 false accusations" guarantee is therefore **conditional on honest, correctly-routed marking**, not a property of the engine. Every lens independently produced a false accusation by mismarking a sound argument (deny a valid MP's AC-virtues → accuse affirming_the_consequent). The headline promise should be restated with this precondition.

2. **Every defect lives at the routing/UX seam, not in the deductive core.** Definitions, separability, and thresholds are sound across all four lenses. The whitewashes (C-1, C-2, C-3) and misroutes (M-1) are all about *how evidence is gathered and pooled* before it reaches a gate that is itself well-calibrated.

3. **Evidence is pooled at the wrong granularity.** The single deepest technical theme: the family-pooled gate both (a) lets honest sibling-affirmations cancel real denials (C-1) and (b) prevents distinct-fallacy evidence from aggregating against innocence (C-3). Per-fallacy denial-signal + family-level aggregate floor addresses both.

4. **"Holds up" is doing too much work.** It means "genuinely sound," "I skipped everything," "two fallacies cancelled out," and "I marked the wrong family" — four very different epistemic states wearing one label (m-1, M-1, C-3).

5. **The cue suggester is a net negative as shipped** — agreed by all four. Below-chance accuracy plus a highlighted fast-path actively steers novices into the wrong family.

---

## 5. TOP 5 RECOMMENDATIONS (prioritized)

1. **Fix the sibling-affirmation whitewash (C-1) with per-fallacy gating.** Decide accuse/lean per fallacy from only its own virtues; sibling affirmations must not defend unrelated fallacies. Add the missing regression test. *This is the difference between a tool that works and one that acquits the guilty — highest priority by unanimous panel weight.*

2. **Fix the false_dilemma routing trap (C-2).** Move false_dilemma into "Forces a narrow choice" (or rename the families), and run the lay-name→correct-family audit across the catalog.

3. **Overhaul cue routing (M-1).** Down-weight generic cues, weight by 1/N specificity, require ≥2 hits, or suppress the highlighted fast-path until it beats chance. Add statistical/causal cues.

4. **Make distinct-fallacy evidence aggregate against innocence (C-3),** via a family-level "any-fallacy" floor that escalates ≥2 distinct denials to at least a lean. Complements #1.

5. **Restate the "0 false accusations" claim honestly** and split the verdict vocabulary: introduce `valid_earned` vs. `cynic_valid` (m-1), surface VALID share on accusations (m-2), clarify validity-not-truth copy (m-3). Also clear the housekeeping: stale calibration comment (m-5), qid validation (m-6).

**Bottom line for the author:** Your logic engine is genuinely good — keep it. The work to do is almost entirely upstream of the gate: stop pooling sibling affirmations into one verdict, fix the family name that hides false_dilemma, and stop trusting a below-chance cue suggester. Do #1 and #2 and this becomes a defensible teaching tool that keeps its charity toward the innocent while actually naming the guilty.

*Re-verification harnesses: `/tmp/chair_check.mjs` (honest-juror vs prosecutor sweep), `/tmp/chair_check2.mjs` (routing trap, D2, valid_earned).*