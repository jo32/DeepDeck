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

## Directory reference

The minimal authoritative reference is GitHub repository ID + canonical repository URL + manifest path. The directory resolves a selected release/tag to a full commit and derives searchable metadata from that commit. A registry may add its own stable entry ID and review fields.

The directory is not required to store source, bundles, comments or account tokens. Upstream rename/transfer must be checked against the repository ID; URL reuse by another repository must not inherit trust or installed provenance. A tag is a moving reference unless otherwise guaranteed; always pin the resolved commit locally.

The official index accepts POST JSON (`repository`, `manifestPath`) at `https://deepdeck.getmegaportal.com/api/webmcp/submissions`. It verifies and stores metadata in a server database, then refreshes it periodically. No listing PR or website rebuild is required. Check the returned job status and live catalog before claiming the repository is indexed.

## Maintainer and companion skills

The directory and installed provenance obtain the GitHub maintainer login from the repository owner returned by the GitHub API. It identifies the repository maintainer, not the owner of the target website or every contributor. Account links and avatars are derived from that login. Do not put arbitrary avatar URLs into the manifest.

Keep companion site skills under `.agents/skills/<name>/` or the upstream `.dsh/skills/<name>/` convention. Exports include only ordinary local skill files from the site workspace and list their SHA-256 digests in local provenance. These files reflect the current workspace independently of the selected immutable TypeScript revision. Review them in the publication diff; the current installer does not automatically activate companion skills.
