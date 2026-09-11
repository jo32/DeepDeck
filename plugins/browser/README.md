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

HTTP(S) links in Agent replies open in a new Browser tab; middle-click opens a
background tab. Electron routes the original Harness anchors without replacing
the conversation or sharing the shell's profile or opener with the website.

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

## GitHub community WebMCP

The WebMCP panel includes a Community section: discover projects for the current
origin, preview a public GitHub repository, review its source and confirm installation.
The default resolves the latest stable release; Advanced accepts an explicit full
commit SHA for unreleased testing. The Host resolves tags, checks repository ID,
ordinary Git tree paths, blob integrity and manifest SHA-256, then compiles locally.
No repository install scripts or remote build commands run. Preview expires after
five minutes and is consumed once; changes to local draft/activation require a new
preview. Installation preserves editable source and rolls back native registration
failures. GitHub provenance persists with each imported local revision.

Export GitHub draft saves the selected active revision into a separate site-workspace
directory. The `deepdeck-webmcp-github` skill is bundled in both Use and Builder;
the Agent can call `webmcp_export_revision` directly, use existing GitHub authentication,
publish or contribute a repair as requested. Export itself performs no GitHub write.
The initial draft is UNLICENSED and needs license, tool metadata and verification
review before publication. The repository skill link and runtime use the same text.

The public directory lives at `/webmcp` and `/zh/webmcp`; its snapshot is generated
from `registry/webmcp/entries` with `pnpm webmcp:sync`. The initial list is empty.
Existing GitHub issues/releases are the source for collaboration and maintenance
status; no account service or object-storage backend is required. Directory data
can be stale and is not an endorsement of community source.

Run `node apps/desktop/scripts/verify-webmcp-market.mjs` for the isolated real
Electron UI and native-registration check. The fixture simulates GitHub responses;
repository resolution and persistence are covered separately by Host tests.

## Local lifecycle

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
node apps/desktop/scripts/verify-browser-composer.mjs
node apps/desktop/scripts/verify-browser-links.mjs
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

## Embedded WebMCP market

Open **Settings → WebMCP market** alongside the App store. The Browser plugin owns the Cordis settings section and the standalone `webmcp-market` surface. It renders the same directory component shipped by the website, within the settings panel’s remaining height. It loads the live catalog through the Host and falls back to the packaged catalog when the remote index is unavailable. The default view does not depend on an online HTML page being deployed. An explicitly configured remote iframe still supports a bounded handshake and falls back locally when it fails. Source preview, errors and confirmation are rendered outside the remote frame. Confirmation opens the verified target website when needed; activation still requires actual native registration and preserves the Builder draft and previous revision.

Outside DeepDeck, **Install in DeepDeck** links to `deepdeck://webmcp/install` with repository, manifest path and optional immutable commit/repository ID. Electron handles cold and warm launches, queues requests until Harness is ready, and opens the plugin's preview surface. It does not install from a protocol event. The packaged app registers the scheme; development Electron launches on macOS cannot validate OS-level scheme association. Publish the website and install a desktop release containing this change to enable the complete external flow.

GitHub repository owners supply the maintainer avatar/login in the directory, preview and Browser tool panel. This is repository attribution, not ownership of the target website. Older installed revisions without author metadata remain supported; a fresh GitHub preview/import obtains it.

Publication drafts include the current site's ordinary `.agents/skills` and `.dsh/skills` files and their digests. The GitHub skill reviews these files with the chosen immutable WebMCP source before an authorized PR/push. Companion skills are published to GitHub; the TypeScript installer does not silently activate them.

Verify the cross-origin embedded and standalone UI with `node apps/desktop/scripts/verify-webmcp-market-embed.mjs`; verify the existing Browser panel with `node apps/desktop/scripts/verify-webmcp-market.mjs`. Both use temporary Electron profiles and local fixtures.

The settings market owns one scrollable directory region. Container queries adapt the directory to the settings column width rather than the desktop viewport; empty state controls fit without scrolling at the tested 1000 × 700 window. The GitHub install form remains available when the directory is empty or offline. `catalog.json` is shipped with the plugin and refreshed alongside the website catalog by `pnpm webmcp:sync`.


## Publication files and native Browser

The Community section discovers projects for the current site automatically and
has an explicit Refresh action. It distinguishes an empty online catalog, an
empty bundled snapshot, and a failed request; switching sites cancels stale results.

Publication Files uses the published **dsh-better-sidebar@0.17.1** file tree,
editor/preview viewers, Cordis service/store and Host APIs. The upstream
[v0.17.1 release](https://github.com/omdsh-dev/DSH-better-sidebar/releases/tag/v0.17.1)
explicitly supports Harness 0.1.1-rc.x. Keep the version pinned until its source
exports and lazy chunks have been verified against our Harness version.

DeepDeck mounts these modules in its existing Browser plugin surface. The
upstream Client entry point, DOM mounting, global link interception and iframe
BrowserView are not activated. The browser tab descriptor calls DeepDeck's native
Browser API, retaining the existing native tabs, sessions and WebMCP capabilities.
The original Host serves file operations, terminal connections and lazy chunks.
The main desktop conversation mounts a Better Sidebar workbench through the
`desktop.workbench` Cordis slot. It exposes file, Git, terminal, subagent and side
conversation tabs, and keeps tab selection, width and collapsed state in Better
Sidebar's per-session store. Its Browser tab opens the native DeepDeck Browser.
The desktop layout reserves space beside the conversation; the upstream DOM
mount and layout-push hooks are not enabled.

Export opens an independent **Files** column beside the Agent sidebar, so chat
and files remain visible together. The directory tree and preview fill that
column, which has its own resize handle and close button. The toolbar folder
button opens the current site's entire workspace, including Agent reports
and skills. **Export GitHub draft** opens the exact newly exported project folder
with its editable source selected. **Publish to GitHub and registry** starts the
site Agent with the existing `deepdeck-webmcp-github` skill, using the latest
exported project (creating one only if none exists). The Agent publishes the
project and submits its reference to the DeepDeck registry; repository or license
choices are resolved by the skill when missing. Reopening a project preserves
local edits and Git history. The UI displays the same directory tree and editor
for both actions, including source, manifest, README and companion skills.
Native website bounds reserve the combined width of both
sidebars. Hidden skills folders are included. Source, manifest and skills support preview/edit/save, directory refresh,
file refresh, downloads and explicit file uploads. File references use the existing
site conversation composer. The editor's own refresh confirmation protects dirty
content. Full local paths are collapsed by default. No generated plugin `lib/`
files or upstream Harness edits are committed.

## Continuing a community project

After installing a community package, **Continue in Builder** checks out its exact
upstream commit into `<site workspace>/webmcp-project` on a local Git branch. It
preserves the repository history, manifest, license, documentation and project
skills, and leaves the previous standalone Builder draft intact. The Agent's
source tools and the Files sidebar use this same persistent directory. Source
writes require the digest returned by the preceding read. Locally built revisions
record their upstream baseline separately from the digest of their actual source.

**Check upstream updates** fetches the latest release (or the default branch when
there is no stable release) and prepares a three-way merge in a temporary Git
worktree. An explicit commit is also supported by `webmcp_project`. Previewing
does not modify working files or activate tools. Confirmation first checkpoints
local changes, then merges. Stale previews are rejected if working files change.
Real content/metadata conflicts remain editable in Builder; the generated source
digest alone does not require manual conflict resolution. **Finish resolved
merge** records the new upstream baseline; **Abort merge** restores the checkpoint.
Pending conflicts survive a restart and prevent applying or publishing.

`webmcp_apply` compiles the working source, validates native registration, updates
the manifest digest/tool directory and activates the resulting immutable revision.
A failed apply restores the previous native revision. Functional verification
still requires calling the tools against the real site. Merging alone never
changes active tools.

**Contribute upstream** asks the site Agent to create a focused upstream PR.
**Publish my fork** asks it to publish a derived repository and submit that
repository to the registry. Both use the existing GitHub skill and preserve
attribution/history. Neither action requests an automatic PR merge or stable
release. A project export requires its source to match the selected active
revision; publication must follow final functional verification.

This first version supports one community Git project per site, not composition
of several independent packages. Switching to another repository requires first
preserving/moving the project directory and its sibling `.webmcp-project.json`
metadata. It requires local Git and access to GitHub for repository/source fetches;
the official catalog proxy does not proxy these Git operations. Rewritten upstream
history or an entry-path migration requires explicit repository review.
