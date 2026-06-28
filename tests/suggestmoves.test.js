// suggestMoves self-check. Run: node tests/suggestmoves.test.js
// Tests the "which move is it?" surfacing (the deeper-branch redesign) against the REAL catalog, so
// it also guards the authored per-fallacy `cues`. If a cue edit regresses surfacing, this fails.
// See guidance/CHECKLIST-LENGTH-INVESTIGATION.md for why cue-phrase surfacing (measured ~9/10 top-1)
// replaced the abstract-tell relevance heuristic (~2/6).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData, suggestMoves } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const data = loadData(read('data/fallacies.json'), read('data/questions.json'), null, read('data/families.json'));

test('suggestMoves surfaces the right deflection move, ties multi-move, defaults to residual', () => {
  // clear single move surfaces first
  let r = suggestMoves(data, 'deflection', 'you only want the meeting moved because it helps your schedule');
  assert.equal(r.surfaced[0], 'appeal_to_motive');
  assert.ok(!r.allZero);

  // a two-move argument surfaces both
  r = suggestMoves(data, 'deflection', 'you only say that because you are biased, and anyway everyone does it');
  assert.ok(r.surfaced.includes('appeal_to_motive') && r.surfaced.includes('two_wrongs'));

  // nothing matches -> all-zero -> just the residual (red herring), not a wrong guess.
  // (The UI must NOT present that lone residual as a confident match; on allZero it shows ALL moves
  // with "nothing jumped out" framing. See renderMovePick. This asserts the engine signal it keys on.)
  r = suggestMoves(data, 'deflection', 'the coffee machine is broken');
  assert.ok(r.allZero);
  assert.equal(r.residual, 'red_herring');
  assert.deepEqual(r.surfaced, ['red_herring']);

  // panel must-fix: the common "you only believe/think that because" shape routes to motive, not the
  // red_herring residual it used to fall through to.
  r = suggestMoves(data, 'deflection', 'you only believe that because the layoffs would scare you');
  assert.ok(!r.allZero);
  assert.equal(r.surfaced[0], 'appeal_to_motive');

  // every surfaced id is a real fallacy in the family
  const fam = new Set(data.families.deflection);
  r = suggestMoves(data, 'deflection', 'well what about you, you do it too');
  assert.ok(r.surfaced.every((f) => fam.has(f)));
  assert.equal(r.surfaced[0], 'whataboutism');
});

test('held-out deflection arguments surface the correct move first >= 9/10', () => {
  const TESTS = [
    ['red_herring', 'I asked why the report is late and he started ranting about the coffee machine'],
    ['whataboutism', 'I told her she missed the deadline and she said well what about you'],
    ['moving_the_goalposts', 'first they wanted a receipt, I gave it, now they want a bank statement too'],
    ['non_sequitur', 'he owns a truck so therefore he will be good at running the company'],
    ['appeal_to_consequences', 'it cannot be true that the layoffs are coming, that would be too awful'],
    ['appeal_to_motive', 'you only want the meeting moved because it helps your own schedule'],
    ['two_wrongs', 'yeah I parked there but everyone does it all the time anyway'],
    ['ad_hominem_circumstantial', 'do not listen to her budget plan, she just got divorced'],
    ['whataboutism', 'sure I forgot, but look who is talking, you forget constantly'],
    ['two_wrongs', 'I know it was wrong but it is normal to cut corners'],
  ];
  let top1 = 0;
  for (const [truth, arg] of TESTS) {
    const m = suggestMoves(data, 'deflection', arg);
    if (m.surfaced[0] === truth || (truth === 'red_herring' && m.allZero)) top1++;
  }
  assert.ok(top1 >= 9, `expected >= 9/10 top-1, got ${top1}`);
});
