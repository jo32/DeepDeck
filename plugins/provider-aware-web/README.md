# DeepDeck provider-aware web

This Cordis service replacement keeps the Harness `ctx.web` contract while
selecting search through the provider used by the current agent request.

- `openai-codex` model requests use the `openai-codex` search provider.
- `deepseek-official` model requests use the `deepseek-official` search provider.
- Explicit deployment configuration still wins.
- Agentless and unknown-provider calls retain the upstream single-usable-provider
  fallback and ambiguity errors.

The plugin owns only routing. Concrete provider authentication, requests, and
normalized results remain with their provider plugins.
