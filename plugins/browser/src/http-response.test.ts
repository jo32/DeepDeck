import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from './index.js'
import { BrowserSiteStore } from './site-store.js'

vi.mock('dsh-better-sidebar', () => ({ apply: () => {} }))
vi.mock('./runtime.js', () => ({ BrowserRuntime: class { dispose() {} } }))
vi.mock('./native-client.js', () => ({ BrowserNativeClient: class { async request() {} } }))

let directory: string
afterEach(async () => { vi.unstubAllEnvs(); if (directory) await rm(directory, { recursive: true, force: true }) })

it('preserves absent and populated draft results through the real HTTP handler, while acknowledging void commands', async () => {
  directory = await mkdtemp(join(tmpdir(), 'browser-http-response-'))
  vi.stubEnv('DEEPDECK_BROWSER_HOME', directory)
  const sites = new BrowserSiteStore(directory)
  const site = await sites.ensure('https://example.com')
  type Context = Parameters<typeof apply>[0]
  let handler!: Parameters<Context['webServer']['register']>[0]['handler']
  let dispose!: () => void
  apply({
    reflect: { provide: () => () => {} },
    webServer: { register: route => { handler = route.handler; return () => {} } },
    effect: setup => { dispose = setup() },
  } as Context)
  const request = async (action: object) => {
    const input = Object.assign(Readable.from([JSON.stringify(action)]), {
      method: 'POST', headers: { origin: 'http://127.0.0.1:5000', host: '127.0.0.1:5000' },
    }) as IncomingMessage
    const writeHead = vi.fn()
    const end = vi.fn()
    await handler(input, { writeHead, end } as unknown as ServerResponse)
    expect(writeHead.mock.calls[0]?.[0]).toBe(200)
    return JSON.parse(end.mock.calls[0]?.[0] as string)
  }
  try {
    const list = { action: 'market.files.list', siteId: site.id }
    expect(await request(list)).toBeNull()
    const workspaceList = { action: 'site.files.list', siteId: site.id }
    expect(await request(workspaceList)).toMatchObject({ entries: [], parent: null })
    await writeFile(join(site.workspacePath, 'research.md'), '# Existing report')
    expect(await request(workspaceList)).toMatchObject({ entries: [{ name: 'research.md' }] })
    const draft = join(site.workspacePath, 'webmcp-publish-test')
    await mkdir(draft)
    await writeFile(join(draft, 'webmcp.json'), '{}')
    expect(await request(list)).toMatchObject({ entries: [{ name: 'webmcp.json' }] })
    expect((await request(workspaceList)).entries.map((entry: { name: string }) => entry.name)).toEqual(['webmcp-publish-test', 'research.md'])
    expect(await request({ action: 'command', command: { action: 'layout', top: 100, right: 0 } })).toEqual({ ok: true })
  } finally { dispose() }
})
