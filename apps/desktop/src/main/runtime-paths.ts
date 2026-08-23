import { join, resolve } from "node:path";
import type { HarnessClientPlugin } from "./harness/harness-process.js";

export interface DesktopRuntimePaths {
  brandingManifestPath: string;
  harnessRoot: string;
  nodeBinary: string;
  patchPath: string;
  plugins: readonly HarnessClientPlugin[];
  workspaceRoot: string;
}

export interface ResolveDesktopRuntimePathsOptions {
  appPath: string;
  cwd: string;
  environment?: NodeJS.ProcessEnv;
  home: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const value = environment[name]?.trim();
  return value || fallback;
}

function packagedNodeBinary(resourcesPath: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? join(resourcesPath, "runtime", "node", "node.exe")
    : join(resourcesPath, "runtime", "node", "bin", "node");
}

export function resolveDesktopRuntimePaths(
  options: ResolveDesktopRuntimePathsOptions,
): DesktopRuntimePaths {
  const environment = options.environment ?? process.env;
  const workspaceRoot = environmentValue(
    environment,
    "DEEPSEEK_DESKTOP_WORKSPACE",
    options.isPackaged ? options.home : options.cwd,
  );

  if (options.isPackaged) {
    return {
      brandingManifestPath: join(options.resourcesPath, "branding", "brand.json"),
      harnessRoot: join(options.resourcesPath, "harness"),
      nodeBinary: packagedNodeBinary(options.resourcesPath, options.platform),
      patchPath: join(options.resourcesPath, "cordis.patch.yml"),
      plugins: [
        {
          packageName: "@deepdeck/dsh-client-ui-desktop-chrome",
          path: join(options.resourcesPath, "plugins", "desktop-chrome"),
        },
        {
          packageName: "@deepdeck/dsh-client-ui-home-hero",
          path: join(options.resourcesPath, "plugins", "home-hero"),
        },
        {
          packageName: "@deepdeck/dsh-client-ui-agent-preset-sections",
          path: join(options.resourcesPath, "plugins", "agent-preset-sections"),
        },
        {
          packageName: "@deepdeck/dsh-community-market-desktop-bridge",
          path: join(options.resourcesPath, "plugins", "marketplace-desktop-bridge"),
        },
        {
          packageName: "@deepdeck/dsh-bun-plugin-builder",
          path: join(options.resourcesPath, "plugins", "bun-plugin-builder"),
        },
        {
          packageName: "@deepdeck/dsh-first-run",
          path: join(options.resourcesPath, "plugins", "first-run"),
        },
        {
          packageName: "@deepdeck/dsh-app-conversations",
          path: join(options.resourcesPath, "plugins", "app-conversations"),
        },
        {
          packageName: "@deepdeck/dsh-hackernews-reader",
          path: join(options.resourcesPath, "plugins", "hackernews-reader"),
        },
        {
          packageName: "dsh-codex-connect",
          path: join(options.resourcesPath, "harness", "node_modules", "dsh-codex-connect"),
          presetBundle: true,
        },
        {
          packageName: "dsh-community-market",
          path: join(options.resourcesPath, "harness", "node_modules", "dsh-community-market"),
          presetBundle: true,
        },
      ],
      workspaceRoot,
    };
  }

  const workspaceRepository = resolve(options.appPath, "../..");
  return {
    brandingManifestPath: environmentValue(
      environment,
      "DESKTOP_BRAND_PATH",
      join(workspaceRepository, "branding", "brand.json"),
    ),
    harnessRoot: environmentValue(
      environment,
      "DEEPSEEK_HARNESS_PATH",
      join(workspaceRepository, "vendor", "deepseek-harness"),
    ),
    nodeBinary: environmentValue(
      environment,
      "DEEPSEEK_DESKTOP_NODE_BINARY",
      environment.npm_node_execpath?.trim() || "node",
    ),
    patchPath: environmentValue(
      environment,
      "DEEPDECK_HARNESS_PATCH",
      join(workspaceRepository, "plugins", "desktop-chrome", "cordis.patch.yml"),
    ),
    plugins: [
      {
        packageName: "@deepdeck/dsh-client-ui-desktop-chrome",
        path: environmentValue(
          environment,
          "DEEPDECK_DESKTOP_CHROME_PLUGIN",
          join(workspaceRepository, "plugins", "desktop-chrome"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-client-ui-home-hero",
        path: environmentValue(
          environment,
          "DEEPDECK_HOME_HERO_PLUGIN",
          join(workspaceRepository, "plugins", "home-hero"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-client-ui-agent-preset-sections",
        path: environmentValue(
          environment,
          "DEEPDECK_AGENT_PRESET_PLUGIN",
          join(workspaceRepository, "plugins", "agent-preset-sections"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-community-market-desktop-bridge",
        path: environmentValue(
          environment,
          "DEEPDECK_MARKETPLACE_DESKTOP_BRIDGE_PLUGIN",
          join(workspaceRepository, "plugins", "marketplace-desktop-bridge"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-bun-plugin-builder",
        path: environmentValue(
          environment,
          "DEEPDECK_BUN_PLUGIN_BUILDER_PLUGIN",
          join(workspaceRepository, "plugins", "bun-plugin-builder"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-first-run",
        path: environmentValue(
          environment,
          "DEEPDECK_FIRST_RUN_PLUGIN",
          join(workspaceRepository, "plugins", "first-run"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-app-conversations",
        path: environmentValue(
          environment,
          "DEEPDECK_APP_CONVERSATIONS_PLUGIN",
          join(workspaceRepository, "plugins", "app-conversations"),
        ),
      },
      {
        packageName: "@deepdeck/dsh-hackernews-reader",
        path: environmentValue(
          environment,
          "DEEPDECK_HACKERNEWS_READER_PLUGIN",
          join(workspaceRepository, "plugins", "hackernews-reader"),
        ),
      },
      {
        packageName: "dsh-codex-connect",
        path: environmentValue(
          environment,
          "DEEPDECK_CODEX_CONNECT_PLUGIN",
          join(workspaceRepository, "node_modules", "dsh-codex-connect"),
        ),
        presetBundle: true,
      },
      {
        packageName: "dsh-community-market",
        path: environmentValue(
          environment,
          "DEEPDECK_COMMUNITY_MARKET_PLUGIN",
          join(workspaceRepository, "plugins", "community-market"),
        ),
        presetBundle: true,
      },
    ],
    workspaceRoot,
  };
}
