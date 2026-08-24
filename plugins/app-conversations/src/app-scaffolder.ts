import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u
const MAX_APP_TITLE_LENGTH = 120

export interface AppScaffoldInput {
  readonly id: string
  readonly title: string
}

export interface AppScaffoldResult {
  readonly appId: string
  readonly title: string
  readonly packageName: string
  readonly sourceDirectory: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizedInput(input: AppScaffoldInput): AppScaffoldInput {
  const id = input.id.trim().toLowerCase()
  const title = input.title.trim()
  if (!APP_ID_PATTERN.test(id)) {
    throw new Error('App ID 只能包含小写字母、数字和连字符，且必须以字母或数字开头和结尾。')
  }
  if (
    title.length === 0
    || title.length > MAX_APP_TITLE_LENGTH
    || /[\u0000-\u001F\u007F]/u.test(title)
  ) {
    throw new Error(`App 名称必须包含 1–${String(MAX_APP_TITLE_LENGTH)} 个字符。`)
  }
  return { id, title }
}

function packageManifest(appId: string, title: string, packageName: string): string {
  return `${JSON.stringify({
    name: packageName,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: `${title} — created with DeepDeck`,
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    exports: {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './client': { types: './lib/client.d.ts', default: './lib/client.js' },
      './invariant': { types: './lib/invariant.d.ts', default: './lib/invariant.js' },
      './package.json': './package.json',
    },
    dsh: {
      app: { id: appId, title },
      bundle: { patch: './cordis.patch.yml' },
      client: {
        inject: [
          '@deepseek-ai/dsh-client-runtime',
          '@deepdeck/dsh-client-ui-desktop-chrome',
          '@deepdeck/dsh-app-conversations',
        ],
        platform: 'web',
      },
    },
    scripts: { build: 'bun run build.mjs' },
    files: [
      'lib/**',
      'cordis.patch.yml',
      'README.md',
    ],
  }, null, 2)}\n`
}

function buildScript(packageName: string): string {
  return `import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'\n\nawait rm('lib', { recursive: true, force: true })\nawait mkdir('lib', { recursive: true })\nawait cp('src', 'lib', { recursive: true })\n\nconst result = await Bun.build({\n  entrypoints: ['src/client.js'],\n  target: 'browser',\n  format: 'cjs',\n  external: [\n    'react',\n    'react/jsx-runtime',\n    '@deepseek-ai/dsh-client-ui-primitives',\n  ],\n})\nif (!result.success || result.outputs.length !== 1) {\n  for (const log of result.logs) console.error(log)\n  throw new Error('Unable to build the DeepDeck Client bundle')\n}\nconst client = await result.outputs[0].text()\nconst banner = ${JSON.stringify(`window.__ModuleLoader__.load({ id: ${JSON.stringify(packageName)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;\n`)}\nconst footer = '\\nreturn module.exports; } });\\n'\nawait writeFile('lib/client.js', banner + client + footer)\n\n// Keep the declaration copied from src/client.d.ts; reading it here makes a\n// missing declaration fail the same build instead of surfacing on restart.\nawait readFile('lib/client.d.ts')\nconsole.log('Built DeepDeck App Host and Client bundles')\n`
}

function hostSource(appId: string, title: string, packageName: string): string {
  const pagePath = `/apps/${appId}`
  const openPath = `/api/apps/${appId}/open`
  const safeTitle = escapeHtml(title)
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #111318; color: #f5f7fb; }
    main { width: min(620px, calc(100% - 40px)); padding: 40px; border: 1px solid #303541; border-radius: 22px; background: #191c23; box-shadow: 0 22px 70px #0006; }
    .eyebrow { color: #8da2fb; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 12px 0 10px; font-size: clamp(32px, 6vw, 54px); line-height: 1.05; }
    p { margin: 0; color: #b7bdca; font-size: 16px; line-height: 1.65; }
    code { display: block; overflow-wrap: anywhere; margin-top: 24px; padding: 12px 14px; border-radius: 10px; background: #101218; color: #d4dcff; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">DeepDeck App</div>
    <h1>${safeTitle}</h1>
    <p>Your App is running. Open Settings → Apps → Vibe Coding to turn this starter into the product you want.</p>
    <code>~/DeepDeck/Plugins/${appId}</code>
  </main>
</body>
</html>`

  return `import { fileURLToPath } from 'node:url'\n\nconst APP_ID = ${JSON.stringify(appId)}\nconst APP_TITLE = ${JSON.stringify(title)}\nconst PACKAGE_NAME = ${JSON.stringify(packageName)}\nconst PAGE_PATH = ${JSON.stringify(pagePath)}\nconst OPEN_PATH = ${JSON.stringify(openPath)}\nconst PAGE_HTML = ${JSON.stringify(page)}\n\nexport const inject = ['appConversations', 'webServer']\n\nfunction sameOrigin(request) {\n  const host = request.headers.host\n  const origin = request.headers.origin\n  if (typeof host !== 'string' || typeof origin !== 'string') return false\n  try {\n    const value = new URL(origin)\n    return (value.protocol === 'http:' || value.protocol === 'https:') && value.host === host\n  } catch {\n    return false\n  }\n}\n\nfunction sendJson(response, status, value) {\n  const body = JSON.stringify(value)\n  response.writeHead(status, {\n    'content-type': 'application/json; charset=utf-8',\n    'content-length': Buffer.byteLength(body),\n    'cache-control': 'no-store',\n    'x-content-type-options': 'nosniff',\n  })\n  response.end(body)\n}\n\nexport function apply(ctx) {\n  const conversations = ctx.get('appConversations')\n  const webServer = ctx.get('webServer')\n  if (conversations === undefined || webServer === undefined) {\n    throw new Error(APP_TITLE + ' requires the DeepDeck Apps runtime')\n  }\n  const sourcePackageRoot = fileURLToPath(new URL('..', import.meta.url))\n  ctx.effect(() => conversations.register({\n    id: APP_ID,\n    title: APP_TITLE,\n    workspaceSlug: APP_ID,\n    workspaceTitle: \`Apps · \${APP_TITLE}\`,\n    packageName: PACKAGE_NAME,\n    sourcePackageRoot,\n    appWindowPath: PAGE_PATH,\n  }), \`${appId}: App registration\`)\n  ctx.effect(() => webServer.register({\n    kind: 'exact',\n    path: PAGE_PATH,\n    async handler(request, response) {\n      if (request.method !== 'GET') {\n        response.writeHead(405).end()\n        return\n      }\n      response.writeHead(200, {\n        'content-type': 'text/html; charset=utf-8',\n        'content-length': Buffer.byteLength(PAGE_HTML),\n        'cache-control': 'no-store',\n        'content-security-policy': \"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'\",\n        'x-content-type-options': 'nosniff',\n      })\n      response.end(PAGE_HTML)\n    },\n  }), \`${appId}: App page\`)\n  ctx.effect(() => webServer.register({\n    kind: 'exact',\n    path: OPEN_PATH,\n    async handler(request, response) {\n      if (request.method !== 'POST' || !sameOrigin(request)) {\n        sendJson(response, 403, { error: 'same-origin POST required' })\n        return\n      }\n      const pageUrl = new URL(PAGE_PATH, request.headers.origin).href\n      const opened = typeof process.send === 'function'\n        ? process.send({ type: 'deepdeck:open-app-window', url: pageUrl })\n        : false\n      sendJson(response, 200, { opened, url: pageUrl })\n    },\n  }), \`${appId}: App window bridge\`)\n}\n`
}

function clientSource(appId: string, title: string): string {
  return `import { useState } from 'react'\nimport { jsx } from 'react/jsx-runtime'\nimport { Button, IconCordisPluginOutline14, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'\n\nconst APP_ID = ${JSON.stringify(appId)}\nconst APP_TITLE = ${JSON.stringify(title)}\nconst OPEN_PATH = ${JSON.stringify(`/api/apps/${appId}/open`)}\n\nfunction Launcher({ wide = false, closeApps }) {\n  const [busy, setBusy] = useState(false)\n  const open = async () => {\n    if (busy) return\n    setBusy(true)\n    try {\n      const response = await fetch(OPEN_PATH, { method: 'POST' })\n      const value = await response.json()\n      if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Unable to open App')\n      if (value.opened !== true && typeof value.url === 'string') window.open(value.url, '_blank', 'noopener,noreferrer')\n      closeApps?.()\n    } finally {\n      setBusy(false)\n    }\n  }\n  const label = busy ? \`Opening \${APP_TITLE}…\` : APP_TITLE\n  return jsx(Tooltip, {\n    label: APP_TITLE,\n    delayMs: 500,\n    disabled: wide,\n    children: jsx(Button, {\n      variant: 'ghost',\n      disabled: busy,\n      'data-deepdeck-app-launcher': APP_ID,\n      'data-wide': wide,\n      'aria-label': label,\n      icon: jsx(IconCordisPluginOutline14, { size: wide ? 16 : 18 }),\n      onClick: () => { void open() },\n      children: wide ? label : null,\n    }),\n  })\n}\n\nfunction Settings() {\n  return jsx('p', {\n    style: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.5 },\n    children: 'This starter has no custom settings yet. Use Vibe Coding to add them.',\n  })\n}\n\nexport const inject = ['slots']\n\nexport function apply(ctx) {\n  ctx.slots.inject('sidebar.apps', () => ctx.slots.register({\n    name: 'sidebar.apps',\n    id: APP_ID,\n    order: 20,\n    label: APP_TITLE,\n  }, Launcher))\n  ctx.slots.inject('settings.apps.item', () => ctx.slots.register({\n    name: 'settings.apps.item',\n    id: APP_ID,\n  }, Settings))\n}\n`
}

function declarations(): string {
  return `export declare const inject: readonly string[]\nexport declare function apply(ctx: unknown): void\n`
}

function readme(appId: string, title: string): string {
  return `# ${title}\n\nA DeepDeck App created from the built-in starter.\n\n- Source: \`~/DeepDeck/Plugins/${appId}\`\n- Build: \`bun run build\`\n- Generated output: \`lib/\` (do not commit)\n\nUse **Settings → Apps → Vibe Coding** to continue building the App. Keep Host behavior in \`src/index.js\`, Client slots in \`src/client.js\`, and runtime assembly in \`cordis.patch.yml\`.\n`
}

function agentInstructions(): string {
  return `# DeepDeck App development\n\n- Extend this App through Cordis services, slots, stores, and lifecycle effects.\n- Keep Host code in src/index.js and Client UI in src/client.js.\n- Do not patch the Harness DOM, inject global CSS, or use Electron APIs from Client code.\n- Keep package identity, dsh.app identity, exports, invariant, and cordis.patch.yml aligned.\n- Generated lib/ output is build-only and must not be committed.\n- Before finishing source edits, call deepdeck_app_apply when it is available. It performs the authoritative build and runtime apply; do not run a duplicate build first.\n`
}

/** Create a collision-safe managed App source tree without touching the active profile. */
export async function scaffoldAppSource(
  pluginRoot: string,
  rawInput: AppScaffoldInput,
): Promise<AppScaffoldResult> {
  const input = normalizedInput(rawInput)
  const packageName = `@deepdeck-apps/${input.id}`
  const sourceDirectory = resolve(pluginRoot, input.id)
  await mkdir(pluginRoot, { recursive: true, mode: 0o700 })
  try {
    await mkdir(sourceDirectory, { mode: 0o700 })
  } catch (cause) {
    const code = typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : undefined
    if (code === 'EEXIST') throw new Error(`App 源码目录已存在：${sourceDirectory}`)
    throw cause
  }

  try {
    const source = join(sourceDirectory, 'src')
    await mkdir(source, { mode: 0o700 })
    await Promise.all([
      writeFile(join(sourceDirectory, 'package.json'), packageManifest(input.id, input.title, packageName), { mode: 0o600 }),
      writeFile(join(sourceDirectory, 'cordis.patch.yml'), `- insert:\n    - id: ${input.id}\n      name: '${packageName}'\n`, { mode: 0o600 }),
      writeFile(join(sourceDirectory, 'build.mjs'), buildScript(packageName), { mode: 0o600 }),
      writeFile(join(sourceDirectory, '.gitignore'), 'lib/\nnode_modules/\n', { mode: 0o600 }),
      writeFile(join(sourceDirectory, 'README.md'), readme(input.id, input.title), { mode: 0o600 }),
      writeFile(join(sourceDirectory, 'AGENTS.md'), agentInstructions(), { mode: 0o600 }),
      writeFile(join(source, 'index.js'), hostSource(input.id, input.title, packageName), { mode: 0o600 }),
      writeFile(join(source, 'index.d.ts'), declarations(), { mode: 0o600 }),
      writeFile(join(source, 'client.js'), clientSource(input.id, input.title), { mode: 0o600 }),
      writeFile(join(source, 'client.d.ts'), declarations(), { mode: 0o600 }),
      writeFile(join(source, 'invariant.js'), `export const name = ${JSON.stringify(`${input.id}-invariant`)}\nexport const inject = ['appConversations']\nexport function apply(ctx) {\n  if (ctx.get('appConversations') === undefined) throw new Error(${JSON.stringify(`${input.title} requires the DeepDeck Apps runtime`)})\n}\n`, { mode: 0o600 }),
      writeFile(join(source, 'invariant.d.ts'), `export declare const name: ${JSON.stringify(`${input.id}-invariant`)}\nexport declare const inject: readonly ['appConversations']\nexport declare function apply(ctx: unknown): void\n`, { mode: 0o600 }),
    ])
  } catch (cause) {
    await rm(sourceDirectory, { recursive: true, force: true }).catch(() => {})
    throw cause
  }

  return Object.freeze({
    appId: input.id,
    title: input.title,
    packageName,
    sourceDirectory,
  })
}
