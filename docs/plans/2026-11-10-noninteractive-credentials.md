# macOS 凭据存储改造（0.3.1）

要求：用户保留本地登录和服务商密钥，OneLinkAI 的凭据读取不要求用户输入 Mac 登录或钥匙串密码。

## 实现

应用主进程加载 N-API 模块，并在 Electron ready 之前调用 `SecKeychainSetUserInteractionAllowed(false)`。禁止系统授权 UI 是进程级约束，访问被拒绝时返回错误，不回退到交互式读取。

新数据使用随机 256 位密钥、AES-256-GCM、每次独立的 96 位 nonce；格式标识参与认证。密钥由应用自身通过 Security.framework 创建，存入 `cloud.onelinkai.desktop.credentials.v1` 通用密码条目，默认 ACL 信任创建该条目的应用，不向任意应用开放。数据文件继续使用 0600 权限。密钥不写入配置目录，不根据机器序列号派生。

Windows/Linux 保留原 Electron 存储接口。macOS 登录会话、服务商文件和其中的嵌套 API Key、恢复备份全部改用新的适配器。主动配置 Zed 时读写 Zed 自身的凭据属于另一个接口，与 OneLinkAI 存储条目分开。

## 迁移与失败行为

旧版 v10 数据通过非交互 Security.framework 读取原条目，兼容 Chromium 的 PBKDF2-SHA1（saltysalt、1003 次、128 位）和 AES-CBC 格式。参考 Chromium 130 `components/os_crypt/sync/os_crypt_mac.mm`，以及本机 SDK 的 Security/SecKeychain.h。

能读取时先验证内容、转换服务商嵌套凭据、保留 `.legacy-<uuid>` 加密原件，再原子替换为新格式。原备份文件保持原样，恢复时仍可通过兼容解密器静默读取。

若旧密钥不存在或被拒绝，原会话/服务商文件移至 `.legacy-<uuid>`，显示迁移提示，允许重新登录、重新录入服务商密钥。此时无法恢复旧密文里的明文，不宣称无损迁移。损坏文件和新格式文件不会被自动重置。历史恢复备份在不可访问时返回错误并保留原件。

系统钥匙串锁定或拒绝新条目访问时，保存/读取报错，不弹密码框、不降级到明文、不覆盖无法解密的数据。正常使用前提是系统登录会话与钥匙串可用；使用者不需要为本应用填写系统密码。

## 构建与验证

`npm run build` 编译 arm64/x86_64 通用 N-API 二进制，需 Xcode 命令行工具和 Node N-API 头文件，可用 `ONELINK_NODE_HEADERS` 指定头文件目录。electron-builder 将 `.node` 解包并签名；保留 Developer ID 身份和 bundle identifier，更新不应更换身份或使用未签名版本覆盖。

`npm test` 验证密文认证、跨实例读取、旧服务商嵌套迁移、拒绝访问时归档保留和损坏文件保护。

`npm run desktop:verify-mac -- release/mac-arm64/OneLinkAI.app` 验证签名、隔离目录启动，并在两个独立的签名应用进程中创建和读取测试密文。测试使用独立的 `.selftest` 钥匙串条目，只保存随机测试加密密钥，不读取用户业务凭据。

`APPLE_KEYCHAIN_PROFILE=onelink-notary npm run desktop:dist-mac-release` 生成签名、公证并装订的 DMG。当前机器上的验证不等于已经在同事的 macOS 上完成测试。
