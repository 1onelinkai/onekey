# One Key 构建资源

此目录保存桌面应用图标、运行时校验信息及发行配置。

- `electron-runtime.json`：固定 Electron 版本及官方运行时校验值。
- `entitlements*.plist`：macOS 应用和原生启动入口的签名权限。
- `software-update.json`：可选的软件更新 JSON 接口地址。
- `icons/` 与 `icon.png`：窗口、托盘与安装包使用的图标资源。

签名私钥和公证凭据保存在构建机器中，不放入此目录。
