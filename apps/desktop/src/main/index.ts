import { resolve } from "node:path";
import { app } from "electron";
import { bootstrapDesktop } from "./bootstrap.js";
import { loadBranding } from "./branding.js";

const branding = loadBranding(
  process.env.DESKTOP_BRAND_PATH
    ?? resolve(app.getAppPath(), "../../branding/brand.json"),
);
app.setName(branding.name);

void bootstrapDesktop(branding).catch((error: unknown) => {
  console.error("Fatal desktop startup error", error);
  app.exit(1);
});
