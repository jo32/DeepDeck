import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketRoot = join(workspaceRoot, "plugins", "community-market");
const expectedFileCount = 101;
const expectedSha256 = "127891688d523c9c1282c68a97f3c011dc4590a0b62f734988ac75510f3e6885";
const excludedFiles = new Set(["UPSTREAM.md", "cordis.patch.yml"]);

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = relative(marketRoot, path).split(sep).join("/");
    if (
      relativePath === "lib"
      || relativePath.startsWith("lib/")
      || relativePath === "node_modules"
      || relativePath.startsWith("node_modules/")
    ) continue;
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile() && !excludedFiles.has(relativePath)) files.push(relativePath);
  }
  return files;
}

const files = (await collectFiles(marketRoot)).sort();
const hash = createHash("sha256");
for (const path of files) {
  const contents = await readFile(join(marketRoot, path));
  hash.update(path);
  hash.update("\0");
  hash.update(String(contents.length));
  hash.update("\0");
  hash.update(contents);
}

const digest = hash.digest("hex");
if (files.length !== expectedFileCount || digest !== expectedSha256) {
  throw new Error(
    `Community Market source drifted from the reviewed import: ${files.length} files, ${digest}. `
      + "Review upstream changes and refresh this pin deliberately.",
  );
}

console.log(`verify-community-market-source: ${files.length} files match ${digest}`);
