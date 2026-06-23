// Checklist-flow tests (the positive-first reformulation). Run: node tests/checklist.test.js
//
// Unlike the sequential flow, checklist scoring is DETERMINISTIC given (family, affirmed, denied) —
// there is no stochastic question selection — so these are exact, seed-independent guarantees:
//   • all-affirmed / nothing-marked → the argument holds up (goodwill)
//   • denying ONE virtue never accuses (one shortfall ≠ guilt)
//   • denying TWO virtues of the same fallacy tentatively accuses THAT fallacy (reliable catch)
//   • affirming other virtues can pull a 1-denial argument back to sound (you can DEFEND, not just prosecute)
//   • "none of these / seems fine" → holds up
// This is the positive-validation, goodwill-first contract made testable.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData, scoreChecklist } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const data = loadData(read('data/fallacies.json'), read('data/questions.json'));

// the virtues (incriminating question ids) for each fallacy, grouped by family — derived from the
// weights, so this needs no tells file and stays correct as data changes.
const familyOf = {};
for (const [fam, ids] of Object.entries(data.families)) for (const id of ids) familyOf[id] = fam;
const virtuesOf = (fid) =>
  data.questions.filter((q) => q.lr[fid] && q.lr[fid].yes > 1).map((q) => q.id);

let passed = 0;
const ok = (m) => { passed++; console.log(`  ✓ ${m}`); };
const SEEDS = [1, 7, 42];   // deterministic anyway; a few seeds guard against accidental rng use

function verdict(fid, denied, affirmed = []) {
  const fam = familyOf[fid];
  // any seed gives the same answer; assert that too
  const kinds = SEEDS.map((seed) =>
    scoreChecklist(data, { familyId: fam, denied, affirmed, seed }));
  const k0 = kinds[0].kind + (kinds[0].fallacy ? ':' + kinds[0].fallacy : '');
  for (const v of kinds) {
    const k = v.kind + (v.fallacy ? ':' + v.fallacy : '');
    assert.equal(k, k0, `checklist verdict must be seed-independent (${fid})`);
  }
  return kinds[0];
}

// ---- goodwill: nothing marked, and all-affirmed, both hold up ----
for (const f of data.fallacies ? Object.keys(data.fallacies) : []) {
  const fam = familyOf[f];
  const all = virtuesOf(f);
  const skipNothing = scoreChecklist(data, { familyId: fam, seed: 1 });
  assert.notEqual(skipNothing.kind, 'accuse', `${f}: skipping everything must not accuse`);
  const allAffirmed = scoreChecklist(data, { familyId: fam, affirmed: all, seed: 1 });
  assert.notEqual(allAffirmed.kind, 'accuse', `${f}: affirming every virtue must not accuse`);
}
ok('goodwill: nothing-marked and all-virtues-affirmed never accuse');

// ---- one denial never accuses ----
let oneOk = true;
for (const f of Object.keys(data.fallacies)) {
  const v = verdict(f, virtuesOf(f).slice(0, 1));
  if (v.kind === 'accuse') { oneOk = false; console.log(`    ✗ ${f} accused on a single denial`); }
}
assert.ok(oneOk, 'a single denied virtue must never accuse (one shortfall ≠ guilt)');
ok('one denied virtue never accuses');

// ---- two denials reliably accuse: EVERY pair of a fallacy's virtues, when denied, must accuse
// that fallacy. (In the real UI the user denies whichever virtues they see absent — not a chosen
// "best" pair — so robustness requires all pairs to work, not just the strongest.) ----
const allPairs = (arr) => {
  const out = [];
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) out.push([arr[i], arr[j]]);
  return out;
};
const misses = [];
for (const f of Object.keys(data.fallacies)) {
  const vs = virtuesOf(f);
  if (vs.length < 2) { misses.push(`${f}: only ${vs.length} virtue/s — needs ≥2`); continue; }
  for (const pair of allPairs(vs)) {
    const v = verdict(f, pair);
    if (!(v.kind === 'accuse' && v.fallacy === f)) {
      misses.push(`${f}: denying [${pair.join(', ')}] → ${v.kind}${v.fallacy ? ':' + v.fallacy : ''}`);
    }
  }
}
if (misses.length) { console.log('  ✗ two-denial misses (some virtue pair fails to accuse):'); for (const m of misses) console.log('      ' + m); }
assert.equal(misses.length, 0, `every pair of a fallacy's virtues must accuse it when denied (${misses.length} miss/es)`);
ok(`all ${Object.keys(data.fallacies).length} fallacies accuse on ANY two denied virtues`);

// ---- affirming virtues can defend: 1 denial + 2 affirmations of the same fallacy → holds up ----
{
  const f = 'ad_hominem';
  const vs = virtuesOf(f);
  const v = scoreChecklist(data, { familyId: familyOf[f], denied: [vs[0]], affirmed: vs.slice(1, 3), seed: 1 });
  assert.notEqual(v.kind, 'accuse', 'affirming other virtues should rescue a single-denial argument');
}
ok('affirming virtues actively defends an argument (positive validation works)');

// ---- "none of these" holds up ----
{
  const v = scoreChecklist(data, { familyId: 'none', seed: 1 });
  assert.equal(v.kind, 'cynic_valid', '"none of these / seems fine" → the argument holds up');
}
ok('"none of these" routes to a holds-up verdict');

console.log(`\n${passed} checks passed.`);
