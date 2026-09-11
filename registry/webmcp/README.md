# WebMCP directory

The official directory uses a Cloudflare Worker and D1. GitHub hosts project source and collaboration; it is not part of indexing or catalog reads. A project does not require a DeepDeck registry PR or a GitHub Release to appear in the directory.

## Publish and update

In DeepDeck, choose **Publish** in the site Agent, or ask it to publish and list the project. After publishing the source, the Agent calls `webmcp_publish_index`. The tool sends the exact committed manifest and source directly to the directory. The Worker checks the package and source digest, writes D1, and returns `indexed` immediately. The Agent repeats this automatically for requested new versions.

The tool generates and privately saves a per-project update credential outside the Git project. The same credential makes retries idempotent and permits future updates. Do not print or commit it. There is no GitHub indexing token, topic scan, polling schedule, manual queue refresh or additional submission form.

For custom publishing clients, POST the complete package to `https://deepdeck.getmegaportal.com/api/webmcp/submissions`: `repository`, `repositoryId`, `manifestPath`, `commit`, `manifest`, `source`, and `publisherToken`. Read the files from the exact local published commit. See the [package contract](../../plugins/browser/skills/deepdeck-webmcp-github/references/repository-contract.md) and [service documentation](../../apps/webmcp-index/README.md) for limits and credential handling. A repository URL alone is insufficient; the service never fetches its contents.

`200` with `status: indexed` confirms publication. Verify the returned status URL and the exact commit in the [live catalog](https://deepdeck.getmegaportal.com/api/webmcp/catalog). `400` explains a package error, `403` rejects an unauthorized update or moderated project, `429` includes a retry delay, and `503` reports an unavailable service. The publication client automatically retries transient failures using its saved credential.

## Installation and availability

Directory metadata is publisher-submitted and does not certify GitHub ownership or live website functionality. Installation previews and verifies the actual repository identity and the full pinned commit/source before activation. Updating the directory does not silently replace an installed version.

The website proxies `/api/webmcp/catalog` and `/api/webmcp/submissions`; `/webmcp/catalog.json` remains an alias for older clients. Successful publications appear immediately without a website rebuild or desktop release.

During an outage, the website labels its bundled fallback with `X-WebMCP-Source: bundled`. This is not proof of live publication. `pnpm webmcp:sync` explicitly refreshes offline snapshots when preparing a desktop release; it is never part of the website build.
