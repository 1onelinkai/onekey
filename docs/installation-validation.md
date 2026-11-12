# 安装验收记录

日期：2026-10-23。测试宿主：macOS 15.7.3 / Darwin 24.6，Apple ARM64。

## 结论边界

本次使用真实网络、真实安装包、真实进程执行，不把 mock runner 测试计为实装。
命令行安装位于 `/tmp/onelink-real-validation-20261023`，桌面应用位于各自临时 HOME 的 `Applications`。
没有用用户现有的客户端代替测试安装。命令行最终复检使用应用本身的 `createAgentService.detect()`，不只使用测试脚本中的检测器。

Windows x64 / ARM64、macOS Intel 没有实机验证条件；平台分支测试不能证明这些平台安装成功。32 位系统明确拒绝安装。
Grok Build 尚无经过确认的官方安装渠道，仍显示官方下载，不计入自动安装。
Windows 桌面安装尚未接入。Windows Claude Code / Pi 缺少 Git Bash 时会明确失败，目前不会自动补装 Git。

## 真实安装结果

| 客户端 | 本次版本 | 实装结果 | 检查 |
| --- | --- | --- | --- |
| Claude Code | 2.1.309 | 通过，67 秒 | 安装、版本、帮助入口、实际检测 |
| Codex | 0.164.0 | 通过，53 秒 | 安装、版本、帮助入口、实际检测 |
| OpenCode | 1.19.4 | 通过，41 秒 | 安装、版本、帮助入口退出成功、实际检测 |
| Pi | 1.4.0 | 通过，49 秒 | 安装、版本、帮助入口、实际检测 |
| Gemini CLI | 0.65.0 | 通过，54 秒 | 安装、版本、帮助入口、PTY 子进程、keytar 加载 |
| OpenClaw | 2026.10.6 | 通过，141 秒 | 安装、版本、帮助入口、esbuild / koffi 加载 |
| DeepSeek Harness | 0.2.1-rc.2 | 通过，63 秒 | 安装、版本、帮助入口、PTY 子进程、koffi 加载 |
| MiniMax Code | 0.6.12 | 通过，55 秒 | 安装、版本、帮助入口、SQLite 内存数据库执行 SQL；实际卸载通过 |
| Hermes | 0.22.5+7.gfab9b01 | 通过，426 秒 | 官方分阶段安装、依赖、TUI / Web 构建、版本、帮助入口、实际检测 |
| WorkBuddy | 5.8.3 | 通过，152 秒 | 国内更新接口、真实 zip、哈希、签名、ARM 架构、实际检测 |
| Zed | 1.25.2 | 通过，37 秒 | 官方 DMG、哈希、挂载、签名、ARM 架构、应用检测 |
| ZCode | 3.16.2 | 通过，133 秒 | 官方 DMG、哈希、挂载、签名、ARM 架构、应用检测 |
| Claude Desktop | 3.6556.2 | 通过，191 秒 | 官方 zip、哈希、签名、Universal 架构、应用检测 |
| VS Code | 1.143.1 | 通过 | 首次下载触发旧 10 分钟限制；新版实测从 134.8 MiB 续传，492 秒后完成剩余下载、哈希、签名、架构和安装检测 |

上述耗时是当次网络与缓存条件下的观测，不是对所有用户的时长保证。前四项日志在最初并行验证期间被旧版 harness 的同名 results.json 覆盖，版本由随后真实命令复检记录；不伪造遗失日志。后续 harness 按客户端组合分别保存报告。

MiniMax 卸载后再安装实际遇到镜像同步延迟：官方最新为 0.6.13，npmmirror 返回 ETARGET，安装器自动切换腾讯镜像，仍安装同一固定版本 0.6.13，60 秒完成，SQLite 安装校验通过。这是实际故障切换，非模拟线路测试。最终实际系统版本由 sw_vers 返回 15.7.3，前述 15.6 为 Darwin 推断值，以实际值为准。

实装不等于完成模型调用。本次没有用真实平台密钥执行收费推理，也没有完整操作各桌面应用的登录和聊天界面。

## 修复的具体故障

1. 系统只启用 SOCKS 代理时，旧版本没有向 Git / uv / npm 传递代理。现转换为进程内、仅监听 loopback 的 HTTP CONNECT 桥，退出时关闭连接。
2. 无输出下载被空闲超时误杀。默认采用阶段总超时，仍支持显式空闲超时，并终止进程树。
3. Node 24 大版本符合但 minor 太旧。最低要求提高至 24.22.1，下载环境在替换旧环境前运行验证，替换失败恢复原目录。
4. npm 新版本跳过依赖脚本。现在对所需包显式列出脚本许可、输出安装脚本日志；实际补执行并测试原生组件。
5. Hermes 与 npm 客户端 PATH 共用同一标记。使用不同标记，避免互相覆盖，并测试两种安装顺序与重复配置。
6. 桌面应用从下载页改为实际下载、哈希校验、签名和架构检查、暂存复制再落到用户 Applications，拒绝覆盖现有应用。
7. 下载中断支持 Range 续传；服务端忽略 Range 时重下；续传位置不符拒绝；最终完整文件仍必须匹配 SHA-256。
8. 安装前检查用户目录可写、可用空间（CLI 2 GiB，Hermes 5 GiB）；系统 / 架构不支持时明确阻止。
9. MiniMax / DeepSeek 同时提供 `mcode` / `dsh` 标准命令和应用内部别名，卸载同时移除两个入口。
10. npm 先确定具体版本，再按同一版本切换镜像，避免不同镜像 latest 不一致。

## 自动测试用例

| 场景 | 断言 |
| --- | --- |
| mac ARM / Intel、Windows ARM / x64、ia32、旧系统 | 正确生成支持计划或拒绝原因；不算实机验证 |
| HTTP 环境代理、系统代理、ALL_PROXY、DIRECT | 原有环境保留，代理一致传递 |
| SOCKS 转 HTTP、HTTPS CONNECT | 使用本地 SOCKS 服务真实转发，目标域名不可直连仍成功；连接关闭 |
| SOCKS 不可达 | 返回 502，不返回成功隧道 |
| 官方 / 镜像探测 | 验证有效载荷，按延迟排序，拒绝伪成功响应 |
| 磁盘不足 / HOME 不可写 | 下载前失败，报具体原因，清理写入探针 |
| 不满足最低版本的 Node | 拒绝复用 |
| 下载 hash 不符 | 不解压，不替换现有运行环境，清理临时目录，释放代理 |
| 桌面架构、地址、hash 元数据错误 | 拒绝错误架构、非官方地址、缺失 hash；Universal 正常接受 |
| 桌面包损坏 / 签名错误 | 不写入 Applications，清理暂存 |
| 下载途中断线与恢复 | 保留已下载数据，下一次发送正确 Range，验证合并文件 hash |
| 静默安装、失败退出、超时 | 捕获错误、按总时限终止，静默短任务正常完成 |
| 重复安装 / 同时安装 | 已安装跳过；同一个安装服务拒绝第二个任务 |
| Shell 引号路径 / 重复 PATH / 不完整标记 | 正确转义、保留原文、备份、幂等、拒绝损坏标记 |
| PATH 共存 | Hermes 与 npm 路径同时保留，无重复 |
| 卸载 | 只删除所选托管命令，保留配置，拒绝未知外部来源 |
| Electron UI / IPC | 平台 Key 复用、模型获取、配置写入、恢复、托盘隐藏和恢复 |

## 复现

```sh
npm test
npm run desktop:check
npm run desktop:test-flow
ONELINK_TEST_HOME=/tmp/onelink-real-validation-20261023 node scripts/install-runtime-test.cjs
ONELINK_TEST_HOME=/tmp/onelink-new-validation node scripts/install-real-test.cjs claude codex opencode pi gemini openclaw deepseek-harness minimax hermes
ONELINK_TEST_HOME=/tmp/onelink-desktop-new-validation node scripts/install-real-test.cjs vscode zed zcode claude-desktop workbuddy
```

需要系统 SOCKS 时设置 `ONELINK_TEST_PROXY='SOCKS5 host:port'`，无需改全局 registry 或 Git 配置。此脚本的下载使用 devDependency 中的 undici，实际应用使用 Electron net.fetch 的系统网络。
`artifacts/install-validation` 保存复检与部分原始实装报告。桌面安装缓存保留在测试 HOME 的 `.onelinkai/managed/downloads`。

最新全量自动化测试：49 项通过。源码 Electron smoke、完整配置 UI flow，以及打包后的应用 smoke 均通过。发布目录为 `release/mac-arm64/OneLinkAI.app`，未签名，仅用于本地测试。

额外尝试打包版 `--flow-test`：功能流程已执行，但保存截图时尝试向只读 app.asar 写入 artifacts，最终退出 1。因此不计为打包版 UI flow 通过。打包版 smoke 退出 0，进程退出期间另有 Untrusted IPC sender 日志，尚需单独处理关闭期间的请求。

## 用户真实目录故障复现与修复（2026-10-23）

此前隔离 HOME 的安装通过，未覆盖用户已有 npm 缓存权限污染，不能作为用户机器安装成功的证明。
在实际 `/Users/pony/.hermes/hermes-agent` 复现了截图中的 npm 退出码 243（errno -13）：
`~/.npm/_cacache/content-v2/sha512/d1/83` 属于 root，npm rename 缓存文件时报 EACCES。
诊断日志：`/tmp/onelink-hermes-npm-diagnosis/2026-10-23T07_25_17_780Z-debug-0.log`。

Hermes 所有安装阶段现在显式传递大小写两种 npm cache 环境变量，使用
`~/.onelinkai/managed/hermes-npm-cache`。未删除、修改或 chown 用户全局 npm 缓存。
回归用例注入冲突的继承缓存设置，在 products 阶段启动真实 `npm config get cache`，确认使用托管缓存。
其余 npm 客户端已有显式 `--cache` 参数。

在用户原失败目录，固定原提交 `67491b50f7e5ef8be6e591d745b32758aa60c33e` 重新执行 products，
实际 npm ci、TUI 和 Web 构建通过，退出 0。`hermes --version` 返回
`0.22.5+9.g67491b5`，`hermes --help` 退出 0。直连时版本命令曾因上游 Git 标签查询等待 60 秒后返回，
因此不能将“版本查询慢”直接判为安装失败。

原 49 项自动测试全部通过；增强后的 Hermes 回归测试通过。
新版 `release/mac-arm64/OneLinkAI.app` 已重新打包，检查 app.asar 内含独立缓存修复，打包版 smoke 退出 0。
完整阶段重跑日志见 `artifacts/install-validation/hermes-user-home-recovery.log`。
完整重跑所有官方阶段及版本验证均通过。测试 harness 在末尾检测曾漏传必填 dataDir，
修正检测调用后返回 installed=true、version=0.22.5，结果保存于同目录 recovery.json；此错误不来自应用安装代码。
本次验证仍仅证明此 macOS ARM64 环境的结果。

## 尚未验收

- 多地区真实网络（纯国内无代理、PAC 按域名分流、企业认证代理、断网恢复）。本次使用当前本地网络及 SOCKS 代理，另有受控故障测试。
- Windows / Intel 实机、无开发工具的新系统、内存很低和只读用户目录下的完整真实安装。
- 每一个桌面应用的实际启动、交互和推理任务；本次桌面验收侧重安装文件、签名、架构和检测。
- npm 客户端仍共享 managed prefix；目前保护用户系统环境，但尚非每客户端独立事务化安装。
- 同机多份 VS Code 时，现有检测器可能同时返回系统安装的命令与用户目录安装的 bundle，展示版本取命令版本。本次安装包自身版本 1.143.1 已由 PlistBuddy 验证；现有系统命令为 1.141.0，不能把它作为新安装包版本证明。
- 一键补齐所有系统级依赖仍未覆盖。需要管理员授权、系统 Git / 编译工具等场景不能保证全程无人值守。
