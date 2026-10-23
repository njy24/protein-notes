import { parse } from 'yaml';
import nodesRaw from '../data/atlas/nodes.yml?raw';
import edgesRaw from '../data/atlas/edges.yml?raw';

export type NodeType = 'model' | 'method' | 'paper' | 'data' | 'org' | 'event' | 'concept';
export type Era = 'foundation' | 'structure' | 'design' | 'validation' | 'agent';

export interface AtlasNode {
  id: string;
  label: string;
  label_en?: string;
  type: NodeType;
  year: number;
  era: Era;
  summary: string;
  doi?: string;
  url?: string;
  projects?: string[];
  weight: number;
}

export interface AtlasEdge {
  source: string;
  target: string;
  type: 'extends' | 'uses' | 'enables' | 'related' | 'measures' | 'part-of';
}

export const NODES = parse(nodesRaw) as AtlasNode[];
export const EDGES = parse(edgesRaw) as AtlasEdge[];

export const NODE_TYPES: Record<NodeType, { label: string; color: string }> = {
  model: { label: '模型', color: 'var(--c-blue)' },
  method: { label: '方法', color: 'var(--c-green)' },
  paper: { label: '论文', color: 'var(--c-plum)' },
  data: { label: '数据', color: 'var(--c-ochre)' },
  org: { label: '机构', color: 'var(--c-slate)' },
  event: { label: '事件', color: 'var(--c-accent)' },
  concept: { label: '概念', color: 'var(--muted)' },
};

export const ERAS: Record<Era, { label: string; en: string; years: string; note: string }> = {
  foundation: { label: '基础', en: 'Foundation', years: '1971–2020', note: '结构与序列的公共基础设施' },
  structure: { label: '结构预测', en: 'Structure', years: '2021–2024', note: '从序列到接近实验精度的坐标' },
  design: { label: '生成式设计', en: 'Design', years: '2022–2025', note: '骨架生成、序列反解与条件控制' },
  validation: { label: '实验账本', en: 'Validation', years: '2022–2026', note: '命中率、亲和力与湿实验反馈' },
  agent: { label: '智能体', en: 'Agents', years: '2026–', note: '模型驱动的设计—实验闭环' },
};

export function nodeById(id: string): AtlasNode | undefined {
  return NODES.find((n) => n.id === id);
}

export function neighborsOf(id: string): { node: AtlasNode; type: AtlasEdge['type']; out: boolean }[] {
  const out: { node: AtlasNode; type: AtlasEdge['type']; out: boolean }[] = [];
  for (const e of EDGES) {
    if (e.source === id) {
      const n = nodeById(e.target);
      if (n) out.push({ node: n, type: e.type, out: true });
    } else if (e.target === id) {
      const n = nodeById(e.source);
      if (n) out.push({ node: n, type: e.type, out: false });
    }
  }
  return out;
}
