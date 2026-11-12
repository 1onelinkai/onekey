# 0.3.2 macOS 启动与发行改造

## 需求与现状

使用者只需要正常双击应用。不将 Terminal、脚本运行、系统密码、隐私设置操作作为启动故障处理的前提。故障机目前仅返回 Finder 的通用“无法打开”，没有提供底层日志，因此尚不能确定根因。本机启动与公证结果不得被描述为故障机已修复。

## 决策

恢复由 electron-builder 从固定版本的官方 Electron ZIP 重新解包，去掉复用 node_modules 内已解包 Electron.app 的配置。Electron 固定为 40.10.6。已将本机缓存 ZIP 的 SHA256 与该版本官方 SHASUMS256.txt 对照一致：24e3b1a13ff7243f6b9036ebb743b6f62b19e4a925242d27eaa2be90de90a691。

应用顶层可执行文件使用仅依赖系统 AppKit/Foundation 的小型原生启动入口。原 Electron 可执行文件移到同一 Contents/MacOS 目录内的 OneLinkAI Runtime；其 Frameworks、Resources、ASAR、相对 rpath 和 bundle 保持原有结构。父进程保持运行并转发 Finder 再次激活事件、参数、stdout 和退出状态。

原生入口捕获子进程启动错误和最后 64 KiB stderr。异常退出时自动显示原生错误窗口，支持一键复制详情，错误文件存入 ~/Library/Logs/OneLinkAI/startup-error.txt，权限 0600。已知凭据字段在报告中脱敏。正常启动不写错误报告，不读业务凭据。用户无需执行诊断命令。

签名按 Mach-O、app 与 framework 处理，不为 ASAR、图标和 locale 数据附加独立代码签名扩展属性。数据仍由顶层资源封印保护。顶层原生入口使用空权限清单；Electron 和 Helper 保持现有 JIT 权限。Runtime 显式保留 cloud.onelinkai.desktop 的指定身份，使已创建的钥匙串条目仍认可同一个应用。N-API 库改为 MH_BUNDLE，避免把构建机绝对路径作为 dylib install name。

## 代价、失败模式与边界

会额外保留一个小型原生父进程，需要验证 Finder 激活、退出、参数与子进程读写，不能仅编译即交付。应用仍使用 Chromium 自身的 sandbox，没有添加 --no-sandbox 或放宽系统安全设置。

该入口能捕获 Electron 在 JavaScript 初始化前失败的 stderr/退出信号。系统若在原生入口本身执行前拒绝整个包，应用内部无法记录这个拒绝；不得承诺所有系统拒绝都可内置诊断。

替代方案包括让同事跑脚本（用户明确拒绝），以及仅在 JS 初始化后写日志（无法捕获 Electron 自身早期错误）。此次保留同一 bundle 的原生入口，避免额外安装独立诊断应用或增加使用步骤。

## 验证

先在隔离副本验证原生入口能加载现有 ASAR；再测试运行时缺失、异常退出、信号退出、参数透传和报告脱敏。正式签名包需验证 UI 启动、跨进程凭据读取、应用移动、完整配置流程、实际只读 DMG 中的 Finder 启动，以及父进程退出后没有遗留 Runtime。
