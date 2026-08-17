# DeepDeck Development Guide

本文件适用于整个仓库。

## 核心原则：插件优先

DeepDeck 基于 DeepSeek Harness 构建。新增功能、界面定制和交互调整时，默认必须通过 Cordis 插件机制实现，而不是直接修改 Harness 或在 Electron 宿主中注入补丁。

- 优先在 `plugins/*` 中创建或扩展插件。
- 优先使用 Harness 提供的 slot、store、service、presenter、locale 和 runtime API。
- 通过插件自己的 `cordis.patch.yml` 完成服务替换、配置和装配。
- 插件需要同时声明 Host/Client 入口、类型出口和 invariant；生成的 `lib/` 不提交。
- 如果已有插件可以承载需求，应扩展该插件，避免在宿主中重复实现同一套状态或 UI。

## 禁止的实现方式

- 不要直接修改 `vendor/deepseek-harness`。该目录视为只读上游源码。
- 不要使用 `executeJavaScript`、`insertCSS`、`MutationObserver`、全局 DOM 查询或事件拦截来篡改 Harness 页面。
- 不要依赖易变的 DOM 层级、文本内容或自动生成的 class 名完成业务逻辑。
- 不要把可以由 Cordis store/service 管理的状态复制到 Electron 或另一套 React 状态中。

如现有 Cordis 扩展点确实无法支持需求，应先说明缺失的能力及原因，再采用最小范围的宿主改动；不要绕过插件系统做隐式 hook。

## Electron 宿主的职责边界

`apps/desktop` 只负责插件无法承担的原生桌面能力，例如：

- Electron 生命周期、窗口创建和原生标题栏配置；
- IPC、文件系统、系统菜单、协议和操作系统集成；
- Harness 子进程的启动、停止和健康检查；
- Cordis patch 与本地插件包的装配和解析。

页面布局、品牌展示、会话交互、模式选择等 Web UI 行为应放在插件中。

## 推荐开发流程

1. 先查找 Harness 已有的 Cordis service、slot、store 和插件入口。
2. 在 `plugins/*` 中实现功能，并保持 Host/Client 边界清晰。
3. 使用 `cordis.patch.yml` 将插件接入运行时。
4. 仅在需要原生能力或插件启动装配时修改 `apps/desktop`。
5. 为插件装配、状态条件和关键交互补充回归测试。

## 验证要求

提交前至少运行：

```bash
pnpm check
pnpm test
pnpm build
```

涉及 UI 交互时，还应在真实 Harness 页面或 Electron 应用中验证展开/收起、空状态/有数据状态以及按钮命中区域。
