# DeepDeck Browser

Browser is a Cordis Host/Client plugin. Its launcher sits above Apps and opens a
native, tabbed Electron browser with an address bar, back/forward/reload, find,
zoom, downloads, and a persistent browsing profile. A site Agent panel reuses the
Harness conversation and Composer.

The visual system takes cues from [Libraries.dev](https://libraries.dev/):
neutral solid surfaces, fine borders, quiet blue accents and generous spacing.
Cards, tabs and the Composer have no decorative gradients or shadows; floating
menus retain one subtle shadow. A matching light palette follows the app's appearance. Browser
composes both palettes through `theme.overrideTokens`, so the original Composer
and portal menus use the same colors without changing the desktop preference.
The small SVG Agent sphere animates only during work, respects reduced motion,
and uses no external assets or animation dependencies.

New tabs open a full-width start page with one search field, the Host's saved
sites, and actionable Site Agent / WebMCP Builder cards. Choosing a card focuses
the search field; opening a site then prepares its existing Harness session in
that mode once navigation completes. No Agent turn is sent automatically.
The empty Agent panel stays closed on new tabs unless explicitly opened, and
Downloads remains available. The start page adapts to panel and window width.

The Browser uses an integrated macOS tab/title bar, theme-aware surfaces and a
resizable Agent panel (drag its left edge, or focus the divider and use arrow
keys). Use/Builder lives in the site header. Text tabs distinguish Conversation,
WebMCP and Downloads. Conversation opens directly in Chat; Browser has no
Chat/Trajectory switch, session-log export action, or separate session toolbar.
Sessions previously viewed in Trajectory return to Chat on opening in Browser.
The compact Composer retains Harness send/stop,
model and access controls. The original home-hero dock remains mounted, including
send/working/stop interactions. Browser uses the home-hero plugin’s
`DockedComposer` presentation to keep the character small even in empty sessions. The new-tab page uses its
shared `deepdeckCharacter` service; small marks use its cached icon. The Agent panel opens directly into chat with its input docked at the bottom.
Empty sessions show a short welcome in the message area, without a large character
or a Start button. Existing conversations resume in the same layout.

Below 560 px of Agent-panel width, model/reasoning selection, Fast mode, Codex
usage and session metrics move into **More**, leaving a single row of primary
composer controls. Wider panels show them inline.
The menu renders the original Cordis controls with their original stores and
actions; unavailable controls stay hidden. Escape and outside clicks dismiss
the menu, and resizing keeps the message draft intact.

Tabs support middle-click to close and a native context menu for new-tab-to-right,
reload, duplicate, close, close others, close to the right, and reopen. The menu
targets the clicked tab without activating it. Closing the active tab selects its
right neighbour, or its left neighbour if it was last. Up to 20 closed tabs can
be reopened during the desktop run, restoring their position and navigation
history. Duplicate also preserves navigation history.

Website content has its own native context menu. Selected text can be copied,
searched, or appended with its source URL to the site Agent's existing draft;
the Agent never sends it automatically. Editable fields expose the browser's
actual undo, redo, cut, copy, paste and select-all capabilities. Link actions,
page navigation and Inspect are included when relevant. Menu actions are pinned
to the originating document, so navigation closes the popup and invalidates its
captured selection.

Tab shortcuts work while the shell, Agent composer, or website has focus:
Cmd/Ctrl+T, W, Shift+T, 1–8 and 9 (last tab), Ctrl+Tab / Ctrl+Shift+Tab,
and Ctrl+PageUp / PageDown. macOS also supports Cmd+Option+Left / Right
and Cmd+Shift+[ / ]. Cmd/Ctrl+R reloads; adding Shift bypasses cache.
Menu content and localization live in the plugin; native keyboard routing and
system-menu presentation live alongside Electron's tab lifecycle.

## Site Agents and WebMCP

Opening a website’s Conversation panel automatically prepares its Agent;
**Use / Builder** selects its mode. Preparation creates or resumes a session without
sending an Agent turn. Concurrent preparation reuses the same site session, even
when its first caller switches tabs while it is being created. A site is an
exact HTTP(S) origin, including scheme and port. Its conversation and workspace
persist independently of browser tabs. Use and Builder modes share that same
conversation. A running task remains bound to its original tab when you select
another tab; the interface shows its target. Different sites have separate Agents.

Browser discovers actual registered WebMCP tools through Chromium's WebMCP domain
and observes additions/removals. API presence alone is not site support. Existing
site tools and generated WebMCP appear together with source and version details.
The Agent calls `browser_context` to inspect this directory, then
`browser_webmcp_call` to invoke a tool and wait for its real result.

## Chrome DevTools MCP

The official `chrome-devtools-mcp` 1.8.0 is bundled and available in **both Use
and Builder**. No separate Chrome process, installation or global debugging port
is required. Discover its tool names and input schemas with
`mcp__chrome_devtools__list_tools`, then invoke them through
`mcp__chrome_devtools__call_tool` using `{ name, arguments }`. Start with the
official `list_pages` tool to obtain `pageId`.

The suite includes snapshots, JavaScript evaluation, interaction, console and
network details, screenshots, performance and memory snapshots.
WebMCP discovery and execution use `browser_context` and `browser_webmcp_call`;
the upstream name-only WebMCP tools are excluded and rejected if called directly.
Both screenshot paths become normal Harness image attachments.
Browser owns native tab creation/closure through `browser_open_tab` and
`browser_close_tab`; `browser_select_tab` explicitly binds another same-site tab.

Each Agent uses an authenticated, loopback CDP bridge exposing only its bound
website tab. It never exposes the Harness shell or a browser-wide debugging
endpoint. Independent CDP sessions keep MCP events separate from Browser's own
WebMCP registry. Retargeting, site changes, tab closure and Agent disposal release
the connection; failed actions are never automatically replayed. MCP file outputs
are rooted in the site's workspace, and upstream usage statistics/CrUX reporting
are disabled. Capabilities that require Chrome-only services remain subject to
the Electron/Chromium version.

The CDP bridge forwards an explicit set of page inspection/debugging methods.
Profile-wide cookie/storage commands, alternate WebMCP invocation, profile
selection and unknown methods are denied, including on flattened page sessions.
Direct navigation stays within the bound origin; Puppeteer's utility worlds
are created without universal cross-origin access. Native file uploads validate
canonical paths against the site's workspace before forwarding to Chromium.
This remains a privileged page debugger, including JavaScript evaluation.

When capabilities are missing, the Agent can switch itself to Builder, inspect the
live page, capture screenshots, explore the UI, inspect request metadata/errors,
and debug JavaScript. It writes a single TypeScript source, compiles and installs
it with `webmcp_apply`, verifies the new tools against the page, returns to use
mode, and continues the original task. The bundled `deepdeck-webmcp-builder` Skill
contains the complete authoring workflow and SDK contract.

Generated WebMCP runs in an isolated browser JavaScript world with DOM access and
without Node APIs. `globalThis.__deepdeckWebMCP` exposes asynchronous
`registerTool`, a disposal `signal`, and `onDispose`. Generated registrations are
namespaced and tracked by their real execution context; they never replace
site-owned registrations. They may compose existing native WebMCP tools.

## Lifecycle

- Enabled WebMCP loads automatically on matching documents and browser restart.
- Site bindings persist in Browser's own store. Reopening resumes the original
  Harness Session before binding its new tab, without adding custom Session log
  events or replaying earlier actions.
- Sources and immutable, digest-verified revisions persist under
  `~/DeepDeck/Browser/webmcp`; site workspaces live under `~/DeepDeck/Browser/sites`.
  `DEEPDECK_BROWSER_HOME` overrides the root for isolated development/testing.
- Compilation, page registration, activation, and functional validation are
  separate outcomes. Activation requires an actual successful registration
  receipt. The Agent must verify real outputs before claiming functional success.
- Failed updates restore the prior active revision. The panel supports disable,
  re-enable and rollback. Each version cleans up only its own tools and resources.
- Electron serializes installation, removal and their rollback per origin, even
  after the Host cancels or times out its IPC wait. A delayed transaction cannot
  restore tools after a later disable. Registration has a bounded startup deadline.
- Calls carry explicit tab, frame, document and revision identities. Navigation,
  replacement and closure invalidate affected operations. Unknown outcomes are
  never automatically replayed; concurrent page actions on one tab are rejected.
- The browser uses its own persistent login profile. WebMCP remains subject to
  Chromium support and the website's Permissions Policy, including frame access.

## Editing and page actions

For a site-wide WebMCP build, Builder inventories the site's main discoverable
reading and interaction workflows: login/account controls, search fields, form
controls, plain and rich-text editors, draft/preview actions and separate submit
actions. A focused repair stays within its requested capability. Builder inspects
opened composers and dialogs when needed; the native element summary includes
contenteditable and ARIA text controls, labels and editability/length constraints.

Login support separates account-state discovery, opening the real login UI,
selecting observed methods, submitting the native form when requested, and
checking the resulting state. Passwords and verification codes stay in the
website's native UI; generated tools return state and necessary user actions
without secret values. Opening or submitting a login window does not establish
authentication. Cross-origin login uses the real browser flow and a later check
on the bound site. After login, the Agent refreshes context and discovers tools
and account-dependent controls that were previously unavailable.

Login dialogs and method switches can navigate nested frames and invalidate a
pending call. Generated actions return promptly; the Agent refreshes context
and verifies the resulting UI in a separate read. An interrupted action has an
unknown outcome and must be inspected before any retry.

The bundled skill describes an editing round trip: WebMCP reads the existing
draft, the current site Agent composes or revises it, WebMCP writes back with an
target-identity and expected-value checks, and the Agent verifies the actual
editor/preview state.
The plain-textarea example is executable source shared with the Electron
integration verifier. Rich editors must preserve formatting and application
state rather than merely changing visible DOM text.

For editors requiring native input, a generated tool can return a
`requires_browser_action` result with target, expected value and replacement
text. The Agent checks it against the user's task and a fresh snapshot, uses
the existing DevTools input tools, then verifies the editor through WebMCP.
This is an Agent-mediated workflow, not a new automatic bridge or a nested
model invocation from page code. Filling and submitting remain separate.

## Boundaries and verification

`plugins/browser` owns UI, Host services, site bindings and generation storage.
`desktop-chrome` provides the generic `sidebar.launchers` and `desktop.surface`
slots. `apps/desktop` supplies native windows, WebContents, navigation and the
narrow IPC/CDP bridge. No Harness vendor source or Harness DOM is patched.

The shared wire contract maps every command to its response type. The Host
validates incoming structured results and snapshots before exposing them to
the plugin. Screenshot results include both image data and document identity.

```sh
pnpm --filter @deepdeck/dsh-browser check
pnpm --filter @deepdeck/dsh-browser test
node apps/desktop/scripts/verify-browser-native.mjs
node apps/desktop/scripts/verify-browser-devtools.mjs
pnpm check
pnpm test
pnpm build
pnpm runtime:prepare
pnpm runtime:verify
```

Native verification uses local fixture websites and a temporary profile. Runtime
verification checks the Browser Host API and the packaged platform-specific
esbuild executable. Model-generated tools still require live functional checks on
the particular website; registration is not a promise of compatibility with every
future page or site update.

## Core browsing controls

The Browser plugin now owns a dedicated tools toolbar, incremental find UI with
match counts, download controls, HTTP/proxy authentication prompts, tab reordering
and mute controls. Native WebContents state supplies zoom, audio and search
results. The Electron profile remembers site permissions, host zoom, navigation
history and recent downloads. `browser-session.ts` contains the native profile
capabilities separately from WebMCP orchestration.

See [the core browsing review](../../docs/browser-core-review.md) for the
implemented capabilities, verification commands and remaining platform limits.
The core Electron fixture runs with a temporary profile and real BrowserFrame;
system fullscreen needs an unlocked desktop session.
