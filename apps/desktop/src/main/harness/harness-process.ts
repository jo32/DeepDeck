import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { HarnessRuntimeStatus } from "../../shared/runtime.js";
import { parseReadinessUrl } from "./readiness.js";

const START_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 5_000;
const MAX_LOG_LINES = 80;

type StatusListener = (status: HarnessRuntimeStatus) => void;

export interface HarnessClientPlugin {
  packageName: string;
  path: string;
}

export interface HarnessProcessOptions {
  harnessRoot: string;
  nodeBinary: string;
  workspaceRoot: string;
  patchPath: string;
  plugins: readonly HarnessClientPlugin[];
  displayName: string;
}

export interface OwnedPluginLink {
  pluginRoot: string;
  previousTarget?: string;
}

export function ensureHarnessPluginLink(link: string, pluginRoot: string): OwnedPluginLink | undefined {
  let stat;
  try {
    stat = lstatSync(link);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (stat) {
    if (!stat.isSymbolicLink()) {
      throw new Error(`插件解析路径已被占用：${link}`);
    }
    const previousTarget = readlinkSync(link);
    const target = resolve(dirname(link), previousTarget);
    if (target === pluginRoot) return undefined;
    unlinkSync(link);
    symlinkSync(pluginRoot, link, "junction");
    return { pluginRoot, previousTarget };
  }

  symlinkSync(pluginRoot, link, "junction");
  return { pluginRoot };
}

export function restoreHarnessPluginLink(link: string, ownership: OwnedPluginLink): void {
  if (!lstatSync(link).isSymbolicLink()) return;
  const currentTarget = resolve(dirname(link), readlinkSync(link));
  if (currentTarget !== ownership.pluginRoot) return;
  unlinkSync(link);
  if (ownership.previousTarget) {
    symlinkSync(ownership.previousTarget, link, "junction");
  }
}

export function resolveHarnessHome(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.DSH_HOME?.trim();
  if (!configured) return join(homedir(), ".dsh");
  if (configured === "~") return homedir();
  if (configured.startsWith("~/") || configured.startsWith("~\\")) {
    return resolve(homedir(), configured.slice(2));
  }
  return resolve(configured);
}

export function resolveHarnessPluginLink(dshHome: string, packageName: string): string {
  const parts = packageName.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`无效的插件包名：${packageName}`);
  }
  return join(dshHome, "profiles", "web", "node_modules", ...parts);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class HarnessProcess {
  private child: ChildProcess | undefined;
  private startPromise: Promise<string> | undefined;
  private intentionalStop = false;
  private readonly ownedPluginLinks = new Map<string, OwnedPluginLink>();
  private readonly listeners = new Set<StatusListener>();
  private readonly logs: string[] = [];
  private status: HarnessRuntimeStatus;

  constructor(private readonly options: HarnessProcessOptions) {
    this.status = {
      state: "idle",
      message: `${options.displayName} 尚未启动`,
    };
  }

  getStatus(): HarnessRuntimeStatus {
    return { ...this.status };
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<string> {
    if (this.status.state === "ready" && this.status.url) return this.status.url;
    if (this.startPromise) return this.startPromise;

    this.intentionalStop = false;
    this.logs.length = 0;
    this.publish({ state: "starting", message: `正在启动 ${this.options.displayName}…` });

    const pending = this.launch();
    this.startPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = undefined;
    }
  }

  async restart(): Promise<string> {
    await this.stop();
    return this.start();
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.child = undefined;
      this.publish({ state: "idle", message: `${this.options.displayName} 已停止` });
      return;
    }

    this.publish({ state: "stopping", message: `正在停止 ${this.options.displayName}…` });
    const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
    child.kill("SIGTERM");

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout("timeout"), STOP_TIMEOUT_MS);
    });
    const result = await Promise.race([exited.then(() => "exit" as const), timedOut]);
    if (timeout) clearTimeout(timeout);
    if (result === "timeout" && child.exitCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
    if (this.child === child) this.child = undefined;
    this.publish({ state: "idle", message: `${this.options.displayName} 已停止` });
  }

  private launch(): Promise<string> {
    const cliPath = resolve(this.options.harnessRoot, "apps/cli/lib/bin.js");
    if (!existsSync(cliPath)) {
      const message = `${this.options.displayName} 运行引擎尚未构建，请先运行 pnpm bootstrap`;
      this.publish({ state: "error", message });
      return Promise.reject(new Error(message));
    }

    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    try {
      this.preparePluginLinks(environment);
    } catch (error) {
      const message = `${this.options.displayName} 无法准备插件配置：${errorMessage(error)}`;
      this.publish({ state: "error", message });
      return Promise.reject(new Error(message));
    }

    let child: ChildProcess;
    try {
      child = spawn(
        this.options.nodeBinary,
        [cliPath, "web", "--patch", this.options.patchPath, "--port", "0"],
        {
          cwd: this.options.workspaceRoot,
          env: environment,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      this.cleanupPluginLinks();
      const message = `无法启动 ${this.options.displayName}：${errorMessage(error)}`;
      this.publish({ state: "error", message });
      return Promise.reject(new Error(message));
    }
    this.child = child;

    return new Promise<string>((resolveReady, rejectReady) => {
      let settled = false;
      let readyUrl: string | undefined;
      let stdoutBuffer = "";
      let stderrBuffer = "";

      const settleFailure = (message: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const details = this.logs.join("\n") || undefined;
        this.publish({ state: "error", message, ...(details ? { details } : {}) });
        rejectReady(new Error(message));
      };

      const recordLine = (line: string, source: "stdout" | "stderr"): void => {
        const trimmed = line.trim();
        if (!trimmed) return;
        this.logs.push(`${source === "stderr" ? "[stderr] " : ""}${trimmed}`);
        if (this.logs.length > MAX_LOG_LINES) this.logs.shift();
        if (source === "stderr") console.error(`[dsh] ${trimmed}`);
        else console.log(`[dsh] ${trimmed}`);

        const parsed = parseReadinessUrl(trimmed);
        if (!parsed || settled) return;
        settled = true;
        readyUrl = parsed;
        clearTimeout(timeout);
        this.publish({ state: "ready", message: `${this.options.displayName} 已就绪`, url: parsed });
        resolveReady(parsed);
      };

      const consume = (chunk: Buffer, source: "stdout" | "stderr"): void => {
        let buffer = (source === "stdout" ? stdoutBuffer : stderrBuffer) + chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) recordLine(line, source);
        if (source === "stdout") stdoutBuffer = buffer;
        else stderrBuffer = buffer;
      };

      child.stdout?.on("data", (chunk: Buffer) => consume(chunk, "stdout"));
      child.stderr?.on("data", (chunk: Buffer) => consume(chunk, "stderr"));
      child.once("error", (error) => {
        this.cleanupPluginLinks();
        settleFailure(`无法启动 ${this.options.displayName}：${errorMessage(error)}`);
      });
      child.once("exit", (code, signal) => {
        this.cleanupPluginLinks();
        if (stdoutBuffer) recordLine(stdoutBuffer, "stdout");
        if (stderrBuffer) recordLine(stderrBuffer, "stderr");
        if (this.child === child) this.child = undefined;
        if (!readyUrl) {
          settleFailure(
            `${this.options.displayName} 在就绪前退出（${signal ?? `code ${String(code)}`}）`,
          );
          return;
        }
        if (!this.intentionalStop) {
          this.publish({
            state: "error",
            message: `${this.options.displayName} 意外退出（${signal ?? `code ${String(code)}`}）`,
            details: this.logs.join("\n"),
          });
        }
      });

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        settleFailure(`${this.options.displayName} 启动超时`);
      }, START_TIMEOUT_MS);
    });
  }

  private preparePluginLinks(environment: NodeJS.ProcessEnv): void {
    if (!existsSync(this.options.patchPath)) {
      throw new Error(`插件配置不存在：${this.options.patchPath}`);
    }

    try {
      const dshHome = resolveHarnessHome(environment);
      const packageNames = new Set<string>();
      for (const plugin of this.options.plugins) {
        if (packageNames.has(plugin.packageName)) {
          throw new Error(`插件包名重复：${plugin.packageName}`);
        }
        packageNames.add(plugin.packageName);

        const pluginRoot = resolve(plugin.path);
        for (const file of ["package.json", "lib/index.js", "lib/client.js"]) {
          const path = join(pluginRoot, file);
          if (!existsSync(path)) throw new Error(`插件尚未构建：${path}`);
        }
        const manifest = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8")) as {
          name?: unknown;
        };
        if (manifest.name !== plugin.packageName) {
          throw new Error(`插件包名不匹配：${pluginRoot}`);
        }

        const link = resolveHarnessPluginLink(dshHome, plugin.packageName);
        mkdirSync(dirname(link), { recursive: true });
        const ownership = ensureHarnessPluginLink(link, pluginRoot);
        if (ownership) this.ownedPluginLinks.set(link, ownership);
      }
    } catch (error) {
      this.cleanupPluginLinks();
      throw error;
    }
  }

  private cleanupPluginLinks(): void {
    const owned = [...this.ownedPluginLinks];
    this.ownedPluginLinks.clear();
    for (const [link, ownership] of owned) {
      try {
        restoreHarnessPluginLink(link, ownership);
      } catch (error) {
        const code = error instanceof Error && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") {
          console.error(`[desktop] Unable to remove plugin link: ${errorMessage(error)}`);
        }
      }
    }
  }

  private publish(status: HarnessRuntimeStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(this.getStatus());
  }
}
