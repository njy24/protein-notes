import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '@protein/core';
import { url } from '../lib/url';

export async function GET(context: APIContext) {
  const site = context.site ?? new URL('http://localhost:4321');
  const abs = (p: string) => new URL(url(p), site).toString();
  const weekly = (await getCollection('weekly', ({ data }) => !data.draft)).sort((a, b) => b.data.issue - a.data.issue);
  const deep = (await getCollection('deep', ({ data }) => !data.draft)).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const items = [
    ...weekly.map((w) => ({
      title: `周报 ${w.data.week}：${w.data.title}`,
      pubDate: w.data.date,
      description: w.data.summary,
      link: abs(`/weekly/${w.id}/`),
      categories: ['周报', ...w.data.tags],
    })),
    ...deep.map((n) => ({
      title: n.data.title,
      pubDate: n.data.date,
      description: n.data.summary,
      link: abs(`/deep/${n.id}/`),
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
