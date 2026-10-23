const BASE = import.meta.env.BASE_URL || '/';

/** 生成带部署子路径的内部链接，始终以 / 结尾。 */
export function url(path = '/'): string {
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  let p = path.startsWith('/') ? path : `/${path}`;
  if (!/\.[a-z0-9]+$/i.test(p) && !p.endsWith('/')) p += '/';
  return `${base}${p}` || '/';
}

/** 生成绝对地址（canonical / RSS / sitemap 用）。 */
export function absUrl(path: string, site: URL | undefined): string {
  return new URL(url(path), site ?? 'http://localhost:4321').toString();
}
