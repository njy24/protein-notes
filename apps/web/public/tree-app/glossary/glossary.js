/* ============================================================
   CSA2 术语阅读器 — 运行时
   依赖：glossary/terms.js（由 tools/build_glossary.py 生成）
   功能：点击任意 a.t 打开右侧抽屉；抽屉内的术语可继续点，形成可回溯的
         学习路径（面包屑 = 你一路钻进来的轨迹）。
   ============================================================ */
(function () {
  "use strict";

  var G = window.GLOSSARY || {};
  var CATS = window.GLOSSARY_CATS || {};
  var LEVELS = window.GLOSSARY_LEVELS || { 1: "零基础可读", 2: "需要一点前置", 3: "偏进阶" };
  if (!Object.keys(G).length) { return; }

  /* ---------------------------------------------------------- 匹配器 */
  var _matcher = null, _byLower = {};

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function buildMatcher() {
    if (_matcher) { return; }
    var pairs = [];
    Object.keys(G).forEach(function (id) {
      var t = G[id];
      var forms = [t.term].concat(t.aka || []);
      forms.forEach(function (s) {
        s = (s || "").trim();
        if (s.length < 2) { return; }
        pairs.push([s, id]);
      });
    });
    pairs.sort(function (a, b) { return b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1); });
    var seen = {}, uniq = [];
    pairs.forEach(function (p) {
      if (seen[p[0]]) { return; }
      seen[p[0]] = 1;
      uniq.push(p);
      _byLower[p[0].toLowerCase()] = p[1];
    });
    var alts = uniq.map(function (p) {
      var s = p[0];
      var isAscii = /^[\x00-\x7F]+$/.test(s);
      return isAscii
        ? "(?<![A-Za-z0-9_])" + escapeRe(s) + "(?![A-Za-z0-9_])"
        : escapeRe(s);
    });
    _matcher = new RegExp(alts.join("|"), "g");
  }

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** 术语库正文允许用 **…** 表示加粗；这里统一转成 <strong>。*/
  function emphasize(html) {
    return html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  /** 把一段纯文本变成带术语链接的 HTML；selfId 不会被链接（避免自指）。*/
  function linkText(text, selfId) {
    buildMatcher();
    // 先切出 HTML 实体，避免在 &amp; 之类的内部匹配到术语
    var tokens = escHtml(text).split(/(&[a-zA-Z]+;|&#\d+;)/);
    return tokens.map(function (tok, i) {
      if (i % 2 === 1) { return tok; }
      return tok.replace(_matcher, function (m) {
        var id = _byLower[m.toLowerCase()];
        if (!id || id === selfId) { return m; }
        return '<a class="t" data-t="' + id + '">' + m + "</a>";
      });
    }).join("");
  }

  /** linkText + 加粗，卡片正文统一走这个。*/
  /* [[term-id]] 是显式链接：直接指向某个词条，不受表面形式匹配影响。
     它在自动匹配之前处理，所以用它写的链接一定生效。 */
  var EXPLICIT_RE = /\[\[([^\]\s]+)\]\]/g;

  function explicitLinks(text, selfId) {
    return String(text == null ? "" : text).replace(EXPLICIT_RE, function (m, id) {
      if (!G[id] || id === selfId) { return G[id] ? G[id].term : ""; }
      return '<a class="t" data-t="' + id + '">' + G[id].term + "</a>";
    });
  }

  function rich(text, selfId) {
    return emphasize(linkText(explicitLinks(text, selfId), selfId));
  }

  /* ---------------------------------------------------------- DOM */
  var drawer, backdrop, crumbs, body, backBtn, closeBtn, searchIn;
  var trailBtn, trailPanel;
  var stack = [];        // 当前下钻链路（面包屑）
  /* 走过的路径存成一棵【树】。
     节点身份 = 从根到它的完整路径（如 "1>2>5"），所以「1→2→3→4 之后回到 2 再 2→5」
     会自然长成 2 的两个子节点，而不是两条独立记录。 */
  var treeRoot = { key: "", children: [] };
  var treeNodes = { "": treeRoot };
  var visitOrder = 0;    // 按首次访问顺序编号
  var trailOpen = false;
  var TRAIL_KEY = "gl-trail-v1";   // sessionStorage 的键（三份 HTML 共用一个标签页会话）
  var searchMode = false;

  function buildUI() {
    backdrop = document.createElement("div");
    backdrop.id = "gl-backdrop";
    backdrop.addEventListener("click", close);

    drawer = document.createElement("aside");
    drawer.id = "gl-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "术语解释");
    drawer.innerHTML =
      '<div id="gl-top">' +
        '<div id="gl-crumbs"></div>' +
        '<div id="gl-tools">' +
          '<button id="gl-back" type="button">← 返回上一层</button>' +
          '<button id="gl-trail" type="button" title="看看这一路走来点过哪些词条">' +
            "🕘 走过的路径</button>" +
          '<input id="gl-search-in" type="search" placeholder="搜索术语…">' +
          '<button id="gl-close" type="button">✕ 关闭</button>' +
        "</div>" +
        '<div id="gl-trail-panel"></div>' +
      "</div>" +
      '<div id="gl-body"></div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    crumbs = drawer.querySelector("#gl-crumbs");
    body = drawer.querySelector("#gl-body");
    backBtn = drawer.querySelector("#gl-back");
    closeBtn = drawer.querySelector("#gl-close");
    searchIn = drawer.querySelector("#gl-search-in");
    trailBtn = drawer.querySelector("#gl-trail");
    trailPanel = drawer.querySelector("#gl-trail-panel");

    trailBtn.addEventListener("click", toggleTrail);
    trailPanel.addEventListener("click", function (e) {
      // 折叠三角：只收放，不跳转
      var f = e.target.closest && e.target.closest("[data-trail-fold]");
      if (f) {
        var fk = f.dataset.trailFold;
        if (treeNodes[fk]) {
          treeNodes[fk].collapsed = !treeNodes[fk].collapsed;
          renderTrail();
        }
        return;
      }
      var a = e.target.closest && e.target.closest("[data-trail-go]");
      if (!a) { return; }
      var id = a.dataset.trailGo;
      if (a.dataset.trailAct === "copy") {
        var lines = [];
        (function walk(keys, depth) {
          keys.forEach(function (k, i) {
            var nd = treeNodes[k];
            if (!nd) { return; }
            var last = i === keys.length - 1;
            lines.push("  ".repeat(depth) + (depth ? (last ? "└ " : "├ ") : "") +
                       G[nd.id].term);
            if (nd.children.length) { walk(nd.children, depth + 1); }
          });
        })(treeRoot.children, 0);
        var txt = lines.join("\n");
        var done = function (okc) {
          var b = trailPanel.querySelector('[data-trail-act="copy"]');
          if (b) { b.textContent = okc ? "已复制" : "复制失败";
                   setTimeout(function () { b.textContent = "复制"; }, 1400); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () { done(true); },
                                                  function () { done(false); });
        } else { done(false); }
        return;
      }
      if (id === "clear") {
        treeRoot = { key: "", children: [] };
        treeNodes = { "": treeRoot };
        visitOrder = 0;
        saveTrail();
        renderTrail();
        return;
      }
      // 关键：跳到【那个节点所在的整条路径】，而不是在当前链尾追加。
      // 否则「1→2→3→4 之后点 2」会变成 1→2→3→4→2，永远长不出分支。
      var key = a.dataset.trailKey;
      if (key !== undefined && treeNodes[key]) {
        stack = treeNodes[key].path.slice();
        trailOpen = false;
        searchMode = false;
        openDrawer();
        paint();
        return;
      }
      if (G[id]) { push(id); }
    });
    backBtn.addEventListener("click", pop);
    closeBtn.addEventListener("click", close);
    searchIn.addEventListener("input", function () { renderSearch(searchIn.value); });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("on")) {
        if (trailOpen) { trailOpen = false; renderTrail(); } else { close(); }
      }
      if (e.altKey && e.key === "ArrowLeft" && drawer.classList.contains("on")) { pop(); }
    });

    // 抽屉内部的术语点击（事件委托，天然支持任意深度）
    body.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a.t");
      if (!a) { return; }
      e.preventDefault();
      var id = a.dataset.t;
      if (G[id]) { push(id); }
    });

    // 悬停某个节点时，把它到根的整条链点亮 —— 回头看"我是从哪岔过来的"很有用
    trailPanel.addEventListener("mouseover", function (e) {
      var a = e.target.closest && e.target.closest("[data-trail-key]");
      if (!a) { return; }
      var path = (treeNodes[a.dataset.trailKey] || {}).path || [];
      var keys = path.map(function (_, i) { return path.slice(0, i + 1).join(">"); });
      trailPanel.querySelectorAll(".tr-node").forEach(function (el) {
        el.classList.toggle("hl", keys.indexOf(el.dataset.trailKey) >= 0);
      });
    });
    trailPanel.addEventListener("mouseleave", function () {
      trailPanel.querySelectorAll(".tr-node.hl").forEach(function (el) {
        el.classList.remove("hl");
      });
    });

    window.addEventListener("hashchange", function () {
      // a term link inside an inlined diagram lands here
      if (!applyHash() && drawer.classList.contains("on")) { close(true); }
    });
  }

  /* ---------------------------------------------------------- 渲染 */
  function crumbsHtml() {
    var out = ['<span class="cb" data-i="-1">术语地图</span>'];
    stack.forEach(function (id, i) {
      out.push('<span class="sep">›</span>');
      out.push('<span class="cb' + (i === stack.length - 1 ? " cur" : "") +
               '" data-i="' + i + '">' + escHtml(G[id].term) + "</span>");
    });
    if (stack.length > 1) {
      out.push('<span class="pathlen">第 ' + stack.length + " 层</span>");
    }
    return out.join("");
  }

  function related(id, limit) {
    var ids = [], seen = {};
    // 1) 显式指定的「树骨架」：作者保证这些是这个词条该往下走的方向
    (G[id].rel || []).forEach(function (t) {
      if (t !== id && !seen[t] && G[t]) { seen[t] = 1; ids.push(t); }
    });
    // 2) 正文里自然提到的
    var host = document.createElement("div");
    host.innerHTML = G[id].body.map(function (p) { return rich(p, id); }).join("");
    host.querySelectorAll("a.t").forEach(function (a) {
      var t = a.dataset.t;
      if (t !== id && !seen[t]) { seen[t] = 1; ids.push(t); }
    });
    // 正文里没提到的，用同分类补齐
    if (ids.length < 6) {
      Object.keys(G).forEach(function (t) {
        if (t !== id && !seen[t] && G[t].cat === G[id].cat) { seen[t] = 1; ids.push(t); }
      });
    }
    // 显式骨架保持作者给定顺序，其余按难度排序
    var backbone = (G[id].rel || []).filter(function (t) { return !!G[t]; });
    var rest = ids.filter(function (t) { return backbone.indexOf(t) < 0; });
    rest.sort(function (a, b) { return G[a].level - G[b].level; });
    return backbone.concat(rest).slice(0, limit || 14);
  }

  function cardHtml(id) {
    var t = G[id];
    var akas = (t.aka || []).filter(function (a) { return a !== t.term; }).slice(0, 6);
    var h = ['<div class="gl-card">'];
    h.push('<div class="gl-head"><h2>' + escHtml(t.term) + "</h2></div>");
    h.push('<div class="gl-badges">' +
           '<span class="gl-badge cat">' + escHtml(CATS[t.cat] || t.cat) + "</span>" +
           '<span class="gl-badge lv' + t.level + '">L' + t.level + " · " +
           escHtml(LEVELS[t.level] || "") + "</span></div>");
    if (akas.length) {
      h.push('<div class="gl-aka">也叫：' + akas.map(escHtml).join(" · ") + "</div>");
    }
    h.push('<div class="gl-one">' + rich(t.one, id) + "</div>");
    var figs = window.GLOSSARY_FIGS || {};
    if (figs[id]) {
      h.push('<figure class="gl-fig">' + figs[id] + "</figure>");
    }
    t.body.forEach(function (p) { h.push("<p>" + rich(p, id) + "</p>"); });

    // ---- 深入层：公式 / 机制细读 / 常见误解 / 证据 ----
    if (t.math) {
      h.push('<div class="gl-sec">核心形式</div><div class="gl-math">' +
             escHtml(t.math) + "</div>");
    }
    if (t.deep && t.deep.length) {
      h.push('<div class="gl-sec">深入</div>');
      t.deep.forEach(function (p) { h.push('<p class="gl-deep">' + rich(p, id) + "</p>"); });
    }
    if (t.misconception) {
      h.push('<div class="gl-mis"><b>常见误解</b>' + rich(t.misconception, id) + "</div>");
    }
    if (t.evidence) {
      h.push('<div class="gl-ev"><b>证据</b>' + escHtml(t.evidence) + "</div>");
    }
    if (t.why) {
      h.push('<div class="gl-why"><b>为什么在这个项目里重要：</b>' +
             rich(t.why, id) + "</div>");
    }
    var rel = related(id);
    if (rel.length) {
      h.push('<div class="gl-sec">顺着往下钻</div><div class="gl-rel">');
      rel.forEach(function (r) {
        h.push('<a data-t="' + r + '">' + escHtml(G[r].term) +
               " <small>L" + G[r].level + "</small></a>");
      });
      h.push("</div>");
    }
    h.push('<div class="gl-nav">' +
           '<button type="button" data-nav="search"><span>找不到想要的？</span>搜索全部 ' +
           Object.keys(G).length + " 个词条</button>" +
           (stack.length > 1
             ? '<button type="button" data-nav="up"><span>回到上一层</span>' +
               escHtml(G[stack[stack.length - 2]].term) + "</button>"
             : "") +
           "</div>");
    h.push("</div>");
    return h.join("");
  }

  function paint() {
    registerPath();          // 任何一次导航都让当前路径进树
    crumbs.innerHTML = crumbsHtml();
    body.innerHTML = stack.length ? cardHtml(stack[stack.length - 1]) : "";
    body.scrollTop = 0;
    backBtn.disabled = stack.length < 2;
    stack.forEach(markSeen);
    renderTrail();
    saveTrail();
    syncHash();
  }

  /* 把当前这条 stack 注册进树里（连同它的所有前缀）。
     节点按【首次访问顺序】编号，children 也按访问顺序排列。 */
  function registerPath() {
    for (var i = 1; i <= stack.length; i++) {
      var p = stack.slice(0, i);
      var key = p.join(">");
      if (treeNodes[key]) { continue; }
      var parentKey = i > 1 ? stack.slice(0, i - 1).join(">") : "";
      var node = { key: key, id: p[i - 1], path: p, children: [], order: ++visitOrder };
      treeNodes[key] = node;
      (treeNodes[parentKey] || treeRoot).children.push(key);
    }
    saveTrail();
  }

  function trailCount() { return Math.max(0, visitOrder); }

  /* 分叉点 = 有 ≥2 个子节点的节点。表头原来显示的是"根节点个数"，
     一个链式路径会被说成"1 条分支"，是错的。 */
  function branchPoints() {
    var n = 0;
    Object.keys(treeNodes).forEach(function (k) {
      if (treeNodes[k].children.length >= 2) { n++; }
    });
    return n;
  }

  function maxDepth() {
    var d = 0;
    Object.keys(treeNodes).forEach(function (k) {
      var nd = treeNodes[k];
      if (k && nd.path && nd.path.length > d) { d = nd.path.length; }
    });
    return d;
  }

  /* ---- 持久化：三份 HTML 是各自独立的页面，靠 sessionStorage 让树活到最后 ---------- */
  function saveTrail() {
    try {
      sessionStorage.setItem(TRAIL_KEY, JSON.stringify({
        nodes: Object.keys(treeNodes).filter(function (k) { return k; })
          .map(function (k) {
            var n = treeNodes[k];
            return [k, n.id, n.order, n.path.join(">")];
          }),
        order: visitOrder
      }));
    } catch (e) { /* 隐私模式或 file:// 下可能被拒 */ }
  }

  function loadTrail() {
    var raw;
    try { raw = sessionStorage.getItem(TRAIL_KEY); } catch (e) { return; }
    if (!raw) { return; }
    try {
      var data = JSON.parse(raw);
      (data.nodes || []).forEach(function (row) {
        var key = row[0], id = row[1], order = row[2], path = row[3].split(">");
        if (!G[id]) { return; }                       // 换了文档，词条表可能不同
        treeNodes[key] = { key: key, id: id, path: path,
                           children: [], order: order };
      });
      // 二次遍历补父子关系（先建全节点，避免顺序问题）
      Object.keys(treeNodes).forEach(function (k) {
        var n = treeNodes[k];
        if (!k) { return; }
        var parentKey = n.path.length > 1 ? n.path.slice(0, -1).join(">") : "";
        var parent = treeNodes[parentKey];
        if (parent && parent.children.indexOf(k) < 0) { parent.children.push(k); }
      });
      Object.keys(treeNodes).forEach(function (k) {
        if (k) { treeNodes[k].children.sort(function (a, b) {
          return treeNodes[a].order - treeNodes[b].order; }); }
      });
      visitOrder = data.order || 0;
    } catch (e) { /* 存的东西坏了就当没有 */ }
  }

  // 分类配色：按分类在 GLOSSARY_CATS 里的次序取色，稳定且与文档主题协调
  var CAT_COLORS = ["#6366f1", "#0f7b52", "#b4530a", "#0ea5e9",
                    "#a855f7", "#e11d48", "#64748b", "#ca8a04"];
  var catIndex = null;
  function catColor(cat) {
    if (!catIndex) {
      catIndex = {};
      var i = 0;
      for (var k in CATS) { if (CATS.hasOwnProperty(k)) { catIndex[k] = i++; } }
    }
    var n = catIndex[cat];
    return CAT_COLORS[(n === undefined ? 0 : n) % CAT_COLORS.length];
  }

  function nodeHtml(key) {
    var n = treeNodes[key];
    var t = G[n.id];
    if (!t) { return ""; }
    var onPath = stack.indexOf(n.id) >= 0 &&
                 stack.slice(0, n.path.length).join(">") === key;
    var cur = stack.length === n.path.length && onPath;
    var cls = "tr-node" + (cur ? " cur" : (onPath ? " onpath" : ""));
    var has = n.children.length > 0;
    var collapsed = !!n.collapsed;
    var lead = has
      ? '<span class="tr-fork" data-trail-fold="' + key + '" title="收起 / 展开这一支">' +
        (collapsed ? "▸" : "▾") + "</span>"
      : '<span class="tr-fork tr-leaf">·</span>';
    var kick = has
      ? '<span class="tr-kidn" title="这一支下面有 ' + n.children.length + ' 个词条">' +
        n.children.length + "</span>"
      : "";
    var kids = (has && !collapsed)
      ? '<ul class="tr-kids">' + n.children.map(nodeHtml).join("") + "</ul>"
      : "";
    return '<li>' +
      '<div class="' + cls + '" data-trail-go="' + n.id +
        '" data-trail-key="' + key + '" title="跳到这个词条（会截断到它所在的那一层）">' +
        lead +
        '<span class="tr-dot" style="background:' + catColor(t.cat) + '"></span>' +
        '<span class="tr-ord">' + n.order + "</span>" +
        '<span class="tr-nm">' + escHtml(t.term) + "</span>" +
        kick +
        '<span class="tr-cat">' + escHtml(CATS[t.cat] || t.cat) + "</span>" +
      "</div>" +
      (collapsed && has ? '<div class="tr-folded">已收起 ' + n.children.length +
        " 个分支</div>" : "") + kids + "</li>";
  }

  /* 走过的路径：显示成一棵树。分支处一眼能看出「从哪个词岔出去的」。 */
  function renderTrail() {
    if (!trailPanel) { return; }
    var n = trailCount();
    if (trailBtn) {
      trailBtn.textContent = "🕘 走过的路径" + (n ? " " + n : "");
      trailBtn.classList.toggle("has", n > 0);
    }
    if (!trailOpen) { trailPanel.classList.remove("on"); return; }
    trailPanel.classList.add("on");
    if (!n) {
      trailPanel.innerHTML =
        '<div class="tr-empty">还没有走过任何词条。<br>' +
        "点开任意带虚线的术语，这里会长出一棵你走过的树。</div>";
      return;
    }
    var bp = branchPoints(), md = maxDepth();
    trailPanel.innerHTML =
      '<div class="tr-head">' +
        "<span>走过 <b>" + n + "</b> 个词条" +
        (bp ? " · <b>" + bp + "</b> 处分支" : "") +
        (md > 1 ? " · 最深 " + md + " 层" : "") +
        " · 当前在第 " + stack.length + " 层</span>" +
        '<span class="tr-acts">' +
          '<button type="button" data-trail-act="copy" title="把这棵树复制成文本">复制</button>' +
          '<button type="button" data-trail-go="clear">清空</button>' +
        "</span>" +
      "</div>" +
      '<ul class="tr-tree">' + treeRoot.children.map(nodeHtml).join("") + "</ul>";
  }

  function toggleTrail() {
    trailOpen = !trailOpen;
    renderTrail();
  }

  function markSeen(id) {
    document.querySelectorAll('a.t[data-t="' + id + '"]').forEach(function (a) {
      a.classList.add("gl-seen");
    });
  }

  /* ---------------------------------------------------------- 搜索 */
  function renderSearch(q) {
    searchMode = true;
    q = (q || "").trim().toLowerCase();
    var ids = Object.keys(G);
    var hits = ids.filter(function (id) {
      if (!q) { return true; }
      var t = G[id];
      return (t.term + " " + (t.aka || []).join(" ") + " " + t.one + " " +
              t.body.join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    hits.sort(function (a, b) {
      var ta = G[a].term.toLowerCase(), tb = G[b].term.toLowerCase();
      var ia = ta.indexOf(q), ib = tb.indexOf(q);
      if (q && ia !== ib) { return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); }
      return G[a].level - G[b].level || (ta < tb ? -1 : 1);
    });
    var h = ['<div class="gl-sec">' + (q ? "搜索结果" : "全部术语") +
             " · " + hits.length + " 条</div>"];
    if (!hits.length) {
      h.push('<div class="gl-empty">没有匹配的术语。换个说法试试，' +
             "例如只输入英文缩写，或者点上面面包屑退回去。</div>");
    } else {
      h.push('<div class="gl-hits">');
      hits.slice(0, 200).forEach(function (id) {
        var t = G[id];
        h.push('<div class="gl-hit" data-t="' + id + '">' +
               '<span class="c">' + escHtml(CATS[t.cat] || t.cat) + " · L" + t.level +
               "</span><div class=\"h\">" + escHtml(t.term) + "</div><p>" +
               escHtml(t.one) + "</p></div>");
      });
      h.push("</div>");
    }
    body.innerHTML = h.join("");
    body.scrollTop = 0;
    crumbs.innerHTML = '<span class="cb" data-i="-1">术语地图</span>' +
      '<span class="sep">›</span><span class="cb cur">搜索</span>';
    backBtn.disabled = !stack.length;
  }

  /* ---------------------------------------------------------- 行为 */
  function openDrawer() {
    backdrop.classList.add("on");
    drawer.classList.add("on");
    document.documentElement.style.overflow = "hidden";
  }

  function close(fromHash) {
    drawer.classList.remove("on");
    backdrop.classList.remove("on");
    document.documentElement.style.overflow = "";
    searchMode = false;
    trailOpen = false;
    renderTrail();
    searchIn.value = "";
    if (!fromHash && /^#!t=/.test(location.hash)) {
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) { /* file:// 下可能被拒绝 */ }
    }
  }

  /* 记录一次访问。所有进入词条的路径都必须经过这里，
     否则「从页面直接点进去的第一次」不会被记下（曾经就是这么漏的）。 */
  function recordVisit(id) {
    if (!G[id]) { return; }
    registerPath();
  }


  function push(id) {
    if (!G[id]) { return; }
    stack.push(id);
    recordVisit(id);
    trailOpen = false;
    searchMode = false;
    searchIn.value = "";
    openDrawer();
    paint();
  }

  function pop() {
    if (stack.length < 2) { return; }
    stack.pop();
    paint();
  }

  function goDepth(i) {
    if (i < 0) { close(); return; }
    stack = stack.slice(0, i + 1);
    paint();
  }

  function syncHash() {
    if (!stack.length) { return; }
    try {
      history.replaceState(null, "", "#!t=" + stack.join(">"));
    } catch (e) { /* file:// 下某些浏览器会拒绝，忽略即可 */ }
  }

  /** 读取 #!t=a>b>c；成功则打开对应学习路径。*/
  function applyHash() {
    var m = /^#!t=(.+)$/.exec(location.hash);
    if (!m) { return false; }
    var ids = m[1].split(">").filter(function (i) { return !!G[i]; });
    if (!ids.length) { return false; }
    if (ids.join(">") === stack.join(">") && drawer.classList.contains("on")) { return true; }
    stack = ids;
    recordVisit(ids[ids.length - 1]);
    searchMode = false;
    searchIn.value = "";
    openDrawer();
    paint();
    return true;
  }

  /* ---------------------------------------------------------- 启动 */
  function boot() {
    loadTrail();          // 先把上次的树捞回来（同一标签页会话内切文档不丢）
    buildUI();
    renderTrail();        // 立刻刷新按钮计数，否则要等第一次点击才显示

    // 页面上的术语链接（两份文档 + 术语地图）
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented) { return; }       // 抽屉内部已经处理过了
      var a = e.target.closest && e.target.closest("a.t");
      if (!a || drawer.contains(a)) { return; }
      e.preventDefault();
      var id = a.dataset.t;
      if (!G[id]) { return; }
      stack = [id];
      recordVisit(id);
      openDrawer();
      paint();
    });

    // 术语地图页的卡片：标题链接已由 a.t 处理，整卡也可点
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented) { return; }
      var hit = e.target.closest && e.target.closest(".gl-hit");
      if (!hit) { return; }
      push(hit.dataset.t);
    });

    // BUG3: 内联矢量图里的 <a href="#!t=...">。浏览器行为不完全一致，
    //       所以直接接管点击，不依赖 URL 跳转。
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented) { return; }
      var a = e.target.closest && e.target.closest('a[href^="#!t="]');
      if (!a) { return; }
      e.preventDefault();
      var ids = a.getAttribute("href").slice(4).split(">")
                 .filter(function (i) { return !!G[i]; });
      if (ids.length) {
        stack = ids;
        recordVisit(ids[ids.length - 1]);
        openDrawer();
        paint();
      }
    });

    // 面包屑
    crumbs.addEventListener("click", function (e) {
      var cb = e.target.closest && e.target.closest(".cb");
      if (!cb) { return; }
      goDepth(parseInt(cb.dataset.i, 10));
    });

    // 卡片底部的两个按钮
    body.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-nav]");
      if (!b) { return; }
      if (b.dataset.nav === "up") { pop(); }
      else { searchIn.focus(); renderSearch(""); }
    });

    // 深链接：#!t=a>b>c（也用于内联图里的术语链接）
    applyHash();

    // 链接标记显眼程度切换
    var btn = document.querySelector(".gl-toggle");
    if (btn) {
      var modes = [
        ["gl-plain", "术语标记：隐藏"],
        ["", "术语标记：低调"],
        ["gl-strong", "术语标记：明显"]
      ];
      var mi = 1;
      btn.textContent = modes[mi][1];
      btn.addEventListener("click", function () {
        if (modes[mi][0]) { document.body.classList.remove(modes[mi][0]); }
        mi = (mi + 1) % modes.length;
        if (modes[mi][0]) { document.body.classList.add(modes[mi][0]); }
        btn.textContent = modes[mi][1];
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
