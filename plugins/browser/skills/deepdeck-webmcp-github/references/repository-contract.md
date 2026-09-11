# DeepDeck WebMCP repository convention

Use this contract for GitHub packages imported by DeepDeck Browser. The parser lives in `plugins/browser/src/webmcp-package.ts`. A repository needs directory submission to become discoverable; direct repository installation is also available. Existing incompatible formats require an explicit adapter or migration, not a claim that Browser accepts them.

## Files

```text
webmcp.json
src/webmcp.ts
README.md
LICENSE
CONTRIBUTING.md
```

Keep actual source under `src/webmcp.ts`. Preserve any existing license; for original code, confirm the intended license within the user's publishing scope. README covers exact origin, useful tasks, login requirements, available tools, tested scenarios and known gaps. CONTRIBUTING explains reproducing a site regression and submitting focused fixes. Do not add an Actions workflow or dependencies solely for publishing.

## Manifest fields

| Field | Meaning |
| --- | --- |
| `formatVersion` | `1` for this proposed DeepDeck convention |
| `name`, `description` | Human-readable identity and bounded task description |
| `version` | Project release version, checked against the selected release convention |
| `origin` | One exact HTTPS origin, without credentials, path, query or fragment |
| `entry` | Repository-relative ordinary source file, initially `src/webmcp.ts` |
| `sourceSha256` | SHA-256 of the source file's exact committed bytes, not its Git blob ID |
| `runtime` | Object `{ "id": "deepdeck-webmcp", "sdkVersion": 1 }`; other SDK versions are rejected |
| `license` | Applicable license identifier; include its actual text and attribution |
| `tools` | Bounded names/descriptions/input schemas of authored tools; distinguish from dynamically discovered site-native tools |
| `tags` | Website/task discovery terms |
| `upstream` | Optional fork origin: repository URL, manifest path and baseline full commit |

Do not put the current commit SHA in the manifest that defines that same commit: this creates a self-reference problem. Record the resolved commit in directory/installation metadata. Test reports may refer to sourceSha256, compiler, runtime and timestamp, with exact tested tools and outcomes; after a commit exists, an Issue, PR or release note can refer to it directly.

Compute sourceSha256 from the committed blob or confirm the staged bytes match the file used for hashing. Git line-ending conversion can otherwise produce a different digest. Source timestamps and “all tools work” prose are not functional evidence.

## Source and verification

DeepDeck currently builds a single TypeScript browser script to IIFE using its internal esbuild configuration: no runtime imports, require, Node APIs or repository build/install scripts. Source is limited to 512 KiB and compiled output to 1 MiB. Generated tools use `globalThis.__deepdeckWebMCP` and run on the matching origin.

Exporting an existing local revision requires its saved source, not a newer editable draft. Verify the saved `sourceDigest`. Do not copy the local revision ID as a Git commit or market version; local revision also includes compiler and compiled-output identity.

Report compile, page registration and functional validation separately. A validation is scoped to source digest/commit, tool, actual scenario, DeepDeck/compiler environment and time. Do not carry verification across source changes or infer that an Issue closing means the released version is fixed.

## Directory publication

The index is a Cloudflare Worker backed by D1. It never fetches GitHub, runs a repository build, scans topics or waits for a Release. After publishing, the Agent sends the exact local committed package to the index and receives an immediate indexed receipt. New versions are pushed the same way.

`webmcp_publish_index` accepts the local project directory, canonical repository URL, repository ID from the publication result, full pushed commit SHA and manifest path. It reads the committed files, verifies the source digest and automatically maintains a private per-project update credential outside the project. Retrying the same publication is idempotent. An existing listing requires its saved credential; submissions cannot undo moderation.

The HTTP payload at `https://deepdeck.getmegaportal.com/api/webmcp/submissions` contains `repository`, `repositoryId`, `manifestPath`, `commit`, `manifest`, `source`, and a 64-character hexadecimal `publisherToken`. The Worker validates the package schema, exact HTTPS origin, redistribution license, source size and SHA-256. It stores directory metadata and the credential hash in D1; it never stores the credential itself or executes source. Source is supplied for validation and is not retained in the directory.

`200` with `status: indexed` confirms the package was written. Verify its commit in the live catalog before reporting completion. Requests containing only a repository URL are rejected with an actionable error. There are no GitHub indexing credentials, quotas, discovery jobs or background retries.

The directory describes publisher-submitted packages. It does not independently certify repository ownership or live-site behavior. The installer still resolves the repository ID and verifies the exact pinned commit and source before activating anything. A tag is a moving reference; directory installation uses the recorded commit even when a version is present.

## Maintainer and companion skills

The directory derives the repository owner link from its canonical URL; installed provenance obtains the actual repository owner through the installer’s GitHub identity check. It identifies the repository maintainer, not the owner of the target website or every contributor. Account links and avatars are derived from that login. Do not put arbitrary avatar URLs into the manifest.

Keep companion site skills under `.agents/skills/<name>/` or the upstream `.dsh/skills/<name>/` convention. Exports include only ordinary local skill files from the site workspace and list their SHA-256 digests in local provenance. These files reflect the current workspace independently of the selected immutable TypeScript revision. Review them in the publication diff; the current installer does not automatically activate companion skills.
