# DeepDeck Website

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
- 更新产品介绍时，同步核对 `lib/metadata.ts` 和 `lib/structured-data.ts`，保持页面、搜索摘要和结构化数据的发布状态一致。

首条 WebMCP 更新日期为 2026-09-05，标为开发预览；现有已发布安装包不作为该功能的体验入口。
