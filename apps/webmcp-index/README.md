# WebMCP directory service

A Cloudflare Worker validates publisher-submitted packages and stores their directory metadata in D1. The existing website proxies the Worker. Publishing and browsing make **no GitHub requests**. There is no indexing cron, topic discovery, GitHub token, request budget or background validation queue.

## Publication flow

After the requested GitHub publication, the Site Agent calls `webmcp_publish_index` with its local Git project directory, repository URL/ID, full pushed commit and manifest path. The tool reads that commit’s manifest and source, checks the source digest and posts the complete package to `/api/webmcp/submissions`. It generates and saves a project update credential automatically outside the publishable workspace, before sending the first request. Retries reuse the same credential and payload.

The HTTP payload is `repository`, `repositoryId`, `manifestPath`, `commit`, `manifest`, `source`, and `publisherToken` (32 random bytes in lowercase hex). The Worker validates the schema, exact HTTPS origin, redistribution license, 64 KB manifest limit, 512 KB source limit and source SHA-256. The request limit is 4 MB, including JSON escaping. It does not fetch, compile or execute source. D1 stores directory metadata, the manifest, the publication digest and a hash of the update credential; the source and raw credential are not retained.

A successful `200` response says `indexed` and includes the exact commit/hash plus a status URL. The entry is immediately available from the catalog. Repeating the same request is idempotent; a new version with the same saved project credential updates the listing. Another credential cannot overwrite it. `enabled=0` remains an administrative moderation decision. First submission establishes a directory publishing credential, not proof of GitHub account ownership. The installer still checks the actual repository ID and pinned commit/source before activation.

A URL-only request returns `400` with instructions to publish the complete package. `429` includes `Retry-After`; the client retries automatically. `503` reports an unavailable service, not queued success. The status of an old unindexed URL-only record is `needs_package` until a full package is published.

## Local verification

```sh
pnpm --filter @deepdeck/webmcp-index db:local
pnpm --filter @deepdeck/webmcp-index check
pnpm --filter @deepdeck/webmcp-index test
pnpm --filter @deepdeck/webmcp-index build
```

Tests use actual local D1. They verify synchronous publication with outbound networking disabled, integrity rejection, idempotency, updates, concurrency, credential isolation, legacy records and moderation.

## Deployment and migration

Use the existing Wrangler login and the existing `deepdeck-webmcp-index` D1 database. Apply migrations with `wrangler d1 migrations apply DB --remote`, then deploy with `wrangler deploy`. Migration `0002_direct_publication.sql` adds publication fields without deleting legacy records. The empty cron configuration removes the former polling schedule. No GitHub service token is needed.

Legacy entries already containing verified metadata remain discoverable even if their last GitHub poll failed. During the one-time migration, automatically provision a random project credential in the publisher’s private credential directory and store only its SHA-256 in `publisher_token_hash` for those known existing projects. Do not allow an anonymous request to claim an existing verified listing. Existing unindexed URL-only submissions accept their first complete package normally.

The website’s server-only `WEBMCP_INDEX_URL` still points at the Worker origin. Deploy the website’s larger publication proxy before enabling the new publisher. Catalog responses use `no-store` so successful publication is visible immediately. Verify `/health` reports `direct-publication`, the Worker’s schedule list is empty, and publishing a real authorized package returns `indexed` with the same commit in the official catalog.

The endpoint accepts at most ten publications per minute per Cloudflare location and caps the directory at 5,000 projects. These are traffic/storage limits, independent of GitHub. Administrative recovery or suppression uses the existing D1 access; update credentials must stay out of logs, URLs and Git repositories.
