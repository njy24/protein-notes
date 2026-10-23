#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本项目的配图。用法：python3 concept-tree/scripts/gen_figures.py --config concept-tree.json"""
import os
import sys

# 让 figlib / gen_figures 可被导入
_SKILL = os.environ.get("CONCEPT_TREE_HOME", "")
for _d in (_SKILL, os.path.join(_SKILL, "scripts")):
    if _d and _d not in sys.path:
        sys.path.insert(0, _d)

from figlib import Fig, C                      # noqa: E402
from gen_figures import figure                 # noqa: E402


@figure("example-term")
def _f_example() -> Fig:
    f = Fig(720, 240, "示例：一张图只讲一件事")
    f.box(24, 60, 200, 80, "左边", ["第一行", "第二行"], "blue")
    f.arrow([(228, 100), (300, 100)], label="流向")
    f.box(304, 60, 200, 80, "右边", ["结论"], "green")
    f.caption(24, 200, "把「所以呢」写在图里，不要只画示意。")
    return f
