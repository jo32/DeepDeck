# DeepDeck WebMCP benchmark

DeepDeck owns the editable benchmark source in `benchmarks/webmcp`. It starts from
8 site recipes, 49 tasks, WebMCP source patches and scoring logic imported from
WindTunnel. This is a local source fork for creating our own tasks, with preserved
[source and license attribution](../benchmarks/webmcp/NOTICE.md).

## Write your own tasks

Edit `benchmarks/webmcp/tasks/<site>.yaml` directly, or copy
`benchmarks/webmcp/templates/blog-author.yaml` to a new file:

```yaml
tasks:
  - id: my-blog-author
    tier: answer
    start_path: /about
    prompt: Read this About page and report the author's full name.
    timeout_seconds: 600
    predicate:
      type: answer
      contains: [Tails Azimuth]
```

Run that file independently:

```sh
pnpm benchmark:webmcp list --sites tailwind-nextjs-blog --task-file ./my-tasks.yaml
pnpm benchmark:webmcp run --sites tailwind-nextjs-blog --task-file ./my-tasks.yaml --n 1
```

`--task-file` requires one site and replaces its default task file. Task IDs must
be unique safe identifiers. `excluded: true` retires a task. `--task-ids a,b`
selects a subset and rejects unknown IDs. Existing `params` templates can supply
prompt and predicate values; the current runner resolves them with seed 1.

Answer predicates support `contains`, `contains_any`, `matches` and
`not_contains`. For state-changing tasks, specify a `probe`, its `args` and an
`assert` (`equals`, `contains`, `matches` or `truthy`); the capsule's `oracle.sh`
must implement that probe. The local implementation is
`benchmarks/webmcp/scoring/predicates.mjs` and can be extended with regression
tests in `benchmarks/webmcp/tests`.

Modify website tools in `goldens/<site>.reference.patch`, fixture data in
`fixtures/<site>/`, and startup/reset/probes in `capsules/<site>/`. Register new
sites and profiles in `sites/sites.yaml`. These are ordinary repository files;
there is no upstream sync operation to overwrite your work.

## Prepare and run

Requirements: the repository's Node/pnpm toolchain, running Docker, Git, Bash 4+,
jq, flock, GNU tar and coreutils. On macOS, start OrbStack or Docker Desktop and
install `brew install bash coreutils gnu-tar jq flock`.

```sh
pnpm install
pnpm build:desktop
pnpm benchmark:webmcp doctor
pnpm benchmark:webmcp list --sites full

# Native tool discovery in actual DeepDeck, without a model call.
pnpm benchmark:webmcp smoke --sites tailwind-nextjs-blog

# Model-driven runs against your current local task definitions.
pnpm benchmark:webmcp run --sites lite --n 1
pnpm benchmark:webmcp run --sites full --n 3

# Keep local sites open for manual development; stop with matching arguments.
pnpm benchmark:webmcp up --sites lite --run-id manual --port 3215
pnpm benchmark:webmcp down --sites lite --run-id manual --port 3215
```

重复执行相同的 `up` 会复用健康的实例，不会重建或重置数据；已完成准备但停止的实例会重新启动。同一个 `run-id` 必须使用原端口。需要应用网站源码或补丁改动时，先执行 `down`，再 `up` 重新构建（`down` 会删除该实例及其数据）。

`--sites` accepts a named profile or comma-separated site IDs. Sites are cloned
at the revisions in their capsule recipes when first prepared; the application
sources are separate from our owned task/tool/scoring code. The runner explicitly
enables the imported `WT_WEBMCP=1` switch so preparation applies the local tool
patches. Modifying a patch affects the next preparation. Start with a light site;
the full set includes several database-backed stacks and requires more resources.

Model runs use an isolated copy of the default configuration in `$DSH_HOME` or
`~/.dsh`. Override with `--settings-from PATH`, or select an explicit route with
`--provider ID --model ID` and optional `--effort ID`. Only `settings.yaml`,
`.credentials.yaml` and `.openai-codex-auth.json` are copied, with private
permissions. No history, cookies or project files are copied. Smoke checks copy
no credentials. Additional provider plugins need their own desktop configuration.

## Results and boundaries

See the [local corpus audit](webmcp-benchmark-audit.md) for verified runs,
remaining website warnings and known weaknesses in the imported scoring rules.

Each attempt resets its capsule and starts a fresh DeepDeck Electron profile and
Harness home. The Browser Cordis plugin binds a new Agent session to the site and
collects its formal session events. The Agent uses DeepDeck's normal tool set and presentation, choosing between
WebMCP and ordinary browser tools. The benchmark adds no tool whitelist and does
not require WebMCP tools to exist for `run` (`smoke` still checks their discovery).
The prompt prohibits reading benchmark source files, fixtures and evaluation data.
A shared 600-second Agent execution deadline applies, with no step limit. Site/browser startup is excluded; login remains part of the task. Set `timeout_seconds` in a task or override all tasks with `--timeout-seconds` (1–600).

Expected answers stay in the runner. After completion, the local scorer checks
the final answer or the capsule's actual state. Failed mutations are not retried.
A majority is reported only when all requested repetitions exist. Discovery-only
smoke results are never counted as task-success results.

Reports default to `.deepdeck/benchmarks/<timestamp>/report.json`; set
`--output PATH` to choose a new directory. Reports are checkpointed after every
attempt and include a hash of the local task/tool/fixture/scorer/lifecycle files,
a hash of the selected resolved tasks (including custom files), DeepDeck commit
and dirty status, actual model route, transcript, raw token/cache usage, timings,
verdicts and failures. Unknown cost remains `null`. Reset and startup time are
excluded from `agentMs`. Logs and transcripts are private local artifacts.

The runner closes its desktops and capsule stacks; dependency caches and website
source workspaces are retained outside this repository. For forced termination,
use `harness/bin/capsule SITE down --run-id ID --port PORT` with the run's same
`CAPSULE_RUNTIME_ROOT`. Historical runs from before the local-source migration
remain under their original report directories and retain their original origin
metadata. They are not evidence of changes to the current custom corpus.

Repository checks: `pnpm check`, `pnpm build`, and `pnpm test`. With Node 25,
`NODE_OPTIONS=--no-experimental-webstorage pnpm test` avoids an existing desktop
test's conflict with Node's experimental global `localStorage`.

Local migration validation (2026-09-16): `check`, the full test suite with that
Node option, and `build` passed. A real DeepDeck run loaded the standalone
`templates/blog-author.yaml`, discovered the site's native `ask_site`, used the
configured model, and completed scoring. It correctly recorded a failed answer:
the Agent returned co-author Sparrow Hawk rather than the About page's default
author Tails Azimuth. The raw report is retained locally at
`.deepdeck/benchmarks/webmcp-custom-task-validation/report.json`. This verifies
custom-task execution and failure reporting, not success on all starter tasks.

`run` 和 `smoke` 未指定 `--port` 时，从 3215 起自动跳过已预留或被占用的端口（最多尝试 100 个），并打印实际网站地址。显式指定 `--port` 时严格使用该端口。手动 `up` 的实例可保持运行，benchmark 会创建独立实例。

### 自动管理网站启停

直接运行题目即可，无需先 `up` 或随后 `down`：

```bash
pnpm benchmark:webmcp run --sites tailwind-nextjs-blog --task-file benchmarks/webmcp/templates/blog-author.yaml --n 1
```

`run` / `smoke` 会创建独立实例、等待网站就绪、执行测试，并在成功、失败或 `Ctrl+C` 后清理该实例、释放端口。终端会显示启动地址和停止结果，报告的 `instances` 记录实际地址及启停时间。启动或重置期间中断，会等待当前生命周期步骤结束后清理，避免 Docker 构建与清理同时进行。手动 `up` 的网站保留运行；只有开发时想持续访问网站才需要 `up` / `down`。强制杀进程或断电无法执行退出清理；清理失败时终端会显示对应的手动清理命令。

Benchmark 使用浏览器界面自动创建并选中的站点会话，不再另建后台会话。`run` 和 `smoke` 都等待可见对话面板确认连接；报告中的 `result.connection` 记录 `siteId`、`sessionId`、`tabId` 和 `visibleConversationReady`，未连接会直接失败。

## 有／无 WebMCP 的成对比较

`run` 现在默认 `--webmcp compare`。明确写出来的完整例子：

```bash
pnpm benchmark:webmcp run --sites tailwind-nextjs-blog --task-file benchmarks/webmcp/templates/blog-author.yaml --webmcp compare --n 3
```

单侧运行用 `--webmcp on` 或 `--webmcp off`。`smoke --webmcp compare` 可以不调用模型，检查两侧浏览器的 WebMCP 状态和界面会话连接。`--timeout-seconds 600` 给两侧统一指定 Agent 时间上限；默认每题每组 10 分钟，不含网站／浏览器启动。没有步数限制，旧 `max_steps` 字段不再生效。

网站源码、补丁、数据、端口、题目、模型设置和预算相同。每侧开始前重置网站，并启动独立的 Electron/Harness 会话；一次命令的模型设置先保存为临时快照，清理时删除。关闭侧通过 Electron 的 Blink feature 开关关闭 WebMCP，禁止安装或执行 WebMCP 工具，并检查工具列表为空。网站补丁仍然存在于两侧，避免把 UI 修复或后端差异混进对照。普通浏览器、DevTools 工具在两侧保持可用。

同一题第 1 次先 on 后 off，第 2 次先 off 后 on，依次交替。默认 n=3 是每侧各 3 次。任一侧失败仍保存结果并尝试另一侧；中断则停止后续任务。仅原题评分器分别判定正确性，有 WebMCP 的答案不是正确性标准。

输出 `report.json` 和 `comparison.md`：

- `comparison.pairs` 保存每个配对的两侧答案、正确性、实际模型、token 和耗时。on 是参考侧，差值为 **off − on**，正数表示 WebMCP 用得更少。
- `comparison.bothCorrect` 单独汇总两侧都完成、模型相同且都答对的结果。参考侧答错、缺少答案、运行失败或模型不同，不会被当作有效的正确答案效率提升。
- token 总量按 Harness 标准字段相加：input + output + cache-read + cache-write，另保留各项原值。不完整用量显示为空；token 总量不是实际账单费用。模型路由或缓存行为不同不能通过数字自动解释成 WebMCP 的效果。
- `agentMs` 是 Agent 执行时间，包含模型与工具等待；`wallMs` 还包含桌面应用启动／退出。网站构建和重置时间单独记录。比较以 Agent 时间为主。
- 节省比例是 `(off − on) / off`。汇总按有效配对的总量计算，记录每项实际样本数。只有一次运行时只应看作观测，不足以得出稳定性能结论。

## WebMCP 实现的验证边界

有工具并不等于工具合理。on 侧启动前检查工具名称、描述和对象参数 schema；off 侧检查原生功能关闭且工具为空。独立的正确性评分保留，基线错误会在报告中标明。

博客增加 `read_page` 读取当前或明确路径的已发布内容，并修复 `ask_site` 因“full name”等措辞过滤正确页面的问题。测试覆盖完整问句、路径限制、未知页面、导航后内容及不同作者姓名，直接执行补丁里的工具代码。它不会内置作者答案，也不会把共同作者资料冒充 About 页面。内容较长时明确标出截断。

这些检查不能证明所有站点所有写入工具的业务正确性。其他站点已有的启动审计和评分器局限见 `docs/webmcp-benchmark-audit.md`；尤其弱评分器的 PASS 不能当作全面验证。新增题目应配上足以验证操作结果的独立 predicate。报告保留完整调用记录，便于核实基线失败或异常低耗时的原因。

### 模型和 API 配置

默认沿用 `--settings-from`（默认 `~/.dsh`）的模型设置和凭据。可以只为本次运行指定模型和接口；修改写入临时配置，两组共享同一份快照，结束后删除，不修改日常设置。

```bash
# 已保存 DeepSeek Key：当前 Harness 的 V41 Flash API ID 是 deepseek-flash。
# 命令也接受 deepseek-v4.1 / deepseek-v4.1-flash 别名。
pnpm benchmark:webmcp run --sites tailwind-nextjs-blog \
  --task-file benchmarks/webmcp/templates/blog-author.yaml \
  --provider deepseek-official --model deepseek-v4.1 --webmcp compare --n 3

# 自定义地址、从环境变量读取 Key（变量须已 export）
pnpm benchmark:webmcp run --sites tailwind-nextjs-blog \
  --task-file benchmarks/webmcp/templates/blog-author.yaml \
  --provider deepseek-official --model deepseek-v4.1 \
  --base-url https://your-deepseek-endpoint.example/v1 \
  --api-key-env BENCH_API_KEY --webmcp compare --n 3
```

Key 支持 `--api-key-env NAME`、`--api-key-file PATH` 或 `--api-key KEY`，三者只能选一个。优先使用环境变量或文件，避免命令历史保存明文 Key；省略时使用已保存的凭据。报告记录模型与显式配置的 Base URL，不记录 Key。Base URL 不接受内嵌凭据、查询参数或片段。

普通兼容接口可使用 `--provider my-gateway --model <实际模型 ID> --api openai-completions --base-url <接口地址> --api-key-env BENCH_API_KEY`；另支持 `openai-responses` 和 `anthropic-messages`。DeepSeek 官方适配使用 `deepseek-official`，不需要 `--api`；模型名称按当前本地 Harness 的内置目录解析，接口是否授权该模型仍以实际运行结果为准。

### 任意网站 + Query：自动消融实验

```bash
pnpm benchmark:webmcp ablate \
  --url https://your-website.example/about \
  --query '这个页面的作者全名是什么？' \
  --n 3
```

不需要 Docker、站点注册或题目文件。命令使用现有 DeepDeck 模型配置；同样支持 `--provider`、`--model`、`--base-url`、`--api-key-env`、`--api-key-file`、`--effort`、`--settings-from`、`--timeout-seconds` 和 `--output`。例如增加 `--provider deepseek-official --model deepseek-v4.1 --api-key-env DEEPSEEK_API_KEY`。

执行过程：

1. 用真实 DeepDeck 检查开启组的原生 WebMCP 工具，再验证关闭组工具为空。正常页面跳转可跟随到最终站点。
2. 每组每轮独立启动浏览器和会话，使用同一份模型配置、query 和预算。每轮交替 on/off 顺序。
3. 写出 `comparison.md` 与 `report.json`，包含两组答案、token（包括缓存）、Agent 耗时、完整工具调用、错误和 WebMCP 实际调用次数。启动时间另计。
4. 自动关闭本命令启动的浏览器，删除临时凭据配置。不会停止用户提供的网站。

默认只检测网站自带的原生 WebMCP。也可用 `--webmcp-file /absolute/path/webmcp.js` 测试自己的实现：读取并冻结一个使用 `globalThis.__deepdeckWebMCP.registerTool(...)` 的 DeepDeck JavaScript 注册脚本（已构建的 JS，不是 TypeScript 源码），仅在开启组通过 DeepDeck 原生 WebMCP 安装接口加载；关闭组禁用浏览器 WebMCP。脚本最大 256 KiB，报告记录内容摘要以便确认版本。不会自动生成另一套 WebMCP。网页加载完成后 10 秒仍未发现工具，则生成“不适用”报告，退出码为 2，并且不进行模型调用。

可选 `--expected-answer 'Tails Azimuth'` 在两组最终答案中做忽略大小写、规范化空白的文本包含校验。预期答案不发送给 Agent。未提供时正确性为“未评分”，报告仅比较完整执行配对的效率，并保留两组答案供人工核对；有 WebMCP 的答案不会被自动当成正确答案。有预期答案时另按“两侧都通过校验”的配对汇总效率。文本包含校验不代表完整语义正确性。

远程网站无法由本命令重置后端数据；每组使用干净浏览器，已有登录状态不会复制。因此首版适用于无需登录、数据相对稳定的页面；会改变远端数据的 query 会重复执行并可能影响后续组的条件。结果会注明这个限制。网站没有工具、没有实际调用工具、运行失败与答案不匹配均有明确记录，不会自动输出“WebMCP 更好”的结论。

退出码：0 表示两组运行完整且没有已知答案校验失败；1 表示运行不完整、异常或答案校验失败；2 表示未发现可供消融的 WebMCP。

本地脚本最小示例（保存为 `heading-webmcp.js`）：

```js
globalThis.__deepdeckWebMCP.registerTool({
  name: 'read_heading',
  description: 'Read the main heading from the current page.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => ({
    content: [{ type: 'text', text: JSON.stringify({
      heading: document.querySelector('h1')?.textContent ?? null,
      url: location.href,
    }) }],
  }),
});
```

```bash
pnpm benchmark:webmcp ablate --url https://example.com \
  --query 'What is the main heading?' --webmcp-file ./heading-webmcp.js --n 3
```
