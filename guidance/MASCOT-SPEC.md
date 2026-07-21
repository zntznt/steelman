# Steely — mascot spec (the contract the p5 sketch implements)

**Status:** this spec describes a p5.js canvas approach that was never shipped; `src/mascot.js` as it
actually exists is a plain image-swapper over static PNGs, not a p5 sketch (see `mascot/README.md`).
On top of that, the Reading Desk redesign disconnected the mascot entirely: `index.html` no longer
loads `src/mascot.js` or hosts an image element, so `window.steely?.setStage(name)` is never called
and nothing here currently runs. Treat this as a design brief for a future mascot pass, not a
description of live behavior.

Steely is the app's mascot: an anthropomorphic steel **I-beam** that *holds an argument up to the
light* so you can both see if it stands. A fair juror, never a prosecutor. Rendered in `src/mascot.js`
(p5.js, isolated — a load failure falls back to the static `src/mascot.svg` or nothing; it can never
break the app). Stage is signalled by the UI via `window.steely?.setStage(name)`.

Viewbox **120 × 130**, center axis **x=60**. Body y≈30–96, bubble above at y≈4–28.

## Personality
A load-bearing optimist — a steady, old-soul girder that assumes the best of every argument and
quietly holds it up to check if it stands. Warm, unhurried, never smug. When something's off it
doesn't pounce — it tilts its head: "let's look at this one part, together."

## Resting baseline (every stage tweens from this)
- **Eyes:** round dots r=5 at (52,56) & (68,56). Blink scaleY→0.1 ~every 4s.
- **Eyebrows:** off by default; when on, 8px strokes centered (52,49) & (68,49).
- **Mouth:** arc centered (60,72); resting = gentle up-arc ~12px wide, 3px deep.
- **Arms:** 2px rounded strokes from (49,66) L / (71,66) R, ending in 3px circle hands; resting hands hold the bubble at (48,26)/(72,26).
- **Bubble:** rounded rect 30×20 r=6 centered (60,16), 4px down-tail. Outline-only.
- **Idle float:** whole rig translateY = sine ±2.5px, period 2.6s.
- **Transitions:** tween all parametric values 300–400ms ease-in-out; on/off elements fade. Flanges, web, rivets, feet NEVER change.

## Per-stage expressions
| stage | eyes | brows | mouth | arms/pose | bubble | motion |
|---|---|---|---|---|---|---|
| **input** | dots r=5.5, level | off | up-arc 14w/4d | both up, arms angled outward ("go ahead") | empty, dotted, opacity pulse 0.45↔0.7 / 2s | float; slow +2° lean-in every ~4s |
| **family-pick** | pupils +2px toward hovered side | ONE brow raised +2px (considering side) | near-flat 10w/1.5d, right corner +1 | one arm steadies bubble, other to "chin" (54,40) | dimmed 0.6, "?" glyph, wobble ±2°/1.8s | lean toward hovered option; else tilt toggles ~3.5s |
| **checklist** | calm, 1px narrower, pupils down 1px | off/faint level | up-arc 13w/4d ("doing well") | both arms hold bubble steady, 2px higher | clear; halo +1 notch per checked item | float ±1.5px; nod-pulse + 1px lift per check |
| **gap-found** ⭐ | fully open SOFT, pupils ~1.5px toward BUBBLE (never user) | BOTH raised high, inner-UP tent ⌃⌃ (never inner-down) | near-flat line, faint 1px dip ONE corner (never a frown) | palm-up beside bubble ("may I show you?"); squared to user, no lean-in | INTACT (never cracked); ONE tiny amber dot beside the gap; no red, no "!", no glow | float slows to ±1px/3s; ONE slow 3° tilt toward bubble & back; no bounce |
| **holds-up** | happy closed crescents (u-arcs 8w) | off | biggest smile 16w/6d | lift bubble high, gentle ta-da, feet squash | ONLY glowing stage: soft sage halo + 3 one-shot sparkles | entry pop 0.94→1.04→1.0 ease-out-back; then livelier float ±3.5px/2.2s |
| **skeptic-exit** | relaxed dots, friendly symmetric half-blink on entry (no wink), pupils +2px sidelong | off | easy smile 11w/3d, right corner +1 | bubble lowered/cradled, other arm open shrug palm-up ~10° | neutral, no marks, no glow | easy float ±2.5px/2.8s + side-sway ±1px; entry shrug-bob |

## The gap-found guardrail (hard constraints — most important)
Reads as **care, not capture**. Enforce ALL: slower/smaller motion, no bounce, no lean toward the
user, pupils toward the BUBBLE, brows inner-UP, mouth flat-with-one-soft-dip, arm palm-UP beside the
bubble. Invert any one and Steely becomes a prosecutor. Bubble never cracks (Steely never damages the
argument). Exactly one tiny amber mark — the only amber in the whole set.

## Color
- Body: warm steel grey-taupe (#9aa0a0–#8a9090), soft 1px strokes.
- Accent: sage green, used on the mouth/eye-arcs and the holds-up glow. This predates the current app palette (rust
  `#8a3324`, green `#3f6b45`, gilt `#a9884e`; there is no `--accent` variable or sage tone in
  `src/styles.css` anymore), so reconcile the accent with the current palette if this spec is revived.
- Amber: ONLY the gap-found marker, tiny, nowhere else.
- Sits on the paper background.

## Reduced motion (`prefers-reduced-motion`)
Disable ALL float/lean/sway/pop/sparkle/wobble/blink. Each stage renders as a single still pose (the
tween end-state); stage changes are an instant or ≤120ms opacity crossfade. Fully legible at rest.
