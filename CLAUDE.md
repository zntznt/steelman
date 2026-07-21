# CLAUDE.md: Steelman

Project rules for any agent working in this repo. Read before editing.

## Writing style (HARD RULES)

- **No em dashes (—), ever.** Not in user-facing copy, not in comments, not in commit messages, not in docs. This is absolute.
- **No en dashes (–) or lone hyphens used as a dash substitute.** If a sentence needs a dash to work, it's the wrong sentence: rephrase it with a comma, a colon, or two sentences.
- **AP style** for all prose: short declarative sentences, one idea per sentence, plain words.
- Keep the warm, goodwill-first voice (see the thesis below). Plain does not mean cold.

## What this app is (and isn't)

- Static site: vanilla JS ES modules, **no build step, no framework, no bundler.** Served as-is on GitHub Pages.
- **Not an AI app.** No LLM or network call at runtime. All reasoning is the local Bayesian engine in `src/engine.js`. Nothing the user types leaves the browser.
- Data-driven: fallacies, questions, families, and checklist tells live in `data/*.json`. Adding a fallacy is a data edit, not a code change.

## Non-negotiables

- **Zero false accusations is sacred.** Never relax the accusation gate to make a catch pass. `tests/calibration.test.js` and `tests/checklist.test.js` enforce it; both must stay green.
- The thesis is goodwill-first: assume the argument holds up until evidence concentrates on one fallacy. "Innocent until proven otherwise." Copy disarms cynics; it never sneers or says "gotcha."
- Run all five test suites (`engine`, `checklist`, `coverage`, `calibration`, `suggestmoves`) before committing. All must pass.
- Commit/push only when work is done. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Where things are

- `src/engine.js`: the engine (pure functions; imported by browser and tests).
- `src/ui.js`: screens and all user-facing strings.
- `data/*.json`: the catalog.
- `guidance/`: rationale and design docs. Start with `HOW-IT-DECIDES.md` and `WHY-THESE-WEIGHTS.md`.
- `mascot/`: hand-made raster art drops here (see `mascot/README.md`). The mascot is currently unwired: `index.html` doesn't load `src/mascot.js` or host its image element, so it's dead code the app never touches.
