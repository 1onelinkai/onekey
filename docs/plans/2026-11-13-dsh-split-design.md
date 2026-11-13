# DSH CLI 与桌面版拆分

保留 deepseek-harness 作为托管 npm CLI 的标识，新增 deepseek-harness-desktop 表示桌面应用。CLI 仅检测命令，桌面版仅检测应用包；版本、更新来源与卸载目标分别记录。桌面版暂无经过验证的自动安装和升级渠道，保留官方安装说明与应用内更新提示。

CLI 默认写入 profiles/web/cordis.patch.yml，允许选择启动时的其他 profile，拒绝路径穿越与保留名称 desktop。桌面版只写 desktop profile。两者共享 DSH_HOME 下的凭据文件，但 CLI 按 profile 使用独立凭据引用，避免覆盖桌面版 Key。旧版写入 desktop 路径的历史记录在读取时归到桌面版，保留恢复 ID 与原始备份。

验证覆盖单独安装、同时安装、版本独立、配置路径与凭据隔离、旧历史归属与恢复、升级来源、卸载目标以及真实渲染器配置流程。
