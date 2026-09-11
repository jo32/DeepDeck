/** Native routing only; the Cordis plugin validates and previews the package. */
export function webmcpLink(value: string): string | undefined {
  try {
    if (value.length > 2048) return undefined;
    const url = new URL(value);
    if (url.protocol !== 'deepdeck:' || url.host !== 'webmcp' || url.pathname !== '/install' || url.username || url.password || url.hash || !url.searchParams.get('repository')) return undefined;
    return url.href;
  } catch { return undefined; }
}
export function webmcpWindowUrl(base: string, link: string): string | undefined {
  const checked = webmcpLink(link);
  if (!checked) return undefined;
  const url = new URL('/', base);
  url.searchParams.set('deepdeck-surface', 'webmcp-market');
  // A fragment keeps the external request out of HTTP access logs.
  url.hash = new URLSearchParams({ install: checked }).toString();
  return url.href;
}
