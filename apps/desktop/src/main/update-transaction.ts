import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type UpdateTransactionPhase =
  | "preparing"
  | "installing"
  | "verifying"
  | "launching"
  | "failed";

export interface UpdateTransaction {
  schemaVersion: 1;
  phase: UpdateTransactionPhase;
  sourceVersion: string;
  targetVersion: string;
  appPath: string;
  startedAt: number;
  updatedAt: number;
  helperPid?: number;
  message?: string;
}

export type UpdateStartupDisposition =
  | { state: "none" }
  | { state: "completed"; transaction: UpdateTransaction }
  | { state: "active"; transaction: UpdateTransaction }
  | { state: "failed"; transaction: UpdateTransaction };

const phases = new Set<UpdateTransactionPhase>([
  "preparing",
  "installing",
  "verifying",
  "launching",
  "failed",
]);

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseUpdateTransaction(value: unknown): UpdateTransaction | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const transaction = value as Record<string, unknown>;
  if (
    transaction.schemaVersion !== 1
    || !nonEmptyString(transaction.phase)
    || !phases.has(transaction.phase as UpdateTransactionPhase)
    || !nonEmptyString(transaction.sourceVersion)
    || !nonEmptyString(transaction.targetVersion)
    || !nonEmptyString(transaction.appPath)
    || typeof transaction.startedAt !== "number"
    || !Number.isFinite(transaction.startedAt)
    || typeof transaction.updatedAt !== "number"
    || !Number.isFinite(transaction.updatedAt)
  ) return undefined;

  const helperPid = transaction.helperPid;
  const message = transaction.message;
  return {
    schemaVersion: 1,
    phase: transaction.phase as UpdateTransactionPhase,
    sourceVersion: transaction.sourceVersion,
    targetVersion: transaction.targetVersion,
    appPath: transaction.appPath,
    startedAt: transaction.startedAt,
    updatedAt: transaction.updatedAt,
    ...(typeof helperPid === "number" && Number.isInteger(helperPid) && helperPid > 0
      ? { helperPid }
      : {}),
    ...(nonEmptyString(message) ? { message } : {}),
  };
}

export function updateTransactionPath(userDataPath: string): string {
  return path.join(userDataPath, "update-transaction.json");
}

export async function readUpdateTransaction(
  filename: string,
): Promise<UpdateTransaction | undefined> {
  try {
    return parseUpdateTransaction(JSON.parse(await readFile(filename, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    console.warn(`Unable to read update transaction ${filename}`, error);
    return undefined;
  }
}

export async function writeUpdateTransaction(
  filename: string,
  transaction: UpdateTransaction,
): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(transaction, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filename);
}

export async function clearUpdateTransaction(filename: string): Promise<void> {
  await rm(filename, { force: true });
}

export function classifyUpdateStartup(
  transaction: UpdateTransaction | undefined,
  currentVersion: string,
  isProcessAlive: (pid: number) => boolean,
  now = Date.now(),
): UpdateStartupDisposition {
  if (!transaction) return { state: "none" };

  // If the bundle no longer reports the source version, this launch is from a
  // replacement (the requested target or a newer manually installed build).
  if (currentVersion !== transaction.sourceVersion) {
    return { state: "completed", transaction };
  }
  if (transaction.phase === "failed") return { state: "failed", transaction };
  const transactionIsFresh = now - transaction.updatedAt < 15 * 60 * 1_000;
  if (transactionIsFresh && transaction.helperPid && isProcessAlive(transaction.helperPid)) {
    return { state: "active", transaction };
  }
  return {
    state: "failed",
    transaction: {
      ...transaction,
      phase: "failed",
      updatedAt: now,
      message: transaction.message ?? "Update helper stopped before installation completed.",
    },
  };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
