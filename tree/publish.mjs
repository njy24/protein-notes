/**
 * 将 concept-tree 的构建产物发布到站点静态目录，并注入返回链接与站点配色。
 * 运行：node tree/publish.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'apps/web/public/tree-app');
mkdirSync(resolve(OUT, 'glossary'), { recursive: true });

let html = readFileSync(resolve(ROOT, 'tree/index.html'), 'utf8');
html = html.replace(
  '<div class="wrap">',
  '<div class="wrap"><a class="back" href="../tree/">← 返回折叠之后</a>'
);
const override = `<style>
body{background:#faf8f2;color:#171814}
h1{font-family:'Source Serif 4','Songti SC','Source Han Serif SC',serif;font-weight:600;letter-spacing:-.01em}
.lead,.stat{color:#73746a}
.gl-item{background:#fffdf8;border-color:#e2ddd0;border-left-color:#a3372a;border-radius:2px}
.gl-item.lv1{border-left-color:#a3372a}.gl-item.lv2{border-left-color:#2d5a86}.gl-item.lv3{border-left-color:#86601f}
.gl-item a.t{color:#171814;border-bottom-color:#c9c1ab}
.gl-item a.t:hover{color:#a3372a;border-bottom-color:#a3372a}
#gl-search{background:#fffdf8;border-color:#e2ddd0;border-radius:2px}
.gl-path,.gl-cat h2{border-bottom-color:#171814}
.back{display:inline-block;font-size:13px;color:#73746a;text-decoration:none;margin-bottom:20px;border-bottom:1px solid #dfd8c6}
.back:hover{color:#a3372a;border-color:#a3372a}
</style></head>`;
html = html.replace('</head>', override);
html = html.replace(
  '<div class="tips"></div>',
  '<div class="tips">点开任意词条即可继续下钻；搜索会同时匹配中文名、英文名与解释内容。</div>'
);
html = html.replace('已在两份文档中自动标注链接', '从两条路线或分类进入');
writeFileSync(resolve(OUT, 'index.html'), html, 'utf8');

for (const f of ['glossary.css', 'glossary.js', 'terms.js', 'figures.js']) {
  copyFileSync(resolve(ROOT, 'tree/glossary', f), resolve(OUT, 'glossary', f));
}
console.log(`发布概念树 → ${OUT}`);
