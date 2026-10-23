import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const CATEGORY = z.enum(['methods', 'design', 'experiments', 'tools', 'industry', 'commentary']);
const PROJECT = z.enum(['P1', 'P2']);
const EVIDENCE = z.enum(['peer-reviewed', 'preprint', 'report', 'news']);

const item = z.object({
  title: z.string(),
  titleEn: z.string().optional(),
  url: z.string().url(),
  source: z.string(),
  date: z.coerce.date().optional(),
  category: CATEGORY,
  /** 一句话：这条到底是什么 */
  tldr: z.string(),
  /** 2–4 句：关键数字、方法、边界 */
  body: z.string().optional(),
  /** 为什么值得读 / 对课题的意义 */
  why: z.string().optional(),
  /** 作者自己声明的局限，或我们读出来的局限 */
  caveat: z.string().optional(),
  doi: z.string().optional(),
  tags: z.array(z.string()).default([]),
  projects: z.array(PROJECT).default([]),
});

const briefs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/briefs' }),
  schema: z.object({
    title: z.string(),
    issue: z.number().int().positive(),
    date: z.coerce.date(),
    period: z
      .object({ from: z.coerce.date(), to: z.coerce.date() })
      .optional(),
    summary: z.string(),
    /** 本期判断：3 条以内，写成可被反驳的句子 */
    judgement: z.array(z.string()).max(5).default([]),
    tags: z.array(z.string()).default([]),
    projects: z.array(PROJECT).default([]),
    items: z.array(item).min(1),
    draft: z.boolean().default(false),
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

const notes = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    projects: z.array(PROJECT).default([]),
    evidence: EVIDENCE.default('peer-reviewed'),
    citations: z.array(citation).default([]),
    /** 与 P1/P2 的具体关联，键为小写 p1/p2 */
    projectNotes: z
      .object({ p1: z.string().optional(), p2: z.string().optional() })
      .optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    series: z.string().optional(),
  }),
});

export const collections = { briefs, notes };
