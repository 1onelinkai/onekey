# OneLinkAI Desktop

统一管理 AI 编程工具的安装、模型服务商与本机配置。通过一个桌面工作台连接 OneLinkAI 平台或自带 API Key（BYOK），为不同 Agent 生成符合其原生格式的配置。

基于 Electron、React 和 Vite，当前版本为 **0.3.2**。

## 主要功能

- **Agent 管理**：检测本机安装、版本和路径，提供安装、更新、打开及卸载入口；CLI 在系统终端启动，桌面应用直接唤起。
- **统一模型配置**：管理服务商、API Key、模型名称、上下文窗口和输出限制，按各工具支持的能力写入推理、子代理、压缩等参数。
- **配置预览与恢复**：写入前预览变更，自动备份；多文件写入失败回滚，恢复前检查文件变化，避免覆盖后续修改。
- **本机配置查看**：读取 JSON、JSONC、JSON5、TOML 和 YAML，支持搜索、刷新和复制脱敏内容；认证文件不读取，`.env` 仅展示变量名。
- **平台工作台**：登录 OneLinkAI，查看组织、API Keys、模型和请求记录；平台数据使用真实接口。
- **本地服务商**：支持 BYOK 服务商及模型资料，跨重启保留；配置表单按目标应用显示可用参数及限制。
- **软件更新**：检查桌面客户端新版本，用户确认后下载完整安装包，再确认重启安装；与 Agent 更新相互独立。

## 支持的工具

| 类型 | 工具 |
| --- | --- |
| CLI / Agent | Claude Code、Codex、Gemini CLI、Grok Build、OpenCode、OpenClaw、Pi、MiniMax Code、Hermes、DeepSeek Harness CLI |
| 桌面应用 / 编辑器 | Claude Desktop、DeepSeek Harness Desktop、VS Code、Zed、ZCode、WorkBuddy |

不同工具的安装、更新、协议及高级参数能力有所差异。DeepSeek Harness CLI 和 Desktop 分别检测和配置，CLI 可选择 profile。Zed 和 VS Code 的 API Key 需在目标应用内保存；写入模型配置后，部分应用仍需手动选择模型或重启。

详细能力、配置位置及使用步骤见 [产品文档](product-docs/pages/index.md) 和 [Agent 参考](product-docs/pages/reference/agents/index.md)。

## 快速开始

开发需要 Node.js 和 npm。macOS 原生模块及发行打包还需要 Xcode Command Line Tools；签名、公证需要有效的 Apple Developer ID 证书与本机公证凭据。

```sh
git clone https://github.com/1onelinkai/onekey.git
cd onekey
npm ci
npm run desktop:dev
```

仅预览网页界面：

```sh
npm run dev
```

网页预览默认使用 5174 端口，本机检测、安装和配置能力需通过 Electron 使用。桌面应用关闭窗口后保留在系统状态栏，完整退出请使用状态栏菜单或系统退出命令。

## 验证与构建

```sh
npm test                    # 单元与集成测试
npm run build               # 编译本机模块与前端
npm run desktop:check       # Electron 页面启动检查
npm run desktop:test-flow   # 配置预览、写入与恢复流程检查
npm run desktop:pack        # 生成未封装的应用目录
npm run desktop:dist        # 按当前平台配置生成安装包
```

测试使用隔离的临时目录及虚构凭据，不应把测试成功等同于真实账号或全部操作系统的验证。当前具有 macOS Apple 芯片实机验证条件，Windows、Linux 及 Intel Mac 的能力需按平台另行验证。

### macOS 正式发行

在 macOS 上准备匹配的 Developer ID Application 证书及私钥，并将 Apple 公证凭据保存在本机钥匙串 profile 中：

```sh
APPLE_KEYCHAIN_PROFILE=your-notary-profile npm run desktop:dist-mac-release
```

发行脚本校验固定版本的官方 Electron 运行时，构建 ARM64 应用，完成 App 与 DMG 签名、Apple 公证和票据装订，并生成更新清单。

- 最终分发包：`release/distribution/OneLinkAI-<版本>-arm64-notarized.dmg`
- 更新文件：`release/software-updates/darwin/arm64/`
- 验证入口：`npm run desktop:verify-mac`

签名证书私钥与公证密码不随源码或安装包分发。正式发行配置中的签名身份需替换为构建者自己的证书。严格发行检查要求本机开启 Gatekeeper；当前存储自检入口也需随应用实现维护，不能只凭脚本退出状态判断全部验证结果。

请通过网站或网盘分发最终 DMG。已确认的分发经历中，聊天附件下载的隔离限制曾导致接收方无法启动，而改用网盘下载后正常。详见 [macOS 分发说明](docs/macos-distribution.md) 和 [排查记录](docs/macos-distribution-investigation-2026-11-10.md)。

### 软件更新服务

自动更新接口及部署约定见 [软件更新 API](docs/software-updates.md) 与 [OpenAPI 契约](docs/software-update-api.openapi.yaml)。可在 `build/software-update.json` 配置 JSON 版本接口；使用默认更新源时，需部署对应的更新清单及安装包。生成更新文件不会自动发布到服务器。

## 产品文档与官网

产品说明站使用独立的 VitePress 项目：

```sh
npm --prefix product-docs ci
npm run docs:dev             # 本机 5175 端口
npm run docs:check           # 示例、能力矩阵及链接检查
npm run docs:build
```

独立官网位于 [`官网/`](官网/README.md)：

```sh
npm --prefix 官网 ci
npm run website:dev          # 本机 5173 端口
npm run website:build
```

官网演示使用页面内存，不读取或修改本机 Agent 配置。

## 项目结构

```text
electron/       主进程、IPC、Agent 适配器、安装更新与测试
src/            React 工作台、交互组件及客户端能力定义
build/          图标、签名权限及运行时/更新配置
scripts/        开发、打包、签名、公证与验证脚本
product-docs/   用户说明与原理文档站
docs/           工程说明、接口契约与设计记录
public/         静态资源
官网/           独立产品官网
```

## 数据与配置边界

- 平台登录会话和 BYOK 服务商资料由主进程保存到 Electron `userData` 下的本地 AES-256-GCM 文件，当前生产路径不读取系统钥匙串。加密 Key 与密文在同一用户目录，无法防御已经能读取二者的程序。
- 写入 Agent 的凭据遵循目标工具的配置格式，目标配置和恢复备份可能含明文密钥，请勿公开分享。
- 退出平台登录会删除本地登录会话，不撤销已经写入 Agent 的配置或密钥。
- 检测依据可执行文件或应用包，残留配置目录不等同于已安装。自定义路径或运行时覆盖可能影响检测结果。
- 本机配置查看为只读视图，不包含项目级配置和所有运行时环境覆盖；脱敏后的内容也应在分享前自行确认。
- 文件写入成功与模型连接成功分别展示；连接测试会真实调用所选服务并消耗少量额度。
- 不提供平台 API Key 的创建或删除操作。真实平台接口的字段与权限行为需持续联调验证。

部分客户端配置格式参考 [Magpie](https://github.com/yetone/magpie)，未复制其源代码。
