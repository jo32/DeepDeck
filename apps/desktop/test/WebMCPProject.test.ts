// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { WebMCPProjectPanel } from '../../../plugins/browser/src/client/WebMCPProjectPanel.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root; let container: HTMLDivElement
afterEach(async () => { await act(async () => root?.unmount()); container?.remove() })
const state = { directory: '/site/webmcp-project', sourcePath: '/site/webmcp-project/src/webmcp.ts', upstream: { commit: 'a'.repeat(40) }, sourceDigest: 'b'.repeat(64), changed: true, conflicts: [], merging: false }
async function mount(request: ReturnType<typeof vi.fn>) {
  const onContinue = vi.fn(async () => {}), onFiles = vi.fn(), onPublish = vi.fn(async () => {})
  const props = { site: { id: 'site' }, browser: { request }, running: false, onContinue, onFiles, onPublish, t: (key: keyof typeof en) => en[key] } as unknown as ComponentProps<typeof WebMCPProjectPanel>
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(createElement(WebMCPProjectPanel, props)))
  return { onContinue, onFiles, onPublish }
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === text)
  expect(button, text).toBeDefined()
  await act(async () => button!.click())
}
it('offers continuing the installed source before a project exists', async () => {
  const { onContinue } = await mount(vi.fn(async () => null))
  expect(container.textContent).toContain(en.projectStartHint)
  await click(en.projectContinue)
  expect(onContinue).toHaveBeenCalledOnce()
  expect(container.textContent).not.toContain(en.projectCheck)
})
it('previews without merging or installing and discards the preview when cancelled', async () => {
  const request = vi.fn(async (input: any) => input.action === 'project.state' ? state : input.action === 'project.preview' ? { token: 'preview', upstream: { commit: 'c'.repeat(40) }, diff: '+ added capability', conflicts: [] } : {})
  await mount(request)
  await click(en.projectCheck)
  expect(container.textContent).toContain('+ added capability')
  expect(request.mock.calls.some(([input]) => ['project.merge', 'market.install'].includes(input.action))).toBe(false)
  await click(en.cancel)
  expect(request).toHaveBeenCalledWith({ action: 'project.cancel', siteId: 'site', token: 'preview' })
  expect(container.textContent).not.toContain('+ added capability')
})
it('conflict confirmation changes only the working project and opens its files', async () => {
  const request = vi.fn(async (input: any) => input.action === 'project.state' ? state : input.action === 'project.preview' ? { token: 'preview', upstream: { commit: 'c'.repeat(40) }, diff: 'conflict', conflicts: ['src/webmcp.ts'] } : {})
  const { onFiles, onPublish } = await mount(request)
  await click(en.projectCheck); await click(en.projectMerge)
  expect(request).toHaveBeenCalledWith({ action: 'project.merge', siteId: 'site', token: 'preview' })
  expect(onFiles).toHaveBeenCalledOnce()
  expect(request.mock.calls.some(([input]) => input.action === 'market.install')).toBe(false)
  await click(en.projectContribute); await click(en.projectFork)
  expect(onPublish.mock.calls).toEqual([['contribute'], ['fork']])
})
