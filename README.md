# OneLinkAI Desktop

软件自身支持启动检查、用户确认下载完整安装包及确认重启覆盖安装，独立于 Agent 更新。macOS、Windows 后台接口见 [软件更新 API 规范](docs/software-updates.md) 和 [OpenAPI 契约](docs/software-update-api.openapi.yaml)。

macOS 仅发布一个 DMG，官网下载与自动更新共用；客户端验证后本地转换临时 ZIP 交给原生更新器，后台无需上传 ZIP。可在 `build/software-update.json` 配置现有 JSON 版本接口。

Electron 客户端，首页为数据概览和已安装 Agent；API Keys、配置记录、请求记录、模型服务商为独立页面。正常启动使用 `electron/platform-live.cjs` 连接真实平台；官网登录窗口由用户主动登录，主进程接收本次 SSO 令牌，通过 `session-store.cjs` 的本地 AES-256-GCM 文件存储保存到 userData/platform，不使用系统钥匙串。BYOK 服务商、密钥和模型使用相同机制保存到 userData/local-providers，支持跨重启恢复。加密 Key 与密文同用户目录保存，不能防御已能读取二者的程序。组织、Key、模型及请求记录使用官网现有接口，接口契约来自前端静态分析，真实账号返回值仍需联调。测试流程单独使用 `electron/platform.cjs` 模拟数据。

客户端不提供创建或删除平台 API Key 的功能；平台配置使用所选平台 Key，BYOK 则允许添加本地服务商密钥。平台完整密钥只保留在主进程，只有脱敏值时明确拒绝配置。请求记录通过 `/log/user/call/list` 拉取，每次最多 100 条；字段映射需真实账号验证，不伪造统计数据。退出登录会删除本地登录会话和独立官网会话，不撤销已经写入 Agent 的密钥。

## 产品文档站

完整用户说明与原理手册位于 [product-docs](product-docs/README.md)，使用独立依赖的 VitePress，包含产品理念、登录、BYOK、检测、更新、安装与卸载、配置覆盖和恢复、凭据数据流及15个Agent配置参考。先执行 `npm --prefix product-docs ci`，再运行 `npm run docs:dev`（本机5175端口）。`npm run docs:build` 生成静态站，`npm run docs:generate` 从当前适配器刷新示例与能力矩阵。

## 启动与构建

`npm run dev` 在 5174 端口启动桌面工作台的网页预览；Electron 使用相同工作台入口。产品介绍落地页已独立放在 [官网](官网/README.md) 目录，可单独安装依赖、运行与构建。首次执行 `npm --prefix 官网 install`，随后使用 `npm run website:dev` 在 5173 端口启动官网，`npm run website:build` 构建官网。官网交互演示仅使用页面内存，不读取或修改本机配置。

默认窗口为 960×720，支持缩放调整。系统状态栏常驻，菜单可打开窗口、检测客户端或退出；关闭窗口仅隐藏，退出请使用状态栏菜单或系统退出命令。

```sh
npm install
npm run desktop:dev
npm run desktop:pack
```

`npm run desktop` 构建并启动；`npm run desktop:dist` 生成当前平台安装包。macOS 正式打包使用 `APPLE_KEYCHAIN_PROFILE=onelink-notary npm run desktop:dist-mac-release`，完成 App 和 DMG 签名、公证后，发布文件位于 `release/distribution/`。详见 [macOS 分发验证](docs/macos-distribution.md)。

## 验证

```sh
npm test
npm run desktop:check
npm run desktop:test-flow
```

单元与集成测试在临时 home 下执行真实文件读写，不修改当前用户的 Agent 配置。Electron 流程测试通过真实 UI 和 IPC 执行预览、写入、历史记录和恢复。

## 配置适配

## 自动安装

首页切到“全部”，未安装客户端提供安装入口。Claude Code、Codex、OpenCode、Pi、Gemini CLI、OpenClaw、MiniMax Code、DeepSeek Harness 接入独立 Node.js 24.22.1+ LTS 环境：下载校验、依赖安装、日志、失败重试、版本运行校验及安装后检测。文件位于 `~/.onelinkai/managed`，不会替换系统 Node。macOS 的 VS Code、Zed、ZCode、Claude Desktop、WorkBuddy 使用真实安装包安装到 `~/Applications`，校验 hash、签名与架构，下载支持续传。详见 [安装验收记录](docs/installation-validation.md)，其中区分实测、模拟测试与尚未支持的环境。

安装前并行探测 Node 官方 / npmmirror / 华为云，以及 npm 官方 / npmmirror / 腾讯云线路，按有效响应延迟排序，失败时依次切换。此探测反映可达性与响应延迟，不代表完整下载带宽。Node 文件按共同 SHA-256 清单校验，优先采用可达的官方清单，官方不可达时使用镜像清单。npm 沿用包完整性校验，不修改用户全局 registry。

安装后自动配置当前用户 PATH：macOS 支持 zsh / bash，保留原配置和备份，以独立标记块更新；Windows 备份并修改用户 PATH、广播环境更新。检查持久化结果并验证命令可运行；已打开的终端需要重新打开。不自动执行用户 Shell 启动脚本。

安装矩阵覆盖 macOS ARM64 / Intel x64、Windows ARM64 / x64；32 位 Windows（ia32）明确不支持。macOS 需要 13+，Windows 需要 10+；Windows Claude Code / Pi 还会检查 Git。当前仅 macOS ARM 具备实机验证条件，其余平台尚未实机验证。桌面客户端暂提供官方渠道及未支持原因。

Hermes 接入官方分阶段安装器：先探测 GitHub、GitClone、GHProxy、GHFast、GitMirror 源码线路，固定提交并校验脚本；源码阶段失败切换线路，Python 依赖设置清华 PyPI 镜像，并有阶段超时。随后配置 PATH 并验证版本。macOS ARM 已完成真实源码、运行环境、依赖和 TUI / Web 构建安装验证。Windows 脚本适配尚未实机验证。跳过交互式模型设置、网关设置及浏览器 / 电脑控制可选组件。系统 Git / 开发工具不足时可能需要操作系统确认。

## 配置位置

| Agent | 写入位置 / 方式 |
| --- | --- |
| Claude Desktop | Anthropic 直连配置（受支持的 Claude 模型 ID） |
| Grok Build | 官方二进制安装及 Responses 配置 |
| Gemini CLI | settings.json 与 .env，Google Gemini 原生协议 |
| Claude Code | settings.json 的 env、默认及子 Agent 模型，Anthropic 协议 |
| Codex | config.toml 自定义 provider、模型与 bearer token，Responses 协议 |
| OpenCode | opencode.json / jsonc 的 provider 与 model |
| Pi | models.json provider、settings.json 默认模型与范围 |
| Zed | settings.json 模型定义；API Key 请在 Zed 内手动填写，工作台不访问系统钥匙串 |
| VS Code | 默认 Profile 的 chatLanguageModels.json 模型定义；随后在 VS Code 管理模型内保存 API Key |
| ZCode | v2/config.json（已核实的配置格式） |
| WorkBuddy | models.json 自定义模型，之后在应用内选择模型 |
| Hermes | config.yaml provider 与默认模型 |

参考 Magpie 对应客户端适配格式：https://github.com/yetone/magpie 。没有复制其源代码。

## 共用服务商与模型规格

所有应用共用本地服务商资料，支持备注、官网链接，以及与请求 ID 分离的模型显示名称。模型可保存上下文窗口和最大输出 Token；拉取模型保留手动资料。一键配置中的“高级模型参数”可临时覆盖本次配置，也可用于平台 Key。

全部 15 个应用均提供对应的原生参数配置。OpenCode、OpenClaw、MiniMax、DSH、ZCode 等已补齐上下文和输出；Claude、Codex、Pi、OpenClaw、Hermes 等提供各自支持的推理、子代理或压缩选项；Gemini 提供原生协议、模型拉取和思考预算；VS Code 写入模型定义并引导在应用内保存密钥。由客户端或服务端管理的参数会说明实际限制。完整矩阵见 [共用配置方案](docs/plans/2026-11-10-shared-provider-capabilities.md)。

## 行为与限制

- 检测以可执行文件或 macOS 应用包为依据，展示实际版本与路径。仅残留配置目录不判定为已安装。
- 支持常用 PATH、Homebrew、nvm、用户 bin 以及 OpenCode 和 Hermes 常用安装路径。自定义安装位置可能需要调整 PATH。
- 预览令牌有效期 10 分钟；写入前检查文件变化，配置文件限制为普通文件，拒绝符号链接。
- 自动备份与操作记录保存在 Electron userData/agent-config，文件权限 0600。原配置备份可能含凭据，不要公开分享。
- JSONC 修改保留注释；YAML 使用文档解析器。Codex TOML 保留设置值，但会重新格式化，原始字节可从备份恢复。
- 多文件写入失败会回滚；恢复前检查写入后的文件哈希，避免覆盖其他工具后续修改。
- 当前生产接线不向 Agent 服务注入系统凭据适配器；Zed 和 VS Code 的 API Key 由用户在目标应用内保存。旧钥匙串模块与注入测试仍在仓库，不代表当前自动调用。原始 Agent 配置与备份可能含明文凭据，不能因 BYOK 存储加密就公开分享。
- “文件已写入并校验”和“模型连接成功”分别展示。测试连接会真实请求所填服务并消耗少量额度；没有真实 Key 时不能验证实际模型调用。
- 重启客户端或新建会话后生效。VS Code、ZCode、WorkBuddy 的实际模型列表仍需在客户端内选择；VS Code 还需在管理模型中保存 API Key。
- 当前实际验证平台为 macOS；Windows/Linux 路径实现未经实机验证。
- 网页预览没有本机能力，不会伪造检测结果。请通过 Electron 使用完整流程。

## 本机配置文件查看

所有 15 个客户端的卡片提供“本机配置”入口，一键配置的高级参数区也可打开。读取实际用户配置，支持切换文件、查找参数、重新读取和复制脱敏内容；返回配置表单保留尚未提交的参数。

支持 JSON / JSONC / JSON5、TOML、YAML，覆盖主要设置和模型配置，以及已知的 MCP 配置、Claude Desktop / DSH / VS Code Profile。读取沿用配置目录环境变量；不要求安装客户端或绑定服务商。项目级配置和运行时环境覆盖不纳入此视图。

结构化内容经解析、脱敏和格式化，注释不展示；`.env` 仅展示变量名；认证文件不读取内容。缺失、无法解析、无权限或超大文件分别提示，不影响其他文件。此入口只读，不写回磁盘。
