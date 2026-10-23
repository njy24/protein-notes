/**
 * 新建内容骨架。
 *   npm run new -- note my-slug "标题"
 *   npm run new -- brief "本期标题" [issue]
 */
import { existsSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { todayISO, log } from './lib/util.mjs';

const [kind, ...rest] = process.argv.slice(2);
const date = todayISO();
const q = (s) => JSON.stringify(String(s));

if (kind === 'note') {
  const slug = rest[0];
  const title = rest[1] ?? '未命名笔记';
  if (!slug) {
    console.error('用法：npm run new -- note <slug> "标题"');
    process.exit(1);
  }
  const file = resolve('content/deep', `${slug}.mdx`);
  if (existsSync(file)) {
    console.error(`${file} 已存在`);
    process.exit(1);
  }
  const tpl = `---
title: ${q(title)}
subtitle: ""
date: ${date}
summary: "一句话说明这篇要回答的问题（待写）"
tags: []
projects: []
draft: true
citations: []
---

## 问题

这件事为什么值得写？它改变了哪个判断？

## 已知路线

## 它怎么做

## 关键结果

## 在什么条件下会失效

## 对我们的课题意味着什么
`;
  writeFileSync(file, tpl, 'utf8');
  log(`创建 ${file}`);
} else if (kind === 'brief') {
  const title = rest[0] ?? `${date} 速递`;
  const dir = resolve('content/weekly');
  const issues = readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => {
      const m = readFileSync(resolve(dir, f), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      try {
        return Number(parseYaml(m?.[1] ?? '')?.issue ?? 0);
      } catch {
        return 0;
      }
    });
  const issue = Number(rest[1]) || Math.max(0, ...issues) + 1;
  const file = resolve(dir, `${date}.mdx`);
  if (existsSync(file)) {
    console.error(`${file} 已存在`);
    process.exit(1);
  }
  const tpl = `---
title: ${q(title)}
issue: ${issue}
week: ${date.slice(0,4)}-W${String(Math.ceil((new Date(date).getTime() - new Date(date.slice(0,4)+"-01-01").getTime())/604800000)).padStart(2,"0")}
date: ${date}
summary: "本期导语（待写）"
judgement: []
tags: []
draft: true
items:
  - title: "占位条目：请替换或删除"
    url: "https://example.com"
    source: "占位"
    date: ${date}
    category: methods
    tldr: "一句话说清这条是什么"
    tags: []
---

（导语待写）
`;
  writeFileSync(file, tpl, 'utf8');
  log(`创建 ${file}（第 ${issue} 期）`);
} else {
  console.error('用法：npm run new -- note <slug> "标题"   |   npm run new -- brief "标题" [issue]');
  process.exit(1);
}
