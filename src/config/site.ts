/**
 * 站点身份与内容词汇表。
 * 改名只需要动这里 + src/styles/global.css 里的品牌字重。
 */
export const SITE = {
  name: '折叠之后',
  nameEn: 'After Folding',
  tagline: 'AI 蛋白质设计的研究手记',
  description:
    '追踪 AI 蛋白质设计与功能分子从头设计的研究进展，拆解可复用的方法与失效条件，并记录两个蛋白质课题从读到做的过程。',
  lang: 'zh-CN',
  locale: 'zh_CN',
  since: 2026,
  repoUrl: import.meta.env.PUBLIC_GITHUB_REPO ?? '',
  rssPath: '/rss.xml',
  license: 'CC BY-NC-SA 4.0',
  // 改动这里即可调整全站自称
  maintainer: '站点的维护者',
  maintainerNote: '一位正在参与蛋白质相关课题的本科生研究者',
};

export const NAV = [
  { label: '速递', href: '/briefs/' },
  { label: '深度', href: '/notes/' },
  { label: '图谱', href: '/atlas/' },
  { label: '方法', href: '/method/' },
  { label: '关于', href: '/about/' },
];

export type ProjectId = 'P1' | 'P2';

export const PROJECTS: Record<
  ProjectId,
  { id: ProjectId; short: string; title: string; anchor: string; color: string }
> = {
  P1: {
    id: 'P1',
    short: 'θ 亚基筛选',
    title: '高效筛选蛋白质 θ 亚基氨基酸序列',
    anchor: 'p1',
    color: 'var(--c-ochre)',
  },
  P2: {
    id: 'P2',
    short: '从头设计',
    title: '结构驱动的 AI 蛋白质从头设计与实验验证',
    anchor: 'p2',
    color: 'var(--c-blue)',
  },
};

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

export type EvidenceId = 'peer-reviewed' | 'preprint' | 'report' | 'news' | 'review';

export const EVIDENCE: Record<EvidenceId, { label: string; short: string; color: string }> = {
  'peer-reviewed': { label: '同行评议', short: 'PEER', color: 'var(--c-green)' },
  preprint: { label: '预印本', short: 'PREPRINT', color: 'var(--c-ochre)' },
  report: { label: '技术报告', short: 'REPORT', color: 'var(--c-blue)' },
  news: { label: '新闻/博客', short: 'NEWS', color: 'var(--c-slate)' },
  review: { label: '综述/评论', short: 'REVIEW', color: 'var(--c-plum)' },
};

/** 公开的编辑流程（/method 页面据此渲染） */
export const METHOD_STEPS = [
  {
    n: '01',
    title: '采集',
    en: 'Collect',
    desc: 'arXiv、bioRxiv、PubMed、Crossref 与机构/期刊 RSS，按主题查询定时抓取，落成结构化条目。',
  },
  {
    n: '02',
    title: '预筛',
    en: 'Triage',
    desc: '关键词权重 + 来源权重 + 类型加成做第一轮排序，人只处理进入视野的 30–40 条。',
  },
  {
    n: '03',
    title: '判断',
    en: 'Judge',
    desc: '逐条读摘要/正文，回答三个问题：新在哪、证据够不够、对我们哪一个课题有用。',
  },
  {
    n: '04',
    title: '写作',
    en: 'Write',
    desc: '速递只写“一句话 + 三句正文 + 一条限定”；深度文章必须给出方法、失败模式与可复现路径。',
  },
  {
    n: '05',
    title: '核验',
    en: 'Verify',
    desc: 'DOI 可解析、标题作者一致、预印本标注、数字有出处；未发表数据不进公开区。',
  },
  {
    n: '06',
    title: '发布',
    en: 'Ship',
    desc: '静态站构建、RSS 与 sitemap 自动生成；每次发布都是一个可回溯的 commit。',
  },
];
