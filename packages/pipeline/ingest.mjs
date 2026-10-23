/**
 * 采集：arXiv / PubMed / Crossref / RSS → data/raw/<date>/all.json
 * 只做结构化与去重，不做任何判断（判断在 triage）。
 */
import { resolve } from 'node:path';
import {
  readYamlFile,
  readJson,
  writeJson,
  get,
  stripHtml,
  normTitle,
  isoDate,
  todayISO,
  daysAgoISO,
  log,
} from './lib/util.mjs';

const cfg = readYamlFile(resolve('config/sources.yml'));
const today = todayISO();
const outDir = resolve('data/raw', today);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const counts = {};

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

function compactDate(iso, end = false) {
  return iso.replace(/-/g, '') + (end ? '2359' : '0000');
}

function doiFromText(s = '') {
  const m = String(s).match(/\b(10\.\d{4,9}\/[^\s"'<>]+)/);
  return m ? m[1].replace(/[.,;]$/, '') : undefined;
}

/* ---------------- arXiv ---------------- */
async function fetchArxiv(c) {
  if (!c.enabled) return [];
  const from = daysAgoISO(c.lookback_days);
  const cats = c.categories.map((x) => `cat:${x}`).join(' OR ');
  const kws = c.keywords.map((k) => `abs:"${k}"`).join(' OR ');
  // arXiv 的日期区间语法在不同编码下不稳定，改为取回后按 submittedDate 客户端过滤
  const query = `(${cats}) AND (${kws})`;
  const url = `http://export.arxiv.org/api/query?${new URLSearchParams({
    search_query: query,
    start: '0',
    max_results: String(c.max_results),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  })}`;
  const xml = await get(url);
  const items = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const abs = pick(e, 'id');
    const arxivId = abs.split('/abs/').pop() || abs;
    const doiTag = e.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
    const title = stripHtml(pick(e, 'title'));
    if (!title) continue;
    items.push({
      source: 'arxiv',
      sourceLabel: 'arXiv',
      type: 'preprint',
      title,
      abstract: stripHtml(pick(e, 'summary')).slice(0, 1600),
      authors: [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((x) => x[1]).slice(0, 6),
      date: isoDate(pick(e, 'published')),
      url: `https://arxiv.org/abs/${arxivId}`,
      doi: doiTag ? doiTag[1].trim() : undefined,
      venue: 'arXiv',
      arxivId,
    });
  }
  const recent = items.filter((it) => it.date && it.date >= from);
  counts.arxiv = recent.length;
  return recent;
}

/* ---------------- PubMed ---------------- */
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pubDate(block) {
  const pub = block.match(/<PubDate>([\s\S]*?)<\/PubDate>/)?.[1] ?? '';
  const year = Number(pub.match(/<Year>(\d{4})<\/Year>/)?.[1]);
  if (!year) return null;
  const monthRaw = pub.match(/<Month>([^<]+)<\/Month>/)?.[1]?.trim().toLowerCase() ?? '1';
  const dayRaw = pub.match(/<Day>([^<]+)<\/Day>/)?.[1]?.trim() ?? '1';
  const month = /^\d+$/.test(monthRaw) ? Number(monthRaw) : MONTHS[monthRaw.slice(0, 3)] || 1;
  const day = Number(dayRaw) || 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function fetchPubMed(c) {
  if (!c.enabled) return [];
  const from = daysAgoISO(c.lookback_days).replace(/-/g, '/');
  const to = today.replace(/-/g, '/');
  const ids = new Set();
  for (const q of c.queries) {
    const term = `(${q}) AND ("${from}"[PDAT] : "${to}"[PDAT])`;
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${c.retmax}&term=${encodeURIComponent(term)}`;
    const res = await get(url, { as: 'json' });
    (res?.esearchresult?.idlist ?? []).forEach((id) => ids.add(id));
    await sleep(400);
  }
  const list = [...ids];
  const items = [];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${batch.join(',')}`;
    const xml = await get(url);
    for (const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
      const a = m[1];
      const title = stripHtml(pick(a, 'ArticleTitle'));
      if (!title) continue;
      const pmid = a.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
      const doi = a.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1];
      const journal = a.match(/<Journal>[\s\S]*?<Title[^>]*>([\s\S]*?)<\/Title>/)?.[1];
      const abstract = [...a.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map((x) => stripHtml(x[1]))
        .join(' ')
        .slice(0, 1600);
      const authors = [...a.matchAll(/<Author[^>]*>[\s\S]*?<LastName>([^<]+)<\/LastName>[\s\S]*?<Initials>([^<]+)<\/Initials>/g)]
        .map((x) => `${x[1]} ${x[2]}`)
        .slice(0, 6);
      items.push({
        source: 'pubmed',
        sourceLabel: 'PubMed',
        type: 'paper',
        title,
        abstract,
        authors,
        date: pubDate(a),
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
        doi: doi?.trim(),
        venue: journal ? stripHtml(journal) : 'PubMed',
        pmid,
      });
    }
    await sleep(400);
  }
  counts.pubmed = items.length;
  return items;
}

/* ---------------- Crossref ---------------- */
async function fetchCrossref(c) {
  if (!c.enabled) return [];
  const from = daysAgoISO(c.lookback_days);
  const items = [];
  for (const j of c.issns ?? []) {
    const filter = `issn:${j.issn},from-pub-date:${from},until-pub-date:${today}`;
    const url = `https://api.crossref.org/works?filter=${filter}&rows=${c.rows_per_journal}&sort=published&order=desc&select=DOI,title,abstract,issued,container-title,author,URL,type`;
    try {
      const res = await get(url, { as: 'json' });
      for (const w of res?.message?.items ?? []) {
        const title = stripHtml((w.title ?? [''])[0]);
        if (!title) continue;
        const parts = w.issued?.['date-parts']?.[0] ?? [];
        const date = parts[0]
          ? `${parts[0]}-${String(parts[1] ?? 1).padStart(2, '0')}-${String(parts[2] ?? 1).padStart(2, '0')}`
          : null;
        items.push({
          source: 'crossref',
          sourceLabel: 'Crossref',
          type: 'paper',
          title,
          abstract: stripHtml(w.abstract ?? '').slice(0, 1600),
          authors: (w.author ?? [])
            .slice(0, 6)
            .map((a) => [a.given, a.family].filter(Boolean).join(' '))
            .filter(Boolean),
          date,
          url: w.URL,
          doi: w.DOI,
          venue: stripHtml((w['container-title'] ?? [j.label])[0]),
        });
      }
    } catch (e) {
      errors.push(`crossref:${j.label}: ${e.message}`);
    }
    await sleep(250);
  }
  counts.crossref = items.length;
  return items;
}

/* ---------------- RSS ---------------- */
async function fetchRss(c) {
  if (!c.enabled) return [];
  const items = [];
  for (const feed of c.feeds ?? []) {
    try {
      const xml = await get(feed.url);
      const blocks = [...xml.matchAll(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/g)].map((m) => m[0]);
      let n = 0;
      for (const b of blocks.slice(0, c.max_items_per_feed)) {
        const title = stripHtml(pick(b, 'title'));
        if (!title) continue;
        const linkTag = b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? stripHtml(pick(b, 'link'));
        const desc =
          pick(b, 'description') || pick(b, 'summary') || pick(b, 'content:encoded') || pick(b, 'content');
        const dateRaw = pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated');
        const isBiorxiv = feed.url.includes('biorxiv');
        items.push({
          source: 'rss',
          sourceLabel: feed.name,
          type: isBiorxiv ? 'preprint' : 'paper',
          title,
          abstract: stripHtml(desc).slice(0, 1600),
          authors: [],
          date: isoDate(dateRaw),
          url: linkTag || undefined,
          doi: doiFromText(linkTag) ?? doiFromText(desc),
          venue: feed.name,
        });
        n++;
      }
      counts[`rss:${feed.name}`] = n;
    } catch (e) {
      errors.push(`rss:${feed.name}: ${e.message}`);
    }
    await sleep(200);
  }
  return items;
}

/* ---------------- 归一化与去重 ---------------- */
function normalize(item) {
  const url = item.url || (item.doi ? `https://doi.org/${item.doi}` : undefined);
  const doi = item.doi?.toLowerCase();
  const id = doi ? `doi:${doi}` : url ? `url:${url}` : `title:${normTitle(item.title)}`;
  return {
    ...item,
    id,
    doi,
    url,
    title: stripHtml(item.title),
    abstract: stripHtml(item.abstract ?? ''),
    date: item.date ?? null,
    tags: [],
  };
}

function dedupe(items) {
  const byKey = new Map();
  for (const it of items) {
    const key = it.doi ? `doi:${it.doi}` : `t:${normTitle(it.title)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, it);
      continue;
    }
    // 保留信息更完整的一条，但补齐字段
    const richer = (it.abstract?.length ?? 0) > (prev.abstract?.length ?? 0) ? it : prev;
    byKey.set(key, {
      ...prev,
      ...Object.fromEntries(Object.entries(richer).filter(([, v]) => v !== undefined && v !== '' && v !== null)),
      id: prev.id,
    });
  }
  return [...byKey.values()];
}

/* ---------------- 主流程 ---------------- */
const tasks = [
  ['arXiv', () => fetchArxiv(cfg.arxiv)],
  ['PubMed', () => fetchPubMed(cfg.pubmed)],
  ['Crossref', () => fetchCrossref(cfg.crossref)],
  ['RSS', () => fetchRss(cfg.rss)],
];

log(`ingest ${today} · window ${daysAgoISO(4)} → ${today}`);
const all = [];
for (const [name, fn] of tasks) {
  try {
    const items = await fn();
    all.push(...items);
    log(`${name}: ${items.length}`);
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    log(`${name}: FAILED ${e.message}`);
  }
}

const deduped = dedupe(all.map(normalize));
const seenPath = resolve('data/seen.json');
const seen = readJson(seenPath, {});
const fresh = deduped.filter((it) => !seen[it.id]);
fresh.forEach((it) => (seen[it.id] = today));

// 清理 120 天前的 seen 记录
const cutoff = daysAgoISO(120);
for (const [k, v] of Object.entries(seen)) if (v < cutoff) delete seen[k];

// 同一天重跑时合并而不是覆盖
const existing = readJson(resolve(outDir, 'all.json'), []);
const merged = dedupe([...fresh, ...existing]);
writeJson(resolve(outDir, 'all.json'), merged);
writeJson(seenPath, seen);
writeJson(resolve(outDir, 'meta.json'), {
  date: today,
  window: { from: daysAgoISO(4), to: today },
  raw: all.length,
  deduped: deduped.length,
  fresh: merged.length,
  counts,
  errors,
});

log(`deduped ${deduped.length} → fresh ${fresh.length} (今日累计 ${merged.length}, seen ${Object.keys(seen).length})`);
if (errors.length) log(`errors: ${errors.length}\n  ${errors.join('\n  ')}`);
