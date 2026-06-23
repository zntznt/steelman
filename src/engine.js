// Fallacynator inference engine.
// Belief-weighted (Bayesian-ish) reasoning that DISARMS CYNICS: a strong prior on
// VALID ("the argument holds up") that must be beaten by a triple gate before any
// fallacy is ever named. See guidance/ENGINE-SPEC.md — this file is that spec in code.
//
// Pure functions, no DOM, no I/O. The browser and the Node self-check both import this;
// each does its own JSON loading and hands parsed objects to loadData().

export const CONFIG = {
  // Priors
  PRIOR_VALID: 0.60,        // strong innocence prior
  PRIOR_FALLACY_CAP: 0.15,  // no single fallacy prior may exceed this (anti-laundering)

  // Numerical hygiene
  EPS: 1e-4,                // posterior floor; no hypothesis dies permanently
  L_MIN: 0.2,              // per-cell likelihood clamp (no near-certainty)
  L_MAX: 3.0,             // per-cell likelihood clamp
  MAX_LR_RATIO: 8.0,      // max/min within one derived answer row (bounded single-step impact)

  // Correlation damping: λ raises each answer's log-likelihood to this power. λ<1 discounts
  // corroboration to fight correlated-question double-counting. This dataset has well-separated
  // questions (little correlation to damp), and λ=0.7 starved real fallacies of evidence — they
  // never out-rose the validity prior. λ=1.0 is pure, undamped Bayes: correct here, and it's what
  // lets a genuinely fallacious argument actually clear the gate. Lower it only if a future
  // dataset adds near-duplicate questions that visibly over-concentrate (watch the calibration test).
  EVIDENCE_DAMP: 1.0,     // λ: pure Bayesian update (see note above)

  // Accusation gate — RELATIVE (ratio-based), so it stays correct as fallacies are added.
  // An absolute probability floor is unreachable once the prior mass (1-PRIOR_VALID) is split
  // across many fallacies; ratios are field-size-invariant. The thesis was never "hit 50%" — it
  // was "decisively beat innocence AND know which fallacy." Both are ratios. Calibrated against
  // tests/calibration.test.js: sound arguments peak at f/VALID ≈ 0.07 (huge safety gap below
  // RATIO_VALID), real fallacies reach f/VALID ≈ 1.3–1.9 and dominate the runner-up ≥ 3×.
  RATIO_VALID: 1.5,       // A2: leading fallacy must be ≥ this × P(VALID) (decisively beats innocence)
  RATIO_RUNNERUP: 2.5,    // A4: leading fallacy must be ≥ this × the 2nd-place fallacy (we know WHICH)
  MIN_ACCUSE_MASS: 0.18,  // A3: a small absolute floor so a fallacy leading a near-empty field on
                          //     thin evidence can't accuse; well below what real fallacies reach.

  // Checklist gate: the checklist flow gathers evidence as a few deliberate ticks rather than ~7
  // sequential answers, so the leading fallacy peaks lower. A gentler VALID ratio lets two
  // confident ticks of the same fallacy tentatively accuse, while one tick still can't (it stays
  // below VALID). Runner-up + min-mass conditions are unchanged, so we still know WHICH one.
  CHECKLIST_RATIO_VALID: 0.85, // two ticks land a fallacy at f/VALID ≈ 0.9–1.4 (and ≥4× its
                               // family runner-up); one tick at ≈ 0.2–0.3. A floor of 0.85 sits
                               // cleanly between: two deliberate ticks tentatively accuse, one
                               // never does. (Lower than the sequential 1.5 because two ticks is a
                               // stronger deliberate signal than two passive sequential answers.)

  // VALID exits
  TAU_VALID: 0.75,        // earned-VALID: confident "this holds up"

  // Question loop control
  IG_MIN: 0.02,           // bits; below this, no question is worth asking (stuck)
  Q_MAX: 9,               // hard cap on questions per session
  ENTRY_R: 2,             // first R questions drawn from "entry"-tagged pool
  ENTRY_TOPK: 3,          // entry phase: sample uniformly among top-3 by info gain
  NARROW_TOPK: 2,         // narrow phase: sample among top-2 by info gain (∝ IG)

  // Charity (answer-noise model; §1.4)
  CHARITY_UNSURE: 0.85,   // weight on the "true answer is no" branch for unsure
  MAYBE_YES_SHARE: 0.40,  // weight on "true answer is yes" for maybe (tilt charitable)

  // Unsure-streak guard
  UNSURE_STREAK: 3,       // N consecutive unsure → cynic exit
  UNSURE_FRACTION: 0.60,  // ≥ this fraction of answers unsure → cynic exit
  UNSURE_MIN_N: 4,        // ...but only once at least this many answers exist (avoids 1/1=100%)
};

const ANSWERS = ['yes', 'no', 'maybe', 'unsure'];

// ---------- small helpers ----------
const sum = (a) => a.reduce((x, y) => x + y, 0);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Seeded RNG so sessions replay deterministically (shareable results).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shannon entropy in bits of a {h: prob} distribution.
function entropy(P) {
  let s = 0;
  for (const h in P) { const p = P[h]; if (p > 0) s -= p * Math.log2(p); }
  return s;
}

// ---------- §1.4 derive a proper 4-way categorical P(a|h) from yes/no anchors ----------
function buildCategoricals(lr, H, C) {
  const cat = {};
  for (const h of H) {
    const a = lr[h] || { yes: 1.0, no: 1.0 };          // unlisted hypothesis → neutral
    const gy = clamp(a.yes, C.L_MIN, C.L_MAX);
    const gn = clamp(a.no, C.L_MIN, C.L_MAX);
    const yes = gy;
    const no = gn;
    const maybe = Math.pow(gy, C.MAYBE_YES_SHARE) * Math.pow(gn, 1 - C.MAYBE_YES_SHARE);
    const unsure = Math.pow(gn, C.CHARITY_UNSURE) * Math.pow(gy, 1 - C.CHARITY_UNSURE);
    const Z = yes + no + maybe + unsure;
    cat[h] = { yes: yes / Z, no: no / Z, maybe: maybe / Z, unsure: unsure / Z };
  }
  return cat;
}

// ---------- validateBank: G1–G9 (hard-fail). G10 lives in the fixture test. ----------
// Anti-bias is mechanical here: a gotcha bank throws and never loads.
export function validateBank(fallaciesJSON, questionsJSON, C = CONFIG) {
  const errs = [];
  const warns = [];
  const fallacies = fallaciesJSON.fallacies || [];
  const questions = questionsJSON.questions || [];

  // ----- fallacies.json -----
  const idRe = /^[a-z][a-z0-9_]*$/;
  const seenF = new Set();
  for (const f of fallacies) {
    if (!idRe.test(f.id || '')) errs.push(`fallacy id invalid: ${JSON.stringify(f.id)}`);
    if (f.id === 'VALID') errs.push(`fallacy id "VALID" is reserved`);
    if (seenF.has(f.id)) errs.push(`duplicate fallacy id: ${f.id}`);
    seenF.add(f.id);
    if (!f.name) errs.push(`fallacy ${f.id}: missing name`);
    if (f.base_rate != null && !(f.base_rate > 0)) errs.push(`fallacy ${f.id}: base_rate must be > 0`);
    if (!f.short) errs.push(`fallacy ${f.id}: missing short`);
    else if (f.short.length > 120) errs.push(`fallacy ${f.id}: short > 120 chars`);
    if (!f.teaching) errs.push(`fallacy ${f.id}: missing teaching`);
    if (!f.confirm_check) errs.push(`fallacy ${f.id}: missing confirm_check (required — makes accusation tentative)`);
  }

  // G7: prior caps (anti-laundering)
  if (!(C.PRIOR_VALID >= 0.55)) errs.push(`G7: PRIOR_VALID must be ≥ 0.55`);
  const sumBR = sum(fallacies.map((f) => f.base_rate ?? 1)) || 1;
  for (const f of fallacies) {
    const p0 = (1 - C.PRIOR_VALID) * (f.base_rate ?? 1) / sumBR;
    if (p0 > C.PRIOR_FALLACY_CAP + 1e-9) {
      errs.push(`G7: prior of ${f.id} = ${p0.toFixed(3)} exceeds cap ${C.PRIOR_FALLACY_CAP}`);
    }
  }

  // G9: threshold sanity
  if (!(C.TAU_VALID > C.PRIOR_VALID)) errs.push(`G9: TAU_VALID must exceed PRIOR_VALID (VALID must be earned)`);
  if (!(C.RATIO_VALID > 1.0)) errs.push(`G9: RATIO_VALID must exceed 1.0 (a fallacy must beat VALID to accuse)`);
  if (!(C.RATIO_RUNNERUP > 1.0)) errs.push(`G9: RATIO_RUNNERUP must exceed 1.0 (the leader must beat the runner-up)`);
  if (!(C.MIN_ACCUSE_MASS > 0)) errs.push(`G9: MIN_ACCUSE_MASS must be > 0`);

  // G8: presupposition lint (leading question framing). Soft unless ALLOW_NEUTRAL_EITHER_OR pattern.
  const BANNED = [/\bdodging\b/i, /\binstead of\b/i, /\bobviously\b/i, /\breally\b/i,
    /manipulat/i, /\bfails to\b/i, /\battack\b/i];
  const EITHER_OR = /\bor\b/i; // a neutral "X, or Y?" framing is allowed to use otherwise-banned words

  // ----- questions.json -----
  const qRe = /^q_[a-z0-9_]*$/;
  const seenQ = new Set();
  for (const q of questions) {
    if (!qRe.test(q.id || '')) errs.push(`question id invalid: ${JSON.stringify(q.id)}`);
    if (seenQ.has(q.id)) errs.push(`duplicate question id: ${q.id}`);
    seenQ.add(q.id);
    if (!q.text) { errs.push(`question ${q.id}: missing text`); continue; }

    // G8 lint
    for (const re of BANNED) {
      if (re.test(q.text) && !EITHER_OR.test(q.text)) {
        warns.push(`G8: question ${q.id} uses leading phrasing (${re}) without neutral either/or framing`);
      }
    }

    const lr = q.lr || {};
    const keys = Object.keys(lr);
    // referenced fallacy ids must exist
    for (const k of keys) {
      if (k !== 'VALID' && !seenF.has(k)) errs.push(`question ${q.id}: lr references unknown fallacy "${k}"`);
    }
    // G5/G1: VALID present
    if (!('VALID' in lr)) { errs.push(`G1/G5: question ${q.id} must list VALID in lr`); continue; }
    // every lr cell > 0
    for (const k of keys) {
      const cell = lr[k];
      if (!(cell && cell.yes > 0 && cell.no > 0)) errs.push(`question ${q.id}: lr[${k}] needs yes>0 and no>0`);
    }
    // G6: must discriminate ≥ 2 hypotheses (≥ 1 non-VALID with a non-neutral row alongside VALID)
    const fallacyKeys = keys.filter((k) => k !== 'VALID');
    if (fallacyKeys.length < 1) errs.push(`G6: question ${q.id} discriminates < 2 hypotheses`);

    // G1: an answer must raise VALID relative to some fallacy
    const vNo = lr.VALID.no;
    if (!(vNo >= 1.0)) errs.push(`G1: question ${q.id} lr.VALID.no must be ≥ 1.0 (some answer raises VALID)`);
    const minFallacyNo = fallacyKeys.length ? Math.min(...fallacyKeys.map((k) => lr[k].no)) : Infinity;
    if (!(vNo > minFallacyNo)) {
      errs.push(`G1: question ${q.id} — VALID.no (${vNo}) must exceed the lowest fallacy .no (${minFallacyNo}); a question that can only incriminate is illegal`);
    }

    // G2: charitable direction
    for (const k of fallacyKeys) {
      if (lr[k].yes >= 1.0 && !(lr.VALID.yes <= 1.0)) {
        errs.push(`G2: question ${q.id} — incriminating yes for ${k} must cost VALID (lr.VALID.yes ≤ 1.0)`);
      }
      if (lr[k].no <= 1.0 && !(lr.VALID.no >= 1.0)) {
        errs.push(`G2: question ${q.id} — exonerating no for ${k} must reward VALID (lr.VALID.no ≥ 1.0)`);
      }
    }

    // G3 + G4 on derived rows
    const H = ['VALID', ...fallacies.map((f) => f.id)];
    const cat = buildCategoricals(lr, H, C);
    for (const ans of ANSWERS) {
      const col = H.map((h) => cat[h][ans]);
      const hi = Math.max(...col), lo = Math.min(...col);
      if (lo <= 0) errs.push(`G3: question ${q.id} derived P(${ans}|·) hit 0`);
      if (hi / lo > C.MAX_LR_RATIO + 1e-9) {
        errs.push(`G4: question ${q.id} answer "${ans}" ratio ${(hi / lo).toFixed(2)} > MAX_LR_RATIO ${C.MAX_LR_RATIO}`);
      }
    }
  }

  if (errs.length) throw new Error('validateBank failed:\n  - ' + errs.join('\n  - '));
  return { ok: true, warnings: warns };
}

// ---------- LOAD ----------
export function loadData(fallaciesJSON, questionsJSON, fixturesJSON = null, familiesJSON = null) {
  const { warnings } = validateBank(fallaciesJSON, questionsJSON);
  const H = ['VALID', ...fallaciesJSON.fallacies.map((f) => f.id)];
  const fallacies = {};
  for (const f of fallaciesJSON.fallacies) fallacies[f.id] = f;
  const questions = questionsJSON.questions.map((q) => ({
    ...q,
    cat: buildCategoricals(q.lr, H, CONFIG),  // precompute proper categoricals once
  }));
  // families: family-id → [fallacy ids], from each fallacy's `family` field (singleton fallback).
  const families = {};
  for (const f of fallaciesJSON.fallacies) (families[f.family || f.id] ||= []).push(f.id);
  // families.json (optional): display metadata + routing cues + checklist tells.
  const familyMeta = {};
  const familyCues = {};
  const tells = (familiesJSON && familiesJSON.tells) || {};
  if (familiesJSON && Array.isArray(familiesJSON.families)) {
    for (const fm of familiesJSON.families) {
      familyMeta[fm.id] = { id: fm.id, name: fm.name, prompt: fm.prompt };
      familyCues[fm.id] = fm.cues || [];
    }
  }
  return { H, fallacies, families, familyMeta, familyCues, tells, questions, fixtures: fixturesJSON, warnings };
}

// ---------- INIT ----------
export function newSession(data, seed) {
  if (seed == null) seed = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const { H, fallacies } = data;
  const sumBR = sum(Object.values(fallacies).map((f) => f.base_rate ?? 1)) || 1;
  const logP = {};
  for (const h of H) {
    const p = h === 'VALID'
      ? CONFIG.PRIOR_VALID
      : (1 - CONFIG.PRIOR_VALID) * (fallacies[h].base_rate ?? 1) / sumBR;
    logP[h] = Math.log(Math.max(p, CONFIG.EPS));
  }
  return {
    data, seed, logP: normalizeLog(logP), asked: new Set(),
    answers: [], rng: mulberry32(seed),
  };
}

// belief distribution {h: prob} from log-space
export function beliefs(state) {
  const out = {};
  for (const h in state.logP) out[h] = Math.exp(state.logP[h]);
  return out;
}

// ---------- ANSWER + UPDATE ----------
export function answer(state, questionId, a) {
  if (!ANSWERS.includes(a)) throw new Error(`bad answer "${a}"`);
  const q = state.data.questions.find((x) => x.id === questionId);
  if (!q) throw new Error(`unknown question "${questionId}"`);
  update(state, q.cat, a);
  state.asked.add(questionId);
  state.answers.push({ questionId, a });
  return state;
}

function update(state, cat, a) {
  for (const h of state.data.H) {
    const pah = cat[h][a];                       // proper P(a|h) ∈ (0,1)
    state.logP[h] += CONFIG.EVIDENCE_DAMP * Math.log(pah);
  }
  state.logP = normalizeLog(state.logP);
}

// softmax + EPS floor + renormalize, kept in log-space
function normalizeLog(logP) {
  const vals = Object.values(logP);
  const m = Math.max(...vals);
  const exp = {};
  let Z = 0;
  for (const h in logP) { exp[h] = Math.exp(logP[h] - m); Z += exp[h]; }
  const floored = {};
  let Z2 = 0;
  for (const h in exp) { const p = Math.max(exp[h] / Z, CONFIG.EPS); floored[h] = p; Z2 += p; }
  const out = {};
  for (const h in floored) out[h] = Math.log(floored[h] / Z2);
  return out;
}

// ---------- NEXT QUESTION (info gain + entry/narrow sampling) ----------
function infoGain(P, cat, H) {
  const S = entropy(P);
  let expected = 0;
  for (const a of ANSWERS) {
    let pa = 0;
    for (const h of H) pa += P[h] * cat[h][a];
    if (pa <= 0) continue;
    const post = {};
    let Z = 0;
    for (const h of H) { post[h] = P[h] * Math.pow(cat[h][a], CONFIG.EVIDENCE_DAMP); Z += post[h]; }
    for (const h of H) post[h] /= Z;
    expected += pa * entropy(post);
  }
  return S - expected;
}

function sampleProportional(scored, rng) {
  const total = sum(scored.map((s) => Math.max(s.ig, 0)));
  if (total <= 0) return scored[0];
  let r = rng() * total;
  for (const s of scored) { r -= Math.max(s.ig, 0); if (r <= 0) return s; }
  return scored[scored.length - 1];
}

export function pickNextQuestion(state) {
  const P = beliefs(state);
  let pool = state.data.questions.filter((q) => !state.asked.has(q.id));
  if (state.answers.length < CONFIG.ENTRY_R) {
    const entry = pool.filter((q) => (q.tags || []).includes('entry'));
    if (entry.length) pool = entry;            // prefer entry questions; fall back if none left
  }
  if (pool.length === 0) return null;

  const scored = pool
    .map((q) => ({ q, ig: infoGain(P, q.cat, state.data.H) }))
    .sort((x, y) => y.ig - x.ig);

  if (scored[0].ig < CONFIG.IG_MIN) return null;  // STUCK → caller routes to exit

  if (state.answers.length < CONFIG.ENTRY_R) {
    const top = scored.slice(0, CONFIG.ENTRY_TOPK);
    return top[Math.floor(state.rng() * top.length)].q;
  }
  const top = scored.slice(0, CONFIG.NARROW_TOPK);
  return sampleProportional(top, state.rng).q;
}

// ---------- CHECK STOP (§3 priority) ----------
export function checkStop(state) {
  const P = beliefs(state);
  const fIds = state.data.H.filter((h) => h !== 'VALID');
  const ranked = fIds.map((f) => [f, P[f]]).sort((a, b) => b[1] - a[1]);
  const [f1, p1] = ranked[0] || [null, 0];
  const p2 = ranked[1] ? ranked[1][1] : 0;
  const pv = P.VALID;

  // 1. ACCUSE — relative gate (field-size-invariant). All must hold:
  //   A1  f1 is the leading fallacy
  //   A2  f1 decisively beats VALID by ratio              (p1 ≥ RATIO_VALID · pv)
  //   A3  f1 has a non-trivial amount of belief            (p1 ≥ MIN_ACCUSE_MASS)
  //   A4  f1 clearly dominates the runner-up fallacy       (p1 ≥ RATIO_RUNNERUP · p2)
  // One incriminating answer can't satisfy A2 (it stalls below VALID); ~two consistent ones can.
  if (f1 &&
      p1 >= CONFIG.RATIO_VALID * pv &&
      p1 >= CONFIG.MIN_ACCUSE_MASS &&
      p1 >= CONFIG.RATIO_RUNNERUP * (p2 || CONFIG.EPS)) {
    return {
      stop: true, kind: 'accuse', fallacy: f1,
      confirm_check: state.data.fallacies[f1].confirm_check, beliefs: P,
    };
  }

  // 2. UNSURE-DOMINATED → cynic exit. Checked BEFORE earned-VALID: when the user kept
  // shrugging, "you might just be skeptical" is more honest than manufacturing a confident
  // "this holds up" out of charitable-by-construction unsure nudges.
  const ans = state.answers;
  const recent = ans.slice(-CONFIG.UNSURE_STREAK);
  const streak = recent.length === CONFIG.UNSURE_STREAK && recent.every((r) => r.a === 'unsure');
  // The fraction guard catches a *pattern* of shrugging — it needs a real sample, otherwise a
  // single early "unsure" trips it at 1/1 = 100%. Only apply it once enough has been answered.
  const frac = ans.length >= CONFIG.UNSURE_MIN_N &&
    ans.filter((r) => r.a === 'unsure').length / ans.length >= CONFIG.UNSURE_FRACTION;
  if (streak || frac) return { stop: true, kind: 'cynic_unsure', beliefs: P };

  // 3. EARNED VALID
  if (pv >= CONFIG.TAU_VALID) return { stop: true, kind: 'valid_earned', beliefs: P };

  const budget = ans.length >= CONFIG.Q_MAX;
  const stuck = pickNextQuestion(state) === null;
  if (budget || stuck) {
    // We reached the end without clearing the accusation gate. If a fallacy nonetheless rose
    // clearly above both VALID and the runner-up — just short of the gate — name it as a *lean*
    // ("there might be something here") without accusing. Otherwise VALID stood: skeptic exit.
    const leans = f1 && p1 > pv && p1 >= CONFIG.RATIO_RUNNERUP * (p2 || CONFIG.EPS);
    return {
      stop: true,
      kind: leans ? 'inconclusive_lean' : 'cynic_valid',
      leanFallacy: leans ? f1 : null,
      beliefs: P,
    };
  }
  return { stop: false, beliefs: P };
}

// ---------- DRIVER (what the UI calls each turn) ----------
export function status(state) {
  const stop = checkStop(state);
  if (stop.stop) return stop;
  return { stop: false, nextQuestion: pickNextQuestion(state), beliefs: beliefs(state) };
}

// ---------- user's final call on a tentative accusation (§3.1) ----------
export function confirmVerdict(state, accepted) {
  const stop = checkStop(state);
  if (stop.kind !== 'accuse') throw new Error('confirmVerdict called without a pending accusation');
  if (accepted) {
    return { kind: 'confirmed', fallacy: stop.fallacy, beliefs: stop.beliefs };
  }
  // rejected → cynic exit, never a second-best accusation
  return { kind: 'cynic_after_reject', rejected: stop.fallacy, beliefs: stop.beliefs };
}

// ---------- CHECKLIST scoring (the reformulated, POSITIVE-FIRST UX) ----------
// Instead of a sequential engine-chosen interview, the UI shows the chosen family's checklist as a
// list of VIRTUES — things a sound argument does ("engages the actual claim", "gives reasons beyond
// a feeling"). The user looks for what HOLDS UP. Each virtue is 3-state:
//   • affirmed ("✓ it does this")  → that question = "no"  → evidence FOR validity
//   • denied   ("✗ it doesn't")    → that question = "yes" → evidence for the fallacy
//   • skipped  (left blank)        → no signal (the user didn't judge that dimension)
// This is "innocent until proven otherwise" expressed in the *interaction*: the user is a fair juror
// confirming soundness, not a prosecutor hunting flaws. A fallacy is suspected only where a virtue
// is actively marked ABSENT. Skipping costs nothing (charitable default).
//
// It feeds the SAME Bayesian engine, restricted to the family's fallacies + VALID, so VALID only
// competes against 3-4 candidates — the "drowning" problem of the flat sequential flow is gone. The
// accusation gate and 0-false-accusation guarantee are unchanged.
//
//   familyId   : key in data.families, or null/"none" for "seems fine / none of these"
//   affirmed   : question ids the user marked as virtues the argument HAS (→ "no", pro-VALID)
//   denied     : question ids the user marked as virtues the argument LACKS (→ "yes", pro-fallacy)
//   (anything not in either list is skipped = no signal)
// Returns a verdict in the same shape as checkStop(): { kind, fallacy?, confirm_check?, beliefs }.
export function scoreChecklist(data, { familyId, affirmed = [], denied = [], seed } = {}) {
  const state = newSession(data, seed);

  // "none of these / seems fine" — the user surveyed and saw no problem. That IS the goodwill
  // outcome: nothing to score, the argument stands.
  if (!familyId || familyId === 'none') {
    return { kind: 'cynic_valid', beliefs: beliefs(state), leanFallacy: null };
  }

  // Affirmed virtues exonerate (answer "no"); denied virtues incriminate (answer "yes"); skipped
  // virtues contribute nothing. With nothing denied, no fallacy can clear the gate → the argument
  // holds up. It takes ~two denied virtues of the same fallacy to raise a tentative suspicion.
  for (const qid of affirmed) {
    if (data.questions.find((x) => x.id === qid)) answer(state, qid, 'no');
  }
  for (const qid of denied) {
    if (data.questions.find((x) => x.id === qid)) answer(state, qid, 'yes');
  }

  // Restrict the verdict to this family: the leading fallacy must belong to familyId. We reuse the
  // full Bayesian beliefs (all hypotheses stay normalized), but only consider this family's members
  // as accusation candidates — that's what the routing bought us.
  const famIds = new Set(data.families[familyId] || []);
  const P = beliefs(state);
  const fIds = Object.keys(P).filter((h) => h !== 'VALID' && famIds.has(h));
  const ranked = fIds.map((f) => [f, P[f]]).sort((a, b) => b[1] - a[1]);
  const [f1, p1] = ranked[0] || [null, 0];
  const p2 = ranked[1] ? ranked[1][1] : 0;
  const pv = P.VALID;

  // Relative gate (§3.1) evaluated within the family, with the gentler checklist VALID ratio.
  if (f1 &&
      p1 >= CONFIG.CHECKLIST_RATIO_VALID * pv &&
      p1 >= CONFIG.MIN_ACCUSE_MASS &&
      p1 >= CONFIG.RATIO_RUNNERUP * (p2 || CONFIG.EPS)) {
    return { kind: 'accuse', fallacy: f1, confirm_check: data.fallacies[f1].confirm_check, beliefs: P, state };
  }
  // A family member leads VALID but didn't clear the gate → tentative lean, never an accusation.
  if (f1 && p1 > pv && p1 >= CONFIG.RATIO_RUNNERUP * (p2 || CONFIG.EPS)) {
    return { kind: 'inconclusive_lean', leanFallacy: f1, beliefs: P, state };
  }
  // Nothing rose above the benefit of the doubt → the argument holds up.
  return { kind: 'cynic_valid', leanFallacy: null, beliefs: P, state };
}

// Scan a pasted argument for family routing cues (plain case-insensitive substring match — no AI).
// Returns families ranked by cue hits, for "suggest, don't decide" routing. data.familyCues is the
// {familyId: [cue strings]} map loaded from data/families.json.
export function suggestFamily(data, text) {
  const hay = String(text || '').toLowerCase();
  const scores = {};
  for (const [fam, cues] of Object.entries(data.familyCues || {})) {
    scores[fam] = (cues || []).reduce((n, cue) => n + (hay.includes(cue.toLowerCase()) ? 1 : 0), 0);
  }
  const ranked = Object.entries(scores).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return { top: ranked[0]?.[0] ?? null, scores };
}
