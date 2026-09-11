import { expect, it } from 'vitest';
import { webmcpLink, webmcpWindowUrl } from './webmcp-links.js';
it('routes a protocol launch only to the local market surface and preserves its request in a fragment', () => {
  const link = 'deepdeck://webmcp/install?repository=https%3A%2F%2Fgithub.com%2Ftest%2Frepo&commit=' + 'a'.repeat(40);
  const url = new URL(webmcpWindowUrl('http://127.0.0.1:3210', link)!);
  expect(url.origin).toBe('http://127.0.0.1:3210');
  expect(url.pathname).toBe('/');
  expect(url.searchParams.get('deepdeck-surface')).toBe('webmcp-market');
  expect(new URLSearchParams(url.hash.slice(1)).get('install')).toBe(link);
});
it.each(['https://evil.test/install', 'deepdeck://webmcp/other?repository=x', 'deepdeck://password@webmcp/install?repository=x', 'deepdeck://webmcp/install', 'deepdeck://webmcp/install?repository=' + 'x'.repeat(3000)])('ignores unrelated or malformed protocol requests', link => {
  expect(webmcpLink(link)).toBeUndefined();
});
