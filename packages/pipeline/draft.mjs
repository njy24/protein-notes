/**
 * 草稿：从 data/inbox/latest.json 生成一期速递的骨架（或调用 LLM 生成初稿）。
 *
 * 关键约定：生成的文件写进 src/content/briefs/ 但永远带 `draft: true`，
 * 生产构建会把它过滤掉。人审阅、改写、补判断后，才把 draft 改成 false。
 *
 * 用法：
 *   npm run draft                 # 有 OPENAI_API_KEY 时调用模型，否则只用骨架
 *   npm run draft -- --no-llm     # 强制骨架
 *   npm run draft -- --count=6
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { readJson, todayISO, firstSentence, log } from './lib/util.mjs';

const args = process.argv.slice(2);
const noLLM = args.includes('--no-llm');
const count = Number(args.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 8);
const date = args.find((a) => a.startsWith('--date='))?.split('=')[1] ?? todayISO();

const inbox = readJson(resolve('data/inbox/latest.json'), null);
if (!inbox) {
  console.error('缺少 data/inbox/latest.json，请先运行 npm run fetch && npm run triage');
  process.exit(1);
}

const candidates = inbox.items.filter((x) => x.pass).slice(0, count);
if (!candidates.length) {
  console.error('inbox 中没有越线条目；本期可以不发。');
  process.exit(0);
}

/* 期号 = 现有最大期号 + 1 */
const briefDir = resolve('content/weekly');
const issues = existsSync(briefDir)
  ? readdirSync(briefDir)
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => {
        const src = readFileSync(resolve(briefDir, f), 'utf8');
        const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!m) return 0;
        try {
          return Number(parseYaml(m[1])?.issue ?? 0);
        } catch {
          return 0;
        }
      })
  : [];
const issue = Math.max(0, ...issues) + 1;
function isoWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const week = isoWeek(date);
const filename = resolve(briefDir, `${week}.mdx`);
if (existsSync(filename)) {
  console.error(`${filename} 已存在；请先处理现有草稿。`);
  process.exit(1);
}

/* ---------- LLM 初稿 ---------- */
async function llmDraft() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || noLLM) return null;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const payload = candidates.map((c, i) => ({
    index: i,
    title: c.title,
    venue: c.venue,
    date: c.date,
    abstract: (c.abstract || '').slice(0, 900),
    url: c.url,
  }));
  const system = `你是蛋白质设计领域的科研写作者。为中文读者写"速递"条目。
要求：只依据给定摘要，不补充未出现的事实；数字必须来自摘要；不确定就写"摘要未说明"。
语气克制、具体，避免"具有重要意义"这类空话。所有输出为 JSON。`;
  const user = `下面是 ${payload.length} 条候选论文/新闻。请输出 JSON：
{
 "title": "本期标题（不超过 30 个汉字，指出一个趋势，不要用冒号堆砌）",
 "summary": "本期导语，2-3 句，说明为什么这些条目值得放在一起看",
 "judgement": ["判断1（可被反驳的具体句子）", "判断2", "判断3"],
 "items": [{"index": 0, "tldr": "一句话说清这条是什么", "body": "2-4 句：关键数字/方法/边界", "why": "为什么值得读（1-2 句）", "caveat": "局限（1 句）"}]
}
条目：${JSON.stringify(payload, null, 1)}`;

  const body = {
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  async function call(withJson) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(withJson ? { ...body, response_format: { type: 'json_object' } } : body),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    return res.json();
  }
  let data;
  try {
    data = await call(true);
  } catch {
    data = await call(false);
  }
  const text = data?.choices?.[0]?.message?.content ?? '';
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  log(`LLM 初稿完成：${model}`);
  return json;
}

const llm = await llmDraft();
const byIndex = new Map((llm?.items ?? []).map((x) => [Number(x.index), x]));

/* ---------- 组装 frontmatter ---------- */
const q = (s) => JSON.stringify(String(s ?? ''));
function itemBlock(c, i) {
  const g = byIndex.get(i) ?? {};
  const lines = [
    `  - title: ${q(c.title)}`,
    `    url: ${q(c.url || (c.doi ? `https://doi.org/${c.doi}` : ''))}`,
    `    source: ${q(c.venue || c.sourceLabel || c.source)}`,
    c.date ? `    date: ${c.date}` : null,
    `    category: ${c.category}`,
    `    tldr: ${q(g.tldr || `（待改写）${firstSentence(c.abstract) || c.title}`)}`,
    g.body
      ? `    body: ${q(g.body)}`
      : c.abstract
        ? `    body: ${q(`（原文摘要，待改写）${c.abstract.slice(0, 380)}`)}`
        : null,
    g.why ? `    why: ${q(g.why)}` : null,
    g.caveat ? `    caveat: ${q(g.caveat)}` : null,
    c.doi ? `    doi: ${q(c.doi)}` : null,
    `    tags: []`,
  ].filter(Boolean);
  return lines.join('\n');
}

const title = llm?.title || `周报草稿 ${week} · 待命名`;
const summary =
  llm?.summary ||
  `本期由采集与预筛脚本自动生成候选，共 ${candidates.length} 条。请人工筛选、改写并补充判断后再发布。`;
const judgement = Array.isArray(llm?.judgement) ? llm.judgement : [];

const fm = [
  '---',
  `title: ${q(title)}`,
  `issue: ${issue}`,
  `week: ${week}`,
  `date: ${date}`,
  `summary: ${q(summary)}`,
  judgement.length ? `judgement:\n${judgement.map((j) => `  - ${q(j)}`).join('\n')}` : 'judgement: []',
  `tags: []`,
  `draft: true`,
  'items:',
  candidates.map(itemBlock).join('\n'),
  '---',
].join('\n');

const intro = `\n<!-- 自动生成草稿：请先核对每条事实，再改写导语与判断。删掉这段注释后再发布。 -->\n\n${
  llm ? '' : '（导语待写：为什么这些条目放在一起？它们共同指向哪个趋势？）\n'
}`;

writeFileSync(filename, `${fm}\n${intro}`, 'utf8');
log(`写入周报草稿 ${filename}（draft: true，不会进入生产构建）`);
log(`期号 ${issue} · ${candidates.length} 条；下一步：人工改写 → 改 draft 为 false → 提交`);
