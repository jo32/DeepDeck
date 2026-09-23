# DeepDeck Website

## WebMCP directory

`/webmcp` and `/zh/webmcp` provide searchable GitHub project references, upstream
issues/releases and installation instructions for the Browser Community panel.
The Site Agent publishes the exact committed package directly to
`/api/webmcp/submissions`. A Cloudflare Worker validates the supplied manifest
and source, then writes D1 synchronously. No GitHub indexing requests, token,
topic discovery or queue are involved. The website proxies the live catalog;
`/webmcp/catalog.json` rewrites to the same API for older clients. New versions
are published the same way, with the client’s automatically saved update credential.
See `registry/webmcp/README.md` for the submission contract.

DeepDeck 的官方介绍站，使用 Next.js App Router 与 Geist 构建。

## Local development

在仓库根目录运行：

```sh
pnpm web:dev
```

类型检查与生产构建：

```sh
pnpm web:check
pnpm web:build
```

## Deploy to Vercel

1. 在 Vercel 中导入本仓库。
2. 将 **Root Directory** 设置为 `apps/web`。
3. 保持自动识别的 **Next.js** Framework Preset，然后部署。

站点默认以 `https://deepdeck.getmegaportal.com` 作为 canonical origin，并会优先使用 `NEXT_PUBLIC_SITE_URL` 或 Vercel 提供的 `VERCEL_PROJECT_PRODUCTION_URL` 覆盖它。Open Graph、robots、sitemap 与 JSON-LD 都使用同一个 origin。

英文首页位于 `/`，中文首页位于 `/zh`。两者是可独立索引的静态页面，并通过 `hreflang` 互相声明；旧的 `/en` 地址永久重定向到 `/`。

## Feature highlights and updates

首页的 `#webmcp` 介绍 Browser 与 WebMCP，`#updates` 是持续维护的更新日志。两种语言使用相同的锚点。

- 在 `lib/product-updates.ts` 的 `productUpdates` 开头添加新条目，填写稳定的 `id`、ISO 日期、发布状态、详情链接与中英文内容。页面会自动生成日期、状态、重点介绍和独立的 `#update-<id>` 锚点。
- `status: "development-preview"` 表示尚未随安装包发布；确认实际 release 包含该功能后才改为 `"released"`。可选 `sourceHref` 指向可体验该功能的源码，避免把开发分支功能描述成下载后即可使用。
- 重点功能版块和双语截图说明在 `app/_components/product-updates.tsx`。截图存放于 `public/webmcp/`，应来自真实应用界面，保留原始比例，提供准确的尺寸、替代文本和说明。
- WebMCP 介绍参考 [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)。产品核心理念是让 Agent 自己探索和使用网站，把验证过的操作经验保存成 WebMCP 工具供后续任务复用；人提出目标，无需逐步编写使用教程。围绕“复用已有工具”和“为现有网站添加工具”展开。四张原始 PNG（1369 × 925）依次展示自动发现、Builder 构建、工具列表和 Use 调用；根目录 README 复用同一组图片。效率与 token 收益应说明适用条件，不使用未经测量的比例。
- 更新产品介绍时，同步核对 `lib/metadata.ts` 和 `lib/structured-data.ts`，保持页面、搜索摘要和结构化数据的发布状态一致。

保留 2026-09-05 的源码预览记录，并于 2026-09-06 新增 v1.0.38 正式发布条目。功能版块不显示固定版本号，下载入口统一指向 `releases/latest`；历史更新记录保留当时的版本与发布状态。

## Embedded directory and installation

The `/webmcp` and `/zh/webmcp` directory pages share their cards and filters with the DeepDeck WebMCP market. A validated loopback parent handshake enables embedded mode and its Install buttons; `?embed=deepdeck` alone grants no capability. The parent checks the exact iframe, market origin and per-instance nonce, then prepares and confirms source locally. The page never receives a local installation token or direct access to the Browser API.

Standalone cards use the `deepdeck://webmcp/install` protocol and retain manual repository instructions plus a download/update fallback. A desktop release containing protocol registration is required for OS handoff. Deploy the website before expecting the embedded production directory to support the handshake; no deployment is performed by the implementation or its tests.

The directory UI now lives in `plugins/browser/src/client/WebMCPDirectory.tsx`, with a website publication instructions here. DeepDeck renders that shared component locally; it does not depend on the public HTML route being deployed. The live JSON catalog is fetched by the Host, with a packaged snapshot fallback. Explicit remote embeds retain the handshake protocol.

## Live repository index

The existing `deepdeck` Vercel project remains connected to `jo32/DeepDeck`, with production branch `main` and Root Directory `apps/web`. `WEBMCP_INDEX_URL` is a server-only variable pointing to the Cloudflare index Worker origin. It must not point back to this website. For local development, put `WEBMCP_INDEX_URL=http://127.0.0.1:8787` in an ignored local environment file and run the index's Wrangler dev server.

`pnpm web:build` builds the website without requesting GitHub or regenerating snapshots. Directory pages and APIs fetch the live index at runtime. If it is unavailable or unconfigured, the catalog returns the bundled fallback with `X-WebMCP-Source: bundled` and `Cache-Control: no-store`; the page shows an outage notice. Submissions return 503 when the service is unavailable. `pnpm webmcp:sync` explicitly updates offline fallback snapshots when maintaining a desktop release.

Deploy the Worker and verify the migrated NGA listing before configuring the URL and deploying the website. See `apps/webmcp-index/README.md`. For manual recovery, use the same Vercel project and verify `/api/webmcp/catalog`, `/webmcp/catalog.json`, `/api/webmcp/submissions`, `/webmcp`, and `/zh/webmcp`. No new Vercel project or DNS change is needed.

## Creative task examples

The homepage links directly to `#figma-case` and `#blockbench-case` in both
languages. `app/_components/webmcp-cases.tsx` presents the September 15 Figma
task (the built-in agent declined vector editing; DeepDeck completed the logo)
and the Blockbench ginger-cat project. These are task records, not benchmark
measurements. Keep the distinction between this Figma Agent response and
Figma's broader capabilities, and note that DeepDeck used WebMCP alongside
browser tools.

Original user-provided captures are stored unchanged in `public/webmcp/cases/`.
Responsive CSS shows focused regions, with each image linking to its full
capture. Do not replace the original UI or invent missing task steps.

## WebMCP experiments

`/webmcp/experiments` and `/zh/webmcp/experiments` present the September 2026 Book,
X, and Hacker News comparisons. Both pages share the server-rendered narrative
and a small interactive chart; metrics live in `lib/webmcp-experiments.ts`.
Present the final measured WebMCP results, ordinary-group capabilities, and HN
unequal-completion caveat. Historical WebMCP versions are not part of this page. Do not pool success rates or
present total tokens as monetary cost.

Public aggregate data and a Chinese Markdown report live under
`public/research/webmcp-2026-09/`. Raw session logs, local source paths, and
credentials must not be copied there. `/webmcp/experiments/share-image` renders
the share card. The homepage WebMCP section, footer, and sitemap link to both
localized pages.

## DeepDeck Bench

`/benchmarks` and `/zh/benchmarks` are bilingual product pages for model computer-use benchmarks and automated WebMCP on/off ablations. Local CLI usage is available; custom evaluation engagements use the pilot form. The HN
scoring interaction uses the published baseline-2 aggregate sample in
`public/research/benchmarks/hn-sample.json`; it does not run an agent. Keep the
observed independent page verification distinct from the proposed WebMCP
evaluator architecture. The offer is a scoped pilot, with no invented task
inventory, customers, prices or self-serve availability.

The application form posts to `/api/benchmarks/applications`, which proxies the
Cloudflare Worker using the existing server-only `WEBMCP_INDEX_URL`. Deploy its
`0003_benchmark_applications.sql` migration and intake handler first. The form
shows a receipt only after persistence, retains fields on failure, and reuses
an idempotency ID when retrying unchanged content. Applications are reviewed
manually in the private D1 `benchmark_applications` table; this flow sends no
email and does not collect payments. See `apps/webmcp-index/README.md` for
storage, rate limits, and operator access.

The product narrative leads with two uses of the same DeepDeck execution environment: connect a model to run computer-use task suites, or supply a website and query for a paired WebMCP ablation. The on arm retains normal page tools; only WebMCP availability changes. Without an expected answer, correctness is unscored. The Codex app comparison describes a familiar interaction workflow, not identical internal implementation or a verified SOTA ranking. Historical evidence still explains independent correctness checks, token use, and elapsed time. The interactive comparison draws on all three completed experiments, including the X token increase and HN unequal-work caveat. Never describe a measured reference as a mathematical upper bound or guaranteed minimum resource cost. User-facing application copy omits the storage implementation.

The task-corpus section lists active tasks from the eight registered local sites.
`node scripts/generate-benchmark-catalog.mjs` derives counts, tiers and task IDs
from the YAML corpus, using bilingual public labels in
`lib/benchmark-corpus-labels.json`. The web build regenerates the catalog and the
web check detects stale output. Add a public label when adding a task or site;
raw prompts, test credentials and expected answers are not published. Calibration
tasks, the template and excluded tasks are counted separately from active tasks.
Corpus coverage is not presented as successful end-to-end evaluation coverage.

## Luna and MiMo results (September 23)

The shared model comparison now reads `public/research/benchmarks/models-full-2026-09-23.json`.
Regenerate it with `node scripts/publish-luna-mimo-benchmark.mjs` when the local
Luna and MiMo comparison reports in `docs/benchmarks/` and the raw Luna report
(`.deepdeck/benchmarks/luna-full-20260922/report.json`) are available. The latter
verifies that individual requests do not cross the long-context pricing threshold. The export
whitelists numeric metrics, public labels and audit categories; it excludes raw
answers, transcripts, credentials and local session paths. The original three-model
file remains unchanged.

The five-model overview uses 43 common eligible tasks; the separate Luna/MiMo
comparison uses 45. Per-model site charts exclude known incomplete or unverified
steps and incomplete usage. Raw scorer passes remain unchanged.
Rates verified September 23: Luna uses official Standard USD API-equivalent rates
(input/cache-read/cache-write/output: 0.20/0.02/0.25/1.20 per million tokens),
not the ChatGPT subscription bill. MiMo uses official overseas USD real-time API-equivalent rates
(input/cache-read/output: 0.14/0.0028/0.28 per million tokens), before credits or discounts. This is not an FX conversion of the domestic bill.
Official source URLs and currencies accompany the data and UI. Two MiMo OFF usage
records remain null in total-token and full-cost fields; recorded cost subtotals
are shown as lower bounds. Cache reads are excluded from uncached input, and
reasoning is already included in output.
