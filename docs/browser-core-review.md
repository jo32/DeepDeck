# Browser 核心浏览能力审查与实现

2026-09-05；以仓库锁定的 Electron 43.4.0 / Chromium 150 为准。

现有方向合理：Cordis 插件负责浏览器界面和站点 Agent，Electron 的
WebContentsView 承载真正的 Chromium 网页。影响可用性的主要问题在原生能力的
生命周期、状态同步和交互入口。本次补齐这些主链路，没有修改 Harness 上游。
书签、收藏和账号同步不在本次范围内；仍有下面列出的平台兼容及验收边界。

## 架构边界

| 层 | 职责 |
| --- | --- |
| `plugins/browser/src/client` | 地址栏、标签、查找、工具栏、下载列表、HTTP 登录提示和原有 Harness 对话 |
| Browser Host runtime | 站点与 Session 绑定、WebMCP 版本管理、受约束的 Client API |
| `native-contract.d.ts` / `native-response.ts` | 命令与响应类型、跨进程结果校验；凭据不进入快照 |
| `browser-window.ts` | 原生窗口、WebContents 生命周期、导航、页面事件、WebMCP/CDP 连接 |
| `browser-session.ts` | Chromium profile 的权限、缩放设置、下载对象与历史；原子写入本地状态 |
| `browser-shortcuts.ts` / `browser-page-menu.ts` | 平台快捷键和原生上下文菜单 |

缩放、音频、查找结果和下载进度以 WebContents / DownloadItem 为准。
React 只保存输入草稿、面板开关等界面状态。原生网页位于独立视图中，工具栏展开
后通过插件自身的测量更新页面边界；没有向 Harness 注入脚本或依赖其 DOM 结构。

## 审查发现与修复

| 优先级 | 原问题 | 实现结果 |
| --- | --- | --- |
| P1 | 关闭标签先删除状态，可能丢失未保存内容 | 等待 Chromium 的 beforeunload；“留在页面”保留 WebContents。取消后等待 renderer 完成响应再接受下一次关闭；合并重复关闭请求。窗口关闭复用此流程 |
| P1 | 页面查找没有反馈，原调用不能可靠启动搜索 | 实时查找、结果计数、前后匹配、Enter / Shift+Enter、Escape、Cmd/Ctrl+F/G 和 F3；按 requestId 丢弃旧结果 |
| P1 | HTTP / 代理认证没有输入入口 | 插件显示当前标签的用户名与密码提示；凭据只提交原生认证回调，页面变化后取消过期请求 |
| P1 | 权限每次重复询问，检查与申请不一致 | 同时实现 check/request handler；按顶层网站、请求 frame、权限种类隔离。摄像头与麦克风分别授权；记住允许/拒绝；站点信息可重置权限 |
| P1 | 下载仅显示文本，无法操作 | 暂停、继续、取消、打开、定位文件；正确顺序、状态和大小；未知总大小使用不定进度；活动任务不被列表截断；最近下载记录持久化 |
| P2 | 切换标签后缩放显示重置为 100%，与实际页面不同 | 25%–500% 常用档位、重置、快捷键、鼠标缩放事件；同一 host 的标签与原生缩放一致，重启后恢复 |
| P2 | 常用浏览操作缺少入口 | 独立浏览器工具栏：查找、缩放、打印、MHTML 保存、开发者工具、窗口全屏；链接/图片另存为、图片复制和新标签预览 |
| P2 | 地址识别和键盘操作不完整 | 本地 IP、IPv6、localhost、端口、国际化域名、查询参数、锚点；Alt+Enter 新标签、Escape 撤销输入；编辑期间不被页面更新覆盖 |
| P2 | 标签管理不便 | 拖动排序、菜单左右移动、静音与音频状态；保留中键关闭、复制、关闭其他/右侧、重新打开以及直接选择标签快捷键 |
| P2 | 重开窗口只有 URL，缺少导航历史 | 保存导航 entries 和活动索引，原子写入；恢复多个标签时不等待某个慢网站或认证完成 |
| P2 | 停止加载/下载响应可能误报加载失败 | 忽略 Chromium 的 ERR_ABORTED；真正的网络错误仍显示重试入口 |
| P2 | 网站生成的 blob 文档无法预览 | 支持拥有 HTTP(S) origin 的 blob 页面，保留 Harness origin 隔离；重启时不会恢复已失效的 blob URL |
| P2 | 原生 DevTools 断开后缺少恢复路径 | 关闭 DevTools 或重新加载时恢复协议会话及 WebMCP 发现 |
| P2 | 网页全屏、媒体和外部应用能力缺少宿主接入 | 网页全屏事件调整原生页面边界；系统屏幕选择器及原生选择菜单；受限的 mailto/tel/sms/会议应用链接经用户确认后交给系统；补齐 macOS 媒体用途说明和签名 entitlement |

Electron 43 的 `findNext` 映射到 Blink 的 `new_session`，初次搜索需要传 `true`，
后续匹配传 `false`。本次按锁定版本源码及真实页面结果验证，不能只根据参数名推断。
参见 [Electron 43.4.0 的 FindInPage 实现](https://github.com/electron/electron/blob/v43.4.0/shell/browser/api/electron_api_web_contents.cc#L3350)。

之前修复的 WebMCP 安装/取消顺序、唯一版本化执行入口、CDP 白名单和响应校验继续保留。
浏览器界面操作不改变运行中 Agent 的目标标签；生成工具与网站原生工具继续合并。

## 验证

```bash
pnpm check
pnpm test
pnpm build
node apps/desktop/scripts/verify-browser-native.mjs
node apps/desktop/scripts/verify-browser-native.mjs --page-menu
node apps/desktop/scripts/verify-browser-devtools.mjs
node apps/desktop/scripts/verify-browser-core.mjs
```

新增 core fixture 使用真实 BrowserFrame、原生 WebContentsView 和本地 HTTP 站点，
在独立临时 profile 中验证地址输入、面板收放与按钮命中、查找结果与快捷键、缩放、
静音、排序、MHTML 文件、原生下载的暂停/继续/取消/打开、HTTP 认证、beforeunload
的 Stay/Leave、blob 文档和实例重建后的窗口/历史/缩放/下载记录恢复。
Agent 服务保持空闲，未用真实用户账号或用户文件做测试。

原有两套 native / DevTools fixture 继续验证登录弹窗的 opener、共享登录状态、
后台链接、原始 POST、WebMCP 注册/调用/回滚/取消、跨站隔离和 CDP 权限边界。
权限单测覆盖跨站 frame、媒体类别隔离、持久化拒绝和导航后的过期授权。

本次机器处于锁屏状态：使用 `DEEPDECK_BROWSER_CORE_SKIP_FULLSCREEN=1` 跑完其余
core 流程，明确跳过系统级全屏。解锁后运行默认命令补验；不能把该跳过算作通过。
屏幕选择器、真实摄像头/麦克风、打印机及签名应用的系统授权同样需要真机验收。
媒体用途声明依据 [Electron 的系统权限要求](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos)。

## 仍然存在的能力边界

- 这是 Chromium 浏览器内核上的 DeepDeck 外壳，不能宣称所有网站都与 Chrome 等价。
  第三方身份提供商对嵌入式浏览器的限制、DRM/受保护视频、密码管理/自动填充、
  扩展及设备 API 需要分别验证或专门集成。
- `file://`、`javascript:`、任意 `data:` 顶层页面继续受限；允许普通网站、空标签和
  HTTP(S) origin 的 blob 预览。网站文件上传仍使用 Chromium 的原生文件选择流程。
- 下载历史可重开查看；进程退出前未完成的下载恢复为“中断”，不会自动重放请求，
  当前不提供跨进程断点续传。页面表单和 JavaScript 内存也不会由会话恢复自动重建。
- 屏幕共享的备用选择菜单提供视频源，未实现系统音频混流。异常 renderer 有错误页和
  重载入口，尚无 Chrome 式进程任务管理器。
- 窗口关闭逐个询问未保存页面；后续页面选择取消时，已经确认关闭的标签可重新打开，
  不承诺整组关闭的原子撤销。

后续应以真实网站兼容性和签名应用验收作为发布门槛，尤其是登录、支付页面跳转、
文件选择、长时间下载和音视频会议。不要用“使用 Chromium”替代这些验证。
