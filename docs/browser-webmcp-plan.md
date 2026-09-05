# Browser and WebMCP implementation plan

Browser is a Cordis plugin, launched above Apps into a native browser window.
Each site has a persistent Agent conversation. Its WebMCP Builder mode observes
the live website, generates WebMCP, validates it, and continues the original task.

## Accepted behavior

- Discover the loaded page's registered WebMCP tools automatically. API presence
  alone does not prove that a site exposes tools. Keep observing dynamic changes.
- Merge native site tools with saved and newly generated WebMCP. Preserve site
  registrations; generated tools use a namespace and may compose discovered tools.
- Keep use/Builder modes in the same Session, without changing its preset or cwd.
- Provide Builder with page inspection, screenshots, interaction, script debugging,
  source editing and a fixed compiler even when the site starts with zero tools.
- Bind calls to the site, tab, frame and document generation. Switching tabs never
  retargets running calls. Navigation and closing invalidate affected calls.
- Persist WebMCP sources and immutable revisions. Report compilation, registration
  and activation separately. Failed updates retain the previous active revision.
- Restore browser tabs, login profile, site conversations and enabled WebMCP;
  never replay interrupted operations whose outcome is unknown.

## Architecture

- `plugins/browser`: Host services, site/Session bindings, Builder tools, source
  store, browser Client UI, and the browser/native wire contract.
- `plugins/desktop-chrome`: generic launcher slot above Apps and alternate desktop
  surface slot so the browser can reuse the canonical conversation components.
- `apps/desktop`: native BaseWindow/WebContentsView lifecycle, navigation, browser
  profile, downloads and the narrow WebMCP/CDP bridge. No Harness DOM patches.
- Existing user edits in desktop-chrome and restart tests must be preserved.

## Delivery sequence

1. Contract and plugin assembly; browser window, tabs, address bar, persistent profile.
2. Site Agent binding and mode readiness; native WebMCP discovery/call/cancel.
3. Builder inspection and source/apply tools; origin-scoped injection and merge.
4. Version rollback, navigation/close/reconnect handling and browser interaction polish.
5. Full check/test/build, real Electron verification and packaged runtime assembly checks.

## Acceptance

A site with zero WebMCP → same conversation enters Builder → inspect and generate
→ compile/register/activate → invoke with a real result → continue the original task
→ reopen and auto-load. Also cover native+generated merge, same-site double tabs,
different sites, stale calls, failure rollback, mode changes, cancellation and login
state. Validate real provider tool visibility where credentials are available.

Native feasibility already verified with Electron 43.4.0 / Chromium 150: per-view
WebMCP enablement, CDP discovery/invocation/result, and isolated-world registration.
Cross-origin frames remain subject to the site's Permissions Policy.

## Progress

- [x] Research and native feasibility probe
- [x] Consolidated implementation plan
- [x] Browser and plugin assembly
- [x] Site Agent and WebMCP merge
- [x] Builder generation and activation
- [x] Lifecycle and UI verification
- [x] Repository checks and production assembly

## Research references

- [WebMCP proposal and explainer](https://github.com/webmachinelearning/webmcp)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chromium WebMCP DevTools domain](https://chromedevtools.github.io/devtools-protocol/tot/WebMCP/)

Runtime discovery observes tools registered in the loaded browser document. It
is not a scan of a directory site or a guessed HTTP endpoint. The presence of
`document.modelContext` means the browser offers the API; actual registrations
establish the page's available capabilities. Native and generated registrations
are merged without replacing the native registry. Current Chromium registration
is asynchronous and uses AbortSignal for removal, verified against Electron's
bundled browser rather than assuming an older API shape.

## Implementation and verification notes

The complete implementation is described in [the Browser plugin README](../plugins/browser/README.md).
The native verifier covers zero-tool pages, existing site tools, generated tools,
real invocation outputs, cancellation, rollback, reload, saved-script staging,
multiple tabs and origins, and iframe navigation/detach with reused frame/tool
identities. A stale invocation never runs against the replacement document.

Popup regression verification reproduces the original `Invalid webContents`
exception before the fix. Browser now adopts Electron's supplied popup contents,
keeps a stable handle through script-initiated closure, and starts navigation for
background links that arrive without pre-created contents. Tests cover direct
and deferred login popups, shared cookies, opener callbacks, automatic close,
native/generated WebMCP in popups, target-blank links/forms (one POST with the
original body), and middle-click background tabs.

The official Chrome DevTools MCP 1.8.0 is bundled for both Use and Builder.
The Browser plugin connects over MCP stdio and exposes tool discovery/call
entry points. Electron provides authenticated, tab-scoped CDP leases over its
existing WebContents debugger. Native tab controls stay with Browser, and MCP
events cannot double-update Browser's own WebMCP registry. WebMCP discovery and
execution use Browser's document/frame/revision-aware tools; the upstream
name-only WebMCP tools and raw CDP invocation are blocked. The integration
verifier exercises real MCP calls, network response bodies, console messages,
image attachments, performance tracing, native/generated WebMCP, explicit
retargeting, cancellation without replay and cross-site lease revocation.

Regression coverage also exercises cancellation during delayed registration,
disable and reload without tool resurrection, same-name revision replacement,
both screenshot paths, and cookie/storage command rejection through authenticated
root and flattened page CDP sessions. Electron owns per-origin mutation ordering
through the end of rollback. IPC responses have a command/result type map and
Host-side validation. The CDP bridge uses an explicit method policy, restricts
direct navigation, removes universal world access and confines file uploads to
the site's workspace.

A real Harness conversation also discovered the bundled MCP, read the current
page and its three articles, switched into Builder, inspected generated WebMCP,
took a DOM snapshot and screenshot, then returned to Use. Both modes retained
the same MCP tools throughout. Screenshots were saved as Harness image
attachments; the test provider's text-only model correctly received an image
omission marker instead of raw base64.

Full Harness UI testing used an isolated DSH profile and Browser workspace. A
local deterministic DeepSeek-compatible provider exercised the real Agent tool
pipeline: enter Builder in the same Session, inspect the page, save source,
compile/install, discover and call `deepdeck_list_articles`, receive the fixture's
three real articles, and return to use mode. Provider request snapshots confirmed
Builder-only tools appeared on the next model step and disappeared after exit.
This verifies provider/tool plumbing; it is not a claim that a live model can
successfully build every third-party site's WebMCP without iteration.

Real UI testing caught and fixed duplicate conversation-slot declaration, stale
polling overwriting Agent mode, and hidden native tab focus. The WebMCP panel was
verified with one native plus one generated tool, then disabled generated tools
while retaining the site's native capability.

Cold-restart verification restored the same Session, conversation history and
saved WebMCP, then invoked it again and received the same three articles. Site
bindings are persisted by BrowserSiteStore; no custom events are appended to the
Harness Session log. The Client resumes the existing Session through the public
API before binding the new tab, preserving its original preset and workspace.

Final validation passed: `pnpm check`, `pnpm test`, `pnpm build`, the native
browser verifier (including real foreground focus), `pnpm runtime:prepare`,
`pnpm runtime:verify`, and `git diff --check`. Runtime verification includes the
packaged Browser API and a real esbuild transform with an empty PATH.
