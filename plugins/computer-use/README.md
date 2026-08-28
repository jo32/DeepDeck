# DeepDeck Computer Use

DeepDeck's default Cordis integration for
[`open-computer-use`](https://github.com/iFurySt/open-codex-computer-use).

The management plugin owns the durable `computer-use.enabled` preference and
the browser controls. A dependent Cordis group evaluates that preference before
mounting its `@deepseek-ai/dsh-mcp-client` child. For enabled profiles, initial
MCP discovery is therefore part of the Host startup barrier and its tools are
registered before a first Agent turn can snapshot the catalog. Turning the
preference off disables the child entry, which disposes the process and
unregisters its tools; turning it back on starts the entry again. Process
supervision and native health checks exist only while that enabled child is
mounted. Disabling Computer Use also asks the private native helper to
terminate, so neither watchdog remains as an application-wide background job.

On macOS, the MCP stdio process is a small DeepDeck proxy that launches the
signed nested app through LaunchServices. Its Unix socket is derived from the
helper bundle path, so Codex and unrelated Open Computer Use clients cannot
replace DeepDeck's live agent. The first tool call opens a separate
LaunchServices onboarding instance with `open -W -n` and waits for it to exit;
the same signed bundle identity therefore owns both the permission prompt and
the native MCP operations. While enabled, the proxy pings an established helper
every five seconds, relaunches it after a broken socket, and resets native calls
that exceed 30 seconds. Only `list_apps` and `get_app_state` can be retried after
a disconnect; actions are never replayed. The outer MCP client separately
restarts a crashed stdio proxy with bounded exponential backoff.

Production packaging rewrites the nested helper's plist and audited fixed-width
native constants to `com.jo32.deepdeck.cu-helper` and the display name
`DeepDeck Computer Use` before signing. Packaging fails if the pinned upstream
binary layout has changed. The post-sign hook then requires the code-signing
identifier to equal that bundle ID and the helper to share DeepDeck's release
Team ID before notarization begins. This produces one stable, product-owned TCC
row instead of reusing an upstream release or development identity.

`open-computer-use@0.3.1` is pinned as a production dependency so its MIT-licensed
native runtimes and launcher are copied into every prepared desktop runtime.
