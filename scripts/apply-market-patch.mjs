import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketRoot = join(workspaceRoot, "vendor", "dsh-market");
const patchPath = join(workspaceRoot, "patches", "dsh-market-deepdeck.patch");
const expectedCommit = "da0f0357dfa390fa387d43aa9a5787de16de967a";

function runGit(arguments_, inherit = false) {
  return spawnSync("git", ["-C", marketRoot, ...arguments_], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
}

const revision = runGit(["rev-parse", "HEAD"]);
if (revision.error) throw revision.error;
if (revision.status !== 0) throw new Error(revision.stderr.trim() || "Unable to inspect dsh-market");
if (revision.stdout.trim() !== expectedCommit) {
  throw new Error(
    `dsh-market patch expects ${expectedCommit}, found ${revision.stdout.trim()}. `
      + "Refresh the patch deliberately when updating the submodule.",
  );
}

const check = runGit(["apply", "--check", patchPath]);
if (check.error) throw check.error;
if (check.status === 0) {
  const apply = runGit(["apply", patchPath], true);
  if (apply.error) throw apply.error;
  if (apply.status !== 0) process.exit(apply.status ?? 1);
  console.log("apply-market-patch: applied DeepDeck integration patch");
  process.exit(0);
}

const reverseCheck = runGit(["apply", "--reverse", "--check", patchPath]);
if (reverseCheck.error) throw reverseCheck.error;
if (reverseCheck.status === 0) {
  console.log("apply-market-patch: DeepDeck integration patch already applied");
  process.exit(0);
}

throw new Error(
  "dsh-market contains changes that match neither the pinned base nor the DeepDeck patch.\n"
    + check.stderr.trim(),
);
