# Grok Build 应用内安装

官方依据：https://github.com/xai-org/grok-build ，https://x.ai/cli/install.sh 。
沿用官方 stable 指针及 grok-{version}-{macos|windows}-{aarch64|x86_64}[.exe] 二进制协议，官方 x.ai 和官方 GCS 回退线路。安装到 managed/bin，不执行远程脚本、不写用户 Grok 配置。验证二进制格式、架构及运行版本，验证失败不发布入口。临时目录始终清理，最终检测失败回滚。没有官方哈希清单，不能声称 SHA 校验。提供托管二进制直接卸载，保留配置。测试使用隔离目录及网络/运行器夹具；打包和 Electron 冒烟检查。
