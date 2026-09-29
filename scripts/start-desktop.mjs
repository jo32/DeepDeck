import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function runStartupStep(script, { progress = false, cwd = workspaceRoot } = {}) {
  const startedAt = Date.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script], { cwd, stdio: "inherit" });
    const timer = progress ? setInterval(() => {
      console.log(`DeepDeck：启动准备仍在进行，已用时 ${Math.round((Date.now() - startedAt) / 1000)} 秒；构建完成后会打开窗口。`);
    }, 10_000) : undefined;
    const onInterrupt = () => child.kill("SIGINT");
    const onTerminate = () => child.kill("SIGTERM");
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onTerminate);
    const cleanup = () => {
      clearInterval(timer);
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    };
    child.once("error", error => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (code === 0 && !signal) resolvePromise();
      else reject(Object.assign(new Error(`启动步骤 ${script} 未完成（${signal ?? `exit ${code}`}）`), {
        exitCode: signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : code || 1,
      }));
    });
  });
}

async function main() {
  const startedAt = Date.now();
  console.log("DeepDeck：正在检查启动产物。首次启动或升级后可能需要几分钟重新构建，此时窗口尚未打开。");
  await runStartupStep("scripts/start-build-cache.mjs", { progress: true });
  console.log(`DeepDeck：启动准备完成（${((Date.now() - startedAt) / 1000).toFixed(1)} 秒），正在打开应用…`);
  await runStartupStep("scripts/run-desktop.mjs");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`DeepDeck：${error.message}`);
    process.exitCode = error.exitCode ?? 1;
  });
}
