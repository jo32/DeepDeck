# DeepDeck Website

## WebMCP directory

`/webmcp` and `/zh/webmcp` provide searchable GitHub project references, upstream
issues/releases and installation instructions for the Browser Community panel.
Add references under `registry/webmcp/entries`. Each website build synchronizes
and validates these references against GitHub before generating the pages and
`/api/webmcp/catalog`. Clients read this public mirror without connecting to
GitHub. `/webmcp/catalog.json` serves the same data for older clients. No GitHub
credentials reach the page or API. See `registry/webmcp/README.md` for contributions.

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

The directory UI now lives in `plugins/browser/src/client/WebMCPDirectory.tsx`, with a client re-export here. DeepDeck renders that shared component locally; it does not depend on the public HTML route being deployed. The live JSON catalog is fetched by the Host, with a packaged snapshot fallback. Explicit remote embeds retain the handshake protocol.

## Publish the registry website

The existing `deepdeck` Vercel project is connected to `jo32/DeepDeck`, with production branch `main`, Root Directory `apps/web`, and files outside the root included. A merge automatically builds and publishes the website. `ignoreCommand: "exit 1"` prevents registry-only changes outside `apps/web` from being skipped. No separate desktop deployment is involved.

`pnpm web:build` first runs `registry:sync`, using the workspace's pinned `tsx` dependency (no Harness build is required). It fetches GitHub metadata/source and fails publication if validation fails, keeping the previous deployment live. An optional server-only `GH_TOKEN` build environment variable raises GitHub API limits. Local development uses the checked-in snapshot until you run synchronization.

For manual recovery, link the repository root to that same Vercel project, then run `vercel pull --yes --environment=production`, `vercel build --prod`, and `vercel deploy --prebuilt --prod` from the repository root. Verify `/api/webmcp/catalog`, `/webmcp/catalog.json`, `/webmcp`, and `/zh/webmcp` after deployment. Never create a replacement Vercel project or change DNS for a registry update.
