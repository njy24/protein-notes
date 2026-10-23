import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../config/site';
import { url } from '../lib/url';

export async function GET(context: APIContext) {
  const site = context.site ?? new URL('http://localhost:4321');
  const abs = (p: string) => new URL(url(p), site).toString();

  const briefs = (await getCollection('briefs', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.issue - a.data.issue
  );
  const notes = (await getCollection('notes', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  const items = [
    ...briefs.map((b) => ({
      title: `速递 ${String(b.data.issue).padStart(2, '0')}：${b.data.title}`,
      pubDate: b.data.date,
      description: b.data.summary,
      link: abs(`/briefs/${b.id}/`),
      categories: ['速递', ...b.data.tags],
    })),
    ...notes.map((n) => ({
      title: n.data.title,
      pubDate: n.data.date,
      description: n.data.summary,
      link: abs(`/notes/${n.id}/`),
      categories: ['深度', ...n.data.tags],
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.description,
    site: new URL(url('/'), site),
    items,
    customData: `<language>zh-cn</language><copyright>${SITE.license}</copyright>`,
  });
}
