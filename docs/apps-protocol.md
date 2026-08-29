# DeepDeck Apps 协议

本文描述 DeepDeck 当前的 Apps 运行时协议，以及一个 Cordis 插件如何成为可启动、可配置、可对话、可 Vibe Coding、可用 Bun 热重载的 App。协议实现主要位于 [`app-conversations`](../plugins/app-conversations/) 和 [`bun-plugin-builder`](../plugins/bun-plugin-builder/)，[Hacker News Reader](https://github.com/jo32/dsh-hackernews-reader) 是独立维护的参考实现。

## 1. App、Plugin、Market 与 Builder 的边界

App 不是另一种独立的安装包格式，而是一个提供了 App 运行时能力的 Cordis Plugin。不是所有 Plugin 都是 App；一个完整 App 通常同时注册启动入口、Host 身份、Client actions 和可选设置。

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| Plugin | 提供 Cordis Host/Client 代码、工具、路由、设置和 patch | 不因安装后自动成为 App |
| App | 在 Plugin 基础上提供独立入口、App Workspace、设置和 App actions | 不自行复制 Harness 的 Session 状态 |
| Plugin Market | 发现、获取、安装或更新插件源码/包 | 不执行 App 的会话协议，也不替代 Builder |
| Bun Builder | 审核本地包身份，执行声明的 `build`，生成包或热更新已加载插件 | 不搜索市场、不 clone 仓库、不决定安装来源 |

运行时注册是事实来源：

- `sidebar.apps` 决定 App 是否出现在侧栏的 Apps 启动器中；
- Host `appConversations.register(...)` 决定 App 是否拥有 Workspace、Apps 设置卡、Vibe Coding 和 Rebuild 能力；
- Client `appConversations.register(...)` 决定独立 App 页面可以调用哪些 AI actions；
- `settings.apps.item` 决定该 App 是否有自己的设置内容。

`package.json` 中的 `dsh.app` 可以描述分发层的 App 身份，但仅有 manifest 不会产生运行时 UI；Plugin 仍需完成上述注册。

## 2. 总体架构

```mermaid
flowchart LR
  subgraph P[App Plugin]
    H[Host definition]
    C[Client definition]
    N[sidebar.apps]
    S[settings.apps.item]
    W[Standalone App page]
  end

  N --> L[Apps launcher]
  S --> U[Settings / Apps]
  H --> HR[App Host registry]
  C --> CR[App Client registry]
  W -- BroadcastChannel --> CR
  CR --> SR[Harness Session runtime]
  HR --> WR[Workspace registry]
  U -- local API --> HR
  HR --> BB[Bun Builder]
  BB --> CH[Build outputs]
  CH --> CL[Cordis Loader HMR]
  CH --> BH[Client HMR]
```

Host 和 Client 分工如下：

- Host 保存可信 App 身份、源码根目录和包名，创建 Workspace，并调用 Bun Builder；
- Client 把 App 页面 action 转成受控 prompt，复用 Harness 的标准 Session API，并向 App 页面回传预览状态；
- 独立 App 页面只负责交互和展示，不保存另一套对话状态；
- Electron 只负责打开原生次级窗口、聚焦主窗口等浏览器无法提供的桌面能力。

## 3. 注册一个 App

### 3.1 Host 注册

Host 通过反射服务 `appConversations` 注册 App：

```ts
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

ctx.effect(() => ctx.appConversations.register({
  id: 'example-reader',
  title: 'Example Reader',
  workspaceSlug: 'example-reader',
  workspaceTitle: 'Apps · Example Reader',
  packageName: '@example/dsh-example-reader',
  sourcePackageRoot: packageRoot,
  appWindowPath: '/apps/example-reader',
  actionTools: [{
    name: 'example_set_draft',
    description: 'Set the draft shown in the Example Reader editor.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { content: { type: 'string', maxLength: 20_000 } },
      required: ['content'],
    },
    effect: 'draft.set',
  }],
}), 'example reader: app registration')
```

字段约束：

| 字段 | 含义 | 约束 |
| --- | --- | --- |
| `id` | App 的稳定协议身份 | 小写字母、数字和连字符；当前进程内唯一 |
| `title` | Apps 设置和 Creator Workspace 的显示名 | 不得为空 |
| `workspaceSlug` | 普通 App Workspace 的目录名 | 与 `id` 相同的格式；不同 App 不得共用 |
| `workspaceTitle` | 普通 App Workspace 的显示名 | 可选；默认 `Apps · <title>` |
| `packageName` | Bun Builder 审核和 Loader 匹配使用的包名 | 必须与 `package.json.name` 完全一致 |
| `sourcePackageRoot` | Vibe Coding 和 Rebuild 使用的源码根目录 | 必须是绝对本地路径，不能是 Builder staging 目录 |
| `appWindowPath` | 可选的独立 App 窗口页面 | 同源绝对 pathname；Apply 后 Desktop 刷新匹配窗口并回报数量 |
| `actionTools` | 可选的 Agent UI-effect tools | 名称、schema 和 effect 由 Host 固定注册；只在一次 action 执行期间挂载 |

建议从 `import.meta.url` 推导 `sourcePackageRoot`，不要写开发机绝对路径。热更新后 Host 会从 Builder staging 目录重新注册；注册表只在包名一致时保留之前审核过的原始源码根目录，避免下一次 Rebuild 错误地指向临时目录。

### 3.2 Apps 启动器

Client 使用 `sidebar.apps` list slot 提供启动入口：

```tsx
ctx.slots.inject('sidebar.apps', () => ctx.slots.register({
  name: 'sidebar.apps',
  id: 'example-reader',
  order: 20,
  label: 'Example Reader',
}, ExampleReaderLauncher))
```

Launcher 会收到 `{ wide, closeApps }`。App 打开成功后应调用 `closeApps()`。需要原生次级窗口时，由 Host 的同源路由请求 Electron bridge；Client 不应直接操作 Electron。

### 3.3 App 自有设置

Apps 设置页由 `app-conversations` 统一提供。App 只向 `settings.apps.item` 注入自己的设置内容：

```tsx
ctx.slots.inject('settings.apps.item', () => ctx.slots.register({
  name: 'settings.apps.item',
  id: 'example-reader',
}, ExampleReaderSettings))
```

slot `id` 必须等于 App `id`。Settings 容器使用 `only: app.id` 渲染，因此一个 App 看不到或覆盖另一个 App 的设置。

每张 App 卡由三部分组成：

1. 标题、包名和 **Vibe Coding**；
2. App 自己贡献的设置；
3. 协议统一提供的 **Bun Builder / Rebuild with Bun**。

![Apps 设置中的 App 卡、Vibe Coding 和 Bun Rebuild](images/apps-protocol/apps-settings.png)

App 设置应使用 Harness UI primitives 和设计 token，不能硬编码只适用于 Light 或 Dark mode 的颜色。账号、Cookie 或 token 等凭据由 App 的 Host credential service 保存，不放进 Client state、Workspace 或 App 页面消息。

### 3.4 Client actions

独立 App 页面不能直接提交任意 prompt。Client 为固定 `actionId` 注册 payload 到 prompt 的转换函数：

```ts
ctx.effect(() => ctx.appConversations.register({
  id: 'example-reader',
  actions: {
    explain: payload => prepareExampleAction('explain', payload),
    summarize: payload => prepareExampleAction('summarize', payload),
  },
}), 'example reader: app actions')
```

转换函数返回：

```ts
interface AppConversationPreparedAction {
  prompt: string
  title: string
  sessionTitle?: string
  tools?: string[]
}
```

转换函数负责验证和限制页面传入的 payload。协议还会拒绝空 prompt、超过 64 KiB 的 prompt，并把 Session 标题限制在 120 个字符内。

`tools` 只能选择该 App Host 已声明的 `actionTools`。启用 tool 的 action 会先把它们绑定到本次
请求、canonical Session 和 App Workspace，再发送 prompt；prompt 应明确说明何时调用哪个 tool。
Agent 调用 tool 后，运行时把结构化 effect 交给发起请求的 App 页面。Assistant 最终文本仍只作为
Session 中的对话和进度预览，不会被隐式复制进 App 的业务字段。

这类 tool 只表达 UI effect，例如设置草稿、添加候选项或选择结果。发布、删除、付款等有外部副作用
的操作仍应走 App 自己的确认和权限边界，不能因为 Agent 写入了草稿就自动执行。

### 3.5 新建 App

Apps 设置标题栏提供 **新建 App**。用户填写显示名称和稳定 App ID 后，Host 会在
`~/DeepDeck/Plugins/<app-id>` 创建一个不会覆盖同名目录的 Cordis App 骨架。骨架包含：

- Host、Client 和 invariant 入口及类型出口；
- `dsh.app`、`dsh.bundle`、Client inject 和自挂载 `cordis.patch.yml`；
- `sidebar.apps` 与 `settings.apps.item` 注册；
- 一个由 Host 同源路由提供、通过 Electron App window bridge 打开的 starter 页面；
- `AGENTS.md`、README、构建脚本和不提交 `lib/` 的 `.gitignore`。

创建不是绕过安装边界的文件复制。生成目录会继续经过 Bun Builder 的 preview/build
校验，并由受保护的 profile package transaction 以 `link:` 方式加入当前 bundle。
App ID、包名或目标目录发生碰撞时创建会停止且不会覆盖已有源码；创建成功后需要重启
DeepDeck 装配新的 Host/Client package，之后即可从 App 卡片进入 Vibe Coding。

## 4. 两类 Workspace

Apps 协议故意把“使用 App”和“修改 App”分开：

| 类型 | 路径 | 默认标题 | Agent preset | 用途 |
| --- | --- | --- | --- | --- |
| App content Workspace | `~/DeepDeck/Apps/<workspaceSlug>` | `Apps · <title>` | 用户当前选择 | App actions 的标准 Session、历史和产物 |
| Creator Workspace | 注册的 `sourcePackageRoot` | `Creator · <title>` | 强制 `cordis` | 阅读和修改 App 源码、调用受控 Rebuild |

普通 App action 创建或复用 content Workspace 中的 canonical Session。follow-up 请求如果携带 `sessionId`，协议会验证该 Session 的 `cwd` 仍属于当前 App；App 页面不能把 action 注入其他 Workspace 的 Session。

点击 **Vibe Coding** 时，Client 请求 Host 解析 Creator Workspace，连接一个空白 Session，将 preset 切换为 `cordis`，然后在主窗口打开该 Session。Creator Workspace 直接指向源码包，不写入 `~/DeepDeck/Apps`。

## 5. 独立 App 页面消息协议

独立 App 页面与 DeepDeck 主页面使用同源 `BroadcastChannel` 通信：

```ts
const channelName = 'deepdeck-app-conversations-v1'
```

消息使用 `source`、`clientId` 和 `requestId` 做来源区分与请求关联。页面到运行时有两类消息：

| `type` | `source` | 作用 |
| --- | --- | --- |
| `invoke` | `deepdeck-app-page` | 调用一个已注册的 App action |
| `open-session` | `deepdeck-app-page` | 在主窗口打开一个已经属于该 App 的 Session |

`invoke` 示例：

```json
{
  "source": "deepdeck-app-page",
  "type": "invoke",
  "clientId": "page-instance-id",
  "requestId": "request-id",
  "appId": "example-reader",
  "actionId": "summarize",
  "payload": { "itemId": 42 },
  "openSession": false
}
```

运行时通过 `preview-state` 回传状态：

```json
{
  "source": "deepdeck-app-runtime",
  "type": "preview-state",
  "targetClientId": "page-instance-id",
  "requestId": "request-id",
  "appId": "example-reader",
  "status": "running",
  "sessionId": "session-id",
  "title": "Summarize item",
  "content": "Current assistant preview"
}
```

Agent 调用 action-scoped tool 时，运行时另发一条 `action-effect`：

```json
{
  "source": "deepdeck-app-runtime",
  "type": "action-effect",
  "targetClientId": "page-instance-id",
  "requestId": "request-id",
  "appId": "example-reader",
  "sessionId": "session-id",
  "effect": {
    "sequence": 1,
    "effectId": "effect-id",
    "toolName": "example_set_draft",
    "effect": "draft.set",
    "payload": { "content": "Prepared draft" },
    "createdAt": "2026-08-29T00:00:00.000Z"
  }
}
```

App 页面必须按 `targetClientId`、`requestId`、`appId` 和 effect 名验证消息，再将 payload 应用到
对应 UI。`effectId` 与单调递增的 `sequence` 用于去重和按序消费；action 完成或失败后，tool 会被
卸载，尚未读取的 effect 只短暂保留用于完成投递。

状态语义：

| 状态 | 含义 |
| --- | --- |
| `preparing` | 正在验证 action、准备 Workspace 和 Session |
| `running` | prompt 已接受；可能同时携带增量预览文本 |
| `attention` | Session 等待用户交互，应转到主窗口处理 |
| `completed` | 当前 turn 已完成 |
| `failed` | action、Session 或轮询失败；`error` 提供说明 |

`openSession: true` 表示 prompt 被接受后立即打开 canonical Session，不在 App 页面等待完整回答。否则 Client 最多轮询 10 分钟，并把 Assistant 的 durable message 或 live text delta 折叠成预览。

BroadcastChannel 是同源页面之间的传输机制，不是凭据通道。页面输入仍必须经过消息结构、App id、action id、payload 和 Session 所属关系验证。

## 6. Bun Rebuild 与 Cordis 热更新

Apps 设置里的 Rebuild 和 Creator tool 最终都进入同一个 Host 信任边界：

```mermaid
sequenceDiagram
  participant UI as Apps UI / Creator tool
  participant Registry as App Host registry
  participant Builder as Bun Builder
  participant Loader as Cordis Loader
  participant Client as Client HMR

  UI->>Registry: appId 或 Creator cwd
  Registry->>Builder: preview(registered source root)
  Builder-->>Registry: package identity + confirmation + HMR availability
  Registry->>Registry: packageName 必须与注册值一致
  Registry->>Builder: hotUpdate(previewId, confirmation)
  Builder->>Builder: bun run build
  Builder->>Loader: stage + entry.update(...)
  Builder-->>Client: 更新 Client bundle
  Builder-->>Registry: duration, hostReloaded, buildLog
  Registry-->>UI: AppRebuildResult
```

### 6.1 Settings Rebuild

Settings 页面只把 `appId` 发送到本地 API，不能提交源码路径、shell 命令或 build script。Host 从注册表取得可信 `sourcePackageRoot` 和 `packageName`，然后：

1. 建立 preview，读取并冻结包名、版本、Host/Client 入口和 `scripts.build`；
2. 确认当前 Cordis Loader 正在从同一个源码包加载该 package；
3. 再次验证 live manifest 没有改变审核过的 build plan；
4. 在原始源码目录运行内置 Bun 的 `bun run build`；
5. 验证构建后的 Host/Client 入口；
6. 把新 Host 输出复制到 Builder 管理的 staging 目录并调用 Loader `entry.update(...)`；
7. 由现有 Client HMR 通道加载新 Client bundle。

App Rebuild 是热更新快捷路径，**不会**执行 `bun install`，也**不会**生成 `.tgz`。Bun Builder 的通用“Build tgz”流程才会在隔离快照中执行 `bun install --ignore-scripts`、`bun run build` 和 `bun pm pack --ignore-scripts`。

Loader 更新失败时，旧 Host 保持活动；成功后才清理同一 package 的旧 staging 目录。Builder 不能在自己的请求执行中热更新自己。

### 6.2 Creator mode

Vibe Coding 创建或复用 `cordis` preset 的 source-bound Agent。
`app-conversations` 在该 Agent scope 注册四个工具和一个运行时 Skill：

| Tool | 作用 |
| --- | --- |
| `deepdeck_app_context` | 返回当前 Creator Workspace 绑定的 App id、包名、可信源码根目录和 Rebuild 可用性 |
| `deepdeck_app_apply` | 单一权威入口：构建一次，普通源码走 Cordis HMR，结构变化排队完整重启 |
| `deepdeck_app_rebuild` | `deepdeck_app_apply` 的兼容别名 |
| `deepdeck_app_restart` | 构建验证后登记完整重启；等当前 turn 持久化完成才执行 |

| Skill | 作用 |
| --- | --- |
| `deepdeck-vibe-app-development` | DeepDeck Vibe App 的通用源码开发方法：Host/Client/Page 边界、结构化 Agent effects、凭据和安全、Cordis lifecycle、包 invariant 与端到端验证 |

Skill 由 `app-conversations` 随包分发，并通过 source-bound Agent 的
`ctx.skills.register(...)` 注入，不写入用户的全局 Skill 目录，也不会出现在普通 App 对话中。
Creator system prompt 要求 Agent 在 App 源码工作前加载它；`creator-ready` 协议同时确认 preset、
apply guard、四个 tools 和 Skill，任何一项缺失都会拒绝打开 Creator Session。Skill 只保留从参考
App 中提炼的架构和失败模式，不携带特定站点的接口、数据模型、prompt、布局或功能清单。

工具没有 `sourceDirectory` 或 `appId` 参数，而是从 Session header 的 `cwd` 解析 App，并要求它与注册源码目录的 realpath 完全一致。因此 Creator agent 不能借此构建任意目录；从其他入口打开的 Creator Session 也会被拒绝。Host 在每个 Creator turn 前后对 Workspace 建立指纹；源码变化但没有成功 Apply 时，会继续当前 turn，第二次仍遗漏时由 Host 执行兜底 Apply。构建失败会留下可报告的失败状态，不会形成无限循环。

![Creator mode 调用 Bun Rebuild 并热重载 Cordis Host](images/apps-protocol/creator-rebuild.png)

图中 2007 ms 是一次本地参考构建结果，不是协议 SLA。结果中的 `hostReloaded: true` 只表示 Cordis Host 已切换到新输出；Client HMR 没有确认协议，因此结果明确标为 `not-observed`。Desktop 会刷新与 App pathname 匹配的独立窗口，并返回实际完成加载的窗口数。

## 7. 包与 patch 要求

一个可 Rebuild 的 App package 至少需要：

- `package.json.name` 与 Host 注册的 `packageName` 一致；
- 非空 `scripts.build`；
- `main` 指向构建后的 Host 入口；
- Client App 通过 `exports["./client"]` 和 `dsh.client` 声明 Client 入口及注入依赖；
- 类型出口和 `./invariant` 出口；
- App 自带 `cordis.patch.yml`，使安装后的 package 能被当前 profile 挂载；
- 生成的 `lib/` 不提交，但 `build` 必须能重建所有声明入口。

参考 manifest 片段：

```json
{
  "name": "@example/dsh-example-reader",
  "version": "0.1.0",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./invariant": {
      "types": "./lib/types/invariant.d.ts",
      "default": "./lib/invariant.js"
    }
  },
  "dsh": {
    "app": {
      "id": "example-reader",
      "title": "Example Reader"
    },
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime"],
      "platform": "web"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsdown --config tsdown.config.ts"
  }
}
```

最小自挂载 patch：

```yaml
- insert:
    - id: example-reader
      name: '@example/dsh-example-reader'
```

DeepDeck profile 提供 `app-conversations` 和 `bun-plugin-builder` 基础服务；App 自己的 patch 负责挂载 App Host/Client package。普通 Cordis plugin 也可以由外部 profile patch 挂载，但自带 patch 更适合 Market 安装和独立分发。

## 8. 本地 API 与安全边界

`app-conversations` 使用 `POST /api/deepdeck/app-conversations` 提供以下 action：

| action | 调用方 | 保护 |
| --- | --- | --- |
| `list-apps` | Apps 设置 | 返回非敏感 App descriptor |
| `create-app` | Apps 设置 | 要求 loopback + 同源；校验 App ID，并拒绝覆盖已有源码目录或已加载 App |
| `rebuild` | Apps 设置 | 要求同源；路径和命令只能由 Host 注册表决定 |
| `resolve-workspace` | App Client | 只解析普通 App Workspace |
| `resolve-creator-workspace` | Vibe Coding | 要求 loopback + 同源 |
| `begin-agent-action` | App Client | 要求 loopback + 同源；把 Host 注册的指定 tools 绑定到 App Session/Workspace |
| `read-agent-action-effects` | App Client | 要求 loopback + 同源；只读取本次 execution 的结构化 effects |
| `finish-agent-action` | App Client | 要求 loopback + 同源；卸载 tools 并清理 execution |
| `focus-main-window` | App Client | 只请求 Electron 聚焦主窗口 |

其他边界：

- API request body 上限为 32 KiB；
- App `id`、Workspace slug、package name 和绝对源码路径在 Host 注册时验证；
- action tool 的名称和 schema 只能来自 Host 注册表，并校验 Session、App 与 canonical Workspace 完全匹配；
- Builder 拒绝符号链接源码根目录、与 Builder state 重叠的目录和超限源码树；
- Browser 不得传入 build command；执行的只能是 preview 中审核过的 package `scripts.build`；
- `scripts.build` 仍以当前用户权限执行本地代码，Builder 不是 sandbox；只应 Rebuild 可信源码；
- App 页面应使用同源 Host route、严格 CSP 和 `no-store`，不把 credential 注入 HTML 或 BroadcastChannel。

## 9. 生命周期与卸载

所有注册都必须放在 Cordis `ctx.effect(...)` 或 slot lifecycle 中，并返回 disposer。Plugin 被禁用、热更新或卸载时：

1. `sidebar.apps` 入口自动消失；
2. Host/Client App definition 从注册表移除；
3. App settings slot 被释放；
4. BroadcastChannel listener 随 `app-conversations` Client 生命周期关闭；
5. action-scoped tools 随 turn、Agent 或 Plugin 生命周期卸载；
6. 已有 Workspace 和 Session 历史保留在磁盘，不因 Plugin 卸载而删除；
7. credentials 仍由 App credential service 的清理策略负责。

这使 App UI 跟随 Cordis plugin lifecycle，不需要 Electron 额外扫描 package 或维护重复状态。

## 10. 实现检查清单

- [ ] package 有 Host、Client、types、invariant 和 `cordis.patch.yml`
- [ ] `scripts.build` 可用 Bun 执行并生成声明的 Host/Client 入口
- [ ] Host 注册稳定 `id`、package name 和由 `import.meta.url` 推导的源码根目录
- [ ] Client 注册 `sidebar.apps`，成功打开后调用 `closeApps()`
- [ ] 有设置时使用 `settings.apps.item`，slot `id` 与 App `id` 一致
- [ ] App actions 使用固定 `actionId` 并验证 payload，不接受页面提供的任意 prompt
- [ ] App 数据回写使用 Host 注册、action 选择的 scoped tool；不要把 Assistant 最终文本隐式当成字段值
- [ ] 写入草稿的 UI effect 与发布、删除等有副作用的能力分离，并测试未调用 tool、重复 effect 和错误 payload
- [ ] 普通会话只使用 `~/DeepDeck/Apps/<slug>`，源码修改只使用 Creator Workspace
- [ ] App UI 使用设计 token，同时检查 Light 和 Dark mode
- [ ] 凭据只进入 Host credential service，不进入 Session、Client state 或页面消息
- [ ] Rebuild 不接受浏览器或 agent 提供的源码路径和 shell 命令
- [ ] 覆盖注册/释放、Workspace 所属、消息状态、Rebuild 可用与失败回滚测试

## 参考实现

- [Apps Host/Client contracts](../plugins/app-conversations/src/contracts.ts)
- [Apps Host registry 与本地 API](../plugins/app-conversations/src/index.ts)
- [Apps Client registry 与消息协议](../plugins/app-conversations/src/client/index.ts)
- [Apps 设置 section](../plugins/app-conversations/src/client/AppsSettingsSection.tsx)
- [Creator mode tools](../plugins/app-conversations/src/creator-tools.ts)
- [Vibe App development Skill](../plugins/app-conversations/skills/deepdeck-vibe-app-development/SKILL.md)
- [Bun Builder](../plugins/bun-plugin-builder/src/builder.ts)
- [Cordis Loader HMR adapter](../plugins/bun-plugin-builder/src/index.ts)
- [Hacker News Reader 参考 App](https://github.com/jo32/dsh-hackernews-reader)
