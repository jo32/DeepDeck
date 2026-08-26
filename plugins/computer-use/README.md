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
`open-computer-use doctor` once. The command stays silent when permissions are
ready and opens Open Computer Use's native onboarding window when Accessibility
or Screen Recording is missing, so permission UI appears only after the user
starts a Computer Use task.

`open-computer-use@0.3.1` is pinned as a production dependency so its MIT-licensed
native runtimes and launcher are copied into every prepared desktop runtime.
