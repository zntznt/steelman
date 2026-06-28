// Steelman inference engine.
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
  // confident denials of the SAME fallacy tentatively accuse, while one denial still can't.
  CHECKLIST_RATIO_VALID: 0.12, // Evaluated PER-FALLACY in its own isolated {VALID, F} world (see
                               // scoreChecklist — each fallacy scored only from its own tells, so
                               // siblings can't dilute it; panel fix C-1). Sits at the midpoint of
                               // the measured window for the current 73-fallacy / 21-family bank:
                               // one denied own-tell tops out at f/VALID ≈ 0.06, two denied bottoms
                               // out at ≈ 0.15 (appeal_to_nature; max ≈ 0.22). 0.12 sits between the
                               // windows — safe margin both sides. The value shifts as the catalog grows, so
                               // RE-MEASURE and re-center when it changes a lot: a script that prints
                               // max(1-own-denial) and min(2-own-denial) isolated f/VALID across all
                               // fallacies; the midpoint is the right gate.

  // Cue routing (suggestFamily/suggestBucket). Scores are specificity-weighted: a cue listed by N
  // families is worth 1/N. Only suggest when the top family clears a real signal AND clearly beats
  // the runner-up — better to show the full picker than to confidently misroute (panel M-1).
  CUE_MIN_SCORE: 0.5,     // top weighted score must reach this to surface a suggestion
  CUE_MIN_MARGIN: 1.3,    // ...and be ≥ this × the runner-up family's score

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

    // G8b (warn): distinctiveness. If two fallacies tie for the TOP "yes" weight on a question at the
    // strong tier (≥ 4.0), the engine can't tell them apart from this question — denying it splits
    // evidence and the runner-up gate may never clear, yielding "not sure" where a name was wanted.
    // Not a hard error: the engine degrades to an honest lean (never a false accusation), and an
    // author may legitimately share a strong signal and rely on OTHER tells to separate the pair.
    // Surface it so they can give one fallacy a distinctive tell. (See guidance/WHY-THESE-WEIGHTS.md.)
    if (fallacyKeys.length >= 2) {
      const top = Math.max(...fallacyKeys.map((k) => lr[k].yes));
      if (top >= 4.0) {
        const tied = fallacyKeys.filter((k) => lr[k].yes === top);
        if (tied.length >= 2) {
          warns.push(`G8b: question ${q.id} — ${tied.join(' & ')} tie at the top yes-weight ${top}; they’ll be hard to tell apart here. Give one a more distinctive tell.`);
        }
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
  // families.json (optional): display metadata + bucket + routing cues + checklist tells.
  const familyMeta = {};
  const familyCues = {};
  const buckets = (familiesJSON && familiesJSON.buckets) || [];   // [{id,name,prompt}] for the 2-level picker
  const bucketFamilies = {};                                      // bucket-id → [family ids]
  const tells = (familiesJSON && familiesJSON.tells) || {};
  if (familiesJSON && Array.isArray(familiesJSON.families)) {
    for (const fm of familiesJSON.families) {
      familyMeta[fm.id] = { id: fm.id, name: fm.name, prompt: fm.prompt, bucket: fm.bucket || null };
      familyCues[fm.id] = fm.cues || [];
      if (fm.bucket) (bucketFamilies[fm.bucket] ||= []).push(fm.id);
    }
  }
  return { H, fallacies, families, familyMeta, familyCues, buckets, bucketFamilies, tells, questions, fixtures: fixturesJSON, warnings };
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

  // "none of these / seems fine" — the user surveyed the families and saw no problem worth checking.
  // Nothing was inspected, so this is "not defeated", not "positively confirmed" → cynic_valid.
  if (!familyId || familyId === 'none') {
    return { kind: 'cynic_valid', beliefs: beliefs(state), leanFallacy: null };
  }

  // m-1: a holds-up verdict means two different things and deserves two labels. If the user actively
  // AFFIRMED virtues (ticked ✓ "it does this"), the argument is POSITIVELY justified → valid_earned.
  // If they mostly skipped / denied-but-not-enough, it's merely not-defeated → cynic_valid. ≥2
  // affirmations is the bar for "earned" (one tick is a weak vouch).
  const holdsUpKind = affirmed.length >= 2 ? 'valid_earned' : 'cynic_valid';

  // ---- PER-FALLACY scoring (fixes the sibling-affirmation whitewash, panel finding C-1) ----
  // The old approach poured every affirm/deny answer into ONE shared belief state, so honestly
  // affirming a sibling's virtues ("it didn't strawman, didn't tu quoque…") raised VALID and
  // drowned the real denials of the guilty fallacy. The fix: score EACH fallacy in its own isolated
  // two-hypothesis world {VALID, F}, using ONLY the answers to F's own tells. A fallacy's suspicion
  // then can't be diluted (or inflated) by what the user said about its siblings. This mirrors the
  // family-local renormalization (cross-family isolation) one level deeper: per-fallacy isolation.
  const deniedSet = new Set(denied);
  const affirmedSet = new Set(affirmed);
  const famIds = (data.families[familyId] || []);

  // m-6: warn (dev only) if an affirmed/denied qid isn't a real question at all — that's a typo, and
  // the qid would otherwise vanish silently and read as "holds up". A qid that IS a valid question
  // but isn't this family's tell is NOT a typo: the engine is correctly ignoring an answer that
  // doesn't bear on these fallacies, so it stays quiet. Never throws — a stray must never break a session.
  if (typeof console !== 'undefined' && console.warn) {
    const knownQids = new Set((data.questions || []).map((q) => q.id));
    const unknown = [...affirmedSet, ...deniedSet].filter((q) => !knownQids.has(q));
    if (unknown.length) console.warn(`scoreChecklist: ${unknown.length} unknown qid(s) ignored (not in questions.json): ${unknown.join(', ')}`);
  }

  // For one fallacy: a fresh 2-hypothesis session, apply only THIS fallacy's tell answers, return
  // its renormalized P(F) / P(VALID) share within {VALID, F}.
  function scoreFallacy(fid) {
    const tellQids = (data.tells[fid] || []).map((t) => t.qid);
    const s = newSession(data, seed);
    let deniedCount = 0;
    for (const qid of tellQids) {
      if (deniedSet.has(qid)) { answer(s, qid, 'yes'); deniedCount++; }
      else if (affirmedSet.has(qid)) { answer(s, qid, 'no'); }
    }
    const raw = beliefs(s);
    const Z = raw[fid] + raw.VALID || 1;     // isolate to {VALID, F}
    return { fid, p: raw[fid] / Z, pv: raw.VALID / Z, deniedCount };
  }

  const scored = famIds.map(scoreFallacy).sort((a, b) => b.p - a.p);
  const top = scored[0];
  const runner = scored[1];

  // beliefs snapshot for callers/tests: each fallacy's isolated share + VALID = min isolated share
  const P = { VALID: top ? top.pv : 1 };
  for (const sc of scored) P[sc.fid] = sc.p;

  if (!top || top.p < CONFIG.CHECKLIST_RATIO_VALID * top.pv) {
    // No single fallacy's own virtues were denied enough to beat innocence. But an argument with
    // failures spread across SEVERAL distinct fallacies (panel finding C-3) is less sound, not
    // sound: ≥2 distinct fallacies each with a denied virtue → an honest lean toward the strongest,
    // never "holds up". One denial of one fallacy alone still correctly holds up.
    const denCount = scored.filter((sc) => sc.deniedCount > 0).length;
    if (denCount >= 2) {
      return { kind: 'inconclusive_lean', leanFallacy: top.fid, beliefs: P, state };
    }
    return { kind: holdsUpKind, leanFallacy: null, beliefs: P, state };
  }

  // Innocence is beaten for the leader. Accuse only if it clearly dominates the runner-up fallacy's
  // OWN score too (we know WHICH one). If a second fallacy is independently suspected (C-3: two
  // distinct fallacies), the runner-up ratio won't clear → an honest lean, never "sound".
  const runnerP = runner ? runner.p : 0;
  if (top.p >= CONFIG.RATIO_RUNNERUP * (runnerP || CONFIG.EPS)) {
    return { kind: 'accuse', fallacy: top.fid, confirm_check: data.fallacies[top.fid].confirm_check, beliefs: P, state };
  }
  return { kind: 'inconclusive_lean', leanFallacy: top.fid, beliefs: P, state };
}

// Cue inverse-document-frequency: a cue listed by N families is worth 1/N. Generic words like
// "if"/"either" that several families claim get heavily discounted so they stop stealing arguments
// (panel finding M-1: such cues were false attractors). Cached per data object.
function cueWeights(data) {
  if (data._cueWeights) return data._cueWeights;
  const famCount = {};
  for (const cues of Object.values(data.familyCues || {})) {
    for (const c of (cues || [])) { const k = c.toLowerCase(); famCount[k] = (famCount[k] || 0) + 1; }
  }
  const w = {};
  for (const k in famCount) w[k] = 1 / famCount[k];
  data._cueWeights = w;
  return w;
}

// Scan a pasted argument for family routing cues (plain case-insensitive substring match — no AI).
// Scores each family by the SPECIFICITY-WEIGHTED sum of its matched cues (a cue shared by N families
// counts 1/N). Only returns a suggestion when the top score clears CUE_MIN_SCORE *and* clearly beats
// the runner-up (CUE_MIN_MARGIN) — otherwise null, and the UI just shows the full picker. Better to
// suggest nothing than to confidently misroute (the panel showed wrong suggestions steer novices).
export function suggestFamily(data, text) {
  const hay = String(text || '').toLowerCase();
  const w = cueWeights(data);
  const scores = {}; const hits = {};
  for (const [fam, cues] of Object.entries(data.familyCues || {})) {
    let score = 0, n = 0;
    for (const cue of (cues || [])) {
      if (hay.includes(cue.toLowerCase())) { score += w[cue.toLowerCase()] || 0; n++; }
    }
    scores[fam] = score; hits[fam] = n;
  }
  const ranked = Object.entries(scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked[0], second = ranked[1];
  // confidence gate: enough signal, and a clear winner over the runner-up
  const confident = top
    && top[1] >= CONFIG.CUE_MIN_SCORE
    && top[1] >= CONFIG.CUE_MIN_MARGIN * (second ? second[1] : 0);
  return { top: confident ? top[0] : null, scores, hits };
}

// Suggest a BUCKET (top-level of the 2-level picker) by summing its families' specificity-weighted
// cue scores. Same confidence gate. Returns {top, scores}.
export function suggestBucket(data, text) {
  const { scores: famScores } = suggestFamily(data, text);
  const scores = {};
  for (const [fam, s] of Object.entries(famScores)) {
    const bucket = data.familyMeta[fam]?.bucket;
    if (bucket) scores[bucket] = (scores[bucket] || 0) + s;
  }
  const ranked = Object.entries(scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked[0], second = ranked[1];
  const confident = top
    && top[1] >= CONFIG.CUE_MIN_SCORE
    && top[1] >= CONFIG.CUE_MIN_MARGIN * (second ? second[1] : 0);
  return { top: confident ? top[0] : null, scores };
}

// Surface the most likely SIBLING FALLACIES ("moves") within a chosen family, so the UI can show a
// short "which of these is it doing?" pick instead of the full virtue checklist. Each fallacy is
// scored by how many of its plain-language `cues` (everyday trigger phrases, authored per fallacy)
// appear in the pasted argument. This is the bucket/family cue routing pushed one level deeper.
// Measured to surface the right move first ~9/10 on the hardest 8-fallacy family, vs ~2/6 for the
// abstract tell-row relevance heuristic (see guidance/CHECKLIST-LENGTH-INVESTIGATION.md). Pure, no AI.
//
//   returns { moves: [{fid, score}], surfaced: [fid...], residual: fid, allZero: bool }
//   - moves:    every family fallacy with its cue score, score-descending (ties keep catalog order)
//   - surfaced: the top fallacies to show first. All positive-scorers tied at the top are kept (a
//               multi-move argument legitimately surfaces 2+), capped at `limit`. When nothing scores,
//               surfaced is just [residual].
//   - residual: the family's catch-all (its first/most-general fallacy, e.g. red_herring for
//               deflection), used as the default when no cue matches.
export function suggestMoves(data, familyId, text, limit = 3) {
  const fids = data.families[familyId] || [];
  const hay = ' ' + String(text || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const moves = fids.map((fid) => {
    const cues = data.fallacies[fid]?.cues || [];
    let score = 0;
    for (const cue of cues) if (hay.includes(' ' + cue.toLowerCase() + ' ') || hay.includes(cue.toLowerCase())) score++;
    return { fid, score };
  }).sort((a, b) => b.score - a.score);   // stable: equal scores keep catalog order

  const residual = fids[0] || null;       // first fallacy = the family's most general / catch-all move
  const top = moves[0]?.score || 0;
  const allZero = top === 0;
  let surfaced;
  if (allZero) {
    surfaced = residual ? [residual] : [];
  } else {
    // keep everything tied at the top, then fill toward `limit` with the next-highest scorers
    const tiedTop = moves.filter((m) => m.score === top).map((m) => m.fid);
    const rest = moves.filter((m) => m.score < top && m.score > 0).map((m) => m.fid);
    surfaced = [...tiedTop, ...rest].slice(0, Math.max(limit, tiedTop.length));
  }
  return { moves, surfaced, residual, allZero };
}
