/**
 * 预筛：关键词权重 + 来源/期刊加成 → data/inbox/<date>.json
 * 只决定「哪些条目值得人看」，不决定「写什么」。
 */
import { resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { readYamlFile, readJson, writeJson, todayISO, log } from './lib/util.mjs';

const kw = readYamlFile(resolve('config/keywords.yml'));
const argDate = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];
const rawRoot = resolve('data/raw');
const date =
  argDate ??
  (existsSync(resolve(rawRoot, todayISO()))
    ? todayISO()
    : readdirSync(rawRoot)
        .filter((d) => existsSync(resolve(rawRoot, d, 'all.json')))
        .sort()
        .pop());

if (!date) {
  console.error('没有可用的 data/raw/<date>/all.json，请先运行 npm run fetch');
  process.exit(1);
}

const raw = readJson(resolve(rawRoot, date, 'all.json'), []);
const meta = readJson(resolve(rawRoot, date, 'meta.json'), {});
const lower = (s) => String(s ?? '').toLowerCase();
const hasAny = (text, list) => list.filter((k) => text.includes(lower(k)));
const MIN_SCORE = 8;

const CATEGORY_RULES = [
  ['experiments', ['assay', 'spr', 'bli', 'elisa', 'cryo-em', 'crystal structure', 'binding affinity', 'expression', 'purification', 'in vivo', 'in vitro', 'yeast display', 'hit rate']],
  ['tools', ['github', 'open-source', 'open source', 'we present', 'web server', 'software', 'pipeline', 'toolkit', 'database']],
  ['design', ['binder', 'miniprotein', 'de novo', 'antibody', 'nanobody', 'scaffold', 'epitope', 'hotspot']],
  ['methods', ['diffusion', 'language model', 'inverse folding', 'neural network', 'transformer', 'benchmark', 'algorithm']],
  ['industry', ['company', 'startup', 'funding', 'clinical', 'partnership', 'licensing']],
  ['commentary', ['review', 'perspective', 'commentary', 'opinion', 'outlook']],
];

function venueBonus(venue) {
  const v = lower(venue);
  const keys = Object.keys(kw.venue_bonus ?? {}).sort((a, b) => b.length - a.length);
  for (const k of keys) if (v.includes(k)) return { value: kw.venue_bonus[k], label: k };
  return { value: 0, label: null };
}

function classify(text) {
  for (const [cat, words] of CATEGORY_RULES) if (words.some((w) => text.includes(w))) return cat;
  return 'methods';
}

function suggestProjects(text) {
  const p = [];
  if (/(binder|minibody|miniprotein|de novo|antibody|nanobody|epitope|hotspot|protein design)/.test(text)) p.push('P2');
  if (/(sequence screening|screening|subunit|theta|θ|homolog|alignment|residue conservation|variant)/.test(text)) p.push('P1');
  return p;
}

const scored = raw.map((it) => {
  const text = `${lower(it.title)} ${lower(it.abstract)}`;
  const core = hasAny(text, kw.core ?? []);
  const method = hasAny(text, kw.method ?? []);
  const context = hasAny(text, kw.context ?? []);
  const protein = hasAny(text, kw.protein_context ?? []);
  const excluded = hasAny(text, kw.exclude ?? []);
  const vb = venueBonus(it.venue);
  const sb = kw.source_bonus?.[it.source] ?? 0;

  let score = 0;
  if (protein.length) {
    score =
      Math.min(core.length, 3) * 5 +
      Math.min(method.length, 4) * 3 +
      Math.min(context.length, 3) * 1 +
      vb.value +
      sb;
  }
  if (!protein.length) score = 0;
  if (excluded.length && core.length === 0) score = 0;

  return {
    ...it,
    score,
    pass: score >= MIN_SCORE,
    category: classify(text),
    projectsSuggested: suggestProjects(text),
    reasons: {
      core: core.slice(0, 6),
      method: method.slice(0, 6),
      context: context.slice(0, 4),
      venue: vb.label ? `${vb.label} (+${vb.value})` : null,
      source: `${it.source} (+${sb})`,
      excluded: excluded.slice(0, 3),
    },
  };
});

scored.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
const passed = scored.filter((s) => s.pass);
const top = scored.slice(0, 80);

const byCategory = {};
for (const it of passed) byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;

const payload = {
  date,
  generatedAt: new Date().toISOString(),
  threshold: MIN_SCORE,
  counts: { total: scored.length, passed: passed.length, byCategory },
  ingest: meta.counts ?? {},
  errors: meta.errors ?? [],
  items: top,
};

writeJson(resolve('data/inbox', `${date}.json`), payload);
writeJson(resolve('data/inbox', 'latest.json'), payload);

log(`triage ${date}: ${scored.length} → ${passed.length} 条越线（阈值 ${MIN_SCORE}）`);
for (const [cat, n] of Object.entries(byCategory)) log(`  ${cat}: ${n}`);
log('前 10 条：');
for (const it of top.filter((x) => x.pass).slice(0, 10)) {
  const src = it.venue ? ` · ${it.venue}` : '';
  log(`  [${String(it.score).padStart(2)}] ${it.title.slice(0, 88)}${src}`);
}
