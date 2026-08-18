---
name: deploy-deepdeck
description: Prepare, publish, monitor, and verify signed DeepDeck desktop releases through the repository's GitHub Actions workflow and Cloudflare R2 update feed. Use for DeepDeck deployment, release, publication, updater-feed verification, or release recovery; not for ordinary local development builds.
---

# Deploy DeepDeck

Run release work from the DeepDeck repository root. Treat `docs/release.md` and `.github/workflows/release.yml` as the source of truth; inspect them before changing the workflow or recovering a failed release.

## Essential constraints

- Publish production builds through `.github/workflows/release.yml`. Do not locally sign, upload, or replace production artifacts unless the user explicitly requests a documented recovery action.
- Require explicit release/deploy/publish authorization before pushing a release commit or tag. Planning, status checks, and artifact review remain read-only.
- Keep unrelated worktree changes out of the release. Inspect the branch, commit, submodules, remote, and existing tag/release before staging anything; never use broad staging in a dirty worktree.
- Keep credentials in the `production-release` GitHub Environment. Never print, download, copy into files, or expose Apple, GitHub, or Cloudflare/R2 secret values.
- The tag must be `v` plus the exact version in `apps/desktop/package.json`. Tags and versioned R2 objects are immutable; fix a bad release with a higher version.
- The stable update origin is `https://deepdeck-updates.getmegaportal.com`, with separate `stable/darwin/arm64` and `stable/darwin/x64` feeds.
- Do not claim deployment success until the workflow succeeds, the GitHub Release is public, and both public R2 metadata files resolve to the released version.

For an actual release, monitoring, artifact audit, end-to-end updater test, or failure recovery, read [references/release-runbook.md](references/release-runbook.md) and follow the applicable sections.

