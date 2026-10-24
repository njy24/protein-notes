# 折叠之后 · After Folding

**线上：<https://njy24.github.io/protein-notes/>** · **仓库：<https://github.com/njy24/protein-notes>**

一个追踪 AI 蛋白质设计前沿的公开信息工作流。只保留三个内容面：

- **周报**：每周五，5–6 条值得读的进展；每条给结论、关键数字、为什么值得读与边界。
- **深度**：不定期，一篇只讲一个问题；方法、结果、失效条件、可迁移之处。
- **知识树**：32 个词条、7 个分类、两条学习路线；每个术语可点开，递归下钻。

另有一个**本地操作台**，用来编辑内容、跑采集/预筛、一键发布。

## 模块

```
apps/
  web/              Astro 站点（周报 / 深度 / 知识树入口）
  studio/           本地操作台（127.0.0.1:4400）
packages/
  core/             站点身份、导航、分类（Web 共用）
  pipeline/         采集、预筛、草稿、校验
content/
  weekly/           周报 MDX（frontmatter + items）
  deep/             深度 MDX
tree/               concept-tree 项目（词条源、文档、构建与发布脚本）
data/               inbox、seen、backlog（不进入构建）
config/             信息源与关键词
```

站点、操作台、管线互不依赖，只共享 `content/` 下的文件；换渲染器或接别的内容源时，只要保持文件格式即可。

## 快速开始

需要 Node 22+。

```bash
npm install
npm run dev        # 站点 http://127.0.0.1:4321
npm run studio     # 操作台 http://127.0.0.1:4400
npm run build
```

## 操作台

`npm run studio` 只监听本机，不需要登录，也不会部署到公网。能做：

- 浏览 / 编辑 `content/weekly` 与 `content/deep`，实时预览；
- 新建周报或深度（自动算周编号）；
- 运行采集、预筛、从 inbox 生成周报草稿（`draft: true`）；
- 保存后一键 `git commit + push`，站点自动部署。

页面右上角会显示当前分支、未提交文件数与 inbox 越线条目数。

## 周报

每周五发布。frontmatter：

```yaml
title: 本期标题
issue: 1
week: 2026-W43
date: 2026-10-23
period: { from: 2026-10-07, to: 2026-10-23 }
summary: 导语
thesis: 本期主线（一段可被反驳的论证）
judgement: [三条可被反驳的判断]
tags: []
items:
  - title: 条目标题
    url: https://...
    source: Nature
    date: 2026-10-21
    category: design      # methods|design|experiments|tools|industry|commentary
    tldr: 一句话结论
    body: 背景 + 方法 + 关键数字（2–4 段）
    analysis: 这意味着什么
    caveat: 边界
    next: 下一步该看什么
    doi: 10.1038/...
```

## 深度

```yaml
title: 标题
subtitle: 副题
date: 2026-10-23
summary: 摘要
tags: []
citations:
  - { title: ..., authors: ..., year: 2021, venue: Nature, doi: ... }
```

正文用 `<Cite n={1} />` 指向参考文献。骨架：问题 → 已有路线 → 方法 → 结果 → 失效条件 → 可迁移之处。

## 管线

```bash
npm run fetch      # arXiv / PubMed / Crossref / RSS → data/raw
npm run triage     # 关键词权重 + 期刊加成 → data/inbox
npm run draft      # 从 inbox 生成周报草稿（draft: true）
npm run validate   # frontmatter / 引用编号 / 图谱连通性
npm run check:cites
```

GitHub Actions：

- 每天 05:00（UTC+8）采集 + 预筛，推到滚动分支 `inbox` 并开 PR；
- 周二/五生成周报草稿 PR（需要 `OPENAI_API_KEY`，否则跳过）；
- push `main` 自动构建部署。

> 自动工作流要能开 PR，需要在 **Settings → Actions → General → Workflow permissions** 勾选
> **Allow GitHub Actions to create and approve pull requests**。

## 知识树

`tree/` 是一个 concept-tree 项目：词条由 `apps/web/src/data/atlas/*.yml` 自动生成，构建后再发布到站点。

```bash
node tree/build-terms.mjs                       # atlas → 词条 JSON
cd tree && CONCEPT_TREE_HOME=<skill> \
  python3 <skill>/scripts/build.py --config concept-tree.json
node tree/publish.mjs                           # 构建产物 → apps/web/public/tree-app
```

站点入口是 `/tree/`：上面是概念树入口，下面是领域关系图。

## 部署

推送 `main` 后由 `.github/workflows/deploy.yml` 构建并发布到 Pages。
仓库设置：**Settings → Pages → Source = GitHub Actions**。项目页的 `BASE_PATH` 由工作流自动计算。

## 隐私

`lab/`、`private/` 已在 `.gitignore` 中，用于未发表数据与组内材料；公开内容只谈领域与方法层。

内容以 CC BY-NC-SA 4.0 授权。
