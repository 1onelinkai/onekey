# 卸载原理与保留范围

卸载目标是移除**已确认归属的一份程序**，保留用户配置、会话、项目和共享运行环境。它不是“清空这个名字关联的所有文件”。

## 为什么先生成卸载计划

点击卸载时再次检测安装路径，识别来源，返回 target、kind、原因和必要命令。用户确认后提交 client 与 target，执行时重新计算计划；路径与弹窗不一致就拒绝，防止在两次操作间删错位置。

当前安装任务运行时，主进程阻止卸载。应用提示先退出目标 Agent，但并没有为所有客户端实现可靠的后台进程枚举与自动停止，不能把提示当作已经停止。

## 每种来源如何移除

| 来源 | 核实方式 | 动作 |
| --- | --- | --- |
| OneLinkAI 托管 npm | 命令路径位于托管 bin | 用独立 Node/npm 卸载指定包，移除命令 shim 与别名 |
| 托管 Grok | 目标为托管目录普通文件，真实路径匹配 | 程序移到废纸篓 |
| 标准 OpenCode 独立安装 | `~/.opencode/bin/opencode` 为预期真实普通文件 | 程序移到废纸篓 |
| Claude 官方原生安装 | 标准入口解析到 `.local/share/claude/versions/<版本>` | 程序目录移废纸篓，再移除入口 |
| Hermes 标准源码安装 | 路径、launcher、Git 来源与官方仓库匹配 | 源码与程序环境移废纸篓，移除入口 |
| macOS 应用包 | 已检测 `.app` 处于 `/Applications` 或 `~/Applications` | 调用系统 `shell.trashItem` |
| Homebrew 命令 | 真实路径归属 Cellar 且有 receipt | 用同一前缀下的 `brew uninstall <formula>` |
| 外部 npm（非 Windows） | manifest 包名、bin、真实文件与 npm prefix 一致 | 用原 Node/npm 和原 prefix 执行 uninstall |
| 其他或归属无法确认 | 缺少可靠证据 | 提示使用原工具，不直接递归删除 |

某些 npm / brew 安装可卸载，却不能由工作台一键升级；两套归属判断和操作条件不同，界面不应把两者混为同一能力。

## 哪些内容保留

Agent 用户配置、已写入 API Key、会话、项目、BYOK 服务商、平台登录、OneLinkAI 配置历史与备份保留。共享 Node runtime 和托管 PATH 标记保留，以供其他 Agent 使用。

托管 npm 卸载不把整个共享 prefix 或 `.onelinkai` 目录一并删除。Hermes 保留 `.hermes` 下用户资料，但移除其 `hermes-agent` 源码及程序环境。目标应用本身的卸载器行为若有差异，以计划显示的动作和实际目标为准。

## 权限和 macOS 授权

普通用户位置一般无需管理员。macOS 外部 npm 目录不可写或出现 EACCES / EPERM 时，可通过 osascript 申请管理员授权，仅运行由已验证安装归属重建的卸载命令。用户取消系统授权会明确报告取消。

这与系统钥匙串授权是两回事：不使用钥匙串不代表系统目录卸载永远不需要权限。Homebrew 不可写时会给出原命令，要求使用安装该软件的用户处理，不盲目使用 sudo。

## 卸载后如何确认

检查目标或入口已经消失，再调用正式检测器复查。如果检测到另一份安装，返回“已移除所选安装，但本机仍检测到另一份客户端”。这不代表刚才的卸载没发生。

废纸篓路径可由系统恢复，npm uninstall 的依赖移除并非同样可一键从废纸篓恢复。卸载流程没有像配置事务那样完整的跨步骤回滚；某一步失败时可能已移走程序但入口未清理，需要结合报错处理。

来源：`electron/uninstaller.cjs` 的 `externalTarget/hermesTarget/plan/uninstall`，系统授权参数处理见 `uninstall-authorization.cjs`。
