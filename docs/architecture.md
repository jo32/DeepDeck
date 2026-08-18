# Desktop architecture

## Current boundary

The desktop follows the same broad split as DeepDeck: an Electron main process owns local lifecycle and a sandboxed browser surface owns presentation. DeepSeek Harness remains an independently updatable dependency rather than copied application code.

```text
Electron main process
  ├─ BrowserWindow + sandboxed preload
  └─ HarnessProcess
       └─ resolved Node → pinned apps/cli/lib/bin.js → `dsh web --port 0`
            ├─ dsh-base bundle
            ├─ dsh-web-app bundle
            ├─ user/profile cordis.patch.yml layers
            └─ official host and browser plugin trees
```

The desktop waits for the upstream readiness line (`dsh web: http://127.0.0.1:<port>`) before navigating. This preserves Harness's own definition of readiness: the Cordis loader has settled, the API route exists, and the frontend bundle is available. The service binds only to loopback and receives an OS-assigned port.

The Harness process runs in the selected workspace rather than the Harness checkout. Development captures the launcher's Node executable. A packaged app uses the pinned Node 24 runtime under `process.resourcesPath`; it never reuses Electron's embedded Node runtime. This keeps Harness's declared Node engine independent of Electron and removes any production dependency on a system Node or pnpm installation.

## Why the official Web UI is reused

Harness's browser application is itself a plugin composition. `dsh-base` supplies the agent, model, tools, persistence, sandbox, approvals, settings, and credentials. `dsh-web-app` adds the web server, API gateway, workspace services, and a roster of browser plugins. The Vite entry is intentionally only a thin kernel and is not a standalone application without the host-injected `window.__DSH_BOOT__` graph.

Rebuilding that UI in Electron would bypass the strongest extension mechanism in the upstream project and create a second client protocol to maintain. Loading the official local surface keeps every upstream and out-of-tree plugin available immediately.

## Plugin integration direction

Harness composes ordered bundles into a profile, followed by the profile patch, the home patch, and optional launch overlays. Plugins register services, typed events, UI slots, tools, or other effects through Cordis; their registrations unwind when a plugin unloads. Host and browser plugins are separate faces connected through the generated Remote/API layer.

The desktop therefore does not add a plugin merely to claim integration. A desktop bundle becomes justified only when there is a concrete native capability that the existing Web bundle cannot provide. At that point it should be an out-of-tree package, for example `@deepseek-harness/desktop-bundle`, installed into a dedicated profile and layered after `dsh-web-app`. Likely responsibilities are narrowly scoped native dialogs, app-menu commands, notifications, or update state. Communication with Electron should use an authenticated local IPC endpoint and a matching Harness service provider/client plugin, while model-visible behavior must remain represented in Harness session events.

Until such a capability exists, the desktop launches the standard `web` profile unchanged. User-installed bundles and `cordis.patch.yml` overrides continue to work through the normal upstream mechanism.

## Packaging boundary

Development runs the built CLI from the submodule with the host machine's Node executable and workspace plugin outputs. Production packaging creates a self-contained, relocatable resource tree before electron-builder runs:

```text
DeepDeck.app/Contents/Resources/
  ├─ runtime/node/                 # pinned official Node 24 distribution
  ├─ harness/apps/cli/             # built dsh launcher
  ├─ harness/node_modules/         # materialized production dependency closure
  ├─ plugins/{desktop-chrome,home-hero,agent-preset-sections}/
  ├─ branding/
  ├─ cordis.patch.yml
  └─ runtime-manifest.json
```

`runtime-paths.ts` is the single development/production resolver. When `app.isPackaged` is true, program resources resolve only below `process.resourcesPath`; development-only path overrides cannot redirect a production app back into a source checkout. The packaged default workspace is the user's home directory unless an explicit workspace override is supplied.

Runtime preparation uses a generated pnpm deploy workspace outside the read-only Harness submodule, materializes all workspace links, embeds the official Node archive after SHA-256 verification, and then performs a real `dsh web` boot with an empty `PATH`. Packaging fails unless the local HTTP surface becomes ready. The app-bundle verifier independently checks that same boot from inside `DeepDeck.app`.

electron-builder owns the native distribution boundary: permanent bundle identifier `com.jo32.deepdeck`, DeepDeck executable/helper identities, icon conversion, hardened runtime, signing, notarization, DMG/ZIP generation, and update metadata. A pre-signing hook removes Electron's remaining helper `CFBundleName` values. The renderer remains plugin-owned.

Production update checks use an architecture-specific generic feed under `stable/darwin/<arch>`. Local unsigned packages embed `deepdeckLocalBuild: true` in their packaged metadata (with `DEEPDECK_LOCAL_BUILD=1` retained as a launch-time override), so double-clicking a local app cannot accidentally contact or install from the production feed. See [release.md](release.md) for publication and rollback rules.

The dependency install runs with `CI=true` because the outer repository owns Git hooks. This uses the upstream hook installer's documented unattended path and avoids trying to enable worktree-local hook configuration inside submodule Git metadata; dependency lifecycle scripts still run normally.
