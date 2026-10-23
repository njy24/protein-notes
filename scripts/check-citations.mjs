/**
 * 引用核验：抽取笔记中的 DOI，向 Crossref 确认可解析且标题匹配。
 * 用法：npm run check:cites [-- --offline]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { get, normTitle, log } from './lib/util.mjs';

const offline = process.argv.includes('--offline');
const notesDir = resolve('src/content/notes');
const notes = readdirSync(notesDir).filter((f) => f.endsWith('.mdx'));

const refs = [];
for (const f of notes) {
  const src = readFileSync(resolve(notesDir, f), 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  const fm = parseYaml(m[1]);
  (fm.citations ?? []).forEach((c, i) => {
    if (c.doi) refs.push({ file: f, n: i + 1, doi: c.doi, title: c.title, year: c.year });
  });
}

if (!refs.length) {
  log('没有需要核验的 DOI。');
  process.exit(0);
}
log(`待核验 DOI：${refs.length} 条${offline ? '（离线模式，仅列出）' : ''}`);

const uniq = [...new Map(refs.map((r) => [r.doi, r])).values()];
let failed = 0;
let warned = 0;

for (const r of uniq) {
  if (offline) {
    console.log(`  · ${r.doi}  ${r.title.slice(0, 60)}`);
    continue;
  }
  try {
    const w = (await get(`https://api.crossref.org/works/${encodeURIComponent(r.doi)}`, { as: 'json' }))?.message;
    const found = normTitle((w?.title ?? [''])[0]);
    const mine = normTitle(r.title ?? '');
    const year = w?.issued?.['date-parts']?.[0]?.[0];
    const titleOk = found && mine && (found.includes(mine.slice(0, 40)) || mine.includes(found.slice(0, 40)));
    const yearOk = !r.year || !year || Math.abs(Number(year) - Number(r.year)) <= 1;
    if (!titleOk) {
      warned++;
      console.log(`  ⚠ ${r.doi}\n      记录：${r.title}\n      实际：${(w?.title ?? [''])[0]}`);
    } else if (!yearOk) {
      warned++;
      console.log(`  ⚠ ${r.doi} 年份不一致：记录 ${r.year}，Crossref ${year}`);
    } else {
      console.log(`  ✓ ${r.doi}  ${(w?.title ?? [''])[0].slice(0, 64)}`);
    }
  } catch (e) {
    failed++;
    console.log(`  ✗ ${r.doi}  ${e.message}`);
  }
  await new Promise((res) => setTimeout(res, 350));
}

log(`完成：${uniq.length} 条，失败 ${failed}，警告 ${warned}`);
process.exit(failed ? 1 : 0);
