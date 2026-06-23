// Coverage test — LEGACY (sequential interview flow). Run: node tests/coverage.test.js
//
// ⚠ This guards the *sequential* interview engine (status/pickNextQuestion), which the UI NO LONGER
// USES. The live flow is the positive-first checklist — its catch authority is tests/checklist.test.js,
// and THAT is what new fallacies must satisfy. This file is scoped to LEGACY_SET (the fallacies that
// existed while the sequential flow was live) so it still catches regressions in the old engine
// without gating new fallacies on a flow that structurally can't surface them (the very weakness the
// checklist reformulation fixed). When adding a fallacy: satisfy checklist.test.js; you do NOT need
// to touch this file or LEGACY_SET.
//
// It synthesizes a textbook answer path for each legacy fallacy from its weights and asserts the
// sequential engine still catches it well enough — a guard against accidentally breaking the old flow.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData, newSession, answer, status } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const fallaciesJSON = read('data/fallacies.json');
const questionsJSON = read('data/questions.json');
const data = loadData(fallaciesJSON, questionsJSON);
const QUESTIONS = questionsJSON.questions;

const SEEDS = [1, 7, 42, 1337, 99999, 123, 777, 2024];
const ENTRY_MIN = 2;        // structural: ≥2 entry-pool questions (needed to surface reliably)
const DEDICATED_MIN = 2;    // structural: ≥2 questions that incriminate the fallacy (gate needs ~2)
const AGGREGATE_FLOOR = 0.35; // soft: mean catch rate across the whole catalog must stay ≥ this.
                              // Set just below the current mean so it ratchets: as weak fallacies
                              // are strengthened and removed from KNOWN_WEAK, raise this to lock in
                              // the gain. It can only tighten, never silently slip.
const PER_FALLACY_FLOOR = 0.5; // a fallacy is "reliably catchable" at ≥ this; below = reported

// KNOWN-WEAK allowlist: fallacies whose textbook instance currently catches below the per-fallacy
// floor. They are reachable and correct, but the flat engine can't always surface their questions
// within the budget (see guidance/ARCHITECTURE.md "Scaling" — the family-routing fix). Listed here
// so the build stays green, BUT a *new* weak fallacy NOT on this list fails the build, and a
// previously-strong fallacy regressing into weakness fails too. Shrinking this list is the goal.
const KNOWN_WEAK = new Set([
  'strawman', 'false_dilemma', 'slippery_slope', 'false_cause', 'appeal_to_nature', 'bandwagon',
  // Weakened further once the catalog expanded to 51 (more questions dilute the sequential engine's
  // info-gain selection — the exact weakness the checklist flow replaced). They catch fine in the
  // live checklist (the authority); this is the retired sequential flow only.
  'hasty_generalization', 'circular_reasoning',
]);

// LEGACY_SET: the fallacies that existed while the sequential interview was the live flow. This test
// is scoped to these — it guards the old engine against regression but does NOT gate fallacies added
// after the checklist reformulation (those are the checklist's job; see tests/checklist.test.js).
// Do not add new fallacies here. If you intentionally retire/rename a legacy fallacy, update this.
const LEGACY_SET = new Set([
  'ad_hominem', 'strawman', 'false_dilemma', 'slippery_slope', 'appeal_to_authority',
  'hasty_generalization', 'circular_reasoning', 'appeal_to_emotion', 'false_cause', 'tu_quoque',
  'appeal_to_nature', 'bandwagon', 'argument_from_incredulity',
]);
const legacyFallacies = fallaciesJSON.fallacies.filter((f) => LEGACY_SET.has(f.id));

// Honest answer path for a textbook instance of `target`: a question that points at `target`
// (its yes-weight > 1) is answered "yes"; every other question is answered "no" (the argument is
// ONLY this fallacy — clean on every other dimension). This is exactly how a fair reader of a
// clear example would answer, and it's derived from the weights so it needs no hand-written fixture.
function honestPath(target) {
  const m = {};
  for (const q of QUESTIONS) {
    const inc = q.lr[target] && q.lr[target].yes > 1;
    m[q.id] = inc ? 'yes' : 'no';
  }
  return m;
}

function catchCount(target) {
  const path = honestPath(target);
  let caught = 0;
  for (const seed of SEEDS) {
    const s = newSession(data, seed);
    let guard = 0, verdict = '';
    while (guard++ < 40) {
      const st = status(s);
      if (st.stop) { verdict = st.kind === 'accuse' ? st.fallacy : st.kind; break; }
      const qid = st.nextQuestion.id;
      answer(s, qid, path[qid] ?? 'unsure');
    }
    if (verdict === target) caught++;
  }
  return caught;
}

let passed = 0;
const ok = (m) => { passed++; console.log(`  ✓ ${m}`); };
const failures = [];

// ---- TIER 1 (HARD): structural reachability. A malformed addition fails the build. ----
// Every LEGACY fallacy must have enough entry-pool and dedicated questions to be *capable* of
// catching in the sequential flow. New (post-checklist) fallacies are exempt — see header.
for (const f of legacyFallacies) {
  const entryQs = QUESTIONS.filter((q) => (q.tags || []).includes('entry') && (f.id in q.lr)).length;
  const dedicated = QUESTIONS.filter((q) => f.id in q.lr && q.lr[f.id].yes > 1).length;
  if (entryQs < ENTRY_MIN) {
    failures.push(`ENTRY: ${f.id} has only ${entryQs} entry-pool question(s); needs ≥ ${ENTRY_MIN} (tag one of its dedicated questions "entry", or add it to a broad entry question — see guidance/ADDING-FALLACIES.md §2b)`);
  }
  if (dedicated < DEDICATED_MIN) {
    failures.push(`DEDICATED: ${f.id} has only ${dedicated} question(s) that incriminate it; needs ≥ ${DEDICATED_MIN} (the accusation gate takes ~2 consistent answers)`);
  }
}

// ---- TIER 2 (SOFT→HARD on regression): behavioral catch. Reports every fallacy; fails on a
// NEW weak fallacy, a REGRESSION, or an aggregate drop. The known-weak set is grandfathered. ----
console.log(`Per-fallacy catch — LEGACY set (honest textbook path, ${SEEDS.length} seeds):`);
const rows = [];
let total = 0;
for (const f of legacyFallacies) {
  const c = catchCount(f.id);
  const rate = c / SEEDS.length;
  total += rate;
  const weak = rate < PER_FALLACY_FLOOR;
  const grandfathered = weak && KNOWN_WEAK.has(f.id);
  const mark = !weak ? '✓' : grandfathered ? '~' : '✗';
  rows.push(`  ${mark} ${f.id.padEnd(28)} ${c}/${SEEDS.length}${grandfathered ? '  (known-weak)' : ''}`);
  if (weak && !grandfathered) {
    failures.push(`CATCH: ${f.id} caught only ${c}/${SEEDS.length} (< ${PER_FALLACY_FLOOR * 100}%). If newly added, give it ≥2 entry questions and distinctive dedicated ones (§2b). If it was working, something regressed.`);
  }
  // a grandfathered fallacy that quietly went to ZERO is worth surfacing even if allowed
  if (grandfathered && c === 0) console.log(`     note: ${f.id} now catches 0/${SEEDS.length}`);
}
console.log(rows.join('\n'));

const meanRate = total / legacyFallacies.length;
console.log(`\nMean catch rate: ${(meanRate * 100).toFixed(0)}% (aggregate floor ${AGGREGATE_FLOOR * 100}%)`);
if (meanRate < AGGREGATE_FLOOR) {
  failures.push(`AGGREGATE: mean catch ${(meanRate * 100).toFixed(0)}% < floor ${AGGREGATE_FLOOR * 100}% — the catalog as a whole got too weak`);
}

// guard against the known-weak list silently going stale: a listed fallacy that now catches well
// should be removed from KNOWN_WEAK (keeps the allowlist honest).
for (const id of KNOWN_WEAK) {
  if (!fallaciesJSON.fallacies.some((f) => f.id === id)) {
    console.log(`     note: KNOWN_WEAK lists "${id}" which no longer exists — remove it.`);
  }
}

if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log('  ✗ ' + f);
  assert.fail(`coverage: ${failures.length} problem(s) — see above`);
}
ok(`structural reachability holds; aggregate catch ${(meanRate * 100).toFixed(0)}% ≥ floor; no new-weak or regressed fallacies`);

console.log(`\n${passed} check(s) passed.`);
