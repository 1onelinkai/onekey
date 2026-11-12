# OneLinkAI 0.3.2 macOS 启动故障调查

调查日期：2026-11-10。

## 结论与边界

已在开发机复现一种足以解释用户截图的分发故障：对同一份、字节完全相同的已签名公证 DMG，改变下载隔离属性就能决定 Finder 是否允许启动。聊天工具分发是当前优先验证的原因；尚未读取同事实际下载文件的隔离属性，所以不能声称同事机器的根因已经被最终确认，也不能声称已修复 macOS 26.6.2 上的所有兼容问题。

这次没有修改应用程序、替换 Electron 或重打一个未经目标环境验证的版本。

## 可重复实验

原包 SHA-256：`1cc57a888d4bd76ef3765104a4a5f0b9c95b7370de7c8dcf248c6a1e8e4d84f8`。

实验只修改临时副本的 `com.apple.quarantine` 扩展属性，不修改原包字节、应用签名、用户数据或系统安全设置。标记由实验人为设置；不能把实验中的代理名称当成同事下载文件的真实来源。

| 临时副本条件 | 签名检查 | Apple 发行检查 | 从 DMG 经 LaunchServices 启动并渲染 | 拷出 .app 后启动并渲染 |
| --- | --- | --- | --- | --- |
| 普通下载对照标记 `0083` | 通过 | 通过 | 成功 | 成功 |
| 受限制标记 `0187` | 通过 | 通过 | 失败，`-10810` | 失败，`-10810` |

两份 DMG 的 SHA-256 一致。较早的 `0087` 实验也得到同样结果，拷出的应用继承 `0287` 标记。内核日志明确记录 `created without user consent`，拒绝执行 `OneLinkAI.app/Contents/MacOS/OneLinkAI`。这说明至少在本机复现中，失败发生于顶层启动器执行之前，不是网页、业务 JavaScript 或 Electron Runtime 执行后的异常。

`0083` 与 `0187` 不只相差一个位，因此表格本身不能单独证明某一个位的语义。结合 `0087` 对照、内核拒绝原因和下述公开案例，证据一致指向未经用户同意创建的下载文件所携带的硬隔离限制。

另测：通过系统“归档实用工具”解开带 `0087` 的外层 ZIP，得到的 DMG 仍带 `0087`。因此套一层 ZIP 不是可靠解决方法。

可重复脚本：`scripts/reproduce-mac-quarantine.mjs`。它会挂载临时副本、核验签名、调用 Apple 发行检查、经 LaunchServices 启动原包及拷出副本，并读取应用实际渲染结果，最后清理临时文件。

```sh
node scripts/reproduce-mac-quarantine.mjs '/绝对路径/OneLinkAI-0.3.2-arm64-notarized.dmg'
```

证据：

- `artifacts/distribution-diagnostics/quarantine-reproduction.json`：使用 `0083` / `0187` 的最新复现实验。
- `artifacts/distribution-diagnostics/0.3.2-quarantine-reproduction.json`：使用 `0083` / `0087` 的首次完整实验，包括挂载条件与继承标记。
- `artifacts/distribution-diagnostics/0.3.2-quarantine-kernel.txt`：本机内核的实际拒绝日志。
- `artifacts/distribution-diagnostics/zip-quarantine-extraction.txt`：系统归档工具解压后的属性。

## GitHub 反馈核对

### 与现象最接近的两个报告

1. [electron-builder #8509](https://github.com/electron-userland/electron-builder/issues/8509)：签名和公证成功，其他 Mac 报无法打开、底层 `-10810`。报告者最后定位到 MS Teams 传输；通过网页下载则正常。另有参与者报告 WhatsApp 类似现象。这个报告不是 macOS 26 才出现的。
2. [Tauri #14990 的 Feishu/Lark 反馈](https://github.com/tauri-apps/tauri/issues/14990#issuecomment-4110012488)：参与者报告签名公证完整的 DMG 经飞书传输后带 `0187`，发生同一个 `-10810`；改走浏览器下载解决。该反馈来自 Tauri 项目，支持“分发机制可能独立于 Electron”的判断。该参与者对标记语义的解释是用户报告，不能当成 Apple 官方 API 保证；本次本机实验另有内核日志佐证。

### Electron / electron-builder 的 macOS 26 问题

- [Electron #49522](https://github.com/electron/electron/issues/49522)：报告 Electron 39/40 在 Tahoe 初始化时 SIGTRAP。维护者曾建议用 Forge 做最小对照；后续有 MAS/App Sandbox 报告，讨论中关于根因也有争议。不能据此得出“所有 Electron 40 都无法运行 macOS 26”。我们的包是 Developer ID 分发，未启用 `com.apple.security.app-sandbox`；本次复现失败发生在启动器被执行之前，不能等同于该 V8 初始化崩溃。
- [electron-builder #9455](https://github.com/electron-userland/electron-builder/issues/9455)：M1、macOS 26.1、Electron 39.1 的签名后启动崩溃，堆栈包含 V8 CodeRange 内存预留失败。是不同阶段的错误，缺少同事的运行堆栈时不能套用。
- [Electron #55368](https://github.com/electron/electron/issues/55368)：Electron 45.0.0 在 macOS 26.6.2 的 GitHub Actions arm64 环境有渲染进程启动挂起报告，44.9.3 为报告者对照版本。其截图无系统拒绝窗口，主进程已运行；与本次复现不一致。该报告也不能证明 45.2.3 必然仍有该问题。
- [electron-builder #9615](https://github.com/electron-userland/electron-builder/issues/9615)：Tahoe 26.4 beta 的 HFS 挂载问题导致构建 DMG 失败。用户截图里 DMG 已能挂载，不能据此认定 HFS 就是根因，更不应只把 HFS 改成 APFS 就宣称修复。

公开报告和评论保存到 `artifacts/distribution-diagnostics/research-sources/`，便于复核。

## macOS 打包机制与本项目检查

需要分别验证四件事：

1. Mach-O 架构和最低系统版本决定程序是否具备运行前提。
2. 内外嵌套代码签名保护 bundle 的结构、代码身份和内容完整性。
3. Apple 公证及装订票据是分发检查的一部分，不等于保证所有系统都可以执行。
4. 下载后的隔离属性、LaunchServices、内核执行策略和 App Translocation 决定真实首次启动路径。扩展属性不是 DMG 数据内容的一部分，因此两个包的 SHA-256 一样也可能有不同启动结果。

本项目 0.3.2 的顶层启动器及 Runtime 均为 arm64、最低 macOS 12；主 bundle / 内嵌代码签名通过，app 与 DMG 公证票据已装订，独立 `syspolicy_check distribution` 返回成功。签名的 SDK/Runtime Version 与最低部署系统版本是不同概念，不能看到 SDK 26 就断言只能在 macOS 26 上运行。

Apple TN2206 明确区分签名检查与真实分发测试，并建议以实际下载的安装介质执行安装及启动验证。当前开发机 `spctl --status` 为 `assessments disabled`，之前 `accepted / override=security disabled` 不能证明启用 Gatekeeper 的新机器会放行。这是此前验证的盲区。不过本次受限制下载标记的执行拒绝，即使在该开发机上也成功复现。

本次已修正 `scripts/verify-mac-package.mjs`：

- 显示宿主 Gatekeeper 状态，不隐藏测试限制。
- 使用 `open --stdout / --stderr` 收集 Finder/LaunchServices 启动后的真实结果，必须确认页面渲染；不再把 `open -W` 返回 0 单独当成成功。
- 加入 Apple 独立发行检查与普通下载隔离条件下的启动测试。
- 提供 `--require-gatekeeper`，Gatekeeper 关闭时，严格发行验证必须失败。发行构建脚本已启用该选项，避免再次把开发机功能通过误报为发行批准。

参考：[Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)、[Electron 签名文档](https://www.electronjs.org/docs/latest/tutorial/code-signing)。`syspolicy_check help distribution` 自带说明也明确列出 Gatekeeper、XProtect、配置描述文件等检查。

## 当前系统与最新版本

| 项目 | 已确认情况 | 对此次问题的意义 |
| --- | --- | --- |
| 开发机 | Apple M1、macOS 15.7.3 | 与同事同为 arm64；Gatekeeper 关闭且已有开发使用记录，不能充当干净发行机器。 |
| 同事 | 用户反馈 M1、macOS 26.6.2 | 尚未取得实际系统 build 和下载副本属性；没有在这个系统版本上做实机验证。 |
| 最新 macOS | Apple 安全更新页截至 2026-11-10 列出 2026-11-09 的 macOS Golden Gate 27.2.1，Tahoe 分支为 26.7.3，Sequoia 为 15.8.3 | 26.6.2 不是当前最新版。没有证据表明升级系统是这次问题的必要修复。 |
| 当前项目 Electron | 40.10.6 | 不能仅从版本号判断启动失败根因；当前复现可在不替换 Electron 的情况下切换成败。 |
| 最新 Electron 稳定版 | GitHub `releases/latest` 返回 v45.2.3，发布时间 2026-11-04 | 官方只支持最近三个稳定大版本，40 需要独立规划升级；升级不能替代分发链修复。 |

参考：[Apple 安全更新](https://support.apple.com/en-us/100100)、[Electron v45.2.3](https://github.com/electron/electron/releases/tag/v45.2.3)、[Electron 支持策略](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)。本次未搭建 macOS 26 虚拟机，不能宣称已经验证 Tahoe 或最新系统兼容性。

## 处理建议

先保留同一份 0.3.2，改由 Safari/Chrome 下载网页中的原始 DMG；聊天工具只发送下载链接。若通过飞书网页版下载附件，应确认实际由浏览器保存文件，没有跳回桌面客户端代下载。仍应将应用安装到“应用程序”再启动。之前下载的 DMG 与已拷出的 app 可能保留受限属性，不能只反复打开旧副本。

可以先在用户自己的电脑接收一次同样的聊天附件，读取副本属性并复现，然后再用浏览器下载同一文件对照；无需让同事运行终端、脚本或输入密码。最终确诊仍需实际接收副本的属性，或浏览器重新下载后启动成功的对照证据。

不建议再次盲目换证书、换 Electron、增加启动器，或让最终用户关闭系统安全检查。若浏览器下载仍失败，再以真正的系统拒绝/崩溃证据继续定位，并在 macOS 26 的干净环境执行目标系统验证。
