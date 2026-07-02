// Routing measurement: how often do the cue scanners route a pasted argument well?
// Reports, for a labeled corpus:
//   - suggestFamily / suggestBucket: gate-open rate, correctness when open, false opens on VALID
//   - suggestMoves (home family, pick-content fallacies only): truth top-scored / surfaced (top-3)
// The gates are DESIGNED to stay shut when unsure (better no suggestion than a misroute), so low
// open rates are not failures; open-but-wrong and VALID opens are the numbers that must stay ~0.
//
// Usage: node tools/routing-measure.mjs [corpus.json]   (default: data/fixtures.json)
// Accepts either fixtures format ({fixtures:[{id,label,argument}]}) or corpus ({cases:[...]}).
// ponytail: a report, not a test; thresholds live in the humans reading it.

import { readFileSync } from 'node:fs';
import { loadData, suggestFamily, suggestBucket, suggestMoves } from '../src/engine.js';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const root = new URL('../', import.meta.url);
const data = loadData(
  read(new URL('data/fallacies.json', root)),
  read(new URL('data/questions.json', root)),
  null,
  read(new URL('data/families.json', root)),
);
const src = process.argv[2] || 'data/fixtures.json';
const doc = read(new URL(src, root));
const cases = doc.cases || doc.fixtures;

const famOf = (l) => l === 'VALID' ? null : data.fallacies[l]?.family;
const bucketOf = (l) => l === 'VALID' ? null : data.familyMeta[famOf(l)]?.bucket;

const F = { n: 0, famOpen: 0, famRight: 0, bktOpen: 0, bktRight: 0 };
const V = { n: 0, famOpen: 0, bktOpen: 0 };
const M = { n: 0, top: 0, surfaced: 0, misses: [] };
const famMisses = [];

for (const c of cases) {
  const sf = suggestFamily(data, c.argument).top;
  const sb = suggestBucket(data, c.argument).top;
  if (c.label === 'VALID') {
    V.n++;
    if (sf) { V.famOpen++; famMisses.push(`${c.id}: VALID but family gate opened -> ${sf}`); }
    if (sb) V.bktOpen++;
    continue;
  }
  F.n++;
  if (sf) { F.famOpen++; if (sf === famOf(c.label)) F.famRight++; else famMisses.push(`${c.id}: opened wrong family ${sf} (true: ${famOf(c.label)})`); }
  if (sb) { F.bktOpen++; if (sb === bucketOf(c.label)) F.bktRight++; }
  if (data.fallacies[c.label]?.pick_label) {
    M.n++;
    const { surfaced, moves } = suggestMoves(data, famOf(c.label), c.argument);
    if (moves[0]?.fid === c.label && moves[0].score > 0) M.top++;
    if (surfaced.includes(c.label)) M.surfaced++;
    else if (M.misses.length < 15) M.misses.push(`${c.id}: home room shows [${surfaced.join(', ')}]`);
  }
}

console.log(`corpus: ${src} (${cases.length} cases: ${F.n} fallacy, ${V.n} VALID)`);
console.log(`suggestFamily on fallacies: open ${F.famOpen}/${F.n}, correct ${F.famRight}/${F.famOpen || 1} of opens`);
console.log(`suggestBucket on fallacies: open ${F.bktOpen}/${F.n}, correct ${F.bktRight}/${F.bktOpen || 1} of opens`);
console.log(`false opens on VALID: family ${V.famOpen}/${V.n}, bucket ${V.bktOpen}/${V.n}   (must stay ~0)`);
console.log(`suggestMoves in home family (${M.n} pick-content cases): truth top ${M.top}, truth in surfaced ${M.surfaced}`);
for (const m of famMisses) console.log('  ! ' + m);
for (const m of M.misses) console.log('  ~ ' + m);
