import { readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import type { DesktopBranding } from "../shared/branding.js";

interface BrandManifest {
  id: string;
  name: string;
  tagline: string;
  accentColor: string;
  accentColorSoft: string;
  mark: string;
  appIcon: string;
}

export interface LoadedBranding extends DesktopBranding {
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
    mark: readRequiredString(value.mark, "mark"),
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
  const markPath = resolveAsset(directory, manifest.mark);
  const appIconPath = resolveAsset(directory, manifest.appIcon);

  readFileSync(appIconPath);
  return Object.freeze({
    id: manifest.id,
    name: manifest.name,
    tagline: manifest.tagline,
    accentColor: manifest.accentColor,
    accentColorSoft: manifest.accentColorSoft,
    markDataUrl: readDataUrl(markPath),
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
    markDataUrl,
  } = branding;
  return {
    id,
    name,
    tagline,
    accentColor,
    accentColorSoft,
    markDataUrl,
  };
}
