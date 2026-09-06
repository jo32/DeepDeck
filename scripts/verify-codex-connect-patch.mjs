import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import assert from "node:assert/strict";
import { zstdDecompressSync } from "node:zlib";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const expectedPackageVersion = "0.1.0-alpha.4.21";
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
  // Alpha 4.21 documents the old version pair and diagnoses it as unsupported.
  // Neither is a claim that this build implements the old plugin API.
  const contractText = relative(packageRoot, path) === "INSTALL.md" ? "" : text.replace(
    "DSH 0.1.0-rc.7 requires Codex Connect 0.1.0-alpha.4.14.", "",
  );
  const staleVersion = staleDshVersions.find((version) => contractText.includes(version));
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

// Exercise the installed, patched plugin through Cordis and the real pi-ai
// adapter. Source-only upstream tests cannot cover the packaged model backfill.
const pluginRequire = createRequire(manifestPath);
const { Context } = await import(pathToFileURL(pluginRequire.resolve("@deepseek-ai/cordis")));
const { default: LlmRuntime, createUserMessage, BlockAssembler } = await import(
  pathToFileURL(pluginRequire.resolve("@deepseek-ai/dsh-llm")),
);
const modelRoot = await mkdtemp(join(tmpdir(), "deepdeck-codex-models-"));
const originalDshHome = process.env.DSH_HOME;
process.env.DSH_HOME = modelRoot;
let modelContext;
try {
  const credentials = new plugin.OpenAICodexCredentialStore();
  await credentials.modify(plugin.OPENAI_CODEX_PROVIDER, async () => ({
    type: "oauth", access: accessToken, refresh: "verification-refresh-token",
    expires: Date.now() + 3_600_000, accountId: "deepdeck-patch-account",
  }));
  const boot = async (config = {}) => {
    const ctx = new Context();
    modelContext = ctx;
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(plugin, config);
    return ctx;
  };
  const ctx = await boot();
  const catalog = await ctx.llm.listModels("openai-codex");
  assert.equal(catalog.filter(model => model.id === "gpt-6-astra").length, 1);
  assert.ok(catalog.some(model => model.id === "gpt-5.6-sol"));
  const astra = await ctx.llm.resolveModelInfo("openai-codex", "gpt-6-astra");
  assert.equal(astra.name, "GPT-6 Astra");
  assert.deepEqual(astra.inputModalities, ["text", "image"]);
  assert.equal(astra.context.contextWindow, 1_050_000);
  assert.deepEqual(astra.reasoning.efforts.map(effort => effort.id), ["low", "medium", "high", "xhigh", "max"]);

  const requests = [];
  globalThis.fetch = async (endpoint, init) => {
    assert.equal(String(endpoint), "https://chatgpt.com/backend-api/codex/responses");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), `Bearer ${accessToken}`);
    assert.equal(headers.get("chatgpt-account-id"), "deepdeck-patch-account");
    const bytes = headers.get("content-encoding") === "zstd" ? zstdDecompressSync(init.body) : init.body;
    const body = JSON.parse(typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8"));
    requests.push(body);
    const item = { type: "message", id: "msg_astra", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: "Astra verified.", annotations: [] }] };
    const events = [
      { type: "response.created", response: { id: "resp_astra" } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } },
      { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "Astra verified." },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.done", response: { id: "resp_astra", status: "completed", output: [item],
        usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 } } },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
      headers: { "content-type": "text/event-stream" },
    });
  };
  const stream = async (reasoningEffort) => {
    const assembler = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({
      provider: "openai-codex", model: "gpt-6-astra", reasoningEffort,
      system: "Verify the installed plugin.",
      messages: [createUserMessage({ content: [{ type: "text", text: "Reply briefly." }] })],
    })) {
      if (chunk.type === "finish" && chunk.reason.kind === "error") {
        throw Object.assign(new Error(chunk.reason.failure.message), { code: chunk.reason.failure.code });
      }
      assembler.push(chunk);
    }
    assert.deepEqual(assembler.message({ kind: "model", provider: "openai-codex", model: "gpt-6-astra" }).content,
      [{ type: "text", text: "Astra verified." }]);
  };
  for (const effort of [undefined, "low", "medium", "high", "xhigh", "max"]) {
    await stream(effort);
    assert.equal(requests.at(-1).model, "gpt-6-astra");
    assert.equal(requests.at(-1).reasoning?.effort, effort);
    assert.equal(requests.at(-1).stream, true);
    assert.equal(requests.at(-1).store, false);
  }
  for (const effort of ["off", "minimal"]) {
    await assert.rejects(stream(effort), { code: "UNSUPPORTED_REASONING_EFFORT" });
  }
  assert.equal(requests.length, 6, "unsupported efforts must fail before a request is sent");
  await ctx.fiber.dispose();

  for (const models of [[], ["gpt-6-astra"], ["gpt-5.6-sol"]]) {
    const filtered = await boot({ models });
    assert.deepEqual((await filtered.llm.listModels("openai-codex")).map(model => model.id), models);
    assert.equal((await filtered.llm.resolveModelInfo("openai-codex", "gpt-6-astra")).id, "gpt-6-astra",
      "hiding Astra must preserve existing sessions' ability to resolve it");
    await filtered.fiber.dispose();
  }
} finally {
  await modelContext?.fiber.dispose();
  globalThis.fetch = originalFetch;
  if (originalDshHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = originalDshHome;
  await rm(modelRoot, { recursive: true, force: true });
}

console.log(
  `verify-codex-connect-patch: ${manifest.name} ${manifest.version} is patched for Harness ${expectedDshVersion}`,
);
