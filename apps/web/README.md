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
