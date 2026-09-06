# Codex Connect integration

DeepDeck pins `dsh-codex-connect` to `0.1.0-alpha.4.21`, the last upstream
release verified for this checkout's Harness `0.1.1-rc.2` and pi-ai `0.82.1`.
Alpha 4.22 and later require Harness 0.1.2 APIs; upgrading the plugin alone
would mix incompatible service contracts. The source submodule follows the
same exact tag; the application loads the patched npm package.

The pnpm patch preserves DeepDeck's manual update checks, React 18/19 peer
range, and Responses-based hosted search. It also adds `gpt-6-astra` to the
plugin's provider catalog until a compatible upstream catalog includes it.
The backfill uses the existing OAuth provider and streaming adapter, and
leaves an upstream Astra descriptor intact if one is already present.
Model visibility settings continue to apply, including an explicitly empty
list; hidden models remain resolvable by existing sessions.

Astra metadata was verified on 2026-09-05 against the
[official model page](https://developers.openai.com/api/docs/models/gpt-6-astra):
text/image input, 1,050,000 context tokens, 128,000 maximum output tokens,
and `low`, `medium`, `high`, `xhigh`, `max` reasoning. Model availability still
depends on the ChatGPT account. Existing model and search defaults are retained.

When rebasing, extract the new npm package, transfer the reviewed changes,
and regenerate the pnpm patch against the pristine package. Do not rebuild
the vendored source over the installed package: that would drop these changes.
Run `pnpm check`, `pnpm test`, and `pnpm build`. The patch verifier boots the
installed plugin through Cordis and checks model discovery, visibility,
reasoning validation, and OAuth SSE request/response conversion with a local
fetch fixture; it does not contact OpenAI or consume account quota.
