# 版本检测与升级原理

更新包含两个独立判断：**发布渠道是否有更高版本**，以及 **当前这份安装是否可以由 OneLinkAI 管理**。

## 自动检测何时发生

首页扫描完成后，渲染器异步请求已安装 Agent 的更新状态。之后每 15 分钟检查；窗口重新获得焦点且距离上次结束检查至少 5 分钟，也会检查。

当前安装 / 升级进行时暂停这段后台检查。网络失败显示对应卡片错误，不自动下载或替换程序；下次定时或聚焦再试。没有“检测到就静默升级”的行为。

## 最新版本从哪里来

| Agent | 查询渠道 |
| --- | --- |
| Claude Code | npm `@anthropic-ai/claude-code` 的 `latest` |
| Codex | npm `@openai/codex` 的 `latest` |
| OpenCode | npm `opencode-ai` 的 `latest` |
| Gemini CLI | npm `@google/gemini-cli` 的 `latest` |
| OpenClaw | npm `openclaw` 的 `latest` |
| Pi | npm `@earendil-works/pi-coding-agent` 的 `latest` |
| MiniMax Code | npm `@minimax-ai/code` 的 `latest` |
| DeepSeek Harness | npm `@deepseek-ai/dsh` 的 `latest` |
| Grok Build | xAI 两条官方端点的 `/stable` |
| Hermes | 官方 GitHub 仓库 `/releases/latest` |
| WorkBuddy | CodeBuddy 官方更新接口，按 darwin 与架构查询 |
| Claude Desktop、VS Code、Zed、ZCode | Homebrew Cask JSON 元数据，下载目标另校验官方域名与哈希 |

npm 查询并行探测官方、npmmirror 和腾讯云；官方有效时优先使用官方版本，否则使用可用镜像。不是取三者版本号中最大的一个。每条探测约束超时和返回结构；多数非 npm 版本请求超时 15 秒。

WorkBuddy 官方可能返回四段版本；当前截取前三段用于产品版本比较，另保留原构建标识。相同前三段的不同构建不会单独判为新版。

## 版本如何比较

使用 `semver`，移除开头 `v`；两段版本补 `.0`。无法解析时返回未知，不按字符串字典序比较。

| 内部状态 | 含义 | 当前卡片表现 |
| --- | --- | --- |
| `available` | 发布版本高于本机版本 | 可管理时“更新至”；其他情况“有新版本 · 原渠道更新” |
| `current` | 两者相同 | 已是最新版 |
| `ahead` | 本机版本更高 | 高于稳定版 |
| `unknown` | 任一版本无法比较 | 版本未知 |
| `error` | 查询、元数据或来源判断发生异常 | 版本暂未查到 |
| `unsupported` | 如非 macOS 桌面版本渠道未接入 | 通过原渠道更新 |

“已是最新版”仅能解释为与本次查询渠道一致。镜像 / Cask 有同步延迟，npm 的 `latest` 是发布者标签，不保证永远是稳定版。当前没有按本机 alpha/beta 渠道自动匹配专用 dist-tag。

## 哪些来源可以一键升级

| 安装来源 | 当前升级方式 |
| --- | --- |
| OneLinkAI 托管 npm | 指定包和目标版本，在独立 prefix 安装 |
| OneLinkAI 托管 Grok | 下载固定目标版本官方二进制 |
| macOS `~/Applications` 已知应用 | 备份旧应用后重新安装官方包 |
| macOS Claude 原生标准入口 | 验证符号链接到原生版本目录，执行 `claude update` |
| 非 Windows 的标准 OpenCode 独立普通文件 | 执行 `opencode upgrade <版本> --method curl` |
| 通过路径与官方 Git 来源校验的标准 Hermes 安装 | `hermes update --yes --channel stable` |
| 外部 npm、Homebrew、系统 `/Applications`、不明路径 | 使用原安装渠道 / 客户端内置更新 |

实际还会先通过平台与架构支持检查。当前安装来源是运行时判断结果，不能只按应用名字承诺“全部能更新”。

## 点击更新之后

1. 再次扫描和查询，要求明确有新版、可管理，且目标版本能解析。
2. 展示更新计划与路径，用户确认后启动后台安装任务。
3. 任务开始再次验证检测路径与预期路径一致；原生安装还检查真实文件 / 链接归属。
4. 按来源保留旧程序。npm 备份共享 clients prefix 及命令 shim；桌面 / Grok 先移动旧目标；OpenCode 复制旧文件；Claude 原生保留旧链接和程序副本。
5. 执行安装或官方更新器，运行并复检版本，要求达到预期目标。
6. 成功删除程序备份；失败尝试恢复。恢复失败会保留备份路径并报告，不将失败显示为成功。

Hermes 采用上游更新器的恢复机制，当前没有额外复制完整源码树。`--channel stable` 与其他安装流程固定版本的程度不同；执行后仍要比较预期版本。

## 需要了解的限制

- `claude update` 由上游选择目标，若 npm `latest` 与原生渠道版本不同，可能更新后校验失败并触发恢复。
- WorkBuddy 查询按三段比较，但桌面升级最后读取完整应用版本并与预期比较；上游格式变化可能导致一次失败并回退。
- Hermes 首次安装固定 main 提交，而更新查询跟随稳定 Release，二者不是同一条发布线，详见安装页。
- 版本请求成功不等于下载、依赖安装和目标 API 调用都成功。
- 应用没有自动降级：本机高于渠道版本时不执行升级计划。

实现依据：`electron/agent-updates.cjs` 的 `latest/target/check/plan/upgrade`、`electron/installer.cjs` 的升级分支、`src/DesktopApp.jsx` 的后台定时器。
