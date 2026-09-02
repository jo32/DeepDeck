# DeepDeck provider-aware web

This Cordis service replacement keeps the Harness `ctx.web` contract while
selecting search through the provider used by the current agent request when
possible and automatically failing over to another provider that succeeds at
runtime.

- `openai-codex` model requests use the `openai-codex` search provider.
- `deepseek-official` model requests use the `deepseek-official` search provider.
- Any model provider can match a search provider with the same id; routing is not
  limited to a hard-coded provider list.
- The real search request is also the runtime health probe; no separate dummy
  query runs during startup or registration.
- Locally usable search providers are scheduled asynchronously, with the
  matching provider first. The first successful response wins and the remaining
  requests are cancelled, so one slow or broken provider does not hold up the
  user's search. A faster fallback may win over a slow matching provider.
- Caller cancellation stops every in-flight provider immediately. If every
  candidate fails, the seam reports one `WEB_PROVIDER_ERROR` naming them all.
- Explicit deployment configuration still wins and remains strict when its
  provider is missing or unavailable.
- Fetch selection retains the upstream configured/single-usable contract,
  including ambiguity errors when multiple fetch providers are usable.

The plugin owns only routing. Concrete provider authentication, requests, and
normalized results remain with their provider plugins.
