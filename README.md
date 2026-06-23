# Fallacynator

**Is there a fallacy, or am I just being cynical?**

Paste an argument you're unsure about. Fallacynator asks you a few plain questions about it —
Akinator-style, one at a time — and tells you whether there's likely a logical fallacy, or whether
the argument actually holds up.

The twist: **it starts from goodwill.** There is too much cynicism on the internet, and this app
refuses to add to it. It gives every argument the benefit of the doubt and only suspects a fallacy
when the evidence genuinely holds up — and even then it offers a tentative suspicion you confirm or
reject, never a verdict. "No fallacy — you might just be skeptical, and that's okay" is a real,
common answer.

No accounts. No AI. Nothing leaves your browser — all the reasoning runs locally.

## Run it

It's a static site. Serve the folder (the browser blocks loading the JSON data from `file://`):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Or just visit the GitHub Pages deployment.

## How it works

A small Bayesian engine tracks how likely each fallacy is — plus a strong "the argument is sound"
hypothesis it has to *beat* before naming anything. One answer never convicts; doubt is treated
charitably; the user always makes the final call. The whole catalog of fallacies and questions
lives in plain JSON, so it's extensible without touching code.

- **Why it's built this way:** [`guidance/DESIGN-PRINCIPLES.md`](guidance/DESIGN-PRINCIPLES.md)
- **Add a fallacy (no coding):** [`guidance/ADDING-FALLACIES.md`](guidance/ADDING-FALLACIES.md)
- **The map:** [`guidance/ARCHITECTURE.md`](guidance/ARCHITECTURE.md)
- **The exact contract:** [`guidance/ENGINE-SPEC.md`](guidance/ENGINE-SPEC.md)

## Tests

```bash
node tests/engine.test.js        # the inference math
node tests/calibration.test.js   # 0 false accusations on sound arguments + catches real fallacies
```

## License

MIT © ZNT
