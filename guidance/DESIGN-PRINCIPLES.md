# Design principles — why Fallacynator works the way it does

This is the *why*. If you only read one doc before changing anything, read this one. Every
mechanical decision in [ENGINE-SPEC.md](ENGINE-SPEC.md) exists to serve the principles here. If a
change conflicts with these, the change is wrong, not the principles.

---

## The thesis

> **There is too much cynicism on the internet, and this app refuses to add to it.**

Fallacynator answers one question: *"Is there a fallacy, or am I just being cynical?"* It exists
to **disarm cynics**, not to arm them. It reads every argument charitably and starts from goodwill.
It only flags a fallacy when the evidence genuinely holds up — and even then it suspects rather
than accuses, and hands the final call to the user.

A naive "Akinator for fallacies" would be the *opposite* of this. Akinator's whole mechanic is to
narrow toward an answer it assumes exists. Point that at fallacies and you get a confirmation-bias
machine: it always converges on *some* fallacy, handing a cynical user the gotcha they came for.
We deliberately built against that.

## The four commitments

### 1. The argument is innocent until proven otherwise

`VALID` ("the reasoning holds up") is not the absence of a verdict — it is a **first-class
hypothesis with a strong prior (0.60)** that *competes* with every fallacy and *accumulates its own
evidence*. A sound argument doesn't win by elimination; it wins by earning it, as exonerating
answers pile up. "No clear fallacy" is the honest, common, *celebrated* outcome — not a
consolation prize.

### 2. One answer never convicts

To even tentatively suspect a fallacy, the engine requires a **triple gate**: the fallacy must
beat VALID, beat it by a clear margin, clear an absolute confidence floor, and clearly beat the
runner-up fallacy. In practice that means **about two consistent, strongly incriminating answers.**
A single "yes" mathematically cannot get there — it stalls below VALID. This is the arithmetic
embodiment of "give the argument a fair hearing."

### 3. Doubt is charitable, never incriminating

"Kind of" and "I can't tell" lean *toward* the argument being fine, by construction. Ambiguity
provably cannot build a case against an argument. And if a user is unsure about most questions, the
engine concludes *"you might just be skeptical"* — not "here's the fallacy you couldn't quite see."
Inability to characterize an argument is evidence of the user's uncertainty, not the argument's
guilt.

### 4. A suspicion is offered, not pronounced

When the gate is cleared, the app says *"this might be leaning toward X — here's what that means —
does it fit?"* and shows the fallacy's teaching note and a specific check. **The user decides.** If
they say it doesn't fit, the engine does not reach for a second-best accusation; it lands on "maybe
you're just being a little cynical." Naming a fallacy is never framed as winning an argument.

## How the principles became mechanics

These are guarantees, not good intentions. The data **cannot** be edited into a gotcha machine:

| Principle | Mechanical enforcement |
|---|---|
| Innocent until proven otherwise | `PRIOR_VALID = 0.60`; VALID is a hypothesis in the same simplex; guardrails **G1/G2** force every question to be able to vote for innocence |
| One answer never convicts | the triple gate (`TAU_ACCUSE`, `MARGIN_VALID`, `MARGIN_RUNNERUP`) + evidence damping (`λ = 0.7`) |
| Doubt is charitable | the answer-noise model derives `maybe`/`unsure` as exonerating; the unsure-streak guard routes to the skeptic exit *before* any confident verdict |
| Suspicion, not pronouncement | every fallacy must carry a `confirm_check`; rejecting it routes to the cynic exit, never a fallback accusation |
| No author can break it | `validateBank()` (G1–G9) refuses to load a biased bank; the calibration fixture (G10) fails the build if a sound argument gets accused |

## The tone follows the math

The copy is warm, plain, and unhurried; the UI is calm (soft paper, serif, lots of air) rather
than gamey. This isn't decoration — a triumphant "GOTCHA!" reveal would undercut a tentative
suspicion. The teaching notes always say when something is *not* a fallacy. The verdicts treat "it
holds up" as a real, satisfying result. The visual and verbal register exist to make goodwill feel
like the natural posture, the same way the engine makes it the mathematical default.

## When you extend this

Ask of any new fallacy or question: *could this make a fair-minded person feel accused of bad
reasoning when they reasoned fine?* If yes, fix it before shipping. The guardrails catch the
blatant cases; the spirit is yours to keep. The point of the whole project is that being skeptical
is healthy, and treating every argument as guilty is the thing worth resisting.
