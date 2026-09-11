// Run explicitly on a desktop session: node apps/desktop/scripts/verify-browser-native.mjs
import { build } from "esbuild";
import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const temporary = await mkdtemp(join(tmpdir(), "deepdeck-browser-check-"));
try {
  const bundle = join(temporary, "browser.cjs");
  await build({ entryPoints: [fileURLToPath(new URL("../src/main/windows/browser-window.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: bundle, define: { "import.meta.dirname": JSON.stringify(join(temporary, "main/windows")) } });
  await build({ entryPoints: [fileURLToPath(new URL("../src/preload/browser-passkey.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: join(temporary, "preload/browser-passkey.cjs") });
  const environment = { ...process.env, DEEPDECK_BROWSER_TEST_BUNDLE: bundle, DEEPDECK_BROWSER_TEST_PROFILE: join(temporary, "profile") };
  delete environment.ELECTRON_RUN_AS_NODE;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL(process.argv.includes("--lifecycle") ? "./browser-lifecycle-fixture.cjs" : process.argv.includes("--page-menu") ? "./browser-page-menu-fixture.cjs" : "./browser-native-fixture.cjs", import.meta.url))], { env: environment, stdio: "inherit" });
    const deadline = process.argv.includes("--lifecycle") ? setTimeout(() => {
      console.error("Browser lifecycle verification timed out; an unlocked desktop is required.");
      child.kill("SIGKILL");
    }, 60000) : undefined;
    child.once("error", error => { clearTimeout(deadline); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(deadline);
      if (signal) console.error(`Browser verification terminated by ${signal}.`);
      resolve(code ?? 1);
    });
  });
  process.exitCode = code;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
