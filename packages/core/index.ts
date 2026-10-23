/**
 * 站点身份与共享词汇。Web、Studio 与后续工具都从这里取。
 */
export const SITE = {
  name: '折叠之后',
  nameEn: 'After Folding',
  tagline: 'AI 蛋白质设计的研究手记',
  description:
    '追踪 AI 蛋白质设计与功能分子从头设计的新观点、新方法与新结果：每周一份周报，不定期一篇深度，一张持续生长的知识树。',
  lang: 'zh-CN',
  locale: 'zh_CN',
  since: 2026,
  repoUrl: (import.meta as any).env?.PUBLIC_GITHUB_REPO ?? '',
  rssPath: '/rss.xml',
  license: 'CC BY-NC-SA 4.0',
  maintainer: '站点的维护者',
};

export const NAV = [
  { label: '周报', href: '/weekly/' },
  { label: '深度', href: '/deep/' },
  { label: '知识树', href: '/tree/' },
];

export type CategoryId =
  | 'methods'
  | 'design'
  | 'experiments'
  | 'tools'
  | 'industry'
  | 'commentary';

export const CATEGORIES: Record<CategoryId, { label: string; en: string; color: string }> = {
  methods: { label: '方法与模型', en: 'Methods', color: 'var(--c-blue)' },
  design: { label: '结构与设计', en: 'Design', color: 'var(--c-accent)' },
  experiments: { label: '实验与验证', en: 'Experiments', color: 'var(--c-green)' },
  tools: { label: '工具与数据', en: 'Tools', color: 'var(--c-ochre)' },
  industry: { label: '产业与政策', en: 'Industry', color: 'var(--c-slate)' },
  commentary: { label: '观点与讨论', en: 'Commentary', color: 'var(--c-plum)' },
};
