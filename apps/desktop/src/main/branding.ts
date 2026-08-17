import { readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import type { DesktopBranding } from "../shared/branding.js";

interface BrandManifest {
  id: string;
  name: string;
  tagline: string;
  accentColor: string;
  accentColorSoft: string;
  upstreamName: string;
  wordmark: string;
  mark: string;
  favicon: string;
  appIcon: string;
}

export interface LoadedBranding extends DesktopBranding {
  upstreamName: string;
  appIconPath: string;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`品牌配置字段 ${field} 必须是非空字符串`);
  }
  return value.trim();
}

function readManifest(filename: string): BrandManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`无法读取品牌配置 ${filename}`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`品牌配置 ${filename} 必须是 JSON 对象`);
  }
  const value = parsed as Record<string, unknown>;
  const manifest: BrandManifest = {
    id: readRequiredString(value.id, "id"),
    name: readRequiredString(value.name, "name"),
    tagline: readRequiredString(value.tagline, "tagline"),
    accentColor: readRequiredString(value.accentColor, "accentColor"),
    accentColorSoft: readRequiredString(value.accentColorSoft, "accentColorSoft"),
    upstreamName: readRequiredString(value.upstreamName, "upstreamName"),
    wordmark: readRequiredString(value.wordmark, "wordmark"),
    mark: readRequiredString(value.mark, "mark"),
    favicon: readRequiredString(value.favicon, "favicon"),
    appIcon: readRequiredString(value.appIcon, "appIcon"),
  };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    throw new Error("品牌配置字段 id 只能包含小写字母、数字和连字符");
  }
  for (const field of ["accentColor", "accentColorSoft"] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(manifest[field])) {
      throw new Error(`品牌配置字段 ${field} 必须是六位十六进制颜色`);
    }
  }
  return manifest;
}

function resolveAsset(directory: string, filename: string): string {
  const asset = resolve(directory, filename);
  const pathFromDirectory = relative(directory, asset);
  if (pathFromDirectory.startsWith("..") || resolve(directory, pathFromDirectory) !== asset) {
    throw new Error(`品牌资源必须位于品牌目录内：${filename}`);
  }
  return asset;
}

function readDataUrl(filename: string): string {
  const mimeType = MIME_TYPES[extname(filename).toLowerCase()];
  if (!mimeType) throw new Error(`不支持的品牌资源格式：${filename}`);
  try {
    return `data:${mimeType};base64,${readFileSync(filename).toString("base64")}`;
  } catch (error) {
    throw new Error(`无法读取品牌资源 ${filename}`, { cause: error });
  }
}

export function loadBranding(filename: string): LoadedBranding {
  const manifest = readManifest(filename);
  const directory = dirname(resolve(filename));
  const wordmarkPath = resolveAsset(directory, manifest.wordmark);
  const markPath = resolveAsset(directory, manifest.mark);
  const faviconPath = resolveAsset(directory, manifest.favicon);
  const appIconPath = resolveAsset(directory, manifest.appIcon);

  // Read the app icon as part of validation even though Electron consumes its path.
  readFileSync(appIconPath);
  return Object.freeze({
    id: manifest.id,
    name: manifest.name,
    tagline: manifest.tagline,
    accentColor: manifest.accentColor,
    accentColorSoft: manifest.accentColorSoft,
    upstreamName: manifest.upstreamName,
    wordmarkDataUrl: readDataUrl(wordmarkPath),
    markDataUrl: readDataUrl(markPath),
    faviconDataUrl: readDataUrl(faviconPath),
    appIconPath,
  });
}

export function publicBranding(branding: LoadedBranding): DesktopBranding {
  const {
    id,
    name,
    tagline,
    accentColor,
    accentColorSoft,
    wordmarkDataUrl,
    markDataUrl,
    faviconDataUrl,
  } = branding;
  return {
    id,
    name,
    tagline,
    accentColor,
    accentColorSoft,
    wordmarkDataUrl,
    markDataUrl,
    faviconDataUrl,
  };
}

export function brandPageTitle(title: string, branding: LoadedBranding): string {
  if (title === branding.upstreamName) return branding.name;
  const suffix = ` — ${branding.upstreamName}`;
  return title.endsWith(suffix) ? `${title.slice(0, -suffix.length)} — ${branding.name}` : title;
}

export function harnessBrandingCss(branding: LoadedBranding): string {
  const wordmark = JSON.stringify(branding.wordmarkDataUrl);
  const mark = JSON.stringify(branding.markDataUrl);
  return `
html[data-desktop-brand="${branding.id}"] {
  --openworkbuddy-accent: ${branding.accentColor};
}

html[data-desktop-brand="${branding.id}"] svg[viewBox="0 0 182 24"],
html[data-desktop-brand="${branding.id}"] svg[viewBox="0 0 23.16 17.04"] {
  background-color: var(--dsw-alias-label-primary, currentColor) !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  color: transparent !important;
}

html[data-desktop-brand="${branding.id}"] svg[viewBox="0 0 182 24"] {
  -webkit-mask: url(${wordmark}) center / contain no-repeat;
  mask: url(${wordmark}) center / contain no-repeat;
}

html[data-desktop-brand="${branding.id}"] svg[viewBox="0 0 23.16 17.04"] {
  -webkit-mask: url(${mark}) center / contain no-repeat;
  mask: url(${mark}) center / contain no-repeat;
}

html[data-desktop-brand="${branding.id}"] svg[viewBox="0 0 182 24"] > *,
html[data-desktop-brand="${branding.id}"] svg[viewBox="0 0 23.16 17.04"] > * {
  display: none !important;
}
`;
}

export function harnessBrandingScript(branding: LoadedBranding): string {
  return `(() => {
    const brand = ${JSON.stringify({
      id: branding.id,
      name: branding.name,
      upstreamName: branding.upstreamName,
      faviconDataUrl: branding.faviconDataUrl,
    })};
    document.documentElement.dataset.desktopBrand = brand.id;
    const rewriteTitle = () => {
      const suffix = \` — \${brand.upstreamName}\`;
      const current = document.title;
      const next = current === brand.upstreamName
        ? brand.name
        : current.endsWith(suffix)
          ? \`\${current.slice(0, -suffix.length)} — \${brand.name}\`
          : current;
      if (next !== current) document.title = next;
    };
    rewriteTitle();
    const title = document.querySelector('title');
    if (title) new MutationObserver(rewriteTitle).observe(title, { childList: true, characterData: true, subtree: true });
    let favicon = document.querySelector('link[rel~="icon"]');
    if (!(favicon instanceof HTMLLinkElement)) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.append(favicon);
    }
    favicon.type = 'image/svg+xml';
    favicon.href = brand.faviconDataUrl;
  })()`;
}
