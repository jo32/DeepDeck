import { packagePath, record, repositoryUrl } from './webmcp-package.ts'

export const MARKET_MESSAGE = 'deepdeck.webmcp' as const
export interface MarketPackageRef { repository: string; manifestPath: string; commit?: string; repositoryId?: number }
export function marketPackageRef(value: unknown): MarketPackageRef {
  if (!record(value)) throw new Error('Invalid installation request.')
  const result: MarketPackageRef = { repository: repositoryUrl(value.repository), manifestPath: packagePath(value.manifestPath ?? 'webmcp.json') }
  if (value.commit !== undefined) {
    if (typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.commit)) throw new Error('Invalid package commit.')
    result.commit = value.commit
  }
  if (value.repositoryId !== undefined) {
    if (!Number.isSafeInteger(value.repositoryId) || Number(value.repositoryId) <= 0) throw new Error('Invalid repository identity.')
    result.repositoryId = Number(value.repositoryId)
  }
  return result
}
export function marketInstallLink(input: MarketPackageRef): string {
  const ref = marketPackageRef(input)
  const url = new URL('deepdeck://webmcp/install')
  for (const [key, value] of Object.entries(ref)) url.searchParams.set(key, String(value))
  return url.href
}
export function readMarketInstallLink(input: string): MarketPackageRef {
  if (input.length > 2048) throw new Error('Installation link is too long.')
  const url = new URL(input)
  if (url.protocol !== 'deepdeck:' || url.host !== 'webmcp' || url.pathname !== '/install' || url.username || url.password || url.hash) throw new Error('Invalid DeepDeck installation link.')
  const values = Object.fromEntries(url.searchParams)
  return marketPackageRef({ ...values, ...(values.repositoryId ? { repositoryId: Number(values.repositoryId) } : {}) })
}
export function isDesktopParent(origin: string): boolean {
  try { const url = new URL(origin); return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) } catch { return false }
}
