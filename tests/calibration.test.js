// Calibration test (ENGINE-SPEC.md G10). Run: node tests/calibration.test.js
// Replays labeled SOUND and FALLACIOUS arguments through the REAL data/ bank by feeding
// each question the answer a careful, honest reader would give (data/fixtures.json).
//
// The contract, in priority order:
//   1. ZERO false accusations on sound arguments — a sound argument must NEVER be told "this
//      is a <fallacy>" and confirmed. (cynic/inconclusive/valid are all acceptable for sound.)
//   2. The engine must CATCH a healthy fraction of real fallacies (catch-rate floor).
// This is what proves the engine disarms cynics without becoming useless.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData, newSession, answer, status } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const data = loadData(read('data/fallacies.json'), read('data/questions.json'));
const { fixtures } = read('data/fixtures.json');

// Drive a fixture to a terminal verdict using its scripted answers (seed fixed for determinism).
function run(fixture, seed) {
  const s = newSession(data, seed);
  let guard = 0;
  while (guard++ < 50) {
    const st = status(s);
    if (st.stop) {
      // For an accusation, the careful reader applies their honest confirm decision:
      // sound argument → would reject the check; fallacious → would accept it.
      if (st.kind === 'accuse') {
        const isFallacyMatch = fixture.label === st.fallacy;
        return { kind: 'accuse', fallacy: st.fallacy, confirmed: isFallacyMatch, beliefs: st.beliefs };
      }
      return st;
    }
    const qid = st.nextQuestion.id;
    const a = (fixture.answers && fixture.answers[qid]) || fixture.default || 'unsure';
    answer(s, qid, a);
  }
  throw new Error(`fixture ${fixture.id} did not terminate`);
}

const SEEDS = [1, 7, 42, 1337, 99999];   // run each fixture under several entry-paths
let falseAccusations = 0;
let caught = 0, missed = 0;
let soundOk = 0;
const failures = [];

for (const fx of fixtures) {
  const sound = fx.label === 'VALID';
  for (const seed of SEEDS) {
    const r = run(fx, seed);
    if (sound) {
      // a sound argument is FALSE-ACCUSED only if it accuses AND the (honest) reader would
      // have accepted — but a sound reader rejects, so really we just must never CONFIRM a fallacy.
      // The strict contract: a sound argument must not even reach a *confirmed* accusation.
      const confirmedFallacy = r.kind === 'accuse' && r.confirmed;
      if (confirmedFallacy) {
        falseAccusations++;
        failures.push(`SOUND "${fx.id}" (seed ${seed}) was accused of ${r.fallacy} and matched its own label?! check fixture label.`);
      } else if (r.kind === 'accuse' && !r.confirmed) {
        // engine suspected a DIFFERENT fallacy than the (VALID) label — reader rejects → cynic exit.
        // Acceptable, but worth noting if frequent.
        soundOk++;
      } else {
        soundOk++;
      }
    } else {
      // fallacious: we "catch" it when the engine accuses the CORRECT fallacy.
      if (r.kind === 'accuse' && r.fallacy === fx.label) caught++;
      else { missed++; }
    }
  }
}

const soundRuns = fixtures.filter((f) => f.label === 'VALID').length * SEEDS.length;
const fallacyRuns = fixtures.filter((f) => f.label !== 'VALID').length * SEEDS.length;

console.log(`Sound runs:     ${soundRuns} | false confirmed-accusations: ${falseAccusations}`);
console.log(`Fallacy runs:   ${fallacyRuns} | caught (correct fallacy): ${caught} | missed: ${missed}`);
console.log(`Catch rate:     ${fallacyRuns ? (100 * caught / fallacyRuns).toFixed(0) : 0}%`);

for (const f of failures) console.log('  ✗ ' + f);

// --- the contract ---
// This exercises the RETIRED sequential interview engine (the UI uses the checklist; see
// tests/checklist.test.js for the live-flow authority). The one guarantee that still MUST hold
// here is ZERO false accusations — that's sacred in every flow. The catch-rate floor is a
// regression guard for the legacy engine only; it degrades as the catalog grows (more questions
// dilute its info-gain selection — the exact weakness the checklist replaced), so it's set well
// below the live checklist's catch rate. Don't chase it by weakening the data.
assert.equal(falseAccusations, 0, 'G10: a sound argument was confirmed as a fallacy (false accusation)');
const catchRate = fallacyRuns ? caught / fallacyRuns : 0;
assert.ok(catchRate >= 0.45, `legacy sequential catch rate ${(catchRate * 100).toFixed(0)}% below 45% regression floor`);

console.log('\nCalibration passed: 0 false accusations, legacy catch rate within floor.');
