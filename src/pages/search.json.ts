import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { url } from '../lib/url';
import { fmtDate } from '../lib/format';

export const GET: APIRoute = async () => {
  const briefs = (await getCollection('briefs', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.issue - a.data.issue
  );
  const notes = (await getCollection('notes', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  const entries = [
    ...briefs.map((b) => ({
      title: `速递 ${String(b.data.issue).padStart(2, '0')}：${b.data.title}`,
      url: url(`/briefs/${b.id}/`),
      summary: b.data.summary,
      type: '速递',
      tags: b.data.tags,
      date: fmtDate(b.data.date, 'short'),
    })),
    ...notes.map((n) => ({
      title: n.data.title,
      url: url(`/notes/${n.id}/`),
      summary: n.data.summary,
      type: '深度',
      tags: n.data.tags,
      date: fmtDate(n.data.date, 'short'),
    })),
  ];

  return new Response(JSON.stringify(entries), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
