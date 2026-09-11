// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { PublicationFiles } from '../../../plugins/browser/src/client/PublicationFiles.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('contains malformed responses and opens the site workspace without requiring a publication draft', async () => {
  const request = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ home: '/workspace', entries: [] })
  const Files = vi.fn(() => createElement('div', null, 'File explorer'))
  const props = { site: { id: 'site' }, browser: { request, Files }, t: (key: keyof typeof en) => en[key] } as unknown as ComponentProps<typeof PublicationFiles>
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => { root.render(createElement(PublicationFiles, props)) })
    expect(request).toHaveBeenCalledWith({ action: 'site.files.list', siteId: 'site' }, expect.any(AbortSignal))
    expect(container.textContent).toContain(en.filesWorkspace)
    expect(container.textContent).not.toContain(en.filesNoDraft)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(en.filesInvalidResponse)
    expect(Files).not.toHaveBeenCalled()
    await act(async () => { container.querySelector('button')!.click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(en.filesInvalidResponse)
    expect(Files).not.toHaveBeenCalled()
    await act(async () => { container.querySelector('button')!.click() })
    expect(container.textContent).toContain('File explorer')
    expect(Files.mock.calls[0]?.[0]).toMatchObject({ root: { home: '/workspace', entries: [] } })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    request.mockResolvedValueOnce({ home: '/workspace/webmcp-publish-exact', entries: [] })
    await act(async () => { root.render(createElement(PublicationFiles, { ...props, draft: 'webmcp-publish-exact' })) })
    expect(request).toHaveBeenLastCalledWith({ action: 'market.files.list', siteId: 'site', draft: 'webmcp-publish-exact' }, expect.any(AbortSignal))
    expect(container.textContent).toContain(en.filesDraft)

  } finally { await act(async () => { root.unmount() }) }
})
