/**
 * 内容校验：frontmatter、引用编号、图谱连通性。
 * 用法：npm run validate
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { log, todayISO, normTitle } from './lib/util.mjs';

const errors = [];
const warnings = [];
const CATS = ['methods', 'design', 'experiments', 'tools', 'industry', 'commentary'];
const PROJECTS = ['P1', 'P2'];
const EVIDENCE = ['peer-reviewed', 'preprint', 'report', 'news', 'review'];

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    return parseYaml(m[1]);
  } catch (e) {
    return { __error: e.message };
  }
}

function filesIn(dir) {
  const p = resolve(dir);
  return existsSync(p) ? readdirSync(p).filter((f) => f.endsWith('.mdx')) : [];
}

/* ---------- 速递 ---------- */
const briefFiles = filesIn('src/content/briefs');
const issues = new Map();
const itemUrls = new Map();
let briefCount = 0;
for (const f of briefFiles) {
  const src = readFileSync(resolve('src/content/briefs', f), 'utf8');
  const fm = frontmatter(src);
  const where = `briefs/${f}`;
  if (!fm || fm.__error) {
    errors.push(`${where}: frontmatter 解析失败 ${fm?.__error ?? ''}`);
    continue;
  }
  briefCount++;
  for (const key of ['title', 'issue', 'date', 'summary', 'items']) {
    if (fm[key] === undefined || fm[key] === null || fm[key] === '') errors.push(`${where}: 缺少 ${key}`);
  }
  if (!Number.isInteger(fm.issue) || fm.issue < 1) errors.push(`${where}: issue 必须是正整数`);
  if (issues.has(fm.issue)) errors.push(`${where}: issue ${fm.issue} 与 ${issues.get(fm.issue)} 重复`);
  issues.set(fm.issue, where);
  if (!Array.isArray(fm.items) || fm.items.length === 0) {
    errors.push(`${where}: items 不能为空`);
  } else {
    fm.items.forEach((it, i) => {
      const at = `${where} items[${i}]`;
      for (const key of ['title', 'url', 'source', 'category', 'tldr']) {
        if (!it[key]) errors.push(`${at}: 缺少 ${key}`);
      }
      if (it.url && !/^https?:\/\//.test(it.url)) errors.push(`${at}: url 必须是 http(s)`);
      if (it.category && !CATS.includes(it.category)) errors.push(`${at}: category 非法 (${it.category})`);
      for (const p of it.projects ?? []) if (!PROJECTS.includes(p)) errors.push(`${at}: project 非法 (${p})`);
      if (it.doi && !/^10\.\d{4,9}\//.test(it.doi)) errors.push(`${at}: DOI 格式可疑 (${it.doi})`);
      if (it.url) {
        if (itemUrls.has(it.url)) warnings.push(`${at}: 与 ${itemUrls.get(it.url)} 重复的 url`);
        itemUrls.set(it.url, where);
      }
    });
  }
  if (fm.date) {
    const d = new Date(fm.date);
    if (Number.isNaN(d.getTime())) errors.push(`${where}: date 非法`);
    else if (d > new Date(Date.now() + 86400000)) warnings.push(`${where}: date 在未来 (${fm.date})`);
  }
  if (!fm.draft && /待写|TODO|自动生成草稿/.test(src)) warnings.push(`${where}: 非草稿但仍含占位文本`);
}

/* ---------- 深度 ---------- */
const noteFiles = filesIn('src/content/notes');
let noteCount = 0;
for (const f of noteFiles) {
  const src = readFileSync(resolve('src/content/notes', f), 'utf8');
  const fm = frontmatter(src);
  const where = `notes/${f}`;
  if (!fm || fm.__error) {
    errors.push(`${where}: frontmatter 解析失败 ${fm?.__error ?? ''}`);
    continue;
  }
  noteCount++;
  for (const key of ['title', 'date', 'summary']) {
    if (!fm[key]) errors.push(`${where}: 缺少 ${key}`);
  }
  if (fm.evidence && !EVIDENCE.includes(fm.evidence)) errors.push(`${where}: evidence 非法`);
  for (const p of fm.projects ?? []) if (!PROJECTS.includes(p)) errors.push(`${where}: project 非法 (${p})`);
  if (fm.projectNotes) {
    for (const k of Object.keys(fm.projectNotes)) if (!['p1', 'p2'].includes(k)) errors.push(`${where}: projectNotes.${k} 非法`);
  }
  const cites = [...src.matchAll(/<Cite\s+n=\{(\d+)\}\s*\/>/g)].map((m) => Number(m[1]));
  const total = Array.isArray(fm.citations) ? fm.citations.length : 0;
  if (cites.length && !total) errors.push(`${where}: 正文有 Cite，但 citations 为空`);
  for (const n of cites) if (n < 1 || n > total) errors.push(`${where}: Cite n=${n} 超出 citations 范围 (1–${total})`);
  fm.citations?.forEach((c, i) => {
    if (!c.title) errors.push(`${where} citations[${i}]: 缺少 title`);
    if (c.doi && !/^10\.\d{4,9}\//.test(c.doi)) errors.push(`${where} citations[${i}]: DOI 格式可疑`);
    if (c.url && !/^https?:\/\//.test(c.url)) errors.push(`${where} citations[${i}]: url 非法`);
  });
  if (fm.summary && fm.summary.length > 220) warnings.push(`${where}: summary 超过 220 字（首页可能截断）`);
}

/* ---------- 图谱 ---------- */
let nodeCount = 0;
let edgeCount = 0;
try {
  const nodes = parseYaml(readFileSync(resolve('src/data/atlas/nodes.yml'), 'utf8')) ?? [];
  const edges = parseYaml(readFileSync(resolve('src/data/atlas/edges.yml'), 'utf8')) ?? [];
  nodeCount = nodes.length;
  edgeCount = edges.length;
  const ids = new Set();
  for (const n of nodes) {
    if (!n.id || !n.label || !n.type || !n.year || !n.era) errors.push(`atlas: 节点缺字段 ${JSON.stringify(n).slice(0, 80)}`);
    if (ids.has(n.id)) errors.push(`atlas: 节点 id 重复 (${n.id})`);
    ids.add(n.id);
    if (n.summary && n.summary.length < 20) warnings.push(`atlas: ${n.id} 的 summary 过短`);
  }
  for (const e of edges) {
    if (!ids.has(e.source)) errors.push(`atlas: 边 source 不存在 (${e.source})`);
    if (!ids.has(e.target)) errors.push(`atlas: 边 target 不存在 (${e.target})`);
  }
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  for (const n of nodes) if (!linked.has(n.id)) warnings.push(`atlas: ${n.id} 是孤立节点`);
} catch (e) {
  errors.push(`atlas: 解析失败 ${e.message}`);
}

/* ---------- 摘要 ---------- */
log(`速递 ${briefCount} 期 · 深度 ${noteCount} 篇 · 图谱 ${nodeCount} 节点 / ${edgeCount} 条边`);
log(`日期 ${todayISO()}`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} 条警告`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
if (errors.length) {
  console.log(`\n✗ ${errors.length} 条错误`);
  errors.forEach((e) => console.log(`  - ${e}`));
  process.exit(1);
}
log('✓ 校验通过');
