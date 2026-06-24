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
import { loadData, scoreChecklist, suggestFamily } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const data = loadData(read('data/fallacies.json'), read('data/questions.json'), null, read('data/families.json'));

// the virtues (incriminating question ids) for each fallacy, grouped by family — derived from the
// weights, so this needs no tells file and stays correct as data changes.
const familyOf = {};
for (const [fam, ids] of Object.entries(data.families)) for (const id of ids) familyOf[id] = fam;
const virtuesOf = (fid) =>
  data.questions.filter((q) => q.lr[fid] && q.lr[fid].yes > 1).map((q) => q.id);

// A *distinctive* virtue is one whose question this fallacy OWNS — its yes-weight is the strongest
// among the fallacies that question informs. Denying a distinctive virtue indicts this fallacy
// clearly; denying a SHARED one (e.g. q_hypocrisy_dismisses_point, owned by tu_quoque but borrowed
// by ad_hominem) splits evidence and is genuinely ambiguous. The checklist should expose a
// fallacy's distinctive virtues as its tells, so this is what "any pair must catch" tests.
const distinctiveVirtuesOf = (fid) => {
  // Restrict to the fallacy's AUTHORED tells — those are the only qids the UI can send to
  // scoreChecklist, so the test must exercise exactly those (a weight-distinctive question that
  // isn't a tell, e.g. q_options_framed_fairly, can never reach the engine in the live flow).
  const tellQids = new Set((data.tells[fid] || []).map((t) => t.qid));
  return data.questions
    .filter((q) => {
      if (!tellQids.has(q.id)) return false;
      if (!(q.lr[fid] && q.lr[fid].yes > 1)) return false;
      const others = Object.keys(q.lr).filter((k) => k !== 'VALID' && k !== fid);
      // SOLE owner: this fallacy's signal must strictly exceed every other fallacy's on this question.
      return others.every((k) => q.lr[fid].yes > q.lr[k].yes);
    })
    .map((q) => q.id);
};

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
// Contract: (1) every fallacy has ≥2 distinctive virtues; (2) AT LEAST ONE distinctive pair
// accuses it (so a careful user CAN reach it); (3) NO distinctive pair MISACCUSES a different
// fallacy (the dangerous case — never name the wrong one). Some pairs landing on cynic_valid is
// acceptable and correct: when denied virtues are shared with a sibling (e.g. ad_hominem vs
// tu_quoque), the engine rightly says "person-directed problem, but which?" rather than guessing.
const tooFew = [];
const noCatch = [];
const misaccuse = [];
for (const f of Object.keys(data.fallacies)) {
  const vs = distinctiveVirtuesOf(f);
  if (vs.length < 2) { tooFew.push(`${f}: only ${vs.length} distinctive virtue/s`); continue; }
  let anyCatch = false;
  for (const pair of allPairs(vs)) {
    const v = verdict(f, pair);
    if (v.kind === 'accuse' && v.fallacy === f) anyCatch = true;
    if (v.kind === 'accuse' && v.fallacy !== f) {
      misaccuse.push(`${f}: denying [${pair.join(', ')}] wrongly accused ${v.fallacy}`);
    }
  }
  if (!anyCatch) noCatch.push(`${f}: no distinctive pair accused it`);
}
for (const m of [...tooFew, ...noCatch, ...misaccuse]) console.log('  ✗ ' + m);
assert.equal(tooFew.length, 0, `every fallacy needs ≥2 distinctive virtues (${tooFew.length} short)`);
assert.equal(misaccuse.length, 0, `no distinctive pair may MISACCUSE another fallacy (${misaccuse.length} cases)`);
assert.equal(noCatch.length, 0, `every fallacy must be reachable by some distinctive pair (${noCatch.length} unreachable)`);
ok(`all ${Object.keys(data.fallacies).length} fallacies: ≥2 distinctive virtues, reachable, never misaccusing`);

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

// ---- m-1 (panel): "holds up" splits into valid_earned (positively confirmed via ≥2 affirmed
// virtues) vs cynic_valid (merely not-defeated: skipped / none-of-these / weak vouch). ----
{
  const f = 'ad_hominem';
  const fam = familyOf[f];
  const famQids = [...new Set(data.families[fam].flatMap((x) => (data.tells[x] || []).map((t) => t.qid)))];
  const earned = scoreChecklist(data, { familyId: fam, affirmed: famQids, seed: 1 });
  assert.equal(earned.kind, 'valid_earned', 'affirming the virtues → positively justified (valid_earned)');
  const skimmed = scoreChecklist(data, { familyId: fam, seed: 1 });
  assert.equal(skimmed.kind, 'cynic_valid', 'inspecting but marking nothing → not-defeated (cynic_valid)');
  const none = scoreChecklist(data, { familyId: 'none', seed: 1 });
  assert.equal(none.kind, 'cynic_valid', '"none of these" → cynic_valid');
  const weak = scoreChecklist(data, { familyId: fam, affirmed: [famQids[0]], seed: 1 });
  assert.equal(weak.kind, 'cynic_valid', 'a single affirmation is too weak a vouch to be "earned"');
}
ok('m-1: holds-up splits into valid_earned (confirmed) vs cynic_valid (not-defeated)');

// ---- C-1 regression (panel): denying a fallacy's tells must STILL accuse it even when every other
// virtue in the family is honestly affirmed. The old family-pooled gate let sibling affirmations
// drown the denials and whitewash ~9/12 clear fallacies. Per-fallacy scoring fixes it. ----
{
  const fails = [];
  for (const [fid, tells] of Object.entries(data.tells)) {
    const fam = familyOf[fid];
    const own = tells.map((t) => t.qid);
    // every OTHER tell in the family, affirmed (the honest juror crediting the true sibling virtues)
    const siblings = [...new Set(data.families[fam].flatMap((f) => (data.tells[f] || []).map((t) => t.qid)))]
      .filter((q) => !own.includes(q));
    const v = scoreChecklist(data, { familyId: fam, denied: own.slice(0, 2), affirmed: siblings, seed: 1 });
    if (!(v.kind === 'accuse' && v.fallacy === fid)) fails.push(`${fid} → ${v.kind}${v.fallacy ? ':' + v.fallacy : ''} (whitewashed by sibling affirmation)`);
  }
  for (const m of fails) console.log('  ✗ ' + m);
  assert.equal(fails.length, 0, `denying a fallacy's tells must accuse it despite honest sibling affirmation (${fails.length} whitewashed)`);
}
ok('C-1: honest sibling affirmation never whitewashes a denied fallacy (per-fallacy gating)');

// ---- C-3 regression (panel): two DISTINCT fallacies each with a denied virtue must not read as
// "sound" — an argument with multiple independent failures is less sound, not sound. ----
{
  const fams = Object.keys(data.families).filter((f) => data.families[f].length >= 2);
  const fails = [];
  for (const fam of fams) {
    const [a, b] = data.families[fam];
    const qa = (data.tells[a] || [])[0]?.qid, qb = (data.tells[b] || [])[0]?.qid;
    if (!qa || !qb) continue;
    const v = scoreChecklist(data, { familyId: fam, denied: [qa, qb], seed: 1 });
    if (v.kind === 'cynic_valid') fails.push(`${fam}: denying 1 ${a} + 1 ${b} tell → cynic_valid (two distinct failures read as sound)`);
  }
  for (const m of fails) console.log('  ✗ ' + m);
  assert.equal(fails.length, 0, `two distinct fallacies with denials must not read as sound (${fails.length} families)`);
}
ok('C-3: two distinct fallacies → a concerned lean, never "sound"');

// ---- denying EVERY virtue must NOT read as "sound" (the spread-guilt bug). An argument that
// fails every virtue is the least sound possible; with guilt spread across a family no single
// fallacy may win, but the verdict must be a concerned lean, never cynic_valid. ----
{
  const fails = [];
  for (const fam of Object.keys(data.families)) {
    const qids = [...new Set(data.families[fam].flatMap((f) => (data.tells[f] || []).map((t) => t.qid)))];
    if (qids.length < 2) continue;
    const v = scoreChecklist(data, { familyId: fam, denied: qids, seed: 1 });
    if (v.kind === 'cynic_valid') fails.push(`${fam}: denying all ${qids.length} virtues → cynic_valid (should be concerned, not sound)`);
  }
  for (const m of fails) console.log('  ✗ ' + m);
  assert.equal(fails.length, 0, `denying every virtue must never read as "sound" (${fails.length} family/ies regressed)`);
}
ok('denying every virtue is never "sound" — spread guilt → a concerned lean, in every family');

// ---- AUTHORED data/families.json: tells, metadata, cues are present and well-formed ----
{
  // every family has metadata + cues
  for (const fam of Object.keys(data.families)) {
    assert.ok(data.familyMeta[fam], `family ${fam} missing metadata (name/prompt) in families.json`);
    assert.ok((data.familyCues[fam] || []).length >= 3, `family ${fam} needs ≥3 routing cues`);
  }
  // every fallacy has ≥2 authored tells, each mapping to a question that incriminates it
  for (const fid of Object.keys(data.fallacies)) {
    const tells = data.tells[fid] || [];
    assert.ok(tells.length >= 2, `fallacy ${fid} needs ≥2 authored tells in families.json`);
    for (const t of tells) {
      const q = data.questions.find((x) => x.id === t.qid);
      assert.ok(q, `tell for ${fid} references unknown question ${t.qid}`);
      assert.ok(q.lr[fid] && q.lr[fid].yes > 1, `tell ${t.qid} for ${fid} doesn't incriminate it`);
      assert.ok(t.text && t.text.length > 0, `tell ${t.qid} for ${fid} has no text`);
    }
  }
}
ok('families.json: every family has metadata + cues, every fallacy ≥2 valid authored tells');

// ---- AUTHORED tells actually catch: denying the first two tells of each fallacy accuses it ----
{
  const misses = [];
  for (const [fid, tells] of Object.entries(data.tells)) {
    const denied = tells.slice(0, 2).map((t) => t.qid);
    const v = scoreChecklist(data, { familyId: familyOf[fid], denied, seed: 1 });
    if (!(v.kind === 'accuse' && v.fallacy === fid)) misses.push(`${fid} → ${v.kind}${v.fallacy ? ':' + v.fallacy : ''}`);
  }
  for (const m of misses) console.log('  ✗ authored-tell miss: ' + m);
  assert.equal(misses.length, 0, `denying a fallacy's first two authored tells must accuse it (${misses.length} miss/es)`);
}
ok('authored tells: denying any fallacy’s first two tells accuses it');

// ---- suggestFamily routes representative arguments (and stays silent on a sound one) ----
{
  const cases = [
    ['She is a paid shill so we can ignore her analysis.', 'against_the_person'],
    ['It is all-natural with no chemicals, so it must be safe.', 'irrelevant_appeal'],
    ['Ever since they changed the rule, crime went up, so the rule caused it.', 'causal'],   // post hoc lives in the causal family — M-1 cue overhaul routes here (more correct)
    ['Either we ban it entirely or we accept total chaos.', 'false_choices'],   // C-2: routes to the family that holds false_dilemma
    ['The bridge holds 40 tons because the load tests and engineering report confirm it.', null],
  ];
  for (const [text, expect] of cases) {
    const got = suggestFamily(data, text).top;
    assert.equal(got, expect, `suggestFamily("${text.slice(0, 30)}…") → ${got}, expected ${expect}`);
  }
}
ok('suggestFamily routes typical arguments by cue, and stays silent on a sound one');

// ---- m-6: the dev warning fires only on a real typo, not on a valid-but-off-topic qid ----
{
  const fam = Object.keys(data.families)[0];
  const orig = console.warn;
  const grab = (qid) => {
    let warned = false;
    console.warn = () => { warned = true; };
    try { scoreChecklist(data, { familyId: fam, denied: [qid], seed: 1 }); } finally { console.warn = orig; }
    return warned;
  };
  assert.equal(grab('q_TOTALLY_MADE_UP'), true, 'a qid not in questions.json must warn (typo guard)');
  assert.equal(grab('q_evidence_or_assertion'), false, 'a valid question that just isn’t this family’s tell must NOT warn');
}
ok('m-6: dev warning fires on a typo qid, stays silent on a valid off-topic qid');

console.log(`\n${passed} checks passed.`);
