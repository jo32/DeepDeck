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

站点会优先使用 Vercel 提供的 `VERCEL_PROJECT_PRODUCTION_URL` 生成 Open Graph、robots 和 sitemap 的绝对地址。绑定自定义域名后会自动使用生产域名；也可以通过 `NEXT_PUBLIC_SITE_URL` 显式覆盖。
