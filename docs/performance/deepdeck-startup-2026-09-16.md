# DeepDeck 1.0.47 启动复测

2026-09-16 在本机安装的 `/Applications/DeepDeck.app` 1.0.47 上复测。当前仓库 Harness 仍固定在 `c291e7961a515f6d7af9304e7fd1d257929aef26`；仓库源码和安装版本的 client-modules 都仍有重复组合脚本的路径，9 月 13 日的缓存优化尚未集成。

## 结果

使用已有 `tmp/startup-investigation/measure-recheck.mjs`，每次创建独立临时 DSH_HOME，使用安装版本的 Node、Harness 和插件配置，开启 Computer Use、关闭 Harness 遥测。按原版、优化版交替运行三轮。优化版通过仅作用于测试进程的加载器使用已有隔离优化模块，不改安装包或 vendor 源码。

| 轮次 | 原版引擎就绪 | 缓存优化引擎就绪 |
| --- | ---: | ---: |
| 1 | 10.902 秒 | 2.717 秒 |
| 2 | 8.133 秒 | 2.799 秒 |
| 3 | 7.799 秒 | 2.725 秒 |
| 中位数 | **8.133 秒** | **2.725 秒** |

中位数减少 5.408 秒，约 66.5%。这是调用 HarnessProcess.start 到引擎输出就绪地址的时间，不是点击应用到页面可交互时间；独立配置也不代表用户现有会话与自装插件的完整负载。

全部六次运行通过登录 cookie 读取首页及两个入口脚本，均返回 HTTP 200。没有执行完整 Electron 页面交互验证。隔离优化模块的 43 项测试本次重新执行全部通过。日志为 `tmp/startup-investigation/recheck-2026-09-16-*.log`。

## 原因与实施顺序

1. **优先修复前端插件组合缓存。** `packages/client/modules/src/index.ts` 的 `compose()` 在插件陆续注册时反复执行 `buildCombo()`，包括未变化的单插件脚本和启动批次。Source Map 构造、序列化、换行统计和字节编码因此重复执行。既有 CPU profile 与本次对照结果共同支持这是主要优化点。现有补丁见 [缓存补丁](./harness-client-modules-startup-cache.patch)，其设计、CPU 证据与失效测试见 [原始分析](./deepdeck-startup-2026-09-13.md)。应在可维护的 Harness 上游或分支中集成、更新 DeepDeck 固定版本。仓库要求 vendor 只读；此缓存位于 registry 私有实现，普通 Cordis 插件没有相应策略接口，不应把测试加载器作为生产方案。
2. **并行创建窗口和启动引擎。** `apps/desktop/src/main/bootstrap.ts` 目前先等待 `createWindow()` 完成，再调用 `harness.start()`；前者还等待启动页加载。改动需覆盖窗口创建期间引擎就绪、失败、退出和应用关闭的竞态，避免丢失状态或重复导航。收益尚未单独量化。
3. **将更新检查移至首屏就绪之后。** 当前启动引擎两秒后检查更新，可能与启动竞争资源。不是本次已证实的主要瓶颈，收益需要完整桌面计时确认。
4. **补齐启动阶段计时，再决定是否延后可选初始化。** 应覆盖 Electron ready、窗口显示、引擎 ready、客户端 ready 和最终 reveal。遥测初始化当前也被 await，但本次无数据证明其耗时显著；Computer Use 同样需单独对照，不能仅凭启用状态归因。

本次只增加复测记录，未修改生产代码、上游源码或安装应用，未提交或发布。未执行整仓 check/test/build；正式集成时必须执行这些检查并验证真实 Electron 首屏、重启与插件热更新。
