# 实现依据与文档维护

这份文档以当前源码为主，历史设计和测试报告为辅。外部 Agent 官方手册可解释其产品本身，但不应替代对 OneLinkAI 实际写入行为的核对。

## 章节与源码对应

| 主题 | 实现位置 | 关键入口 |
| --- | --- | --- |
| 窗口、IPC、生产接线 | `electron/main.cjs` | whenReady、withKey、onelink:* handlers |
| 页面交互与后台检查 | `src/DesktopApp.jsx` | refreshLocal、run、checkInBackground、配置表单 |
| 登录窗口 | `electron/platform-login.cjs` | login、logout |
| 平台请求 | `electron/platform-live.cjs` | call、refresh、scope、list、get、models、requests |
| 会话与本地文件加密 | `electron/session-store.cjs` | createSessionStore、load/save/clear |
| BYOK存储 | `electron/local-providers.cjs` | createPersistentLocalProviderStore、selectModels、serial |
| 拉模型与分类 | `electron/provider-models.cjs`、`src/ModelImportDialog.jsx` | fetchProviderModels、category、onConfirm |
| Agent发现与版本 | `electron/agents.cjs` | locate、detect |
| 安装能力、执行与回滚 | `electron/installer.cjs` | installationPlan、ensureRuntime、install |
| 安装源与PATH | `electron/install-environment.cjs` | probeRoutes、configurePath |
| 下载 / 专用安装 | `electron/desktop-installer.cjs`、`grok-installer.cjs`、`hermes-installer.cjs` | installDesktop、installGrok、installHermes |
| 代理与命令执行 | `electron/install-network.cjs`、`install-command.cjs` | createProxyBridge、createInstallCommand |
| 版本判断与升级计划 | `electron/agent-updates.cjs` | latest、target、check、plan、upgrade |
| 卸载与授权 | `electron/uninstaller.cjs`、`uninstall-authorization.cjs` | plan、uninstall、runAuthorized |
| 配置生成 / 文件事务 | `electron/agents.cjs` | build、publicPlan、preview、apply、restore |
| 参数能力 | `electron/model-settings.cjs`、`src/client-capabilities.json`、`client-effort-levels.json` | validateModelSettings、settingsForClient |
| 本机只读查看 | `electron/config-inspector.cjs`、`src/ClientConfigViewer.jsx` | inspect、sanitize、displayContent |
| API小请求验证 | `electron/agents.cjs` | testConnection |

## 自动生成的部分

`node scripts/generate-product-docs.mjs` 使用临时目录、虚构服务地址和Key、模拟的版本命令返回值，调用生产配置适配器生成15个Agent页的默认 / 高级配置示例。它不打开真实账号、不执行收费推理、不写真实用户配置。

`node scripts/generate-product-docs.mjs --check` 比较当前页面与适配器输出，发现不一致即失败。该检查能发现字段示例漂移；描述“为什么这样做”的手写文字仍需人工审阅。

参数能力矩阵同样从当前JSON能力表生成，由 `scripts/update-doc-capabilities.mjs` 维护。

## 推荐的修改流程

1. 修改产品能力或适配器时，先核对实际行为及失败路径。
2. 更新对应手写章节和生成器中的Agent解释。
3. 运行 `npm run docs:generate` 更新示例与能力表。
4. 运行 `npm run docs:check` 检查生成一致性、页面与本地链接。
5. 运行 `npm run docs:build` 检查站点构建与失效链接。
6. 页面布局变化时，在桌面和窄屏检查导航、表格、代码块与搜索。

## 真实验证与示例的区别

单元测试可以在临时HOME验证真实文件写读与回滚；网络模拟能验证协议处理；真实Electron测试能验证IPC与页面；真实厂商安装或真实模型请求才证明对应环境和服务可工作。它们互补，不能相互冒充。

历史报告：`docs/installation-validation.md`、`docs/agent-updates.md`、`docs/uninstall-test-report-2026-10-29.md`。其中日期、当时版本和已知缺项必须保留上下文，不把旧记录重写成今天重新验收。

## 来源冲突时按什么判断

依次核对：当前生产启动接线 → 实际被调用的函数 → 当前自动化验证 → 历史设计 / README。旧钥匙串模块仍在仓库就是典型例子：模块存在和测试通过，并不代表当前登录 / BYOK仍用它。

本产品README已同步纠正明显过时的登录与Zed说明；历史设计文件作为历史资料保留。外部Agent版本变更导致格式失效时，应停止声称兼容，更新适配和文档后重新验证。
