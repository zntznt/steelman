# Steelman

**Is something really wrong with this argument, or am I just being doubtful?**

*Steelman is the opposite of strawman: read an argument at its strongest before you judge it.*

Paste an argument you're unsure about. Steelman points you to the *kind* of thing that might be off
(or none), then shows a short checklist of the things a **sound** argument does — you mark what holds
up and what falls short — and tells you whether there's likely a logical fallacy, or whether the
argument stands.

The twist: **it starts from goodwill, and you look for what's right, not what's wrong.** There is
too much cynicism on the internet, and this app refuses to add to it. The checklist is positive: you
confirm the virtues an argument *has*, like a fair juror — you can even actively defend it. A fallacy
is only suspected where a virtue is genuinely *missing*, and even then it's a tentative suggestion
you confirm or reject, never a verdict. "No fallacy — you might just be skeptical, and that's okay"
is a real, common answer.

No accounts. No AI. Nothing leaves your browser — all the reasoning runs locally.

## Run it

It's a static site. Serve the folder (the browser blocks loading the JSON data from `file://`):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Or just visit the GitHub Pages deployment.

## How it works

Under the positive checklist sits a small Bayesian engine. Each "virtue" you mark is evidence:
affirming one supports a strong "the argument is sound" hypothesis the engine must be *beaten* before
it names any fallacy; denying one (a missing virtue) is evidence for the matching fallacy. One missing
virtue never convicts; the user always makes the final call. Fallacies are grouped into families so a
session stays short and every fallacy is reachable. The whole catalog — fallacies, questions,
families, the checklist virtues, and the routing cues — lives in plain JSON, so it's extensible
without touching code.

- **How it decides (plain walkthrough):** [`guidance/HOW-IT-DECIDES.md`](guidance/HOW-IT-DECIDES.md) — start here to explain the app to someone
- **Why the weights are what they are:** [`guidance/WHY-THESE-WEIGHTS.md`](guidance/WHY-THESE-WEIGHTS.md)
- **Why it's built this way:** [`guidance/DESIGN-PRINCIPLES.md`](guidance/DESIGN-PRINCIPLES.md)
- **Add a fallacy (no coding):** [`guidance/ADDING-FALLACIES.md`](guidance/ADDING-FALLACIES.md)
- **The map:** [`guidance/ARCHITECTURE.md`](guidance/ARCHITECTURE.md)
- **The exact contract (math + schema):** [`guidance/ENGINE-SPEC.md`](guidance/ENGINE-SPEC.md)

## Tests

```bash
node tests/engine.test.js        # the inference math
node tests/coverage.test.js      # every fallacy is reachable & catchable
node tests/calibration.test.js   # 0 false accusations on sound arguments + catches real fallacies
node tests/checklist.test.js     # the live positive-first checklist flow
node tests/suggestmoves.test.js  # the "which move is it?" surfacing
```

## License

MIT © ZNT
