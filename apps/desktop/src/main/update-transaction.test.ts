import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { UpdateTransaction } from "./update-transaction.js";
import {
  classifyUpdateStartup,
  clearUpdateTransaction,
  readUpdateTransaction,
  updateTransactionPath,
  writeUpdateTransaction,
} from "./update-transaction.js";

const transaction: UpdateTransaction = {
  schemaVersion: 1,
  phase: "installing",
  sourceVersion: "1.0.10",
  targetVersion: "1.0.11",
  appPath: "/Applications/DeepDeck.app",
  startedAt: 1,
  updatedAt: 2,
  helperPid: 42,
};

describe("classifyUpdateStartup", () => {
  it("blocks an old bundle while its update helper is still active", () => {
    expect(classifyUpdateStartup(transaction, "1.0.10", () => true, 100)).toEqual({
      state: "active",
      transaction,
    });
  });

  it("recognizes a launch from the replacement bundle", () => {
    expect(classifyUpdateStartup(transaction, "1.0.11", vi.fn())).toEqual({
      state: "completed",
      transaction,
    });
  });

  it("turns an abandoned transaction into an actionable failure", () => {
    const result = classifyUpdateStartup(transaction, "1.0.10", () => false);
    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.transaction).toMatchObject({
        phase: "failed",
        sourceVersion: "1.0.10",
        targetVersion: "1.0.11",
      });
    }
  });

  it("does not trust a reused helper PID after the transaction becomes stale", () => {
    const result = classifyUpdateStartup(
      transaction,
      "1.0.10",
      () => true,
      15 * 60 * 1_000 + transaction.updatedAt,
    );
    expect(result.state).toBe("failed");
  });

  it("persists and clears the transaction atomically", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "deepdeck-update-transaction-"));
    const filename = updateTransactionPath(directory);
    try {
      await writeUpdateTransaction(filename, transaction);
      expect(await readUpdateTransaction(filename)).toEqual(transaction);
      await clearUpdateTransaction(filename);
      expect(await readUpdateTransaction(filename)).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
