import { appendFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const YAML = requireFromDesktop("yaml");

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const equals = argument.indexOf("=");
    let name;
    let value;
    if (equals >= 0) {
      name = argument.slice(0, equals);
      value = argument.slice(equals + 1);
    } else {
      name = argument;
      value = arguments_[index + 1];
      index += 1;
    }
    if (!["--tag", "--base-url", "--github-output"].includes(name) || !value) {
      throw new Error(`Unknown or incomplete release option: ${argument}`);
    }
    options[name.slice(2).replaceAll("-", "_")] = value;
  }
  if (!options.tag) throw new Error("--tag is required");
  if (!options.base_url) throw new Error("--base-url is required");
  return options;
}

const options = parseOptions(process.argv.slice(2));
const desktopPackage = JSON.parse(await readFile(join(desktopRoot, "package.json"), "utf8"));
const computerUsePackage = JSON.parse(await readFile(join(workspaceRoot, "plugins", "computer-use", "package.json"), "utf8"));
const {
  COMPUTER_USE_PACKAGED_IDENTITY,
  COMPUTER_USE_UPSTREAM_IDENTITY,
} = requireFromDesktop("./build/computer-use-identity.cjs");
const semverTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
if (!semverTag.test(options.tag)) throw new Error(`Release tag is not SemVer: ${options.tag}`);
if (options.tag !== `v${desktopPackage.version}`) {
  throw new Error(`Release tag ${options.tag} does not match desktop version ${desktopPackage.version}`);
}

const baseUrl = new URL(options.base_url);
if (baseUrl.protocol !== "https:") throw new Error("UPDATE_BASE_URL must use HTTPS");
if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error("UPDATE_BASE_URL must not contain credentials, a query, or a fragment");
}
if (baseUrl.hostname === "r2.dev" || baseUrl.hostname.endsWith(".r2.dev")) {
  throw new Error("Production UPDATE_BASE_URL must use an R2 custom domain, not r2.dev");
}
const normalizedBaseUrl = baseUrl.href.replace(/\/$/, "");

const builder = YAML.parse(await readFile(join(desktopRoot, "electron-builder.yml"), "utf8"));
if (builder.appId !== "com.jo32.deepdeck") throw new Error("electron-builder appId is not permanent DeepDeck identity");
if (builder.productName !== "DeepDeck" || builder.executableName !== "DeepDeck") {
  throw new Error("electron-builder product and executable names must be DeepDeck");
}
if (builder.afterPack !== "build/after-pack.cjs") {
  throw new Error("Production packaging must rewrite nested app identities before signing");
}
if (builder.afterSign !== "build/after-sign.cjs") {
  throw new Error("Production packaging must verify nested app signatures before notarization");
}
if (COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier !== "com.jo32.deepdeck.cu-helper") {
  throw new Error("Packaged Computer Use helper does not use the permanent DeepDeck identity");
}
if (computerUsePackage.dependencies?.["open-computer-use"] !== COMPUTER_USE_UPSTREAM_IDENTITY.version) {
  throw new Error("Computer Use native identity audit does not match the pinned upstream version");
}
if (builder.forceCodeSigning !== true || builder.mac?.hardenedRuntime !== true || builder.mac?.notarize !== true) {
  throw new Error("Production macOS packaging must require signing, hardened runtime, and notarization");
}
if (builder.publish?.provider !== "generic" || !String(builder.publish?.url).includes("UPDATE_FEED_URL")) {
  throw new Error("electron-builder must use the build-time generic UPDATE_FEED_URL");
}

if (options.github_output) {
  await appendFile(
    options.github_output,
    `version=${desktopPackage.version}\nrelease_tag=${options.tag}\nupdate_base_url=${normalizedBaseUrl}\n`,
  );
}
console.log(`verify-release-config: DeepDeck ${desktopPackage.version} -> ${normalizedBaseUrl}`);
