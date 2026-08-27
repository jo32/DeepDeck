import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCT_ID = "e3e05646-24b9-4532-9068-d8f29cad72f3";
const APP_ID = "com.jo32.deepdeck";
const AUTH_KEY_PATTERN = /^vl_native\.[A-Za-z0-9_-]{43}$/;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageRoot, "dist/main/vibeloft-telemetry-config.json");
const authKey = process.env.VL_NATIVE_KEY?.trim() ?? "";

if (authKey && !AUTH_KEY_PATTERN.test(authKey)) {
  throw new Error("VL_NATIVE_KEY must be a valid VibeLoft Native v4 write key");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  productId: PRODUCT_ID,
  appId: APP_ID,
  authKey: authKey || null,
})}\n`, { encoding: "utf8", mode: 0o600 });

console.log(`VibeLoft Native telemetry config: ${authKey ? "enabled" : "disabled"}`);
