# 卸载验证记录（2026-10-29）

## 已执行

- 全量测试：158/158 通过（包含当时104项卸载测试）。随后新增4项Homebrew边界测试，卸载专项108/108通过。
- 8种CLI：Claude Code、Codex、OpenCode、Pi、Gemini CLI、OpenClaw、DeepSeek Harness、MiniMax。
- 每种CLI覆盖：受管安装三平台分支、外部npm安装、权限错误后系统授权、取消授权、执行失败、返回成功但程序未删除。
- 8种CLI均在隔离目录用真实npm进程卸载本地包夹具；验证包目录移除、共享Node/npm及用户数据保留。未下载/卸载用户的真实客户端。
- 7种桌面应用：Claude Desktop、Codex、DeepSeek Harness、Zed、VS Code、ZCode、WorkBuddy；隔离夹具覆盖移入废纸篓、失败、假成功。
- Electron原生shell.trashItem真实调用：将一次性测试.app移入系统废纸篓，并验证原路径消失、配置保留。
- Hermes源码安装及Claude官方独立安装：验证源码/程序移除及用户配置、共享工具保留。
- Homebrew：安装归属、调用原brew、执行失败、假成功、不可写目录、缺少安装凭据。
- 桌面构建及启动冒烟检查通过。

## 本次修复

- 补充 ~/.opencode/bin/opencode 官方独立安装卸载，仅将程序文件移入废纸篓。
- 对桌面应用、独立安装、Hermes和受管安装检查原入口是否确实消失，防止假成功。
- Claude versions目录重定向时拒绝扩大删除范围。

## 实机只读检测

本机Claude Code、Claude Desktop、OpenCode、OpenClaw、DeepSeek Harness、VS Code、ZCode、WorkBuddy、Hermes有对应卸载路径；OpenClaw需要系统授权。
ChatGPT.app内置Codex不视为可单独删除的安装。

## 未验证及限制

- macOS真实密码授权弹窗没有输入管理员密码实测；授权执行/取消/失败为模拟回归，AppleScript参数构造有转义测试。
- Windows/Linux仅模拟分支；没有对应系统实机验证。外部Windows安装管理器尚未接入。
- 不可写Homebrew目录仍阻止自动卸载，不能用root运行brew冒充支持。
- 未执行任何真实用户客户端的卸载；真实npm测试使用本地包夹具，而非厂商完整发行包。
