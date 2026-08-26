# DeepDeck Computer Use

DeepDeck's default Cordis integration for
[`open-computer-use`](https://github.com/iFurySt/open-codex-computer-use).

The management plugin owns the durable `computer-use.enabled` preference and
the browser controls. A separate `@deepseek-ai/dsh-mcp-client` loader entry
owns the native MCP process. Turning the preference off disables that loader
entry, which disposes the process and unregisters its tools; turning it back on
starts the entry again.

On macOS, enabling the plugin and starting DeepDeck remain silent. The first
Computer Use tool call in each enabled period runs the bundled
`open-computer-use doctor` once with the app-agent proxy disabled. The MCP row
is already running, but the first tool call waits for that standalone permission
process to exit before dispatching to it. The command stays silent when
permissions are ready and opens the native onboarding window only when
Accessibility or Screen Recording is missing. This keeps application startup
silent and prevents onboarding from terminating a live MCP socket.

DeepDeck also gives the MCP app-agent a private `TMPDIR`, isolating its Unix
socket from Codex and other clients that use the same native runtime. Production
packaging rewrites the nested helper to the upstream-supported development
bundle identifier and the display name `DeepDeck Computer Use` before the whole
app is signed. The post-sign hook requires the nested helper and DeepDeck to
share the release Team ID before notarization begins. This keeps the TCC row
distinct from separately installed copies of `Open Computer Use` while retaining
a valid DeepDeck release signature.

`open-computer-use@0.3.1` is pinned as a production dependency so its MIT-licensed
native runtimes and launcher are copied into every prepared desktop runtime.
