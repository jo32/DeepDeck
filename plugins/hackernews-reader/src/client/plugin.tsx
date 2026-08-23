import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepdeck/dsh-client-ui-desktop-chrome/sidebar-contract'
import {
  Button,
  IconBrowseOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepdeck/dsh-app-conversations/app-settings-contract'
import { prepareHackerNewsAction, type PreparedAction } from '../app-actions.js'
import { HackerNewsAppSettings } from './HackerNewsAppSettings.js'

type JsonObject = Record<string, unknown>
type LauncherProps = PropsRuntime<'sidebar.apps'>

interface AppConversationClientService {
  register(definition: {
    readonly id: string
    readonly actions: Readonly<Record<string, (payload: unknown) => PreparedAction>>
  }): () => void
}

const API_PATH = '/api/hackernews-reader'

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function openReaderWindow(): Promise<boolean> {
  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'open-window', payload: {} }),
    })
    if (!response.ok) return false
    const value: unknown = await response.json()
    return isObject(value) && value.sent === true
  } catch {
    return false
  }
}

function HackerNewsLauncher({ wide, closeApps }: LauncherProps) {
  return (
    <Tooltip label="Hacker News" delayMs={500} disabled={wide}>
      <Button
        variant="ghost"
        className="hackerNewsReaderLauncher"
        data-wide={wide}
        aria-label="Hacker News"
        icon={<IconBrowseOutline16 size={wide ? 16 : 18} />}
        onClick={() => {
          void openReaderWindow().then((opened) => {
            if (opened) closeApps()
          })
        }}
      >
        {wide ? 'Hacker News' : null}
      </Button>
    </Tooltip>
  )
}

function installStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@deepdeck/dsh-hackernews-reader'
  style.textContent = `.hackerNewsReaderLauncher{position:relative;flex:none;box-sizing:border-box;width:100%;height:36px;margin:3px 0;padding:0 9px;gap:9px;justify-content:flex-start;overflow:hidden;border:1px solid transparent;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;letter-spacing:-.01em;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.hackerNewsReaderLauncher:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.hackerNewsReaderLauncher:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.hackerNewsReaderLauncher[data-wide='false']{width:36px;height:36px;margin:7px 0 9px;justify-content:center;gap:0;padding:0;border-radius:6px}`
  document.head.appendChild(style)
  return () => style.remove()
}

export const inject = ['slots', 'appConversations']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => installStyles(), 'deepdeck hackernews reader: launcher styles')
  ctx.slots.inject('sidebar.apps', () => ctx.slots.register({
    name: 'sidebar.apps',
    id: 'deepdeck-hackernews-reader',
    order: 20,
    label: 'Hacker News',
  }, HackerNewsLauncher))
  ctx.slots.inject('settings.apps.item', () => ctx.slots.register({
    name: 'settings.apps.item',
    id: 'hackernews-reader',
  }, HackerNewsAppSettings))
  const appConversations = ctx.get('appConversations') as AppConversationClientService | undefined
  if (appConversations === undefined) throw new Error('Hacker News Reader requires app conversations')
  ctx.effect(() => appConversations.register({
    id: 'hackernews-reader',
    actions: {
      explain: payload => prepareHackerNewsAction('explain', payload),
      summarize: payload => prepareHackerNewsAction('summarize', payload),
    },
  }), 'deepdeck hackernews reader: app conversation actions')
}
