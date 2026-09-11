# WebMCP repository index

The official directory is now a live repository index backed by a Cloudflare Worker and D1. GitHub hosts source, releases, issues and contribution PRs. **Listing a project does not require a PR to DeepDeck.** This directory contains documentation only; database migrations and service code live in [`apps/webmcp-index`](../../apps/webmcp-index).

## Submit a repository

Use [Submit project](https://deepdeck.getmegaportal.com/webmcp#submit), or:

```sh
curl --fail-with-body https://deepdeck.getmegaportal.com/api/webmcp/submissions \
  -H 'Content-Type: application/json' \
  -d '{"repository":"https://github.com/owner/project","manifestPath":"webmcp.json"}'
```

The repository must be public and follow the [package contract](../../plugins/browser/skills/deepdeck-webmcp-github/references/repository-contract.md). The index independently resolves repository ID, canonical URL, release/commit, manifest, license and source hash. It never executes submitted source. Unreleased projects are discoverable with a full commit SHA; a listing is not functional verification.

A `202` response includes an `id` and relative `statusUrl`. GET that URL on the same official origin to check `pending`, `indexed`, or `failed`. Only `indexed` plus an entry in the [live catalog](https://deepdeck.getmegaportal.com/api/webmcp/catalog) confirms publication. Failed validation retries with backoff; correct the upstream repository instead of repeatedly submitting it. `429` asks you to wait; `503` indicates unavailable service or a full queue. Submission grants no ownership and cannot overwrite metadata or moderation decisions.

Adding the GitHub `webmcp` topic also enables best-effort discovery of root `webmcp.json` manifests. Submit a URL explicitly for a custom manifest path. Discovery does not guarantee indexing.

## Updates and compatibility

A cron tick checks up to ten due projects every five minutes. Successfully indexed projects refresh every six hours; failures retry from five minutes up to one day. Last verified metadata is retained, with unavailable status on a failed refresh. Repository renames resolve through the recorded immutable ID, so an unrelated repository reusing the old URL cannot replace an entry. Administrators may suppress a project using its D1 `enabled` field.

The website proxies the Worker at `/api/webmcp/catalog` and `/api/webmcp/submissions`; it does not fetch GitHub from a client device. `/webmcp/catalog.json` rewrites to the same live API for older apps. New entries and refreshed metadata become visible after the short catalog cache expires, without rebuilding the website or releasing the desktop app.

During an outage, the website serves the bundled catalog with `X-WebMCP-Source: bundled` and `Cache-Control: no-store`. This is not proof of live indexing. The app retains its own offline fallback. `pnpm webmcp:sync` explicitly refreshes both checked-in fallback snapshots from the live service; it is no longer part of the website build. `--check` compares those snapshots, and `--validate` only validates the fetched live catalog.

See the [service setup and operations](../../apps/webmcp-index/README.md) for deployment, D1 migrations, quotas and environment settings.
