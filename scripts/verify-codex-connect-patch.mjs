import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const expectedPackageVersion = "0.1.0-alpha.4.20";
const expectedDshVersion = "0.1.1-rc.2";
const expectedReactRange = "^18.2.0 || ^19.1.1";
const expectedPiAiVersion = "0.82.1";
const staleDshVersions = ["0.1.0-rc.7", "0.1.0-rc.8"];
const textExtensions = new Set([".d.ts", ".js", ".json", ".md", ".yaml", ".yml"]);

function fail(message) {
  throw new Error(`verify-codex-connect-patch: ${message}`);
}

function expectDeepEqual(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) fail(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function collectTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTextFiles(path));
      continue;
    }
    if ([...textExtensions].some((extension) => entry.name.endsWith(extension))) files.push(path);
  }
  return files;
}

const manifestPath = require.resolve("dsh-codex-connect/package.json");
const packageRoot = dirname(manifestPath);
const physicalPackageRoot = await realpath(packageRoot);
const physicalWorkspaceRoot = await realpath(workspaceRoot);
const relativeRoot = relative(physicalWorkspaceRoot, physicalPackageRoot);
if (relativeRoot.startsWith("..") || relativeRoot.includes(`..${sep}`)) {
  fail(`resolved package is outside the workspace: ${physicalPackageRoot}`);
}

const manifest = await readJson(manifestPath);
const compatibility = await readJson(join(packageRoot, "compatibility.json"));
if (manifest.name !== "dsh-codex-connect" || manifest.version !== expectedPackageVersion) {
  fail(`expected dsh-codex-connect ${expectedPackageVersion}`);
}

const dshPeers = Object.entries(manifest.peerDependencies ?? {})
  .filter(([name]) => name.startsWith("@deepseek-ai/dsh-"));
if (dshPeers.length === 0) fail("package declares no DSH plugin API peers");
for (const [name, version] of dshPeers) {
  if (version !== expectedDshVersion) fail(`${name} peer is ${version}, expected ${expectedDshVersion}`);
}
if (manifest.peerDependencies?.react !== expectedReactRange) {
  fail(`React peer is ${manifest.peerDependencies?.react ?? "missing"}, expected ${expectedReactRange}`);
}
if (manifest.peerDependencies?.["@earendil-works/pi-ai"] !== expectedPiAiVersion) {
  fail("pi-ai peer contract drifted");
}
if (compatibility.dshPluginApi?.version !== expectedDshVersion) {
  fail("compatibility.json does not declare Harness 0.1.1-rc.2");
}

const textFiles = await collectTextFiles(packageRoot);
let claimsConfigurableProvider = false;
for (const path of textFiles) {
  const text = await readFile(path, "utf8");
  if (/registerConfigurableProviders\(\[\{\s*provider:\s*OPENAI_CODEX_PROVIDER/u.test(text)) {
    claimsConfigurableProvider = true;
  }
  const staleVersion = staleDshVersions.find((version) => text.includes(version));
  if (staleVersion !== undefined) {
    fail(`stale ${staleVersion} contract remains in ${relative(packageRoot, path)}`);
  }
}
if (claimsConfigurableProvider) {
  fail("compiled bundle still duplicates Harness 0.1.1's catalog-owned openai-codex directory entry");
}

const clientBundle = await readFile(join(packageRoot, "lib/client.js"), "utf8");
if (clientBundle.includes('"dsh-codex-connect: update checker"')) {
  fail("compiled client still starts the Codex Connect update checker automatically");
}
if (clientBundle.includes('id: "dsh-codex-connect-update"')) {
  fail("compiled client still registers the Codex Connect update overlay");
}
if (!clientBundle.includes('"dsh-codex-connect: manual update store"')
  || !clientBundle.includes("updater.refresh(true)")) {
  fail("compiled client no longer preserves the manual settings update check");
}

const plugin = await import(pathToFileURL(join(packageRoot, manifest.main ?? "lib/index.js")).href);
if (plugin.SUPPORTED_DSH_PLUGIN_API_VERSION !== expectedDshVersion) {
  fail("compiled doctor contract does not report Harness 0.1.1-rc.2");
}
if (plugin.COMPATIBILITY_CONTRACT?.dshPluginApi?.version !== expectedDshVersion) {
  fail("compiled compatibility contract does not report Harness 0.1.1-rc.2");
}

const expectedSearchUrl = "https://chatgpt.com/backend-api/codex/responses";
if (plugin.OPENAI_CODEX_SEARCH_URL !== expectedSearchUrl) {
  fail(`compiled search endpoint is ${plugin.OPENAI_CODEX_SEARCH_URL ?? "missing"}, expected ${expectedSearchUrl}`);
}

const searchResponse = {
  status: "completed",
  output: [
    {
      type: "web_search_call",
      action: {
        sources: [
          { type: "url", url: "https://example.com/a", title: "duplicate" },
          { type: "url", url: "https://example.com/b", title: "Complete source" },
        ],
      },
    },
    {
      type: "message",
      content: [{
        type: "output_text",
        text: "Verified answer.",
        annotations: [{ type: "url_citation", url: "https://example.com/a", title: "Cited source" }],
      }],
    },
  ],
};
const expectedSearchResult = {
  content: "Verified answer.",
  sources: [
    { url: "https://example.com/a", title: "Cited source" },
    { url: "https://example.com/b", title: "Complete source" },
  ],
  truncated: false,
};
expectDeepEqual(
  plugin.mapOpenAICodexSearchResponse(searchResponse),
  expectedSearchResult,
  "compiled hosted-search response mapping drifted",
);

const encodeTokenPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encodeTokenPart({ alg: "none" })}.${encodeTokenPart({
  "https://api.openai.com/auth": { chatgpt_account_id: "deepdeck-patch-account" },
})}.signature`;
const searchRoot = await mkdtemp(join(tmpdir(), "deepdeck-codex-patch-"));
const originalFetch = globalThis.fetch;
let dispatchedSearch;
let recordedSearch;
try {
  const credentials = new plugin.OpenAICodexCredentialStore(join(searchRoot, "auth.json"));
  await credentials.modify(plugin.OPENAI_CODEX_PROVIDER, async () => ({
    type: "oauth",
    access: accessToken,
    refresh: "verification-refresh-token",
    expires: Date.now() + 3_600_000,
    accountId: "deepdeck-patch-account",
  }));
  globalThis.fetch = async (endpoint, init) => {
    dispatchedSearch = { endpoint: String(endpoint), init };
    return new Response(
      `data: ${JSON.stringify({ type: "response.completed", response: searchResponse })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  };
  const provider = new plugin.OpenAICodexSearchProvider({
    credentials,
    model: "gpt-search-patch-verification",
    mode: "live",
    contextSize: "high",
    maxOutputTokens: 321,
    resolveRequestId: () => "deepdeck-patch-verification",
    recordRequest: (request) => { recordedSearch = request; },
  });
  expectDeepEqual(
    await provider.search({ query: "verify the DeepDeck patch" }),
    expectedSearchResult,
    "compiled hosted-search provider result drifted",
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(searchRoot, { recursive: true, force: true });
}

if (dispatchedSearch === undefined || recordedSearch === undefined) {
  fail("compiled hosted-search provider did not record and dispatch its request");
}
const dispatchedHeaders = new Headers(dispatchedSearch.init?.headers);
const dispatchedBody = JSON.parse(String(dispatchedSearch.init?.body));
const expectedSearchBody = {
  model: "gpt-search-patch-verification",
  store: false,
  stream: true,
  instructions: "Search the web for the user query and return a concise answer grounded in the sources you found.",
  input: [{
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: "verify the DeepDeck patch" }],
  }],
  tools: [{
    type: "web_search",
    search_context_size: "high",
    external_web_access: true,
  }],
  tool_choice: "required",
  parallel_tool_calls: true,
  include: ["web_search_call.action.sources"],
};
if (dispatchedSearch.endpoint !== expectedSearchUrl
  || dispatchedSearch.init?.method !== "POST"
  || dispatchedSearch.init?.redirect !== "error") {
  fail("compiled hosted-search provider dispatch contract drifted");
}
if (dispatchedHeaders.get("accept") !== "text/event-stream"
  || dispatchedHeaders.get("openai-beta") !== "responses=experimental"
  || dispatchedHeaders.get("session-id") !== "deepdeck-patch-verification"
  || dispatchedHeaders.get("x-client-request-id") !== "deepdeck-patch-verification") {
  fail("compiled hosted-search request headers drifted");
}
expectDeepEqual(dispatchedBody, expectedSearchBody, "compiled hosted-search request body drifted");
expectDeepEqual(
  recordedSearch,
  { endpoint: expectedSearchUrl, body: expectedSearchBody },
  "compiled hosted-search request recording drifted",
);

const report = plugin.evaluateCompatibility({
  nodeVersion: "v24.18.1",
  packageVersions: {
    "@deepseek-ai/dsh-llm": expectedDshVersion,
    "@deepseek-ai/dsh-llm-pi-ai": expectedDshVersion,
    "@earendil-works/pi-ai": expectedPiAiVersion,
  },
});
if (report.status !== "compatible") fail(`compiled compatibility evaluation returned ${report.status}`);

const installedReport = await plugin.detectCompatibility();
if (installedReport.status !== "compatible") {
  fail(`installed 0.1.1-rc.2 dependency detection returned ${installedReport.status}`);
}

console.log(
  `verify-codex-connect-patch: ${manifest.name} ${manifest.version} is patched for Harness ${expectedDshVersion}`,
);
