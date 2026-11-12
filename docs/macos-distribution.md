# macOS distribution verification

The application includes Electron, Node.js, and production modules. Recipients do not need a development environment. The arm64 artifact supports Apple Silicon, including M2; the bundled Electron runtime requires macOS 12 or later.

The previous package explicitly disabled signing (`mac.identity: null`). Verification reported `code has no resources but signature indicates they must be present`. Development packages now use ad-hoc signing with Electron JIT and library loading entitlements, so the bundle has a consistent resource seal.

Release builds now use Developer ID Application signing for team `7HHXUC392K`, hardened runtime, and electron-builder notarization. The matching private key must be available in the local keychain.

Build and check the actual archive:

```sh
APPLE_KEYCHAIN_PROFILE=onelink-notary npm run desktop:dist-mac-release
npm run desktop:verify-mac
```

The verifier defaults to the final notarized DMG for the current package version. It mounts that DMG read-only, checks its embedded app signature, requests launch through LaunchServices, then copies the app outside the repository and checks rendered startup with a fresh profile and system-only PATH. It also accepts an explicit .app or ZIP path. These checks run on the build machine and do not establish that startup succeeds on a different machine.

Notarization credentials are stored in the local keychain profile `onelink-notary`. Require the build log to report notarization success: electron-builder may skip app notarization if credentials are absent. The release command signs and notarizes the DMG separately, staples its ticket, and writes the final file to `release/distribution/`. Before delivery, also run `xcrun stapler validate release/mac-arm64/OneLinkAI.app` and `codesign --verify --deep --strict release/mac-arm64/OneLinkAI.app`.

Local `spctl` assessment is not evidence of public distribution readiness if its output says `override=security disabled`. Do not disable recipient security settings or remove quarantine as a packaging fix.

## 0.3.1 凭据存储验证

macOS 主进程通过 Security.framework 使用应用自己创建的密钥，并在启动早期禁止钥匙串交互界面。验证签名应用时同时检查两个独立进程间的加密数据持久化：

```sh
npm run desktop:verify-mac -- release/mac-arm64/OneLinkAI.app
```

若系统拒绝访问，不允许回退为交互式密码请求或明文存储。旧版凭据能静默读取则迁移；不能读取则保留 `.legacy-<uuid>` 原件，并提示重新登录/重新录入服务商。详情见 `docs/plans/2026-11-10-noninteractive-credentials.md`。


## 0.3.2 启动入口与发行验证

macOS 发行命令从缓存或官方源取固定版本 Electron ZIP，校验 `build/electron-runtime.json` 中来自官方 SHASUMS256.txt 的 SHA256 后重新解包。构建不再使用 node_modules 中已解包的 Electron.app。

应用使用原生启动入口，捕获运行时进程创建失败、异常退出和信号。正常用户只需要安装并双击。若运行时失败，原生窗口提供“复制错误详情”按钮，并自动记录 ~/Library/Logs/OneLinkAI/startup-error.txt。不要求最终用户运行 Terminal 脚本。原生入口本身若被系统在执行前拒绝，应用内捕获无法覆盖这种情况；不能据此承诺所有问题都有弹窗。

此前的 `scripts/diagnose-mac-startup.command` 保留为开发人员可选工具，不再作为用户排障步骤。故障机的失败尚未复现或解释前，不能以本机启动成功宣称已修复。

原生入口只链接系统 AppKit/Foundation，原 Electron runtime 位于同一个 Contents/MacOS 内。所有 Mach-O 与嵌套 bundle 正常签名，普通数据由资源封印保护。钥匙串依赖的 Runtime 签名身份继续为 cloud.onelinkai.desktop / 7HHXUC392K。
