import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { marked } from 'marked';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'apps/studio/public');
const DIRS = { weekly: join(ROOT, 'content/weekly'), deep: join(ROOT, 'content/deep') };
const PORT = Number(process.env.STUDIO_PORT || 4400);
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function splitFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? { yaml: m[1], body: src.slice(m[0].length) } : { yaml: '', body: src };
}

function isoWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function listContent(type) {
  const dir = DIRS[type];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.mdx'));
  const out = [];
  for (const f of files) {
    const src = await readFile(join(dir, f), 'utf8');
    let fm = {};
    try {
      fm = parseYaml(splitFrontmatter(src).yaml) || {};
    } catch {}
    out.push({
      type,
      id: f.replace(/\.mdx$/, ''),
      title: fm.title || f,
      date: fm.date ? String(fm.date).slice(0, 10) : '',
      week: fm.week || '',
      issue: Number(fm.issue) || 0,
      draft: Boolean(fm.draft),
    });
  }
  out.sort((a, b) => (b.issue || 0) - (a.issue || 0) || String(b.date).localeCompare(String(a.date)));
  return out;
}

function run(cmd, args, input) {
  return new Promise((resolvePromise) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: process.env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    if (input) p.stdin.end(input);
    p.on('close', (code) => resolvePromise({ code, out: out.trim() }));
  });
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  try {
    if (u.pathname === '/api/list' && req.method === 'GET') {
      return json(res, 200, { weekly: await listContent('weekly'), deep: await listContent('deep') });
    }

    if (u.pathname === '/api/status' && req.method === 'GET') {
      const git = await run('git', ['status', '--short', '--branch']);
      let inbox = null;
      try {
        const raw = await readFile(join(ROOT, 'data/inbox/latest.json'), 'utf8');
        const d = JSON.parse(raw);
        inbox = { date: d.date, passed: d.counts?.passed ?? 0, total: d.counts?.total ?? 0 };
      } catch {}
      return json(res, 200, { git: git.out, inbox });
    }

    if (u.pathname === '/api/inbox' && req.method === 'GET') {
      try {
        const raw = await readFile(join(ROOT, 'data/inbox/latest.json'), 'utf8');
        const d = JSON.parse(raw);
        return json(res, 200, {
          date: d.date,
          counts: d.counts,
          items: (d.items || []).filter((x) => x.pass).slice(0, 10).map((x) => ({
            title: x.title, url: x.url, source: x.venue || x.source, score: x.score, category: x.category,
          })),
        });
      } catch {
        return json(res, 200, { items: [], counts: {} });
      }
    }

    if (u.pathname === '/api/file' && req.method === 'GET') {
      const type = u.searchParams.get('type');
      const id = u.searchParams.get('id') || '';
      if (!DIRS[type] || !SAFE_ID.test(id)) return json(res, 400, { error: 'bad params' });
      const src = await readFile(join(DIRS[type], `${id}.mdx`), 'utf8');
      let meta = {};
      try {
        meta = parseYaml(splitFrontmatter(src).yaml) || {};
      } catch {}
      return json(res, 200, { type, id, content: src, meta });
    }

    if (u.pathname === '/api/file' && req.method === 'PUT') {
      const { type, id, content } = await readBody(req);
      if (!DIRS[type] || !SAFE_ID.test(id) || typeof content !== 'string') return json(res, 400, { error: 'bad params' });
      await writeFile(join(DIRS[type], `${id}.mdx`), content, 'utf8');
      return json(res, 200, { ok: true });
    }

    if (u.pathname === '/api/preview' && req.method === 'POST') {
      const { content } = await readBody(req);
      const { yaml, body } = splitFrontmatter(String(content || ''));
      let meta = {};
      try {
        meta = parseYaml(yaml) || {};
      } catch (e) {
        meta = { error: String(e.message) };
      }
      return json(res, 200, { meta, html: marked.parse(body) });
    }

    if (u.pathname === '/api/run' && req.method === 'POST') {
      const { step } = await readBody(req);
      const map = {
        fetch: ['node', ['packages/pipeline/ingest.mjs']],
        triage: ['node', ['packages/pipeline/triage.mjs']],
        draft: ['node', ['packages/pipeline/draft.mjs', '--no-llm', '--count=6']],
      };
      if (!map[step]) return json(res, 400, { error: 'unknown step' });
      const [cmd, args] = map[step];
      const r = await run(cmd, args);
      return json(res, 200, r);
    }

    if (u.pathname === '/api/new' && req.method === 'POST') {
      const { type, title, slug } = await readBody(req);
      if (!DIRS[type]) return json(res, 400, { error: 'bad type' });
      const today = new Date().toISOString().slice(0, 10);
      const weekId = type === 'weekly' ? String(slug || isoWeek(today)) : '';
      const id = type === 'weekly' ? weekId.toLowerCase() : String(slug || `note-${today}`).toLowerCase();
      if (!SAFE_ID.test(id)) return json(res, 400, { error: 'slug 只能用小写字母、数字和连字符' });
      const p = join(DIRS[type], `${id}.mdx`);
      try {
        await readFile(p);
        return json(res, 409, { error: '文件已存在' });
      } catch {}
      const weekly = (await listContent('weekly')).map((x) => x.issue);
      const issue = type === 'weekly' ? Math.max(0, ...weekly) + 1 : 0;
      const tpl =
        type === 'weekly'
          ? `---\ntitle: ${JSON.stringify(title || '未命名周报')}\nissue: ${issue}\nweek: ${isoWeek(today)}\ndate: ${today}\nsummary: "本期导语（待写）"\njudgement: []\ntags: []\ndraft: true\nitems:\n  - title: "占位条目：请替换"\n    url: "https://example.com"\n    source: "占位"\n    date: ${today}\n    category: methods\n    tldr: "一句话说清这条是什么"\n    tags: []\n---\n\n（导语待写）\n`
          : `---\ntitle: ${JSON.stringify(title || '未命名深度')}\ndate: ${today}\nsummary: "一句话说明这篇要回答的问题（待写）"\ntags: []\ndraft: true\ncitations: []\n---\n\n## 问题\n\n## 已有路线\n\n## 它怎么做\n\n## 关键结果\n\n## 在什么条件下会失效\n\n## 可以迁移的部分\n`;
      await writeFile(p, tpl, 'utf8');
      return json(res, 200, { ok: true, type, id });
    }

    if (u.pathname === '/api/publish' && req.method === 'POST') {
      const { message } = await readBody(req);
      const add = await run('git', ['add', '-A']);
      const commit = await run('git', ['commit', '-m', message || `studio: ${new Date().toISOString().slice(0, 16)}`]);
      if (commit.code !== 0) {
        if (/nothing to commit|no changes added/i.test(commit.out)) return json(res, 200, { ok: true, skipped: true, log: '没有需要提交的改动' });
        return json(res, 500, { ok: false, log: add.out + '\n' + commit.out });
      }
      const push = await run('git', ['push']);
      return json(res, push.code === 0 ? 200 : 500, { ok: push.code === 0, log: commit.out + '\n' + push.out });
    }

    // static
    const file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
    if (/^(index\.html|app\.js|style\.css)$/.test(file)) {
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      const data = await readFile(join(PUBLIC, file));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(data);
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e.message) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Studio: http://127.0.0.1:${PORT}`);
});
