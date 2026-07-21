# Steely — mascot art spec

The mascot is currently **disconnected**, not just missing art: `index.html` no longer loads
`src/mascot.js` or hosts an image element for it (both were removed in the Reading Desk redesign), so
dropping art files into this folder won't make anything appear until the mascot is rewired. The
wiring code still exists in `src/mascot.js` and the routing table below still describes the intended
six expressions, but reconnecting it needs a script tag, a host element, and CSS in `src/styles.css`
(which no longer has a "mascot" section) before art can show up again.

## TL;DR for the artist

Make **6 PNG files**, square, **252 × 252 px**, transparent background, named exactly:

```
mascot/steely-input.png
mascot/steely-family.png
mascot/steely-checklist.png
mascot/steely-gap.png
mascot/steely-holds.png
mascot/steely-skeptic.png
```

That's it. As each file lands, that expression starts showing live. Partial sets are fine — any
missing expression simply shows nothing for that stage.

---

## Where it fits

This describes the slot from the old single-card layout: a single image sat **centered, just above
the card**, slightly overlapping its top edge. That layout is gone (the app is now a two-pane
"Reading Desk": a fixed sidebar plus a right pane, with no centered card), so this slot no longer
exists. Reconnecting the mascot would mean choosing a new spot in the current layout, most likely
somewhere in the sidebar. It was decorative (`aria-hidden`), and that should hold either way: it
should never carry meaning the copy doesn't already give.

- **Displayed size:** was 84 × 84 CSS px via `#mascot-img` in `styles.css`; that rule was removed
  along with the rest of the mascot CSS, so this would need to be re-added at whatever size fits the
  new slot.
- **The app gently floats it** up/down ~3px (suppressed under `prefers-reduced-motion`). Your art
  should be a still pose — the motion is added by CSS, don't bake it in.

## Format & dimensions

| | Choice | Why |
|---|---|---|
| **Format** | **PNG-24 with alpha** | Sits on a themed light/dark background, so it needs real transparency. PNG exports cleanly from any tool. |
| **Canvas** | **252 × 252 px, square** | 3× the 84px display box, so it stays crisp on retina/3× phones. Square keeps every expression aligned, so swapping one for another never shifts or jumps. |
| **Background** | **Transparent** | No baked-in card color — the card behind is themed. |
| **Safe area** | Keep the figure within the centered ~220px; leave a few px of breathing room so the float animation never clips. |
| **File size** | Aim < 60 KB each | It's a small on-screen image; keep the page light. |

### Optional: WebP
If you also export WebP (smaller), name them `steely-<expr>.webp`. They're not required and not yet
wired — PNG is the canonical path. If you want WebP served preferentially later, say so and it's a
one-line change in `src/mascot.js`.

### Dark mode
The app is light-only now (the Reading Desk redesign dropped the dark theme), so there's no second
palette to design against. If a dark theme comes back later, a single PNG with a light face + mid-grey
body should still read fine on both; treat this note as no longer applicable until then.

---

## The 6 expressions

Steely is a friendly **steel I-beam** character: warm steel-grey body, paper-white face, sage-green
accents. That sage-green accent predates the current app palette (now rust `#8a3324`, green
`#3f6b45`, and gilt `#a9884e` on a warm-paper base, with no sage tone anywhere in `src/styles.css`),
so reconcile the accent color with the current palette rather than matching this brief literally.
**Open `mascot/_retired-steely.svg` in a browser to see the previous take on each pose**: it's the
visual brief, not a thing to match pixel-for-pixel.

The whole emotional arc is **goodwill-first**: Steely is on the user's side, never smug, never a
"gotcha." Even the "weak spot" pose is concerned-*with*-you, not accusing.

| File | Expression | Mood | Shown when (app stage) |
|---|---|---|---|
| `steely-input.png` | **Welcoming** | open, encouraging, "let's look at this together" | Start screen (`input`) — typing the argument |
| `steely-family.png` | **Curious** | thinking, head slightly tilted, a "hmm?" | Picking the bucket / family (`family`) |
| `steely-checklist.png` | **Attentive** | focused, helpful, steady | The checklist of "Does it…?" questions (`checklist`) |
| `steely-gap.png` | **Gently concerned** | soft, careful, worried-*with*-you — NOT frowning or accusing | A weak spot found (`accuse`, `inconclusive_lean`, `confirmed`) |
| `steely-holds.png` | **Pleased / celebratory** | warm, a little proud, "nice — it holds up" | The argument is sound and the user confirmed why (`valid_earned`) |
| `steely-skeptic.png` | **Easy / reassuring** | relaxed, a small shrug, "maybe it's fine, and that's okay" | No clear problem / cynic verdicts (`cynic_valid`, `cynic_unsure`, `cynic_after_reject`) |

### Stage → expression map (the full routing, for reference)

`src/mascot.js` maps every app stage onto one of the 6 above:

```
input              → input
family             → family
checklist          → checklist
accuse             → gap
inconclusive_lean  → gap
confirmed          → gap
valid_earned       → holds
cynic_valid        → skeptic
cynic_unsure       → skeptic
cynic_after_reject → skeptic
```

So 6 images cover all ~10 stages. If you ever want a distinct pose for, say, `confirmed` vs
`accuse`, add the file and split the alias in `src/mascot.js` — but 6 is the intended set.

---

## How it behaves once art is added (and the mascot is reconnected)

- On load and at every stage change, `src/mascot.js` sets `<img src="mascot/steely-<expr>.png">`.
- It **preloads** all six up front and only reveals one once its file is confirmed to load, so a
  missing file shows nothing (no broken-image icon), and a present one appears the moment it's ready.
- No build step, no manifest to edit, no cache-busting needed for first drop. Just add the files.
- **One more wiring gap beyond the script tag and host element:** `src/mascot.js` only advances past
  its first pose when something calls `window.steely.setStage(name)`. Before the redesign, `ui.js`
  called this at every screen (a `steelyStage()` helper); that helper and all its call sites were
  removed. So reconnecting the script and element alone would show the "input" pose forever, frozen.
  Restoring the per-screen `setStage()` calls in `ui.js` is a separate step from restoring the art.
