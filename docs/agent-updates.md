# Agent 版本检测与升级

参考 CC Switch 的 ToolInstallRow、ToolUpgradeConfirmDialog 和 useToolManagement：先识别安装来源和路径，再展示当前 / 最新版本，确认目标后升级，后台任务不随弹窗关闭而结束。
参考地址：https://github.com/farion1231/cc-switch/tree/main/src/components/settings

## 行为

- 概览不再提供手动检测更新按钮。客户端扫描完成后异步检查已安装 Agent 的版本，每 15 分钟重试；窗口重新获得焦点且距离上次检查超过 5 分钟时也会检查。安装或升级期间暂停检查，任务结束重新扫描后检查。网络失败仅显示卡片提示，不触发全局错误或弹窗。
- 每张卡片显示当前系统的一键安装能力、当前安装来源的一键更新能力和限制原因。只有检测到新版且当前来源可管理时显示“更新至”按钮，点击后仍需确认更新计划。
- npm 包优先采用官方 latest 版本，官方不可达时使用可用国内镜像；下载固定同一版本。
- 桌面版本采用已有 Cask 元数据 / WorkBuddy 官方更新接口；Hermes 查询官方稳定版。
- 显示当前版、最新版、来源、目标路径，区分有更新、已最新、高于稳定版、当前版本未知、查询失败。
- 升级识别出的托管 npm、托管 Grok、标准 OpenCode 独立安装、Claude Code 原生安装、用户 Applications 应用及已校验官方来源的标准 Hermes 安装；外部安装给出渠道说明。
- Claude Code macOS 原生安装器通过 `~/.local/bin/claude` 到 `~/.local/share/claude/versions/<version>` 的真实路径识别；查询 Anthropic 官方 npm stable 包版本，调用 `claude update` 原生更新器，保存当前可执行文件副本和原链接，升级后版本不符时恢复旧入口及文件。
- npm 升级先备份共享 prefix 与命令入口；安装或验证失败恢复。其他程序和用户配置保留。
- 桌面升级备份旧应用，新包继续执行 hash、签名、架构、系统最低版本检查；失败恢复旧应用。
- Hermes 使用官方 `update --yes --channel stable`，独立 npm 缓存及系统代理，采用上游备份恢复机制。
- 不自动降级，不在未知版本时盲目升级，不自动更新外部包管理器的安装。

## 验证

真实 macOS ARM64：在独立 HOME 安装 Codex 0.163.0，通过正式升级服务查询 0.164.0、国内镜像下载、执行升级、运行返回 0.164.0，复查状态 current。
原始结果：`artifacts/install-validation/agent-upgrade-real.json`。
复现：`ONELINK_TEST_PROXY='SOCKS5 host:port' node scripts/upgrade-real-test.cjs`。

自动测试覆盖语义版本、预发布版本、官方版本优先、查询失败隔离、外部来源拒绝、路径变化拒绝、禁止降级和未知版本升级、Claude Code 原生更新与版本文件 / 链接回滚、npm 失败恢复与成功版本校验、桌面失败恢复。
原全量 53 项通过，补充桌面回滚和 WorkBuddy 四段版本号用例后版本升级 5 项通过，版本检测修改后 agents 20 项通过；Electron 配置 UI flow 通过。
线上实际查询 VS Code、Zed、ZCode、Claude Desktop、Hermes 的版本接口均得到有效版本；WorkBuddy 官方四段版本号单独保存构建标识，按应用三段产品版本比较。

尚未实际执行 Hermes 或桌面应用从旧版到新版升级，也未进行 Windows / Intel 实机升级。测试结果不能解释为所有客户端和平台实机验收通过。

## 2026-11-05 补齐

- OpenCode `~/.opencode/bin/opencode` 普通文件使用官方 `upgrade <版本> --method curl`，固定目标版本、保留旧程序，命令失败、版本不匹配或复检失败时恢复。
- 托管 Grok 从两个官方端点查询 stable，升级下载固定版本，失败恢复旧程序。
- 外部包管理器安装仍按来源管理，避免直接替换系统或包管理器文件。新增路径和失败恢复测试采用临时 HOME；未升级使用者本机 Agent。

## 2026-11-10 安装与更新支持范围

“自动检测”只查询版本；下载和替换程序由用户点击一键更新后执行。安装能力和当前已安装程序的更新能力分别判断。

| 应用 | macOS 一键安装 | Windows 一键安装 | 可由 OneLinkAI 一键更新的安装来源 |
| --- | --- | --- | --- |
| Claude Code、Codex、Gemini CLI、OpenCode、OpenClaw、Pi、MiniMax Code、DeepSeek Harness | 支持 | 支持 | OneLinkAI 托管 npm 目录 |
| Grok Build | 支持 | 支持 | OneLinkAI 托管 Grok 二进制 |
| Hermes | 支持 | 支持 | 通过官方来源和路径校验的标准源码安装 |
| Claude Desktop、VS Code、Zed、ZCode、WorkBuddy | 支持 | 需手动安装 | macOS 用户 `~/Applications` 下识别出的应用；Windows 请用原渠道或内置更新 |

额外支持 macOS 标准 Claude Code 原生安装器的程序，以及 macOS 的 `~/.opencode/bin/opencode` 普通文件独立安装。Homebrew、外部 npm、系统 `/Applications` 和非标准位置的应用使用原渠道更新，不直接替换。

以上是已实现的安装流程：要求 macOS 13+ 或 Windows 10+、ARM64 / x64；最终仍检查官方包的架构、签名和系统要求。Hermes 首次安装可能需要系统开发工具确认，Windows Claude Code / Pi 可能需要 Git Bash。Linux、32 位、旧系统未接入一键安装。

本机来源核验（2026-11-10，只读检查，未执行更新）：
- 可一键更新：Claude Code、OpenCode、OpenClaw、Pi、MiniMax Code、Hermes。
- 当前安装需使用原渠道：Codex、Claude Desktop、DeepSeek Harness、VS Code、ZCode、WorkBuddy。
- 尚未安装：Gemini CLI、Grok Build、Zed；可使用一键安装流程。

新增测试覆盖全部 15 个应用的本地能力矩阵、Windows 桌面限制、不联网获取能力、版本服务离线时保留安装来源，以及真实 Electron 渲染器后台检测和失败提示。
