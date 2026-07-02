// Wrong-room safety sweep: can a user who lands in the WRONG family ever produce a wrong
// accusation? Walks every fixture through every family under several answer patterns and counts
// accusations whose named fallacy is not the fixture's ground truth.
//
// Answer patterns:
//   honest       : the fixture's ground-truth answers (its `answers` map, `default` fallback)
//   lazy-first2  : honest answers on only the first 2 checklist rows (UI weight order), rest skipped
//   deny-negative: deny every tell whose wording sounds negative, skip the rest (confused skimmer)
//   deny-first2  : deny the first 2 rows regardless (hostile clicker; measures the trust boundary,
//                  expected to accuse by design since the app trusts two independent denials)
//
// Usage: node tools/wrongroom-sweep.mjs [--corpus data/blind-corpus.json]
// Exit code 1 if honest, lazy-first2, or deny-negative produce any wrong accusation.
// ponytail: measurement script, prints a report; not a test-runner fixture.

import { readFileSync } from 'node:fs';
import { loadData, scoreChecklist } from '../src/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const data = loadData(read('data/fallacies.json'), read('data/questions.json'), null, read('data/families.json'));

const corpusArg = process.argv.indexOf('--corpus');
const fixtures = corpusArg > -1
  ? read(process.argv[corpusArg + 1]).cases.map((c) => ({ id: c.id, label: c.label, answers: {}, default: null, argument: c.argument }))
  : read('data/fixtures.json').fixtures;

const qText = Object.fromEntries(data.questions.map((q) => [q.id, q.text]));
const NEGATIVE = /(\bnot\b|n['’]t\b|\bwithout\b|\bfail|\bignor|\bdodg|\bavoid|\bmiss|\black|\binstead\b|\brather\b)/i;

// The fixture's honest answer for a question: explicit, else its default, else skip.
const honestAnswer = (fx, qid) => fx.answers?.[qid] ?? fx.default ?? null;

// Family checklist rows in UI order: de-duped tells, sorted by diagnostic weight (ui.js sort,
// minus the relevance tiebreak, which never changes which rows exist).
function familyRows(familyId) {
  const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));
  const seen = new Set();
  const rows = [];
  for (const fid of data.families[familyId]) {
    for (const t of data.tells[fid] || []) {
      if (seen.has(t.qid)) continue;
      seen.add(t.qid);
      const q = qById[t.qid];
      const w = q ? Math.max(...data.families[familyId].map((f) => (q.lr[f] && q.lr[f].yes) || 0)) : 0;
      rows.push({ qid: t.qid, text: t.text, w });
    }
  }
  rows.sort((a, b) => b.w - a.w);
  return rows;
}

// Turn a list of (qid -> 'yes'|'no'|skip) decisions into scoreChecklist input.
// Question-space 'yes' = the incriminating direction = the virtue is ABSENT = denied.
function toChecklist(decisions) {
  const affirmed = [], denied = [];
  for (const [qid, a] of decisions) {
    if (a === 'yes') denied.push(qid);
    else if (a === 'no') affirmed.push(qid);
  }
  return { affirmed, denied };
}

const patterns = {
  honest: (fx, rows) => rows.map((r) => [r.qid, honestAnswer(fx, r.qid)]),
  'lazy-first2': (fx, rows) => rows.slice(0, 2).map((r) => [r.qid, honestAnswer(fx, r.qid)]),
  'deny-negative': (fx, rows) => rows.map((r) => [r.qid, NEGATIVE.test(r.text) ? 'yes' : null]),
  'deny-first2': (fx, rows) => rows.slice(0, 2).map((r) => [r.qid, 'yes']),
};

const famOf = (label) => label === 'VALID' ? null : data.fallacies[label]?.family;
const results = {};   // pattern -> {walks, accusations, wrong, wrongCases[], homeCatch, homeTotal}

for (const [pname, decide] of Object.entries(patterns)) {
  const R = results[pname] = { walks: 0, wrong: 0, wrongCases: [], homeCatch: 0, homeTotal: 0 };
  for (const fx of fixtures) {
    // Skip patterns that need ground-truth answers when the corpus has none (blind corpus).
    if ((pname === 'honest' || pname === 'lazy-first2') && !Object.keys(fx.answers || {}).length && !fx.default) continue;
    for (const familyId of Object.keys(data.families)) {
      const rows = familyRows(familyId);
      // Walk 1: the family checklist. Walk 2..n: each move-confirm (only that fallacy's tells).
      const walks = [rows, ...data.families[familyId].map((fid) => {
        const own = new Set((data.tells[fid] || []).map((t) => t.qid));
        return rows.filter((r) => own.has(r.qid));
      })];
      for (const wrows of walks) {
        R.walks++;
        const v = scoreChecklist(data, { familyId, ...toChecklist(decide(fx, wrows)) });
        const home = familyId === famOf(fx.label);
        if (home && wrows === walks[0] && pname === 'honest') {
          R.homeTotal++;
          if (v.kind === 'accuse' && v.fallacy === fx.label) R.homeCatch++;
        }
        if (v.kind === 'accuse' && v.fallacy !== fx.label) {
          R.wrong++;
          if (R.wrongCases.length < 12) R.wrongCases.push(`${fx.id} in room ${familyId} -> accused ${v.fallacy}`);
        }
      }
    }
  }
}

let failed = false;
for (const [pname, R] of Object.entries(results)) {
  const guarded = pname !== 'deny-first2';   // deny-first2 documents the trust boundary, it is not a gate
  const bad = guarded && R.wrong > 0;
  failed ||= bad;
  console.log(`\n[${pname}] walks: ${R.walks}, wrong accusations: ${R.wrong}${bad ? '  << FAIL' : guarded ? '  (pass bar: 0)' : '  (informational: hostile clicks are trusted by design)'}`);
  if (pname === 'honest' && R.homeTotal) console.log(`  home-room catch: ${R.homeCatch}/${R.homeTotal}`);
  for (const c of R.wrongCases) console.log('  - ' + c);
  if (R.wrong > R.wrongCases.length) console.log(`  ... and ${R.wrong - R.wrongCases.length} more`);
}
process.exit(failed ? 1 : 0);
