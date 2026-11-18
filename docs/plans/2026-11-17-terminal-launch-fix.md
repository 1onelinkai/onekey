# macOS CLI 终端启动修复

用户报告：同事在普通终端输入 gemini 可运行，通过 One Key 运行时出现 compinit 权限提示、compdef 缺失，最后 launch.command 路径前缀丢失。

原实现通过 open 将 .command 交给 Terminal。Terminal 在用户登录 shell 中送入命令，zsh 启动文件中的交互读取会抢占这段输入。截图显示先后丢失 /、v、a 等路径开头，CLI 尚未执行。

改为生成临时 .terminal 描述文件，CommandString 使用可执行 launch.sh 的原始绝对路径，RunCommandAsShell 为 true。Terminal 将脚本作为会话命令执行。该字段为 false 时仍会经过用户登录 shell，无法修复本问题。脚本使用 /bin/sh，准备检测到的程序目录、托管运行时、应用 PATH 和系统 PATH，再运行 CLI；退出后移除临时文件。不编辑用户 shell 配置或目录权限。

验证：11 项启动器测试通过，包含真正调用 Terminal 的可选集成测试（ONEKEY_TERMINAL_TEST=1）。测试确认 stdin 为 TTY、中文/空格/引号和 XML 特殊字符路径、配置环境变量、env node 查找以及临时文件清理。进程链为 login → /bin/sh launch.sh → CLI，不经过 zsh。桌面流程也已通过。

限制：本机通过不等于同事机器已经验证。新入口不会执行 .zshrc 等交互启动文件；只在这些文件中设置的代理、别名或其他环境不会自动加载。用户配置文件仍由各 CLI 正常读取。

## DeepSeek 和其他 CLI 复查

用户补充的 DeepSeek 报错仍显示 `onelink-agent-launch-*/launch.command ; exit;`，随后出现 compinit 交互提示和路径缺字。这是旧版启动入口的特征；当前入口只生成 launch.sh 和 .terminal 文件。当前本机 release/mac-arm64 应用中的 app.asar 已包含新入口，所有 CLI 共用该入口，DeepSeek 仅额外传入 --profile 参数。

真实 Terminal 集成测试现从客户端能力目录筛选所有支持 CLI 的客户端，覆盖 Claude、Codex、Gemini、Grok、OpenCode、OpenClaw、Pi、MiniMax、DeepSeek Harness 和 Hermes。每个客户端使用临时探针程序验证 TTY、工作目录、Node PATH、配置环境、参数以及父进程链，DeepSeek 验证自定义 profile 参数。20 项启动器测试全部通过（ONEKEY_TERMINAL_TEST=1），包含 10 个真实 Terminal 启动通道测试。这些测试验证 One Key 的启动通道，不等同于逐个验证第三方 CLI 内部功能。
