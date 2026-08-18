# DeepDeck release runbook

Use this runbook only for the part of the release the user requested. The repository's `docs/release.md`, `.github/workflows/release.yml`, and release scripts take precedence if they change.

## 1. Establish the release candidate

Inspect without mutating anything:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git remote get-url origin
git submodule status --recursive
node -p "require('./apps/desktop/package.json').version"
gh auth status
git fetch --tags origin
```

Confirm all of the following before release mutation:

- the requested changes are committed in the exact candidate commit;
- unrelated modified or untracked files will not be staged or tagged accidentally;
- required submodule pointers are committed and their referenced commits are remotely available;
- `origin` is the intended DeepDeck repository;
- the candidate version is a new SemVer version;
- neither the remote tag nor a GitHub Release already exists for that version.

Check the last condition using the candidate tag, for example:

```bash
git ls-remote --exit-code --tags origin "refs/tags/v1.2.3"
gh release view "v1.2.3"
```

An exit failure means "not found" only after authentication and network health are known to be good. If a tag or release already exists, stop and inspect it rather than replacing it.

## 2. Validate locally

Use Node 24 and the pinned pnpm 11.7.0. Run the repository-required validation from the candidate state:

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
pnpm market:install
pnpm codex-connect:install
pnpm harness:install
pnpm harness:build
pnpm check
pnpm test
pnpm build
pnpm package:local
```

`package:local` must complete its packaged-app and independent-runtime verification. Do not treat a raw Electron development launch as release acceptance.

If the worktree contains unrelated changes that affect these commands, use an isolated worktree at the candidate commit instead of hiding, resetting, or incorporating the user's files.

## 3. Version and publish

Update only `apps/desktop/package.json` to the intended SemVer version, then rerun the relevant validation. Commit the version together with the fully tested release changes if it is not already committed.

Before creating the tag, verify the exact candidate:

```bash
node scripts/verify-release-config.mjs \
  --tag "v1.2.3" \
  --base-url "https://deepdeck-updates.getmegaportal.com"
git show --stat --oneline HEAD
```

After explicit publication authorization, push the release commit first, then create and push one annotated matching tag:

```bash
git push origin HEAD
git tag -a "v1.2.3" -m "DeepDeck v1.2.3"
git push origin "v1.2.3"
```

Do not move or recreate a pushed release tag. The tag-triggered workflow builds signed and notarized arm64 and x64 packages, stages a draft GitHub Release, verifies immutable R2 objects, promotes both `latest-mac.yml` files, and finally publishes the GitHub Release.

## 4. Monitor GitHub Actions

Find the run whose `headBranch` and `headSha` match the pushed tag and commit:

```bash
gh run list \
  --workflow "Release DeepDeck" \
  --limit 10 \
  --json databaseId,headBranch,headSha,status,conclusion,url
gh run watch RUN_ID --exit-status
```

If the `production-release` Environment requires approval, report that exact waiting state. Do not attempt to bypass it.

On failure, capture the failed step and logs before deciding on recovery:

```bash
gh run view RUN_ID
gh run view RUN_ID --log-failed
```

Do not blindly rerun or create a new build for the same version. First determine whether R2 latest metadata was promoted and whether the draft GitHub Release has partial assets.

## 5. Verify publication

Confirm the GitHub Release is public and matches the tag:

```bash
gh release view "v1.2.3" \
  --json tagName,name,isDraft,isPrerelease,publishedAt,url,assets
```

Required release contents are:

- arm64 and x64 DMG, ZIP, and ZIP blockmap assets, plus any generated DMG blockmaps;
- `latest-mac-arm64.yml` and `latest-mac-x64.yml`;
- `release-manifest.json`;
- `SHA256SUMS`;
- GitHub build-provenance attestations from the workflow.

For a full artifact audit, download all assets into a new temporary directory and verify every checksum:

```bash
release_audit_dir="$(mktemp -d)"
gh release download "v1.2.3" --dir "$release_audit_dir"
(cd "$release_audit_dir" && shasum -a 256 -c SHA256SUMS)
```

Inspect `release-manifest.json` and both architecture metadata files. Their version, names, sizes, SHA-512 values, and architecture-qualified paths must agree with the downloaded assets.

Fetch both public update metadata files with cache busting and confirm the released version:

```bash
curl -fsSL "https://deepdeck-updates.getmegaportal.com/stable/darwin/arm64/latest-mac.yml?verify=v1.2.3"
curl -fsSL "https://deepdeck-updates.getmegaportal.com/stable/darwin/x64/latest-mac.yml?verify=v1.2.3"
```

Also verify that each referenced versioned ZIP is publicly downloadable and honors a one-byte Range request (`206` with the exact `Content-Range`). The workflow performs full hash, size, cache-policy, and Range verification before promotion; the post-release audit independently confirms the public result.

## 6. End-to-end updater acceptance

Use signed published builds for a real vN to vN+1 test on a clean Mac. Before starting, close every other running DeepDeck copy, including packaged apps launched from source: macOS updater installation can fail when another process with the same `com.jo32.deepdeck` application identity is still running.

Confirm that:

1. the installed vN discovers vN+1 from the correct architecture feed;
2. download progress advances and the versioned ZIP/blockmap path is used where applicable;
3. Harness stops cleanly, the app exits for installation, and DeepDeck relaunches;
4. About reports vN+1 and normal sessions still load;
5. the installed artifact matches the GitHub/R2 release checksums.

Do not use an updater test to overwrite a user's active production installation without their authorization.

## 7. Recovery boundaries

- Failure before R2 latest promotion leaves clients on the prior release. Inspect the draft and immutable objects before any retry.
- Identical immutable R2 objects may be reused only when size, cache policy, and stored SHA-256 match. Never overwrite a conflicting object.
- Partially uploaded GitHub assets require inspecting and usually removing the draft before restarting. Deleting a draft or assets is destructive and requires explicit authorization.
- If R2 latest metadata was promoted but final GitHub publication failed, repair or publish the existing draft; do not rebuild the same version.
- Never roll `latest-mac.yml` back to a lower version. Ship a corrected higher version instead.
