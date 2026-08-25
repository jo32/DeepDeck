/**
 * 0.1.1-rc.2-compatible client bundle preset for DeepDeck plugins that live outside
 * the Harness repository's two-level package workspace layout.
 */
import { existsSync, globSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from '../vendor/deepseek-harness/node_modules/tsdown'
import { transform } from '../vendor/deepseek-harness/node_modules/lightningcss/node/index.mjs'
import { clientBuildEnvironmentDefines } from '../vendor/deepseek-harness/scripts/client-build-environment.ts'
import {
  PLATFORM_MODULES,
  PRELOADED_CLIENT_EXTERNALS,
} from '../vendor/deepseek-harness/packages/client/web/src/platform.ts'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_VIRTUAL_PREFIX = '\0deepdeck-css:'
const GLOBAL_CSS_VIRTUAL_PREFIX = '\0deepdeck-global-css:'
const INLINE_CSS_VIRTUAL_PREFIX = '\0deepdeck-inline-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const INLINE_CSS_QUERY = '?inline'
const TYPES_MARKER = `${sep}lib${sep}types${sep}`

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|file-reference|session|llm|tools|brand)(\/|$)/
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

interface PluginManifest {
  readonly name?: string
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
  readonly dsh?: { readonly client?: { readonly external?: unknown } }
}

const manifestCache = new Map<string, PluginManifest>()

function pluginManifest(id: string): PluginManifest {
  const cached = manifestCache.get(id)
  if (cached !== undefined) return cached
  for (const path of globSync('plugins/*/package.json', { cwd: REPOSITORY_ROOT })) {
    const manifest = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, path), 'utf8')) as PluginManifest
    if (manifest.name !== id) continue
    manifestCache.set(id, manifest)
    return manifest
  }
  throw new Error(`deepdeck client bundle: no plugins/*/package.json declares ${id}`)
}

function requestedExternals(id: string): ReadonlySet<string> {
  const value = pluginManifest(id).dsh?.client?.external
  if (value !== undefined && (!Array.isArray(value) || value.some(entry => typeof entry !== 'string'))) {
    throw new Error(`${id} dsh.client.external must be a string array`)
  }
  return new Set([
    ...PLATFORM_MODULES,
    ...PRELOADED_CLIENT_EXTERNALS,
    ...((value ?? []) as string[]),
  ])
}

function productionDependencies(id: string): readonly RegExp[] {
  const manifest = pluginManifest(id)
  return [...new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])].sort().map(name => new RegExp(`^${escapeSpecifier(name)}(/|$)`))
}

function escapeSpecifier(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function styleModule(
  id: string,
  file: string,
  css: string,
  classes?: Readonly<Record<string, string>>,
): string {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(file)}`)};`,
    'if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {',
    '  const tag = document.createElement("style");',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classes === undefined ? 'export {};' : `export default ${JSON.stringify(classes)};`)
  return source.join('\n')
}

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolve(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const boundary = emitted.indexOf(TYPES_MARKER)
  if (boundary < 0) return emitted
  return resolve(emitted.slice(0, boundary), 'src', emitted.slice(boundary + TYPES_MARKER.length))
}

function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physical = resolve(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physical).split(sep).join('/')
  return repositoryPath.startsWith('plugins/') ? `../../../${repositoryPath}` : source
}

function libraryConfig(id: string, entries: readonly string[]): UserConfig {
  const externals = productionDependencies(id)
  const isProductionDependency = (specifier: string): boolean => externals.some(pattern => pattern.test(specifier))
  return {
    name: id,
    entry: [...entries],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: {
      neverBundle: isProductionDependency,
      alwaysBundle: specifier => !isBuiltin(specifier) && !isProductionDependency(specifier),
    },
  }
}

function clientConfig(id: string): UserConfig {
  const requested = requestedExternals(id)
  const isRequested = (specifier: string): boolean => requested.has(specifier)
  return {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: isRequested,
      alwaysBundle: specifier => !isRequested(specifier),
    },
    define: {
      ...clientBuildEnvironmentDefines(process.env),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      name: 'deepdeck-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (isRequested(source) || VENDORED_LIBRARY.test(source) || INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) {
          return null
        }
        throw new Error(
          `client bundle purity: ${JSON.stringify(source)} is not a shared module requested by ${id}; `
          + 'use a Cordis service/slot or declare an exact dsh.client.external request',
        )
      },
    }, {
      name: 'deepdeck-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const file = importer === undefined ? source : sourceAssetPath(source, importer)
        return `${CSS_VIRTUAL_PREFIX}${file}${CSS_VIRTUAL_SUFFIX}`
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const file = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(file)
        const source = await readFile(file)
        const result = transform({
          filename: file,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classes: Record<string, string> = {}
        for (const [local, value] of Object.entries(result.exports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
          classes[local] = value.name
        }
        return styleModule(id, file, result.code.toString(), classes)
      },
    }, {
      name: 'deepdeck-css-text-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith(`.css${INLINE_CSS_QUERY}`)) return null
        const stylesheet = source.slice(0, -INLINE_CSS_QUERY.length)
        const file = importer === undefined ? stylesheet : sourceAssetPath(stylesheet, importer)
        return `${INLINE_CSS_VIRTUAL_PREFIX}${file}${CSS_VIRTUAL_SUFFIX}`
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(INLINE_CSS_VIRTUAL_PREFIX)) return null
        const file = virtualId.slice(INLINE_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(file)
        const source = await readFile(file)
        const result = transform({ filename: file, code: source, minify: true })
        return `export default ${JSON.stringify(result.code.toString())};`
      },
    }, {
      name: 'deepdeck-css-global-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const file = importer === undefined ? source : sourceAssetPath(source, importer)
        return `${GLOBAL_CSS_VIRTUAL_PREFIX}${file}${CSS_VIRTUAL_SUFFIX}`
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(GLOBAL_CSS_VIRTUAL_PREFIX)) return null
        const file = virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(file)
        const source = await readFile(file)
        const result = transform({ filename: file, code: source, minify: true })
        return styleModule(id, file, result.code.toString())
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapPathTransform: browserSourcePath,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

/** Build one external DeepDeck plugin using the 0.1.1-rc.2 dynamic-client contract. */
export function deepdeckClientBundle(id: string, libEntries: readonly string[]): UserConfig[] {
  return [libraryConfig(id, libEntries), clientConfig(id)]
}
