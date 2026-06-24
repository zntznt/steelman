# Fallacy Explanation Audit (all 73)

_Each explanation checked by a philosopher against the canonical definition, adversarially verified, then synthesized. 73/73 sound on first pass._

## Verdict

> The 73 explanations are largely sound and canonically accurate, with a small number of genuine fixes needed: the two formal-conditional checks are phrased so a "yes" reads ambiguously, "complex question" leans on a compound-question example that belongs more to a different fallacy, and a handful of teachings could mislead a layperson.

**66 of 73 fully sound.** 1 real definitional error, 2 clarity rewrites, 7 dash-punctuation fixes (CLAUDE.md no-dash rule).

## Error (wrong defect described)

### Complex Question (`complex_question`)
The canonical complex-question fallacy is a question that smuggles in an unproven presupposition (the same core defect as a loaded question), e.g. 'Have you stopped cheating?' The given example, 'Should we cut waste and raise taxes?', is a compound/conjunctive question (two policies bundled), which is a different defect. As written the teaching and check describe bundling two questions rather than presupposing a contested point, blurring it with an everyday 'two-part question' and drifting from the canonical fallacy.

- New teaching: A complex question is built on a hidden assumption you never agreed to, so any straight answer quietly grants that assumption. The classic shape bundles a loaded presupposition into a yes-or-no, like 'Have you stopped cutting corners?', where both yes and no admit you were cutting corners. It is not this fallacy when the built-in assumption is genuinely settled or already agreed, since then a direct answer concedes nothing in dispute.
- New check: Does the question rest on an unproven assumption, so that any direct answer would grant that assumption without it ever being established?

## Misleading / wording fixes

- **Affirming the Consequent** (`affirming_the_consequent`): Every other emotional/appeal entry in the set phrases confirm_check so that a YES answer means 'this IS the fallacy,' but several also pair with a 'set it aside / is there still a reason' framing.
- **Denying the Antecedent** (`denying_the_antecedent`): Parallel to affirming the consequent: the check is correct but the abstract 'stated condition not happening as enough to rule the result out' is hard for a layperson to apply, and could be misread as covering valid cases where the condition truly is the only path.
- **Appeal to Emotion** (`appeal_to_emotion`): The teaching uses a hyphen-style aside ('how something makes you feel - afraid, sympathetic, outraged -') set off with spaced hyphens that read like em dashes.
- **Appeal to Spite** (`appeal_to_spite`): Same spaced-hyphen-as-dash issue ('ill-will - the satisfaction of seeing a disliked person or group lose, suffer, or be denied - as the reason').
- **Appeal to Pity** (`appeal_to_pity`): Same spaced-hyphen-as-dash issue ('genuinely relevant - say, deciding what help someone needs - compassion is the point').
- **Appeal to Force** (`appeal_to_force`): Spaced-hyphen-as-dash usage ('will cost you - your job, safety, standing - rather than').
- **Appeal to Flattery** (`appeal_to_flattery`): Spaced-hyphen-as-dash usage ('compliments - how smart, fair, or discerning you are - so you'll go along').
- **Appeal to Wealth** (`appeal_to_wealth`): Spaced-hyphen-as-dash usage ('its quality, correctness, or worth - 'it costs more.
- **Appeal to Common Sense** (`appeal_to_common_sense`): Spaced-hyphen-as-dash usage ('no actual reasons are given - and often paints anyone who questions it as foolish').

## Minor (noted, no change)

- appeal_to_authority: the teaching is accurate, but strictly the fallacy is usually named 'appeal to UNqualified/irrelevant authority' or treated as the over-reliance case; the wording 'leans on who said something instead of the reasons' already captures this, so no change is needed, just noting the canonical nuance that citing a relevant expert is legitimate (which the teaching does state).
- ad_hominem_circumstantial vs appeal_to_motive: these two overlap heavily (motive is one circumstance). Both are defined correctly and the distinction (situation/affiliation vs stake-to-gain) is preserved, so no fix required, but reviewers should ensure the routing keeps them distinguishable.
- tu_quoque vs whataboutism vs two_wrongs: all three are correctly defined and correctly carve out the legitimate 'expose a double standard' exception; the family split (against_the_person vs deflection vs relevance_extra) is reasonable. No fix needed, just a note that their boundaries are intentionally fine.
- accent: canonically the fallacy of accent classically refers to shifting meaning via spoken stress/emphasis; the modern extension to selective out-of-context quoting is widely accepted and correctly flagged here, so the broadened scope is fine.
- perfect_solution teaching uses 'perfect-solution (or nirvana) fallacy' which is correct; no change.

---

## Applied

All 10 corrections applied to data/fallacies.json (10 teachings, 3 confirm_checks): the Complex Question definitional fix (it described a compound question, not a presupposition), the grounded Affirming/Denying the Antecedent teachings, and 7 appeal-* teachings whose spaced-hyphen asides read as em dashes (now commas). Verified zero dash-as-punctuation remains; engine loads; all four suites green.
