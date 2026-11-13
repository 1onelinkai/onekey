# Agent 检测原理

检测在本机完成。它不需要先登录平台，也不通过云端猜测你的电脑装了什么。

## 1. 按已知入口查找程序

每个客户端有命令名，例如 `claude`、`codex`、`code`、`mcode`、`dsh`。检测器按顺序枚举目录和命令名，找到第一个符合条件的文件就返回。

| 查找顺序 | 目录或来源 |
| --- | --- |
| 最优先 | `~/.onelinkai/managed/bin` |
| Windows Hermes | `%LOCALAPPDATA%/hermes/bin` |
| 系统环境 | 当前进程继承的 PATH 各目录 |
| 用户常用入口 | `~/.local/bin`、`~/.npm-global/bin` |
| 常用包管理器 | `/opt/homebrew/bin`、`/usr/local/bin`、`~/.cargo/bin`、`~/.bun/bin` |
| 应用专用入口 | `~/.opencode/bin`、`~/.grok/bin`、`~/.hermes/venv/bin` |
| macOS Codex / VS Code | 代码列出的应用包内 CLI 路径 |
| nvm | `~/.nvm/versions/node/*/bin` |

macOS / Unix 使用可执行访问检查和普通文件检查；Windows 尝试 `.exe`、`.cmd`、`.bat` 和无扩展名入口，以存在性为基础。

检测器不会运行用户 shell 的启动脚本来获得 PATH，也不会递归搜索整个硬盘。自定义路径如果不在进程 PATH 或已知目录里，就可能漏检。

## 2. macOS 另查应用包

对已知桌面应用名，在 `/Applications` 和 `~/Applications` 检查应用包。默认先系统 Applications，后用户 Applications。Codex.app、DSH 的应用包也有已知名称。

这里的“已安装”主要是入口 / 应用包存在，不是在每次扫描中对包做完整签名验收。配置目录存在只是附加信息，不作为安装成立的依据。

## 3. 读取版本

1. 如果是 OneLinkAI 托管 npm 安装，优先读托管包的 `package.json` 版本。
2. 其他命令入口尝试 `--version`，超时 4 秒，输出上限 8192 字节，从输出中提取版本样式。
3. macOS VS Code、Zed、ZCode、WorkBuddy、Claude Desktop 等从 `Contents/Info.plist` 读 `CFBundleShortVersionString`；有应用包但前一步无版本时也尝试该方式，超时 3 秒。
4. 失败可能得到“已安装，但版本未知”，不把空版本硬写成某个猜测值。

Windows `.cmd/.bat` 在通用探测阶段不通过 shell 直接执行；托管 npm 可以通过清单读版本，其他外部 shim 因此可能无法读到版本。

## 4. 同时返回安装证据和配置路径

每条结果包含 `id/installed/version/executable/bundle/configExists/path/evidence`。`path` 是该 Agent 的用户配置目录，不是程序目录。

- 找到程序或包：`installed = true`。
- 只有旧配置目录：显示残留证据，`installed = false`。
- 什么都没有：没有发现程序。

检测服务随后做本地来源判断，得到能否安装、能否更新和原因；该能力判断不等待版本网络查询。

## 多份安装为什么容易产生疑惑

同一电脑可能有 npm 版、原生版和桌面内置 CLI。托管入口优先；应用包与 CLI 也可能同时被发现。当前结果不是一份“所有安装实例清单”，而是每个 Agent 的代表入口及可选包路径。

因此在另一终端运行 `which codex` 可能看到不同路径；终端 PATH、Electron 继承的 PATH、当前搜索优先级都可能不同。卸载一份后重新扫描，可能又发现另一份，这会明确返回“仍检测到另一份客户端”。

## 检测的成本和边界

16 个 Agent 入口并行检测，但每个客户端的目录查找和版本命令仍有实际耗时。`--version` 通常是轻量操作，依然会执行第三方程序；检测不等于纯静态读取所有文件。

它不会确认 API Key 有效、不测试模型调用、不校验登录态，也不会确认当前正在运行的进程使用了刚读到的配置。来源：`electron/agents.cjs` 的 `locate/detect`。

DSH CLI 与 Desktop 是两个独立入口：CLI 只依据 dsh 命令判断，Desktop 只依据 DeepSeek Harness.app 判断；两者同时存在时分别显示安装路径和版本。旧版写入 desktop profile 的配置记录归到 Desktop，避免误显示为 CLI 已配置。
