/**
 * 从领域图谱的 nodes.yml / edges.yml 生成 concept-tree 词条种子。
 * 运行：node tree/build-terms.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const nodes = parse(readFileSync(resolve(ROOT, 'apps/web/src/data/atlas/nodes.yml'), 'utf8'));
const edges = parse(readFileSync(resolve(ROOT, 'apps/web/src/data/atlas/edges.yml'), 'utf8'));

const adj = new Map(nodes.map((n) => [n.id, []]));
for (const e of edges) {
  adj.get(e.source)?.push(e.target);
  adj.get(e.target)?.push(e.source);
}

function catOf(n) {
  if (n.type === 'data') return 'data';
  if (n.id === 'binder') return 'design';
  if (n.id === 'proteinmpnn' || n.id === 'esm3') return 'sequence';
  if (n.type === 'concept') return 'eval';
  if (n.era === 'agent') return 'agents';
  if (n.era === 'validation') return 'validation';
  if (n.era === 'design') return 'design';
  return 'structure';
}
const levelOf = (n) => (n.weight >= 8 ? 1 : n.weight >= 6 ? 2 : 3);

const byCat = new Map();
for (const n of nodes) {
  const c = catOf(n);
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(n.id);
}

const terms = nodes.map((n) => {
  const cat = catOf(n);
  let rel = [...new Set(adj.get(n.id) || [])].filter((x) => x !== n.id).slice(0, 8);
  if (rel.length < 2) {
    for (const other of byCat.get(cat) || []) {
      if (other !== n.id && !rel.includes(other)) rel.push(other);
      if (rel.length >= 2) break;
    }
  }
  if (rel.length < 2) {
    for (const root of ['alphafold2', 'rfdiffusion', 'binder']) {
      if (root !== n.id && !rel.includes(root)) rel.push(root);
      if (rel.length >= 2) break;
    }
  }
  const catName = {
    structure: '结构预测与表征', design: '生成与设计', sequence: '序列与表征',
    eval: '评估与筛选', validation: '实验与验证', agents: '基础模型与智能体', data: '数据与工具',
  }[cat];
  const body = [`它在知识树中的位置是「${catName}」；相关节点列在下方，可以沿着继续点。`];
  return {
    id: n.id,
    term: n.label,
    aka: n.label_en && n.label_en !== n.label ? [n.label_en] : [],
    cat,
    level: levelOf(n),
    one: n.summary,
    body,
    rel,
    why: '',
    evidence: n.doi ? `DOI: ${n.doi}` : n.url || '',
  };
});

// 保证每个词条都从根可达：不可达的词条由任一可达词条补一条出边
const roots = new Set(['alphafold2', 'rfdiffusion', 'scorpion_binders']);
const reachable = new Set(roots);
let changed = true;
while (changed) {
  changed = false;
  for (const t of terms) {
    if (!reachable.has(t.id)) continue;
    for (const r of t.rel) if (!reachable.has(r)) reachable.add(r);
  }
}
for (const t of terms) {
  if (reachable.has(t.id)) continue;
  const donor = terms.find((d) => reachable.has(d.id) && d.id !== t.id);
  if (donor && !donor.rel.includes(t.id)) {
    donor.rel.push(t.id);
    reachable.add(t.id);
  }
}

writeFileSync(resolve(ROOT, 'tree/glossary/batch_01.json'), JSON.stringify(terms, null, 2) + '\n', 'utf8');
console.log(`写入 ${terms.length} 个词条 · ${new Set(terms.map((t) => t.cat)).size} 个分类`);
