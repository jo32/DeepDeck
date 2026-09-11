# WebMCP index service

A standalone Cloudflare Worker with D1 stores repository candidates and verified directory entries. The existing Vercel website proxies the service; desktop clients keep their official-site API URL. No desktop or website deployment is required when repository records change.

## Local validation

```sh
pnpm --filter @deepdeck/webmcp-index db:local
pnpm --filter @deepdeck/webmcp-index dev
pnpm --filter @deepdeck/webmcp-index check
pnpm --filter @deepdeck/webmcp-index test
pnpm --filter @deepdeck/webmcp-index build
```

Set an optional read-only `GITHUB_TOKEN` in ignored `.dev.vars` to avoid anonymous GitHub limits. Never put tokens in client variables or Wrangler vars. The `nodejs_compat` flag supports the same bounded GitHub reader and hash validation used by the desktop. Tests use actual local D1 and mocked GitHub transport, including real blob/SHA validation. The Worker never compiles or executes repository source.

With `wrangler dev --test-scheduled`, request `/__scheduled` to run a local cron tick. Production uses the configured five-minute Cron Trigger.

## Deployment

Use an existing Wrangler login. Create the scoped D1 database once with `wrangler d1 create deepdeck-webmcp-index` and save the returned exact database ID in `wrangler.jsonc`. Apply `wrangler d1 migrations apply DB --remote`, configure an optional read-only `GITHUB_TOKEN` via `wrangler secret put GITHUB_TOKEN`, then `wrangler deploy`. Before using an existing database, inspect its name/ID and applied migrations. The initial migration queues the existing NGA repository for verification; it does not blindly trust a historical snapshot.

Configure **server-only** `WEBMCP_INDEX_URL=https://<deployed-worker-host>` in the Vercel website project and deploy the website once. It must point to the Worker origin, never to the website's own proxy. The proxy uses short timeouts, bounded bodies, standard JSON and the upstream response status. No custom domain or DNS cutover is required for this arrangement. Public clients keep using the official website domain.

Verify `/health`, `/api/webmcp/catalog`, a POST to `/api/webmcp/submissions`, its returned status URL, and the official-site equivalents. An initial empty catalog is expected until the first successful cron. Check that the NGA entry is indexed before switching the website to the service. Regular GitHub indexing may require a read-only token at larger scale; a developer's broad personal token should not be copied into the Worker.

## Operations and limits

- Without a service token, a D1 budget caps GitHub requests at 40/hour; token-backed indexing is capped at 4,500/hour. Exhausted budget defers jobs without invalidating a verified listing. Anonymous indexing is deliberately slow.
- The scheduled handler claims up to ten due projects with ten-minute leases and performs bounded, sequential GitHub validation. Overlapping invocations cannot process the same active lease. Successful refreshes run every six hours; failures back off to one day. Status and last verified metadata persist in D1.
- The public endpoint accepts only HTTPS GitHub repository URLs and relative manifest paths. It cannot choose fetch destinations, inject SQL, set repository identity/metadata, reset a lease/backoff, or change moderation. Input is limited to 2 KB, and a global edge rate-limit binding allows ten submission requests/minute per Cloudflare location. This is a coarse abuse limit, not authentication or a strict global quota. The SQL admission check caps the database at 5,000 candidates and unverified candidates at 1,000. Failed unverified candidates expire after seven days. Revisit admission capacity before scaling beyond these bounds.
- `DISCOVER_TOPICS=true` enables an hourly GitHub repository search for `topic:webmcp`, including forks. It cycles over at most ten pages of 30 recently updated repositories, enqueues root manifests, and validates them like submissions. This is best-effort discovery, not an exhaustive GitHub crawl. Set it to `false` for submission-only operation.
- To suppress a known listing, run a parameterized/admin-reviewed D1 update setting `enabled=0` for its exact `key`. Public resubmission cannot reverse this. To re-enable, set `enabled=1,next_check=0`. No unauthenticated moderation API is exposed.
- To refresh a known repository immediately after an upstream fix, an administrator can set its `next_check=0`. Public submissions intentionally cannot force repeated GitHub fetches.
- Inspect Wrangler tail/logs and D1 state when a job fails. Errors returned publicly are sanitized. For a database failure, API requests return 503; the website retains its labeled offline snapshot.

Cloudflare's global network does not guarantee Mainland China availability. This design removes GitHub from client requests and keeps the existing official domain; verify availability from the target network separately.
