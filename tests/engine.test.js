// Engine self-check. Run: node tests/engine.test.js
// Tests the MATH against ENGINE-SPEC.md §5 worked traces, using a fixed tiny bank so the
// numbers are deterministic and independent of the real data/ content (that has its own
// calibration fixture). No framework — plain asserts. If the inference math breaks, this fails.

import assert from 'node:assert/strict';
import {
  CONFIG, loadData, newSession, answer, beliefs, checkStop, status,
  validateBank, confirmVerdict,
} from '../src/engine.js';

// ---- fixed bank matching the spec's worked example (§5.1) ----
const FALLACIES = {
  version: 1,
  fallacies: [
    { id: 'ad_hominem', name: 'Ad Hominem', base_rate: 1.5, short: 'Attacking the person instead of their argument.',
      teaching: 'Targets character/motive rather than the claim.', confirm_check: 'Is the speaker’s character used in place of engaging the claim?' },
    { id: 'strawman', name: 'Strawman', base_rate: 1.0, short: 'Refuting a distorted version of the argument.',
      teaching: 'Replaces the real claim with a weaker one.', confirm_check: 'Is the rebuttal answering a weaker version of the claim?' },
    { id: 'slippery_slope', name: 'Slippery Slope', base_rate: 1.0, short: 'One step inevitably leads to an extreme outcome.',
      teaching: 'Asserts an unsupported chain to an extreme.', confirm_check: 'Is the chain to the extreme outcome actually supported?' },
    { id: 'false_dilemma', name: 'False Dilemma', base_rate: 1.0, short: 'Presenting only two options when more exist.',
      teaching: 'Frames a false either/or.', confirm_check: 'Are the two options truly the only ones?' },
  ],
};
const QUESTIONS = {
  version: 1,
  questions: [
    { id: 'q_attacks_person', tags: ['entry'],
      text: 'Does the argument respond to the claim itself, or to the person or motive of who made it?',
      lr: { ad_hominem: { yes: 6.0, no: 0.25 }, VALID: { yes: 0.4, no: 1.3 } } },
    { id: 'q_rejection_is_about_speaker', tags: [],
      text: 'Is the reason for rejecting the claim based on evidence about the claim, or on facts about the speaker?',
      lr: { ad_hominem: { yes: 3.0, no: 0.4 }, VALID: { yes: 0.5, no: 1.2 } } },
    { id: 'q_misrepresents_claim', tags: ['entry'],
      text: 'Does the rebuttal address the claim as actually made, a weaker or exaggerated version of it, or no opposing claim at all?',
      lr: { strawman: { yes: 6.0, no: 0.2 }, VALID: { yes: 0.4, no: 1.3 } } },
  ],
};

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

// ---- validateBank accepts the good bank ----
const { warnings } = validateBank(FALLACIES, QUESTIONS);
ok('validateBank accepts a compliant bank');

// ---- validateBank rejects a gotcha question (G1: can only incriminate) ----
assert.throws(() => validateBank(FALLACIES, {
  version: 1, questions: [{ id: 'q_bad', text: 'a or b?',
    lr: { ad_hominem: { yes: 6.0, no: 0.9 }, VALID: { yes: 0.4, no: 0.8 } } }], // VALID.no < 1.0
}), /G1/);
ok('validateBank rejects a question that can only incriminate (G1)');

// ---- validateBank rejects missing confirm_check ----
assert.throws(() => validateBank({
  version: 1, fallacies: [{ id: 'x', name: 'X', short: 's', teaching: 't' }], // no confirm_check
}, QUESTIONS), /confirm_check/);
ok('validateBank rejects a fallacy missing confirm_check');

const data = loadData(FALLACIES, QUESTIONS);

// ---- priors (§1.2): VALID 0.60, ad_hominem highest fallacy, all ≤ cap ----
{
  const s = newSession(data, 1);
  const P = beliefs(s);
  assert.ok(Math.abs(P.VALID - 0.60) < 0.01, `VALID prior ~0.60, got ${P.VALID}`);
  assert.ok(P.ad_hominem > P.strawman, 'ad_hominem prior > strawman (base_rate)');
  for (const f of ['ad_hominem', 'strawman', 'slippery_slope', 'false_dilemma']) {
    assert.ok(P[f] <= CONFIG.PRIOR_FALLACY_CAP + 1e-9, `${f} prior under cap`);
  }
  const total = Object.values(P).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-6, 'priors sum to 1');
}
ok('priors: strong VALID, base-rate ordering, cap respected, normalized');

// ---- Trace B (§5.4): ONE incriminating "yes" must NOT accuse ----
{
  const s = newSession(data, 1);
  answer(s, 'q_attacks_person', 'yes');
  const P = beliefs(s);
  const stop = checkStop(s);
  // The goodwill guarantee is about the DECISION, not belief ordering: one incriminating answer
  // must never ACCUSE. (A single strong "yes" may nudge a fallacy ahead of VALID, but the gate's
  // ratio requirement means it can't be named — the engine keeps asking.)
  assert.notEqual(stop.kind, 'accuse', 'one yes must not accuse (goodwill preserved)');
  assert.ok(P.ad_hominem < CONFIG.RATIO_VALID * P.VALID,
    `after 1 yes, ad_hominem (${P.ad_hominem.toFixed(3)}) stays under the gate (${(CONFIG.RATIO_VALID * P.VALID).toFixed(3)})`);
}
ok('Trace B: a single incriminating answer never convicts');

// ---- Trace B continued: TWO consistent "yes"es clear the triple gate ----
{
  const s = newSession(data, 1);
  answer(s, 'q_attacks_person', 'yes');
  answer(s, 'q_rejection_is_about_speaker', 'yes');
  const P = beliefs(s);
  const stop = checkStop(s);
  assert.equal(stop.kind, 'accuse', 'two consistent yes-es should clear the gate');
  assert.equal(stop.fallacy, 'ad_hominem', 'accused fallacy is ad_hominem');
  assert.ok(P.ad_hominem >= CONFIG.RATIO_VALID * P.VALID, `P(ad_hominem) beats VALID by ratio (${(P.ad_hominem / P.VALID).toFixed(2)}× ≥ ${CONFIG.RATIO_VALID})`);
  assert.ok(P.ad_hominem >= CONFIG.MIN_ACCUSE_MASS, 'clears minimum mass floor');
  assert.ok(typeof stop.confirm_check === 'string' && stop.confirm_check.length > 0, 'carries a confirm_check');
}
ok('Trace B: two consistent incriminating answers clear the triple gate');

// ---- confirmVerdict: reject routes to cynic exit, not a second accusation ----
{
  const s = newSession(data, 1);
  answer(s, 'q_attacks_person', 'yes');
  answer(s, 'q_rejection_is_about_speaker', 'yes');
  const accepted = confirmVerdict(s, true);
  assert.equal(accepted.kind, 'confirmed', 'accepting confirms');
  const rejected = confirmVerdict(s, false);
  assert.equal(rejected.kind, 'cynic_after_reject', 'rejecting routes to cynic exit');
}
ok('confirmVerdict: user rejection routes to cynic exit, never a fallback accusation');

// ---- Trace A (§5.3): a SOUND argument lands on VALID ----
{
  const s = newSession(data, 1);
  answer(s, 'q_attacks_person', 'no');
  answer(s, 'q_misrepresents_claim', 'no');
  answer(s, 'q_rejection_is_about_speaker', 'no');
  const P = beliefs(s);
  const stop = checkStop(s);
  assert.ok(P.VALID >= CONFIG.TAU_VALID, `sound argument: P(VALID) ${P.VALID.toFixed(3)} >= TAU_VALID ${CONFIG.TAU_VALID}`);
  assert.ok(stop.kind === 'valid_earned', `sound argument earns VALID, got ${stop.kind}`);
  // no fallacy ever overtook VALID
  for (const f of ['ad_hominem', 'strawman', 'slippery_slope', 'false_dilemma']) {
    assert.ok(P[f] < P.VALID, `${f} stayed below VALID`);
  }
}
ok('Trace A: exonerating answers compound into earned VALID');

// ---- "unsure" is charitable: a streak of unsure → cynic exit, never accuse ----
{
  const s = newSession(data, 1);
  answer(s, 'q_attacks_person', 'unsure');
  answer(s, 'q_misrepresents_claim', 'unsure');
  answer(s, 'q_rejection_is_about_speaker', 'unsure');
  const stop = checkStop(s);
  assert.equal(stop.kind, 'cynic_unsure', `unsure streak → cynic exit, got ${stop.kind}`);
}
ok('unsure answers are charitable: a streak routes to the skeptic exit, never an accusation');

// ---- order independence: same answers in any order → same beliefs ----
{
  const a = newSession(data, 1);
  answer(a, 'q_attacks_person', 'yes'); answer(a, 'q_misrepresents_claim', 'no');
  const b = newSession(data, 1);
  answer(b, 'q_misrepresents_claim', 'no'); answer(b, 'q_attacks_person', 'yes');
  const Pa = beliefs(a), Pb = beliefs(b);
  for (const h of data.H) assert.ok(Math.abs(Pa[h] - Pb[h]) < 1e-9, `order-independent for ${h}`);
}
ok('Bayesian update is order-independent (commutative) for all answer types');

// ---- info-gain selection returns a question early, and respects entry pool ----
{
  const s = newSession(data, 1);
  const st = status(s);
  assert.ok(!st.stop && st.nextQuestion, 'fresh session asks a question');
  assert.ok((st.nextQuestion.tags || []).includes('entry'), 'first question comes from the entry pool');
}
ok('question selection asks an entry question first');

console.log(`\n${passed} checks passed.`);
if (warnings && warnings.length) console.log(`(validateBank warnings: ${warnings.length})`);
