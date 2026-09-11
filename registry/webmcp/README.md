# WebMCP directory

This directory stores references to public GitHub projects. Source, issues, pull requests and releases remain in each project's repository. The initial catalog is intentionally empty.

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

Run `pnpm webmcp:sync` to validate references, retrieve GitHub metadata and atomically regenerate `apps/web/public/webmcp/catalog.json`. `GH_TOKEN` is optional for authenticated API limits and is used only by the sync process. Missing references are removed, failed syncs preserve an existing entry with a warning, and duplicate references or malformed inputs fail the command. The website build does not require live GitHub access.

Review reference changes and the generated catalog together. A listing PR does not grant the submitter ownership of the project. If a repository changes ID or becomes archived/unavailable, review its listing instead of silently replacing its source. Renames currently require updating the canonical URL in the reference.

The site reads the checked-in snapshot. Refresh it with this command and deploy the website to update the public directory. No background schedule or GitHub webhook is configured automatically.
