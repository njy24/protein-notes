const CJK = /[\u3400-\u9fff\uf900-\ufaff]/g;

export function fmtDate(d: Date, style: 'iso' | 'long' | 'short' = 'short'): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (style === 'iso') return `${y}-${m}-${day}`;
  if (style === 'long') return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`;
  return `${y}.${m}.${day}`;
}

export function fmtRange(a: Date, b: Date): string {
  const sameYear = a.getFullYear() === b.getFullYear();
  const f = (d: Date) => (sameYear ? `${d.getMonth() + 1}.${d.getDate()}` : fmtDate(d, 'short'));
  return `${fmtDate(a, 'short')} — ${f(b)}`;
}

/** 中英混排的粗略阅读时长：中文按 420 字/分钟，西文按 220 词/分钟。 */
export function readingTime(text: string): number {
  const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ');
  const cjk = (clean.match(CJK) || []).length;
  const words = clean.replace(CJK, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(cjk / 420 + words / 220));
}

/**
 * 极简行内 Markdown：**粗体**、`代码`、[文字](链接)。
 * 仅用于受控内容（速递摘要等），不处理块级语法。
 */
export function inline(text = ''): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br />');
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pct(a: number, b: number): string {
  if (!b) return '—';
  return `${Math.round((a / b) * 100)}%`;
}
