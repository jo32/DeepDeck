# WebMCP directory

This directory is the source of truth for the official WebMCP directory. It stores references to public GitHub projects. Source, issues, pull requests and releases remain in each project's repository.

To list a project, add `entries/<short-name>.json` in a pull request to this repository:

```json
{
  "id": "your-project",
  "repositoryId": 123456789,
  "repository": "https://github.com/owner/repository",
  "manifestPath": "webmcp.json"
}
```

Use the actual numeric GitHub repository ID, not the illustrative value above. IDs and repository/path combinations must be unique. Do not add source or a compiled bundle here. The repository must be public and contain the [WebMCP manifest](../../plugins/browser/skills/deepdeck-webmcp-github/references/repository-contract.md), source, and an appropriate license. A stable release tag must match the manifest version (an optional `v` prefix is accepted).

Projects without a stable release can be listed for discovery; installation of unreleased source requires an explicit full commit SHA. GitHub stars, a recent commit, and successful registration are not functional verification. Issues and repairs link to upstream.

Merging a registry change to `main` automatically triggers the existing `deepdeck` Vercel project's Git integration. Its website build reads the checked-out `entries/`, retrieves GitHub metadata, verifies repository identity, manifest, license and source hashes, and generates the directory. The website and API publish in the same deployment. Contributors only need to commit reference changes; generated snapshots are not required in listing PRs.

GitHub requests happen in the build environment, not on client devices. Clients fetch the public mirror at `https://deepdeck.getmegaportal.com/api/webmcp/catalog`. The previous `/webmcp/catalog.json` URL remains available with the same data for installed clients. Both endpoints allow cross-origin reads and cache for at most five minutes at the CDN. No desktop release or manual website deployment is needed for registry updates.

`GH_TOKEN` is optional for authenticated API limits and is used only by synchronization. For larger registries, configure a read-only GitHub token as a Vercel build environment variable. Never expose it through a `NEXT_PUBLIC_` variable. If GitHub is unavailable, a reference is invalid, or integrity verification fails, the build fails and the previous production deployment remains live.

Review reference changes and their upstream projects together. A listing PR does not grant the submitter ownership of the project. If a repository changes ID or becomes archived/unavailable, review its listing instead of silently replacing its source. Renames currently require updating the canonical URL in the reference.

The registry workflow validates references on pull requests and pushes using GitHub's read-only workflow token. Vercel's Git integration handles previews and production publication separately. The project must include files outside `apps/web` and must not skip builds when only `registry/` changes (`apps/web/vercel.json` sets `ignoreCommand` accordingly). This workflow publishes the website only; it does not publish desktop packages or upstream WebMCP releases.

## Validation and publication

The live catalog is [the registry API](https://deepdeck.getmegaportal.com/api/webmcp/catalog); browse it at [the directory](https://deepdeck.getmegaportal.com/webmcp).

1. Add or update a reference under `entries/`, following [entry.schema.json](entry.schema.json).
2. Run `pnpm webmcp:sync --validate` to check the references without changing files. Use an existing GitHub login token in `GH_TOKEN` when needed. Never commit credentials.
3. Open a PR containing the reference changes. Wait for registry validation and review.
4. Merge to `main`. Vercel automatically runs the website build, including `pnpm --filter @deepdeck/web registry:sync`, and publishes the updated site and API.
5. Verify the live API and directory. Desktop installations fetch the new catalog on refresh and may fall back to their bundled snapshot when offline.

For local inspection, `pnpm webmcp:sync` still refreshes both checked-in snapshots, and `--check` verifies their consistency. Desktop maintainers can include refreshed snapshots in an app release to update its offline fallback. `--website-only` regenerates only the website snapshot and aborts without replacing output on any upstream failure; this is the website build's mode.

Local synchronization and an open PR do not mean a project is indexed on the public website. Verify the live JSON after deployment.
