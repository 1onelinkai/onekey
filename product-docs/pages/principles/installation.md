# 安装原理与完整流程

## 支持范围先看系统和来源

当前一键安装接受 macOS 13+（Darwin 22+）与 Windows 10+，x64 / ARM64。识别到 Rosetta 或 Windows ARM 环境时，会尽量使用实际硬件架构而不只使用进程架构。

Linux、32 位、旧系统拒绝该自动安装路径。桌面应用的一键安装目前仅 macOS；Windows 同名桌面应用给出原渠道说明。Windows 与 Intel 分支实现不代表已完成实机验收。

## 安装前检查

检查用户目录可写，并用临时独占文件验证后删除。磁盘至少需 2 GiB，Hermes 至少 5 GiB；这只是预检门槛，不是所有依赖永远只占这些空间。

同一安装服务一次只允许一个任务。若已检测到安装，普通安装不再重复覆盖，部分托管场景会补检查命令别名及 PATH。升级走另一套有旧程序备份的流程。

安装计划里的步骤用于解释操作；真正执行仍重新检查当前环境，不能把旧弹窗当作跳过验证的授权凭据。

## 路径一：8 个 npm 客户端

Claude Code、Codex、OpenCode、Pi、Gemini CLI、OpenClaw、MiniMax Code、DeepSeek Harness 使用独立管理目录：

```text
~/.onelinkai/managed/
  runtime/       独立 Node.js 和 npm
  clients/       npm --global --prefix 的独立安装目录
  bin/           工作台维护的命令包装脚本与别名
  cache/         npm 缓存
  downloads/     部分安装包缓存
```

### 下载运行环境

并行探测 Node 官方、npmmirror 和华为云的 Node 24 校验清单；运行时满足 **24.22.1 或更新的 24.x** 才复用。官方清单可用时，镜像条目必须与官方哈希一致；官方不可达时允许使用有效镜像提供的清单，这会把清单信任依赖转移到镜像，不能称为独立官方签名验证。

选择可用线路下载当前架构包，流式计算 SHA-256，比对后才解压，执行 Node 版本验证，然后替换 runtime。运行时压缩包上限 150 MiB；下载 5 分钟、解压 2 分钟、运行校验 30 秒等阶段有明确超时。

### 安装固定版本包

探测 npm 官方、npmmirror、腾讯云；官方有效时采用官方返回的版本，否则采用可用镜像。先固定版本，再按可达线路安装相同 `包名@版本`，不在重试时悄悄换一个版本。

独立 Node 执行 npm CLI，使用独立 prefix 和 cache，并为该命令传 `--registry`、重试和超时参数，不修改全局 npm registry。允许执行的依赖安装脚本由实现中的包名列表限定；这不是完整沙箱，也不是对所有依赖的人工安全审计。

安装后读取 manifest，核对包版本、bin 入口及其目录范围，再运行 `--version`。MiniMax 提供 `mcode` 别名，DSH 提供 `dsh` 别名。Windows Claude Code / Pi 会检查 Git for Windows，没有时提示用户先安装。

### 命令包装与 PATH

POSIX shim 设置托管 Node 所在目录到 PATH，再 exec 客户端；Windows `.cmd` 设置 PATH 后 call 原入口。它们让托管客户端使用工作台管理的 Node，而不是替换用户系统 Node。

macOS zsh 修改 `.zshrc` 与 `.zprofile`，bash 修改 `.bashrc` 与 `.bash_profile`；使用 `OneLinkAI managed PATH` 标记块去重更新，修改前保存备份，拒绝符号链接 / 非普通启动配置。会用干净 shell 仅验证注入片段，不执行用户完整启动脚本。其他 shell 不自动处理。

Windows 保存旧用户 PATH 到 JSON，修改用户级环境变量并广播变更，不覆盖系统级 PATH。已开的终端仍需重新打开。

### 失败时发生什么

某条 npm 线路失败会清理当前包入口再切换，全部失败显示日志。首次安装并不保证把所有运行环境、下载缓存、依赖或 PATH 修改都清空；它与有备份的升级回滚不是完全相同的事务。不要将“安装失败”理解成电脑所有字节与之前一致。

## 路径二：macOS 桌面应用

支持 Claude Desktop、VS Code、Zed、ZCode、WorkBuddy。前四者读 Cask 元数据，WorkBuddy 用官方更新接口。核对 HTTPS 下载域名、架构和 64 字符 SHA-256；下载包来自厂商 CDN，GitHub 下载失败可尝试列出的代理。

下载缓存按哈希命名，可验证完整缓存后复用，或通过 Range 续传；服务器不支持部分内容时重下。每次请求最多 20 分钟，安装包上限 2 GiB，最终必须通过完整哈希验证。

ZIP 用 ditto 解压，DMG 以只读方式挂载。安装前运行 `codesign --verify --deep --strict`，读取可执行入口，使用 lipo 核对 CPU 架构，再比较 `LSMinimumSystemVersion` 与本机系统版本。

通过后复制到 `~/Applications` 的临时应用包，再验证签名并 rename。普通安装不覆盖已有目标。签名完整性检查不是“已单独验证发布者身份与公证状态”的同义词；当前安装器没有对每个下载包再完成独立的厂商 Team ID 绑定或 Gatekeeper 联网评估。

结束尝试卸载 DMG。若卸载失败，会报告并保留仍挂载目录，不强行递归删除挂载内容。

## 路径三：Grok Build 官方二进制

从 xAI 官方端点查询 stable，构造当前系统架构文件名，主线路失败切另一官方 GCS 线路。验证 Mach-O / PE 文件头与架构，先在暂存目录运行 `--version` 精确核对目标，再独占复制到托管 bin 并配置 PATH。

当前代码没有下载独立签名清单或 SHA-256 清单；它使用 HTTPS、固定端点、文件格式、架构及运行版本校验。不能把它写成与 Node / 桌面安装完全相同的哈希认证链。下载上限 512 MiB；失败时清理本次发布的目标和暂存文件。

## 路径四：Hermes 分阶段源码安装

依次探测 GitHub、GitClone、GHProxy、GHFast、GitMirror 的 `main` 分支提交，选第一个可用的 40 位提交 SHA。GitHub API 可达时补充提交校对，但 API 不可达并不会强制终止，因此镜像成为来源的一部分。

按该 SHA 从 GitHub Raw、jsDelivr 或代理下载安装脚本。官方原文可达时要求所选脚本一致；不可达时根据脚本结构判断并记录 SHA-256，记录哈希不是对未知镜像内容的独立真实性证明。

调用脚本 `--manifest` / `-Manifest`，要求协议版本 1。按上游声明逐阶段执行，跳过需要用户输入的模型 / 网关配置，支持时跳过浏览器与电脑控制组件。repository 阶段 6 分钟、其他阶段 30 分钟，源码失败依次切换相同提交的可用镜像。

为 Git 使用本次临时 URL rewrite 配置，不改全局 Git；Python 依赖使用清华 PyPI，npm 用独立缓存。最终生成入口、设置 PATH、运行版本并重新检测。

首次安装跟随 **main 提交**，不等于稳定 Release；已安装 Hermes 的升级则调用 stable 更新器。环境、Git 或系统开发工具不足可能需要外部安装和系统确认。

## 代理与后台日志

主进程取系统代理信息，结合环境中的 HTTP(S)/ALL_PROXY 为 Git、npm、uv 等外部命令准备环境。SOCKS 场景可建本机 HTTP CONNECT 桥，结束释放连接；它不直接修改系统代理设置。

任务状态包含 client、phase、最近 100 条日志和 error。界面每秒轮询；关闭弹窗任务仍在进程中运行。当前没有持久任务恢复队列，退出应用不会保证下次从原阶段继续，桌面缓存续传也不等于整个任务自动续跑。

来源：`installer.cjs`、`install-environment.cjs`、`install-command.cjs`、`install-network.cjs` 以及各专用 installer。
