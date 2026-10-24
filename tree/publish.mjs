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
body{background:#fbfbf8;color:#111214;font-family:'Inter','PingFang SC','Hiragino Sans GB','Microsoft YaHei',system-ui,sans-serif;line-height:1.7}
h1{font-family:inherit;font-size:38px;font-weight:650;letter-spacing:-.035em;line-height:1.15}
.lead{color:#3d4147;font-size:16px}
.stat{color:#70757c;font-size:12.5px}
.gl-path{font-size:20px;font-weight:650;letter-spacing:-.02em;border-bottom:1px solid #e7e6e1;padding-bottom:10px}
.gl-cat h2{font-size:19px;font-weight:650;border-bottom:1px solid #e7e6e1;padding-bottom:8px}
.cnt{color:#9aa0a6;font-weight:400;font-size:12px}
.gl-item{background:#fff;border:1px solid #e7e6e1;border-radius:10px;padding:13px 15px;box-shadow:0 1px 2px rgba(16,17,19,.03);transition:border-color .2s,box-shadow .2s}
.gl-item:hover{border-color:#c9d4ff;box-shadow:0 6px 18px -12px rgba(36,71,216,.35)}.gl-item.lv1,.gl-item.lv2,.gl-item.lv3{border-left-color:#e7e6e1}.gl-item.lv1 .gl-lv{background:#edf1ff;color:#2447d8}.gl-item.lv3 .gl-lv{background:#f3f3ee;color:#70757c}
.gl-item a.t{font-weight:600;font-size:15px;letter-spacing:-.01em;color:#111214;border-bottom:1px solid transparent}
.gl-item a.t:hover{color:#2447d8;border-bottom-color:#2447d8}
.gl-lv{font-family:'JetBrains Mono',monospace;font-size:10px;color:#70757c;background:#f3f3ee;border-radius:999px;padding:1px 7px}
.gl-item p{font-size:13px;color:#3d4147;margin-top:5px}
#gl-search{background:#fff;border:1px solid #e7e6e1;border-radius:10px;font-size:15px;padding:12px 15px}
#gl-search:focus{outline:2px solid #c9d4ff;border-color:#2447d8}
.tips{background:#edf1ff;border:0;border-radius:10px;padding:13px 16px;font-size:13px;color:#3d4147}
.back{display:inline-block;font-size:13px;color:#70757c;text-decoration:none;margin-bottom:22px;border-bottom:1px solid #e7e6e1}
.back:hover{color:#2447d8;border-color:#2447d8}
</style></head>`;
html = html.replace('</head>', override);
html = html.replace(
  '<div class="tips"></div>',
  '<div class="tips">点开任意词条即可继续下钻；搜索会同时匹配中文名、英文名与解释内容。</div>'
);
html = html.replace('已在两份文档中自动标注链接', '从两条路线或分类进入');
const search = html.match(/<input id="gl-search"[^>]*>/);
if (search) {
  html = html.replace(search[0], '');
  html = html.replace('<h2 class="gl-path">', `${search[0]}\n<h2 class="gl-path">`);
}
writeFileSync(resolve(OUT, 'index.html'), html, 'utf8');

for (const f of ['glossary.css', 'glossary.js', 'terms.js', 'figures.js']) {
  copyFileSync(resolve(ROOT, 'tree/glossary', f), resolve(OUT, 'glossary', f));
}
console.log(`发布概念树 → ${OUT}`);
