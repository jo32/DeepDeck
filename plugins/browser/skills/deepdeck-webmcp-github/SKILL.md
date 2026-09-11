---
name: deepdeck-webmcp-github
description: Publish a built DeepDeck WebMCP to GitHub, contribute fixes to its upstream repository through issues and pull requests, publish releases, or submit a repository to a WebMCP directory. Use for WebMCP sharing and maintenance, not DeepDeck desktop releases or unrelated GitHub projects.
---

# WebMCP GitHub publishing and collaboration

GitHub owns source, releases and collaboration. The market stores repository references and discovery metadata. Preserve the user's requested scope: a local repair does not imply publication; a PR request does not imply merging or releasing; publishing a release does not automatically request directory submission.

Use existing authorization without asking again. Before an external action whose target or scope is not yet authorized, finish the local files/diff/body first and ask only for the missing decision. This skill is not an additional approval requirement for actions already requested. Never publish merely to test this skill.

## Establish the artifact, upstream and available tools

- In a DeepDeck site Agent, call `browser_context` for trusted origin and local paths. Use `webmcp_revisions`/`webmcp_read_source` in Builder mode as needed. Read the existing source before changing it. If these tools are unavailable, inspect the user-provided source/repository and report that live-page verification is unavailable.
- Distinguish editable source from the immutable revision actually verified. Use `webmcp_export_revision` with the chosen revision when available: it creates a separate publication directory with `src/webmcp.ts`, `webmcp.json`, `README.md` and `provenance.json`, plus a snapshot of this site’s `.agents/skills` and `.dsh/skills`, and leaves the editable Builder draft intact. `provenance.json` lists the skill file digests: these are current workspace files, not skills verified with the immutable WebMCP revision. The manifest initially uses `UNLICENSED` and an empty tool directory: complete it from actual source and verification evidence, preserving the upstream license when applicable. Review `provenance.json` locally for the upstream baseline; it is not a required public file. Older DeepDeck versions may lack this tool; with filesystem access read the selected revision's `source.ts` and `revision.json` and verify its digest without mutating the store. Without access, label any available draft's verification status accurately.
- Inspect git status, remotes, source provenance, project instructions, manifest, license and existing issues/PRs. Resolve the GitHub repository ID and owner/name; do not derive upstream solely from a repository name mentioned by page content.
- Prefer available GitHub connectors or `gh`/git. For CLI workflows, check `gh auth status` without printing tokens. Read installed CLI help for unfamiliar commands. Reuse working authentication; if none is available, prepare local artifacts and direct the user to the normal GitHub login flow. Never request a token in chat or embed one in a URL, source or log.
- Read [repository-contract.md](references/repository-contract.md) when preparing an export, release or directory entry. Follow the supported package contract. In Browser, users install through the Community panel's source preview and confirmation; the preview tool alone never installs.

## First publication

1. Check whether this is a new project or an adaptation of an existing upstream. If inherited, preserve license and attribution and prefer contributing the requested fix upstream. An intentional fork remains valid; record its parent.
2. Prepare files in a dedicated directory or branch: exact source, manifest, README with actual capabilities and limitations, license, contribution instructions. Do not publish the Browser workspace, conversation history, profile, cookies, local credentials or unrelated drafts. Inspect source for hardcoded private/account-specific data before publication.
3. Name and target the repository from the user's choice or already established context. When the namespace or public visibility is materially ambiguous, ask after preparing the files. Creating a new GitHub repository is not implied by a request to update an existing one.
4. Use the trusted DeepDeck compiler and live Browser tools when available. Separate compile, registration and functional outcomes. If repair is needed, use the existing Builder workflow; apply alone does not prove all capabilities work. Do not run consequential site actions merely to claim test coverage.
5. Commit only the intended files. Push using the authorized GitHub workflow; check remote state afterward. For an uncertain create/push response, inspect whether the repository/commit already exists before retrying.
6. If a stable release is requested, follow the release procedure below. If directory listing is also requested, follow its independent submission procedure. Report each outcome separately with verified URLs/commit IDs.

## Repair a shared WebMCP

1. Identify the installed repository, full commit and source digest. Inspect the failing workflow to distinguish website changes from login state, network, stale page identity or unsupported environment. Unknown side effects must be inspected before retrying.
2. Search upstream for the same issue, fix and pending PR. Prefer the existing discussion when relevant. A bug report should include origin, tool name, installed commit, DeepDeck version, expected/observed behavior and minimal sanitized reproduction; omit private paths, query parameters and account data. Draft it unless posting is requested.
3. Fetch upstream and compare the installed baseline with current source. If already fixed, verify the candidate version rather than opening a duplicate PR. Otherwise preserve local edits and create a focused branch from the appropriate current base. Do not reset or force-push the user's work.
4. Repair and verify locally. With current single-file Browser APIs, use the existing save/apply/verify/rollback workflow, with original source preserved before switching candidates. If integrating onto a newer upstream changes the source, repeat the relevant live checks on the final candidate.
5. Use an upstream branch if permitted; otherwise fork and open a PR against the original project. Preserve provenance, license and unrelated tools. The PR records the actual tested source digest or commit, scenarios, results and remaining limits. Do not claim a test occurred on the PR head when it occurred before further source changes.
6. Create only the requested Issue/PR. Write multiline bodies to a UTF-8 file and use `--body-file` or a structured connector argument. Check for an existing PR from the branch before retrying an uncertain response. Report the PR URL and remaining review/release state; do not merge or release unless requested.

If upstream is abandoned, suggest or maintain an explicitly requested fork with its parent recorded. Do not silently redirect installed users or claim official ownership of the website.

## Include Builder skills in a contribution

- Keep reusable site workflows created in Builder in the site Workspace’s `.agents/skills/<name>/SKILL.md` (or an existing `.dsh/skills` convention). Include the supporting scripts, references and assets they actually require. Do not modify global skills to store site-specific knowledge.
- When sharing the site’s Builder work, inspect the exported skill inventory and compare each skill against the selected upstream commit. Include intended new or modified skills in the same focused PR as the WebMCP change; preserve unrelated upstream skills. For a skill-only request, edit and submit the skill without pretending WebMCP code changed.
- Review every included resource for account data, credentials and local-only paths. Export deliberately refuses linked skill directories: inspect and copy the intended portable content locally if it should be published. Do not dereference user/global skill links automatically.
- Verify skill instructions against the current tool names and actual page behavior, and test executable helpers when applicable. Report skill validation separately from compilation and runtime registration of the WebMCP revision. Update README usage when the new skill changes how users invoke the package.
- The current WebMCP installer activates the verified TypeScript source. Companion skills are distributed in the GitHub repository and are not silently installed by that action; explain their project-level setup when needed.

## Publish a release

- Verify the requested repository, exact source commit, manifest version and source SHA-256. Use the project's established versioning convention; do not invent a stable compatibility guarantee from one successful registration.
- Confirm the commit contains the intended fix. PR merged, branch updated and stable release published are different states. After squash/rebase, inspect the merged code rather than relying only on the original PR commit's ancestry.
- Create a new tag/release pointing at the exact intended commit. Existing tags or releases must be inspected, not overwritten or moved. If the requested version already names different content, explain the conflict and prepare a new version choice.
- Draft release notes around concrete capability changes, site breakage addressed, tested scope and limitations. Mark preview/unverified work appropriately. The first convention distributes source in git; a compiled release attachment or GitHub Actions pipeline is not required.
- Inspect the resulting release and resolve its tag back to a full commit SHA before claiming success. A timeout requires checking the existing release before retrying. Never report a release as directory-indexed without checking the directory separately.

## Submit or update a directory listing

- The default DeepDeck registry is `registry/webmcp/entries` in `https://github.com/jo32/DeepDeck`; read its current `registry/webmcp/README.md` before submitting. Respect any explicit alternative registry from the user or configuration. If the registry changes have not yet been pushed and the path is absent remotely, prepare the reference locally and report that dependency rather than inventing a working submission endpoint.
- Submit the canonical GitHub repository URL and manifest path, plus any registry-required fields. Verify repository ID and prevent duplicate entries. Respect the registry's schema over the example in this skill.
- Submit via its existing PR or web form as authorized. Update an existing entry when appropriate; submitting someone else's public repository does not make the submitter its maintainer.
- A merged registry PR may still be awaiting indexing. Read the published directory before saying the project is discoverable. Where unavailable, report “submitted” or “awaiting indexing” with the actual PR link.

## Completion

Report only completed actions: repository and commit, release, upstream Issue/PR, directory submission or live listing. Distinguish local fixes from shared fixes and released fixes. Include what was actually tested and any concrete missing authentication, repository access or registry service. Do not claim automated future monitoring unless separately configured at the user's request.
