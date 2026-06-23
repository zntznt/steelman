// Merge a catalog-expansion workflow result into data/{fallacies,questions,families}.json.
// Usage: node tools/merge-catalog.mjs <workflow-result.json>
//   where the JSON is { families: [ { fam, bucket, fallacies: [ {id,name,base_rate,short,
//   teaching,confirm_check,questions:[{id,text,yes,no}],tells:[{qid,text}]} ] } ] }
//
// Deterministic + idempotent-ish: it MERGES new fallacies into the existing data (keeping the
// shipped 13), assigns each its family, appends its 2 distinctive questions, and adds its tells +
// family metadata/cues from data/taxonomy.json. Re-running with the same input is safe (it skips
// ids already present). Run the test suite afterward — this script does not validate.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rd = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const wr = (p, o) => writeFileSync(join(root, p), JSON.stringify(o, null, 2) + '\n');

const resultPath = process.argv[2];
if (!resultPath) { console.error('usage: node tools/merge-catalog.mjs <result.json>'); process.exit(1); }
const result = JSON.parse(readFileSync(resultPath, 'utf8'));

const fallacies = rd('data/fallacies.json');
const questions = rd('data/questions.json');
const families = rd('data/families.json');
const taxonomy = rd('data/taxonomy.json');

const haveFallacy = new Set(fallacies.fallacies.map((f) => f.id));
const haveQuestion = new Set(questions.questions.map((q) => q.id));
const taxByFam = Object.fromEntries(taxonomy.families.map((f) => [f.id, f]));

let addedF = 0, addedQ = 0, addedT = 0, skipped = 0;
const problems = [];

// Sync the bucket list from taxonomy → families.json so any new bucket (e.g. "logic") gets its
// display metadata embedded. Without this, a new family's bucket would have no name/prompt and the
// 2-level picker couldn't render it. (This is the gap that bit batch 2.)
if (Array.isArray(taxonomy.buckets)) {
  families.buckets = taxonomy.buckets.map((b) => ({ id: b.id, name: b.name, prompt: b.prompt }));
}

for (const famGroup of result.families || []) {
  const famId = famGroup.fam;
  // ensure the family exists in families.json (metadata + cues from taxonomy)
  if (!families.families.some((f) => f.id === famId)) {
    const tx = taxByFam[famId];
    if (!tx) { problems.push(`no taxonomy entry for family ${famId}`); continue; }
    families.families.push({ id: famId, name: tx.name, prompt: tx.prompt, bucket: tx.bucket, cues: tx.cues || [] });
  }

  for (const fal of famGroup.fallacies || []) {
    if (haveFallacy.has(fal.id)) { skipped++; continue; }   // already shipped — leave it
    // 1. fallacy entry
    fallacies.fallacies.push({
      id: fal.id, name: fal.name, base_rate: fal.base_rate ?? 1.0, family: famId,
      short: fal.short, teaching: fal.teaching, confirm_check: fal.confirm_check,
    });
    haveFallacy.add(fal.id); addedF++;

    // 2. its 2 distinctive questions
    for (const q of fal.questions) {
      if (haveQuestion.has(q.id)) { problems.push(`dup question id ${q.id} (fallacy ${fal.id})`); continue; }
      questions.questions.push({
        id: q.id, text: q.text, tags: ['entry'],   // tag entry so legacy coverage stays satisfiable
        lr: { [fal.id]: { yes: q.yes ?? 4.5, no: q.no ?? 0.3 }, VALID: { yes: 0.6, no: 1.4 } },
      });
      haveQuestion.add(q.id); addedQ++;
    }

    // 3. its tells
    families.tells = families.tells || {};
    families.tells[fal.id] = fal.tells.map((t) => ({ qid: t.qid, text: t.text }));
    addedT += fal.tells.length;
  }
}

// stamp the family member lists onto taxonomy for reference (optional, harmless)
wr('data/fallacies.json', fallacies);
wr('data/questions.json', questions);
wr('data/families.json', families);

console.log(`merged: +${addedF} fallacies, +${addedQ} questions, +${addedT} tells; skipped ${skipped} existing`);
console.log(`totals now: ${fallacies.fallacies.length} fallacies, ${questions.questions.length} questions, ${families.families.length} families`);
if (problems.length) { console.log('PROBLEMS:'); for (const p of problems) console.log('  - ' + p); }
