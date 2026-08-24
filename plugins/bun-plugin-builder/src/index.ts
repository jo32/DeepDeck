import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readdir, realpath, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DeepDeckBunPluginBuilder,
  resolveBunBuilderStateRoot,
  type BunHotReloadAdapter,
  type BunHotUpdateAvailability,
  type BunHotUpdateTarget,
  type BunPluginBuilderService,
} from './builder.js'
import { registerBunPluginBuilderRoute } from './routes.js'

interface LoaderEntry {
  readonly options: { name: string }
  readonly disabled: boolean
  readonly fiber?: {
    readonly uid?: number
    readonly runtime?: { readonly callback: unknown } | null
  }
  readonly parent: {
    readonly tree: {
      readonly ctx: { readonly baseUrl?: string }
    }
  }
  update(options: { readonly name: string }): Promise<void>
}

interface PluginContext {
  readonly reflect: {
    provide(name: string, value: unknown): () => void
  }
  readonly webServer: Parameters<typeof registerBunPluginBuilderRoute>[0]
  readonly loader: { entries(): Iterable<LoaderEntry> }
  effect(setup: () => (() => void), label: string): void
}

export const name = 'deepdeck-bun-plugin-builder'
export const inject = ['webServer', 'loader'] as const

interface ActiveHotReloadTarget {
  readonly entry: LoaderEntry
}

async function activeHotReloadTarget(
  ctx: PluginContext,
  target: BunHotUpdateTarget,
): Promise<ActiveHotReloadTarget | BunHotUpdateAvailability> {
  if (target.packageName === '@deepdeck/dsh-bun-plugin-builder') {
    return { available: false, reason: 'The Bun Builder cannot replace itself while a build request is running.' }
  }
  let reviewedEntry: string
  try {
    reviewedEntry = await realpath(target.hostEntryPath)
  } catch {
    return { available: false, reason: 'The selected source has no built Host entry yet.' }
  }

  let packageIsActive = false
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name !== target.packageName || entry.disabled || entry.fiber?.uid === undefined) continue
    packageIsActive = true
    const baseUrl = entry.parent.tree.ctx.baseUrl
    if (baseUrl === undefined) continue
    try {
      const loadedEntry = await realpath(createRequire(baseUrl).resolve(target.packageName))
      const plugin = entry.fiber.runtime?.callback
      if (loadedEntry === reviewedEntry && plugin !== undefined) return { entry }
    } catch {
      // Another entry or a transient package link may still match below.
    }
  }
  return packageIsActive
    ? { available: false, reason: 'This package is active, but it was loaded from a different source directory.' }
    : { available: false, reason: 'This package is not active in the current Cordis profile.' }
}

function createHotReloadAdapter(ctx: PluginContext): BunHotReloadAdapter {
  const stagePackage = async (target: BunHotUpdateTarget): Promise<{
    readonly stageParent: string
    readonly stageRoot: string
    readonly stagedEntry: string
  }> => {
    const packageSegment = Buffer.from(target.packageName).toString('base64url')
    const stageParent = join(resolveBunBuilderStateRoot(), 'hot', packageSegment)
    const stageRoot = join(stageParent, randomUUID())
    await mkdir(stageParent, { recursive: true, mode: 0o700 })
    try {
      await cp(target.sourcePackageRoot, stageRoot, {
        recursive: true,
        force: false,
        errorOnExist: true,
        filter(source) {
          const path = relative(target.sourcePackageRoot, source)
          if (path === '') return true
          const first = path.split(/[\\/]/u)[0]
          return first !== '.git' && first !== 'node_modules'
        },
      })
      const fromPackage = relative(target.sourcePackageRoot, target.hostEntryPath)
      const stagedEntry = resolve(stageRoot, fromPackage)
      if (relative(stageRoot, stagedEntry).startsWith('..')) {
        throw new Error('The reviewed Host entry escaped its package root.')
      }
      let dependencyRoot = target.sourcePackageRoot
      while (true) {
        const candidate = join(dependencyRoot, 'node_modules')
        try {
          if ((await lstat(candidate)).isDirectory()) {
            await symlink(candidate, join(stageRoot, 'node_modules'), 'junction')
            break
          }
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
        }
        const parent = dirname(dependencyRoot)
        if (parent === dependencyRoot) break
        dependencyRoot = parent
      }
      return { stageParent, stageRoot, stagedEntry }
    } catch (cause) {
      await rm(stageRoot, { recursive: true, force: true })
      throw cause
    }
  }

  return {
    async inspect(target) {
      const active = await activeHotReloadTarget(ctx, target)
      return 'entry' in active ? { available: true } : active
    },
    async reload(target): Promise<void> {
      const active = await activeHotReloadTarget(ctx, target)
      if (!('entry' in active)) throw new Error(active.reason ?? 'the selected source is not the active plugin')
      const originalName = active.entry.options.name
      const { stageParent, stageRoot, stagedEntry } = await stagePackage(target)
      try {
        await active.entry.update({ name: pathToFileURL(stagedEntry).href })
      } catch (cause) {
        await rm(stageRoot, { recursive: true, force: true })
        throw cause
      }
      // Entry.update() intentionally does not persist by itself. Restore the
      // reviewed package specifier in memory so the next hot update resolves
      // against the source package again while the fresh fiber stays active.
      active.entry.options.name = originalName
      try {
        const current = basename(stageRoot)
        await Promise.allSettled((await readdir(stageParent))
          .filter(candidate => candidate !== current)
          .map(async candidate => await rm(join(stageParent, candidate), { recursive: true, force: true })))
      } catch {
        // A stale-stage cleanup failure must not invalidate an active reload.
      }
    },
  }
}

/** Provide the preview-first Bun build service and its same-origin settings route. */
export function apply(ctx: PluginContext): void {
  const builder: BunPluginBuilderService = new DeepDeckBunPluginBuilder({
    hotReload: createHotReloadAdapter(ctx),
  })
  ctx.effect(() => {
    const release = ctx.reflect.provide('bunPluginBuilder', builder)
    return () => {
      release()
      builder.close()
    }
  }, 'deepdeck bun plugin builder: service')
  ctx.effect(
    () => registerBunPluginBuilderRoute(ctx.webServer, builder),
    'deepdeck bun plugin builder: api route',
  )
}

export type {
  BunBuildPreviewInput,
  BunBuildRequest,
  BunHotReloadAdapter,
  BunHotUpdateTarget,
  BunPluginBuilderService,
  resolveBunBuilderStateRoot,
} from './builder.js'
export type {
  BunBuildLogs,
  BunBuildPreview,
  BunBuildResult,
  BunBuilderRuntimeStatus,
  BunHotUpdateResult,
  BunSourceBuildResult,
} from './api-types.js'
