# Why the checklist feels overwhelming, and the measured path out

The question was: is the checklist (the 👍/👎 step) the unavoidable breaking point, or can the
decision branch instead of showing a wall of thumbs?

## The wall is real and measured

A user who reaches a family faces a median of **9 thumbs decisions, up to 16** (deflection and
ambiguity are 16 rows each; 9 of 17 families are >=9 rows; 11 of 17 trigger the live "+ Show N more
checks" fold). Progressive disclosure shows the first 4 and folds the rest, but panels repeatedly
showed newcomers do not open the fold and lose trust when rows blur together.

## The wall is NOT necessary

Measured against the live engine: a verdict needs only about **2 of the 9 to 16 rows**. The engine
scores each fallacy from its own ~2 tells in isolation, so denying the right 2 produces the same
verdict as answering all 16. The other rows are noise for any given argument. The wall is an artifact
of showing every sibling fallacy's tells at once, not a property of the decision.

## The proposed fix: branch one level deeper

Replace the wall with one "Which of these is it doing?" pick (plain concrete options with everyday
examples, 2-3 surfaced by relevance plus a "something else"), then a short ~2-check confirm for the
picked move. Turns up-to-16 thumbs into 1 pick + ~2 thumbs, with no fallacy dropped.

A newcomer panel (6 personas) found this **unanimously lighter** (6/6 "proposed-much"). But it found
one make-or-break risk: the pick only works when the user's real move is among the surfaced 2-3.
When it is not, every persona fell back to "pick the closest visible option," which is a silent
precision loss at the pick (worse than the wall, because a clean pick screen lets a skimmer commit to
the wrong move with no friction). So the redesign lives or dies on **surfacing accuracy**.

## Measuring surfacing (the decision point)

Surfacing = floating the user's actual fallacy into the visible top 2-3 of its family.

- **Relevance heuristic (the tie-break scorer): 2/6.** Most arguments scored a flat zero across the
  whole family, so the ranking was just catalog order (luck). Structural reason: tell rows are built
  from abstract argument-analysis vocabulary ("reasons, evidence, conclusion, speaker, weigh"), which
  a lay grievance ("the owner got divorced", "everyone is late") never overlaps. Word-overlap
  surfacing is structurally doomed.

- **Per-fallacy lay cue phrases: 9/10 top-1** (on a held-out set of paraphrased, not-verbatim
  arguments for the hardest family, deflection, 8 siblings). Scoring each fallacy by how many of its
  everyday trigger phrases appear in the argument floats the right move to FIRST place, not just
  top-3. This is the bucket-routing mechanism pushed one level deeper, and it stays no-AI.

  - Multi-move arguments produce a tie at the top, which is correct: surface both.
  - An all-zero argument (nothing specific matches) falls through to the family's residual move
    (red herring = "brings up something off-topic"), a clean catch-all, not a failure.
  - The one "miss" (red herring scoring 0 on a novel off-topic tangent) is the residual-default case
    by design, not a real miss.

## Conclusion

The checklist is not the unavoidable breaking point. The thumbs appear too early and too wide; the
flow already branches (bucket, family) and can branch once more. The deeper branch is worth building,
but ONLY with per-fallacy lay cue phrases for surfacing (the relevance heuristic is not adequate;
measured 2/6 vs 9/10). The cue phrases double as the plain-language content the redesign needs
anyway. Prerequisite authoring: a plain move-label, an everyday example, and a handful of lay cue
phrases for each fallacy. Prototyped and measured for the 8-fallacy deflection family; the remaining
families need the same authoring before the UI is built.

## Built: the deflection slice (panel-tested against the real flow)

The deeper-branch flow is built for the deflection family only; every other family still uses the
checklist (the redesign is gated on `pick_label` existing, which only deflection's 8 fallacies have).
Engine: `suggestMoves(data, familyId, argument)` scores siblings by their lay `cues`, returns the top
matches (ties kept), with an allZero flag. UI: `renderMovePick` -> `renderMoveConfirm` -> verdict,
with a `renderMoveMiss` safety net. Verdict parity with the checklist is proven in code (denying a
move's tells calls the same `scoreChecklist`; all 8 deflection fallacies self-accuse).

A panel walked the ACTUAL built screens against a FAIR rendering of the current wall (real shipped
rows, not the earlier jargon strawman). Result: 6/6 found it "built-much" lighter; the right move
surfaced first as the lone card in 5/6; verdict goodwill intact (e.g. whataboutism accuses with VALID
0.80 vs 0.195). Two must-fixes were applied before commit:

1. allZero wrong-move trap (the only finding that could yield a WRONG-fallacy verdict): when no cue
   matched, the residual (red herring) was shown as a single confident-looking card and a trusting
   reader would pick it and be mis-steered. Fixed: on allZero the UI shows ALL moves with "nothing
   jumped out from your wording, here are all of them" framing and no fold, so nothing is singled out.
2. Cue gap: "you only believe/think that because" missed the motive cues and fell through to red
   herring. Added those phrases to appeal_to_motive.cues.

Deferred (nice-to-have, cannot cause a wrong verdict; do across all families when the redesign rolls
out, not piecemeal for deflection):
- The 2 confirm questions still use the abstract virtue phrasing with an embedded "not" (e.g. "weigh
  the claim on evidence, not on what the speaker stands to gain"), which several readers had to
  re-read and some guessed the thumb direction. Whataboutism and goalposts are already plain.
- A "this looks like a clear match" reassurance line on the single-surfaced case (anxious readers
  wondered what was hidden in the folded "something else").
- The 👎-means-the-bad-thing polarity still taxes skimmers ("wait, down is the bad one?").
- suggestFamily returns null for some deflection arguments (e.g. goalposts), so the user navigates to
  the family unaided; better cues or a clearer bucket label for "Changes the subject" would help.
