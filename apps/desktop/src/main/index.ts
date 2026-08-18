import { app } from "electron";
import { bootstrapDesktop } from "./bootstrap.js";
import { loadBranding } from "./branding.js";
import { resolveDesktopRuntimePaths } from "./runtime-paths.js";

const runtimePaths = resolveDesktopRuntimePaths({
  appPath: app.getAppPath(),
  cwd: process.cwd(),
  environment: process.env,
  home: app.getPath("home"),
  isPackaged: app.isPackaged,
  platform: process.platform,
  resourcesPath: process.resourcesPath,
});
const branding = loadBranding(runtimePaths.brandingManifestPath);
app.setName(branding.name);

void bootstrapDesktop(branding, runtimePaths).catch((error: unknown) => {
  console.error("Fatal desktop startup error", error);
  app.exit(1);
});
