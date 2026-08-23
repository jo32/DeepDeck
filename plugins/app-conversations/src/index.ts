import { mkdir, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  APP_CONVERSATION_API_PATH,
  type AppRebuildResult,
  type AppConversationHostDefinition,
  type AppConversationHostRegistry,
  type AppConversationWorkspace,
  type AppCreatorContext,
  type AppSettingsDescriptor,
} from './contracts.js'
import { installAppCreatorMode } from './creator-tools.js'

type JsonObject = Record<string, unknown>

interface WorkspaceEntity {
  readonly id: string
  readonly path: string
  readonly title: string
}

interface AppConversationHostContext {
  readonly workspaceRegistry: {
    create(path: string, title?: string): Promise<WorkspaceEntity>
  }
  readonly webServer: {
    register(route: {
      readonly kind: 'exact'
      readonly path: string
      readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
    }): () => void
  }
  readonly reflect: {
    provide(name: string, value: unknown): () => void
  }
  readonly bunPluginBuilder: AppBunBuilderService
  readonly agentPresets: {
    composedPreset(agentContext: Context): string | undefined
  }
  effect(effect: () => unknown, label: string): unknown
}

interface AppBuildPreview {
  readonly previewId: string
  readonly packageName: string
  readonly confirmation: string
  readonly hotUpdateAvailable: boolean
  readonly hotUpdateReason?: string
}

interface AppBunBuilderService {
  isStatePath?(path: string): boolean
  preview(input: { readonly sourceDirectory: string }, signal?: AbortSignal): Promise<AppBuildPreview>
  hotUpdate(input: {
    readonly previewId: string
    readonly confirmation: string
    readonly signal?: AbortSignal
  }): Promise<{
    readonly packageName: string
    readonly completedAt: string
    readonly hostReloaded: boolean
    readonly buildLog: string
  }>
  discard(previewId: string): Promise<void>
}

const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

export const APP_WORKSPACE_DIRECTORY = join('DeepDeck', 'Apps')
export const inject = [
  'workspaceRegistry',
  'webServer',
  'bunPluginBuilder',
  'agentPresets',
  'tools',
  'systemPrompt',
] as const

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedDefinition(definition: AppConversationHostDefinition): AppConversationHostDefinition {
  const id = definition.id.trim()
  const title = definition.title.trim()
  const workspaceSlug = definition.workspaceSlug.trim()
  const workspaceTitle = definition.workspaceTitle?.trim()
  const packageName = definition.packageName.trim()
  const sourcePackageRoot = resolve(definition.sourcePackageRoot)
  if (!APP_ID_PATTERN.test(id)) throw new Error(`invalid app conversation id '${id}'`)
  if (!APP_ID_PATTERN.test(workspaceSlug)) throw new Error(`invalid app workspace slug '${workspaceSlug}'`)
  if (title.length === 0) throw new Error('app conversation title must not be blank')
  if (workspaceTitle !== undefined && workspaceTitle.length === 0) {
    throw new Error('app workspace title must not be blank')
  }
  if (!PACKAGE_NAME_PATTERN.test(packageName)) throw new Error(`invalid app package name '${packageName}'`)
  if (!isAbsolute(definition.sourcePackageRoot)) throw new Error('app source package root must be absolute')
  return {
    id,
    title,
    workspaceSlug,
    packageName,
    sourcePackageRoot,
    ...(workspaceTitle === undefined ? {} : { workspaceTitle }),
  }
}

export class DefaultAppConversationHostRegistry implements AppConversationHostRegistry {
  private readonly definitions = new Map<string, AppConversationHostDefinition>()
  private readonly sourceDefinitions = new Map<string, Pick<AppConversationHostDefinition, 'packageName' | 'sourcePackageRoot'>>()

  constructor(
    private readonly workspaceRegistry: AppConversationHostContext['workspaceRegistry'],
    private readonly home = homedir(),
    private readonly builder?: AppBunBuilderService,
  ) {}

  register(rawDefinition: AppConversationHostDefinition): () => void {
    let definition = normalizedDefinition(rawDefinition)
    const existing = this.definitions.get(definition.id)
    if (existing !== undefined) {
      throw new Error(`app conversation '${definition.id}' is already registered`)
    }
    const rememberedSource = this.sourceDefinitions.get(definition.id)
    if (this.builder?.isStatePath?.(definition.sourcePackageRoot) === true) {
      if (rememberedSource === undefined || rememberedSource.packageName !== definition.packageName) {
        throw new Error(`app conversation '${definition.id}' cannot register a Builder staging directory as its source`)
      }
      definition = { ...definition, sourcePackageRoot: rememberedSource.sourcePackageRoot }
    } else {
      this.sourceDefinitions.set(definition.id, {
        packageName: definition.packageName,
        sourcePackageRoot: definition.sourcePackageRoot,
      })
    }
    this.definitions.set(definition.id, definition)
    return () => {
      if (this.definitions.get(definition.id) === definition) this.definitions.delete(definition.id)
    }
  }

  async resolve(appId: string): Promise<AppConversationWorkspace> {
    const definition = this.definition(appId)
    const path = join(this.home, APP_WORKSPACE_DIRECTORY, definition.workspaceSlug)
    await mkdir(path, { recursive: true })
    const title = definition.workspaceTitle ?? `Apps · ${definition.title}`
    const workspace = await this.workspaceRegistry.create(path, title)
    return {
      appId: definition.id,
      path: workspace.path,
      title: workspace.title,
      workspaceId: String(workspace.id),
    }
  }

  async resolveCreator(appId: string): Promise<AppConversationWorkspace> {
    const definition = this.definition(appId)
    const workspace = await this.workspaceRegistry.create(
      definition.sourcePackageRoot,
      `Creator · ${definition.title}`,
    )
    return {
      appId: definition.id,
      path: workspace.path,
      title: workspace.title,
      workspaceId: String(workspace.id),
    }
  }

  async creatorContext(cwd: string, signal?: AbortSignal): Promise<AppCreatorContext> {
    const definition = await this.definitionForSource(cwd, signal)
    const descriptor = await this.describe(definition, signal)
    return {
      appId: descriptor.id,
      title: descriptor.title,
      packageName: descriptor.packageName,
      sourcePackageRoot: definition.sourcePackageRoot,
      rebuildAvailable: descriptor.rebuildAvailable,
      ...(descriptor.rebuildReason === undefined ? {} : { rebuildReason: descriptor.rebuildReason }),
    }
  }

  async list(signal?: AbortSignal): Promise<readonly AppSettingsDescriptor[]> {
    const rows: AppSettingsDescriptor[] = []
    for (const definition of [...this.definitions.values()].sort((left, right) => left.title.localeCompare(right.title))) {
      rows.push(await this.describe(definition, signal))
    }
    return rows
  }

  async rebuild(appId: string, signal?: AbortSignal): Promise<AppRebuildResult> {
    const definition = this.definition(appId)
    if (this.builder === undefined) throw new Error('Bun Builder is unavailable.')
    const startedAt = Date.now()
    let preview: AppBuildPreview | undefined
    try {
      preview = await this.builder.preview({ sourceDirectory: definition.sourcePackageRoot }, signal)
      if (preview.packageName !== definition.packageName) {
        throw new Error('the registered App package identity does not match its source')
      }
      if (!preview.hotUpdateAvailable) {
        throw new Error(preview.hotUpdateReason ?? 'This App cannot be rebuilt in place.')
      }
      const result = await this.builder.hotUpdate({
        previewId: preview.previewId,
        confirmation: preview.confirmation,
        ...(signal === undefined ? {} : { signal }),
      })
      return {
        appId,
        packageName: result.packageName,
        completedAt: result.completedAt,
        durationMs: Date.now() - startedAt,
        hostReloaded: result.hostReloaded,
        buildLog: result.buildLog,
      }
    } finally {
      if (preview !== undefined) await this.builder.discard(preview.previewId).catch(() => {})
    }
  }

  async rebuildCreator(cwd: string, signal?: AbortSignal): Promise<AppRebuildResult> {
    return await this.rebuild((await this.definitionForSource(cwd, signal)).id, signal)
  }

  private definition(appId: string): AppConversationHostDefinition {
    const definition = this.definitions.get(appId)
    if (definition === undefined) throw new Error(`unknown app conversation '${appId}'`)
    return definition
  }

  private async definitionForSource(
    cwd: string,
    signal?: AbortSignal,
  ): Promise<AppConversationHostDefinition> {
    signal?.throwIfAborted()
    const source = await realpath(resolve(cwd)).catch(() => resolve(cwd))
    for (const definition of this.definitions.values()) {
      signal?.throwIfAborted()
      const registered = await realpath(definition.sourcePackageRoot)
        .catch(() => resolve(definition.sourcePackageRoot))
      if (registered === source) return definition
    }
    throw new Error(
      'This Creator Workspace is not a registered DeepDeck App source. Launch Vibe Coding from Settings > Apps.',
    )
  }

  private async describe(
    definition: AppConversationHostDefinition,
    signal?: AbortSignal,
  ): Promise<AppSettingsDescriptor> {
    signal?.throwIfAborted()
    if (this.builder === undefined) {
      return {
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        rebuildAvailable: false,
        rebuildReason: 'Bun Builder is unavailable.',
      }
    }
    let preview: AppBuildPreview | undefined
    try {
      preview = await this.builder.preview({ sourceDirectory: definition.sourcePackageRoot }, signal)
      if (preview.packageName !== definition.packageName) {
        throw new Error('the registered App package identity does not match its source')
      }
      return {
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        rebuildAvailable: preview.hotUpdateAvailable,
        ...(preview.hotUpdateAvailable
          ? {}
          : { rebuildReason: preview.hotUpdateReason ?? 'This App cannot be rebuilt in place.' }),
      }
    } catch (error) {
      return {
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        rebuildAvailable: false,
        rebuildReason: errorMessage(error),
      }
    } finally {
      if (preview !== undefined) await this.builder.discard(preview.previewId).catch(() => {})
    }
  }
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 32 * 1024) throw new Error('request body exceeds 32 KiB')
    chunks.push(buffer)
  }
  const value: unknown = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!isObject(value)) throw new Error('request body must be a JSON object')
  return value
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sameOrigin(request: IncomingMessage): boolean {
  const host = request.headers.host
  const origin = request.headers.origin
  if (typeof host !== 'string' || typeof origin !== 'string') return false
  try {
    const value = new URL(origin)
    return (value.protocol === 'http:' || value.protocol === 'https:') && value.host === host
  } catch {
    return false
  }
}

function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  return address === '127.0.0.1'
    || address === '::1'
    || address?.startsWith('::ffff:127.') === true
}

export async function apply(ctx: AppConversationHostContext): Promise<void> {
  const registry = new DefaultAppConversationHostRegistry(ctx.workspaceRegistry, homedir(), ctx.bunPluginBuilder)
  ctx.effect(
    () => ctx.reflect.provide('appConversations', registry),
    'deepdeck app conversations: host registry',
  )
  ctx.effect(
    () => installAppCreatorMode(
      ctx as unknown as Parameters<typeof installAppCreatorMode>[0],
      registry,
    ),
    'deepdeck app conversations: Creator mode tools',
  )
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: APP_CONVERSATION_API_PATH,
    async handler(request, response) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      try {
        const body = await readJsonBody(request)
        if (body.action === 'list-apps') {
          sendJson(response, 200, { apps: await registry.list() })
          return
        }
        if (body.action === 'rebuild' && typeof body.appId === 'string') {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: 'same-origin request required' })
            return
          }
          sendJson(response, 200, { rebuild: await registry.rebuild(body.appId) })
          return
        }
        if (body.action === 'resolve-workspace' && typeof body.appId === 'string') {
          sendJson(response, 200, { workspace: await registry.resolve(body.appId) })
          return
        }
        if (body.action === 'resolve-creator-workspace' && typeof body.appId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, { workspace: await registry.resolveCreator(body.appId) })
          return
        }
        if (body.action === 'focus-main-window') {
          const sent = typeof process.send === 'function'
            ? process.send({ type: 'deepdeck:focus-main-window' })
            : false
          sendJson(response, 200, { sent })
          return
        }
        sendJson(response, 400, { error: 'unknown action' })
      } catch (error) {
        sendJson(response, 400, { error: errorMessage(error) })
      }
    },
  }), 'deepdeck app conversations: host route')
}
