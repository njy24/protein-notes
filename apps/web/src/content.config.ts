import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const CATEGORY = z.enum(['methods', 'design', 'experiments', 'tools', 'industry', 'commentary']);

const item = z.object({
  title: z.string(),
  titleEn: z.string().optional(),
  url: z.string().url(),
  source: z.string(),
  date: z.coerce.date().optional(),
  category: CATEGORY,
  tldr: z.string(),
  body: z.string().optional(),
  /** 为什么值得读 / 它改变了什么 */
  why: z.string().optional(),
  /** 这意味着什么：与已有路线的关系、被挑战的假设 */
  analysis: z.string().optional(),
  /** 下一步该看什么 */
  next: z.string().optional(),
  caveat: z.string().optional(),
  doi: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const weekly = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: '../../content/weekly' }),
  schema: z.object({
    title: z.string(),
    issue: z.number().int().positive(),
    week: z.string(),
    date: z.coerce.date(),
    period: z.object({ from: z.coerce.date(), to: z.coerce.date() }).optional(),
    summary: z.string(),
    /** 本期主线：一段可被反驳的论证，而不只是摘要 */
    thesis: z.string().optional(),
    judgement: z.array(z.string()).max(5).default([]),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    items: z.array(item).min(1),
  }),
});

const citation = z.object({
  title: z.string(),
  authors: z.string().optional(),
  year: z.number().optional(),
  venue: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().url().optional(),
  note: z.string().optional(),
});

const deep = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: '../../content/deep' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    citations: z.array(citation).default([]),
    series: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { weekly, deep };
