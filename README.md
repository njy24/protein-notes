# 折叠之后 · After Folding

一个服务于两个蛋白质课题的公开信息工作流：**追踪进展 → 拆解方法 → 核验证据 → 写成文章 → 发布到站点**。

- 线上站点：<https://njy24.github.io/protein-notes/>（仓库：<https://github.com/njy24/protein-notes>）
- 技术：Astro 5 静态构建，部署在 GitHub Pages
- 内容：速递（每周两期）+ 深度笔记（每月 2–3 篇）+ 领域图谱
- 管线：arXiv / PubMed / Crossref / RSS 采集 → 关键词预筛 → 可选 LLM 草稿 → 人工审阅
- 原则：机器负责发现，人负责判断；自动生成内容一律 `draft: true`，不会进入生产构建

## 快速开始

需要 Node 22+。

```bash
npm install
npm run dev        # http://127.0.0.1:4321
npm run build      # 产物在 dist/
npm run preview    # 本地预览构建产物
```

## 目录

```
config/                 信息源与关键词（采集/预筛的配置）
data/
  raw/<date>/           当日原始采集（gitignore）
  inbox/                预筛结果（提交到仓库，供人审）
  seen.json             去重记录
  backlog.yml           选题池
scripts/
  ingest.mjs            采集
  triage.mjs            预筛打分
  draft.mjs             生成速递草稿（draft: true）
  new.mjs               新建笔记/速递骨架
  validate.mjs          内容与图谱校验
  check-citations.mjs   DOI 核验
src/
  content/briefs/       速递（MDX，frontmatter 含 items）
  content/notes/        深度笔记（MDX）
  data/atlas/           图谱节点与边（YAML）
  pages/                首页、速递、深度、图谱、方法、关于
  components/           页面组件与 MDX 组件
  styles/global.css     设计系统
.github/workflows/      部署 + 每日采集
```

## 日常流程

```bash
npm run fetch        # 采集近 7–10 天的新条目
npm run triage       # 打分 → data/inbox/latest.json
npm run draft        # 生成一期速递草稿（无 API key 时仅骨架）
npm run validate     # 校验 frontmatter / 引用编号 / 图谱连通性
npm run check:cites  # 联网核验所有 DOI
npm run build
```

写作：

- 速递：`src/content/briefs/<date>.mdx`，frontmatter 的 `items` 是结构化条目。
- 深度：`npm run new -- note <slug> "标题"`，然后按模板写。
- 图谱：在 `src/data/atlas/nodes.yml` 加节点、`edges.yml` 加边，`npm run validate` 会检查悬空边。
- 选题池：`data/backlog.yml`。

## 内容模型

### 速递

```yaml
title: 本期标题
issue: 1                # 期号，自动用于排序与显示
date: 2026-10-23
period: { from: 2026-10-07, to: 2026-10-23 }
summary: 导语
judgement: [判断1, 判断2]   # 可被反驳的句子
tags: [binder]
projects: [P2]
items:
  - title: 条目标题
    url: https://...
    source: Nature
    date: 2026-10-21
    category: design      # methods|design|experiments|tools|industry|commentary
    tldr: 一句话
    body: 2–4 句
    why: 为什么值得读
    caveat: 局限
    doi: 10.1038/...
    projects: [P2]
```

### 深度

```yaml
title: 标题
subtitle: 副题
date: 2026-10-23
summary: 摘要
tags: []
projects: [P2]
evidence: peer-reviewed   # peer-reviewed|preprint|report|news
citations:
  - title: 论文标题
    authors: Jumper, J. et al.
    year: 2021
    venue: Nature
    doi: 10.1038/...
projectNotes:
  p1: 对 P1 的意义
  p2: 对 P2 的意义
```

正文里用 `<Cite n={1} />` 指向上标引用；`n` 对应 `citations` 数组顺序。

## 部署到 GitHub Pages

1. 新建仓库（公开），推送到 `main`。
2. **Settings → Pages → Source = GitHub Actions**。
3. `.github/workflows/deploy.yml` 会自动：
   - 计算 `SITE_URL`（`https://<owner>.github.io`）与 `BASE_PATH`（项目页 `/<repo>/`，用户页 `/`）
   - 运行 `npm run validate` + `npm run build`
   - 发布到 Pages

本地构建模拟项目页：

```bash
SITE_URL=https://yourname.github.io BASE_PATH=/your-repo/ npm run build
```

## 自动采集（可选）

`.github/workflows/ingest.yml` 每天 05:00（UTC+8）运行采集与预筛，把结果推到滚动分支 `inbox` 并开一个 PR。
合并 PR 不会发布任何文章——它只是把候选池同步到仓库。

`.github/workflows/draft.yml` 在周二/周五生成速递草稿（`draft: true`），同样走 PR。
它需要仓库 Secret `OPENAI_API_KEY`（可选 `OPENAI_BASE_URL`、`OPENAI_MODEL`）；没有 key 时只生成骨架。

> GitHub 的定时任务在仓库 60 天无活动后会被暂停；重新手动触发即可恢复。
>
> 自动工作流要能开 PR，还需要在 **Settings → Actions → General → Workflow permissions** 勾选
> **Allow GitHub Actions to create and approve pull requests**。没有这一步，采集任务能跑完，但 PR 创建会失败。

## 隐私

- `lab/`、`private/` 已在 `.gitignore` 中，用于未发表数据与组内材料。
- 公开内容只描述两个课题中可公开的方法层；发布前有隐私门（见 `WORKFLOW.md` 第 9 节）。
- 站点不加载第三方分析脚本。

## 已知限制

- 图谱是人工维护的叙事骨架，不是全量文献计量。
- 搜索只覆盖标题、标签、摘要，不含全文。
- 中文标题在标题字体缺失的平台上会回退到系统黑体（可用 `Aa` 切换正文宋体）。
- 自动预筛只做排序，不判断重要性；阈值需要按领域产出密度调整。

## 相关文档

- `WORKFLOW.md`：完整工作流、质量门、落地计划、待确认事项
- `DESIGN.md`：视觉与内容设计系统

内容以 CC BY-NC-SA 4.0 授权；代码可自行取用。
