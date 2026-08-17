# Desktop architecture

## Current boundary

The desktop follows the same broad split as DeepDeck: an Electron main process owns local lifecycle and a sandboxed browser surface owns presentation. DeepSeek Harness remains an independently updatable dependency rather than copied application code.

```text
Electron main process
  ├─ BrowserWindow + sandboxed preload
  └─ HarnessProcess
       └─ system Node → pinned apps/cli/lib/bin.js → `dsh web --port 0`
            ├─ dsh-base bundle
            ├─ dsh-web-app bundle
            ├─ user/profile cordis.patch.yml layers
            └─ official host and browser plugin trees
```

The desktop waits for the upstream readiness line (`dsh web: http://127.0.0.1:<port>`) before navigating. This preserves Harness's own definition of readiness: the Cordis loader has settled, the API route exists, and the frontend bundle is available. The service binds only to loopback and receives an OS-assigned port.

The Harness process runs in the directory from which the desktop is launched, so the outer project is the initial filesystem context rather than the vendored Harness checkout. The Node executable is captured by the launcher instead of reusing Electron's embedded Node runtime; this keeps Harness's declared Node engine independent of Electron.

## Why the official Web UI is reused

Harness's browser application is itself a plugin composition. `dsh-base` supplies the agent, model, tools, persistence, sandbox, approvals, settings, and credentials. `dsh-web-app` adds the web server, API gateway, workspace services, and a roster of browser plugins. The Vite entry is intentionally only a thin kernel and is not a standalone application without the host-injected `window.__DSH_BOOT__` graph.

Rebuilding that UI in Electron would bypass the strongest extension mechanism in the upstream project and create a second client protocol to maintain. Loading the official local surface keeps every upstream and out-of-tree plugin available immediately.

## Plugin integration direction

Harness composes ordered bundles into a profile, followed by the profile patch, the home patch, and optional launch overlays. Plugins register services, typed events, UI slots, tools, or other effects through Cordis; their registrations unwind when a plugin unloads. Host and browser plugins are separate faces connected through the generated Remote/API layer.

The desktop therefore does not add a plugin merely to claim integration. A desktop bundle becomes justified only when there is a concrete native capability that the existing Web bundle cannot provide. At that point it should be an out-of-tree package, for example `@deepseek-harness/desktop-bundle`, installed into a dedicated profile and layered after `dsh-web-app`. Likely responsibilities are narrowly scoped native dialogs, app-menu commands, notifications, or update state. Communication with Electron should use an authenticated local IPC endpoint and a matching Harness service provider/client plugin, while model-visible behavior must remain represented in Harness session events.

Until such a capability exists, the desktop launches the standard `web` profile unchanged. User-installed bundles and `cordis.patch.yml` overrides continue to work through the normal upstream mechanism.

## Packaging boundary

Development runs the built CLI from the submodule with the host machine's Node executable. A distributable application will need to bundle a compatible Node runtime plus the built/published Harness artifact and declare that runtime as an Electron resource. That packaging step does not require changing the process protocol or the plugin composition described above.

The dependency install runs with `CI=true` because the outer repository owns Git hooks. This uses the upstream hook installer's documented unattended path and avoids trying to enable worktree-local hook configuration inside submodule Git metadata; dependency lifecycle scripts still run normally.
