# Steelman — Neophyte Re-Audit (revised copy)

_Same six readers walked the REVISED copy blind; a grader scored each original problem and hunted regressions._

## Verdict: NEEDS-WORK

> Goodwill tone landed and several majors are fixed, but the three biggest blockers (155-line checklist, backwards thumbs polarity, undefined "fallacy") survived the rewrite, and it introduced new regressions — verdict: NEEDS-WORK.

## Original blockers — graded

| Grade | Original problem |
|---|---|
| **partly-fixed** | The word 'fallacy' is never explained, yet it owns the headline (Start) and the payoff (Ve |
| **still-broken** | The 155-line checklist is impossible: too many items, every line a long abstract sentence, |
| **still-broken** | The ✓/✗ instruction is backwards from intuition and readers can't tell what they're rating |
| **partly-fixed** | The family list (20+ rows) is a wall of near-identical, textbook sentences; titles blur to |

## Regressions introduced by the rewrite

1. **[major]** 'best version of it' / 'Give it the best read you can first' reads as the app promising to REWRITE the user's sentence, an ambiguity the older 'read it at its strongest' did not create. Deon: 'It sounds like the app is going to rewrite my thing into something nicer, which I didn't ask for.' Priya: 'the idea that there's a best version of one sentence is abstract and I don't know what I'm supposed to DO with it.' Mara and Tomas both stumbled on 'best read' ('read as a noun looked like a typo').
   - Fix: Drop 'best version.' Use a concrete action: 'First we'll assume it's a fair point and look for what it gets right.' Replace 'Give it the best read you can' with 'Assume the person means well to start.'
2. **[minor]** Goodwill copy was piled on so thickly on Screen 1 that fast/skeptical readers read it as preachy and condescending — a regression from over-correcting toward 'gentle.' Deon: 'Three nudges to be nice before I've clicked anything... reads as preachy and a little condescending — like it assumes I'm a cynic who needs talking down.' The original audit only flagged 'and that's okay' as a minor; the rewrite expanded the pre-scolding to the Start screen.
   - Fix: Keep ONE goodwill line, not three. Cut the Helper line entirely or merge into the body; let the headline carry the empathy.
3. **[minor]** The CYNIC verdict 'Maybe it's just you reading carefully' can land as a soft 'you're imagining it / calm down' letdown for users who came in genuinely suspicious — reads as a polite scold. Tomas: 'unsure of the tone, mildly felt judged.' Walt: 'felt slightly judged... a little bit of a scolding.' Deon: 'lands as calm down, it's probably nothing, exactly the preachy/soft tone I can't stand.'
   - Fix: Reframe as a genuine finding, not a verdict on the reader: 'We couldn't find a clear problem — the reasoning seems to hold.' Keep the reassurance separate from any implication the user was wrong to check.
4. **[minor]** 'pulling a fast one' (idiom) replaced clearer wording and is now the single most opaque string for non-native and younger readers. Tomas: 'I have NO idea what pulling a fast one means... I cannot guess... did not pick this bucket because I could not understand it.' Mara: 'a saying my grandpa uses... sounds old.' This idiom blocks bucket selection for at least one reader.
   - Fix: Replace with literal phrasing: 'The wording itself is doing something sneaky' or 'The trick is in how it's worded.'

## Remaining issues

1. **[major]** Verdict still shows literal bracket placeholders: '[FALLACY NAME]', '[Name]', '[explanation]…'. Multiple readers read this as a broken/unfinished screen at the most important moment. Walt: 'looks like the app forgot to fill something in — like a blank that didn't load.' Deon: 'clearly a placeholder that didn't get filled in... the app looks broken... lost a little trust.' (Carried over from original 'broken-looking placeholders' major — partly addressed for the Start body but NOT the verdict.)
   - Fix: These must render the real filled-in fallacy name in production. Confirm the template substitutes a plain-language label (e.g. 'going after the person') before the technical term, and never display raw brackets/ALL-CAPS slots to users.
2. **[major]** No 'doesn't apply to my sentence' option on the checklist. Readers were SURE a question didn't apply (one-liner has no 'other side', no 'inconsistency'), but the only escape is 'skip if you're not sure' — wrong label for a confident not-applicable, and readers fear skipping silently ruins the verdict. Cited by Deon, Walt, Mara, Tomas, Priya.
   - Fix: Add an explicit 'Doesn't apply' choice distinct from 'Not sure', and a one-line reassurance: 'Many of these won't apply to your example — that's normal and won't affect the result.'
3. **[major]** The thumb-meaning explanation is hover-only, invisible on phones. Dawn, Walt, Mara, Tomas all note they never see '👍 = Yes, it does this' because mobile has no hover. The one thing that disambiguates the polarity is hidden from the majority device.
   - Fix: Put the legend on-screen permanently (small label under each thumb or inline), not on hover. Better: re-phrase questions so the thumb matches the user's instinct (ask 'Is it attacking the person instead of the point?' so 👍 = 'yes, found the problem').
4. **[minor]** 'argument' is read as 'a fight between people', not 'a claim/statement', by teen and older readers. Mara 'expected screenshots of texts'; Walt 'an argument is two people fighting... that's not an argument, that's a remark.' Causes hesitation about whether their input even fits.
   - Fix: Use 'claim', 'statement', or 'something someone said' in the headline/body, or add a one-line gloss: 'an argument = a point someone is making.'
5. **[minor]** 'Paste an argument' makes type-only users (no clipboard content) freeze. Walt doesn't know how to paste on a phone; Priya and Mara expected to TYPE and worried 'paste' meant they needed something pre-copied.
   - Fix: Change to 'Type or paste an argument…'.
6. **[minor]** Residual jargon in titles/questions still glazes low-literacy and ESL readers: 'establish', 'burden of proof', 'inconsistency', 'restate', 'distrusting', 'counterexample', 'membership rules', 'a fair sample', 'the abstraction'. Cited heavily by Tomas, Walt, Mara.
   - Fix: Swap to plain equivalents: establish->prove, burden of proof->who has to prove it, inconsistency->contradiction, restate->say back fairly, distrusting->not trusting, counterexample->a case that breaks the rule.
7. **[minor]** 'nothing leaves your browser' uses a computer word that confuses (and mildly worries) phone-first older users. Walt: 'I don't think of myself as having a browser... leaves and goes WHERE?'
   - Fix: 'Stays on your phone. Nothing is sent anywhere, no account needed.'
8. **[minor]** Heavy em-dash use chops sentences for slow word-by-word readers and ESL readers who lose the thread at ' — or '. Walt and Tomas both flag dashes/the 'dash + or' split in the headline and checklist instruction.
   - Fix: Prefer short separate sentences over em-dashes in the headline, body, and the 'do / doesn't / or skip' instruction.

## Would each reader finish?

- **Mara:** Honestly? Probably not. The Start screen and picking a bucket were fine, kind of interesting even. But the second something asks me to read like 9 questions in a row that all sound the SAME ("Does it... does it... does it..."), I'd tap random thumbs or just close it. It feels like a reading quiz. I'd maybe get through the bucket and family screens and bail on the checklist.
- **Tomás:** Maybe — but only because the example argument I typed is simple. On Screen 1 and Screen 2 I felt okay and I wanted to continue. The trouble started at Screen 3 (too many lines that all look the same) and Screen 4 (the questions are long and many sound almost identical). I think I would reach a verdict, but on the checklist I would press 👍/👎 by guessing on at least half of them, so I would not really trust my own answers. If the app picked a "family" I didn't choose, I might give up before the verdict.
- **Dawn:** Probably not without bailing at least once. I'd get through Start and picking a bucket fine. But the checklist is where I'd stall hard — eight little "Does it…?" riddles, half of them I can't tell what they mean, and the backwards yes/no scrambles my brain. I'd either skip most of them or close the tab. The verdict, if I got there, I'd actually like.
- **Walt:** Probably not all the way through on my own. I'd get through the first screen fine — I understood "Paste an argument" and the Start button, and I'd type in the sentence about her plan. But by the time I hit that long list of "Does it...?" questions I'd be reading the same one three times, unsure of my own answer, and I'd likely set the phone down and say "I'll ask my grandson." I'd FINISH if someone were sitting next to me. Alone, I'd quit at the checklist.
- **Priya:** Honestly? Probably not on my own. I'd get to Screen 3 (the long list) and the checklist and just freeze. Screens 1 and 2 are friendly and I'd feel okay. But the moment I hit that wall of "Which fits best?" with 20-ish options, and then 8-11 "Does it..." questions where I'd have to re-read each one twice, I'd start second-guessing every single answer. I'd probably tap a few 👍/👎 while feeling unsure, then either skip everything or just close the tab. The verdict screens are gentle, which is nice, but I'm not sure I'd ever get there feeling like I answered honestly.
- **Deon:** Probably yes, but mostly because the example I typed is dead obvious — someone's bad grade has nothing to do with their plan. I'd power through to the verdict to see if the app agreed with me. If my argument were anything subtle, I'd have bailed at the checklist. The reason I'd finish is impatience-to-win, not because the app made it easy.

---

## Applied (response to the re-audit)

**Fixed (real issues, no trade-offs):**
- **Grammar bug** "Looks like a Ad Hominem" → `article()` helper gives correct a/an (affected 27 of 73 names). Also fixed in the inconclusive lean.
- **Checklist polarity anxiety** → each 👍/👎 now carries an **always-visible label** ("yes" / "no") under the icon, not hover-only (invisible on phones). Virtue-framing kept, so **per-fallacy precision is untouched**.
- **"Doesn't apply" choice** added as an explicit third option, distinct from skip, with reassurance: *"Many won't apply to your example, and that's normal — it won't change the result."* Verified engine-neutral (maps to omitted, same as skip).
- **"pulling a fast one"** idiom → "doing something sneaky".
- **"best version of it" / "best read"** (read as *the app rewrites your text*) → "a point someone is making" + "assume it's fair to start, see what it gets right".
- **Start screen over-preachy** → three goodwill nudges cut to one; helper line deleted (headline carries the empathy).
- **Cynic ending scold** ("just you reading carefully") → reframed as a finding about the argument: "No clear problem — it seems to hold up."
- **"argument" = a fight** → glossed as "a point someone is making"; **"Paste"** → "Type or paste"; **"leaves your browser"** → "stays on your device".
- Em-dashes removed from the headline and checklist instruction (kept inside the tight "X, not Y" questions where they do real work).

**Not real (corpus artifacts, verified against code):**
- "[FALLACY NAME] brackets look broken" — those are the audit *corpus* shorthand; live code substitutes the real `f.name`. (The genuine bug hiding under it — the a/an grammar — was fixed above.)
- "155-line wall" — the app shows one family's ~8-11 questions, never 155.

**Deferred by owner decision (would cost precision):**
- Flipping checklist questions to problem-framing (👍 = "found the problem") — this is the polarity inversion that breaks per-fallacy isolation (C-1). Kept virtue-framing; addressed the anxiety with the on-screen legend instead.
- Merging near-duplicate sibling questions (de-dupe) — each feeds a distinct fallacy's evidence.

All four suites green; 0 false accusations preserved.
