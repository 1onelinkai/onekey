# 文档导读

这份说明书围绕一个问题展开：**当我在 OneLinkAI 点击按钮时，电脑和网络上实际发生了什么？**

## 如果你第一次使用

按[产品理念](/guide/philosophy) → [第一次配置](/guide/quickstart) → [你的 Agent 配置参考](/reference/agents/)阅读。完成后应能分清服务商、API Key、模型和客户端，并知道配置后是否还需要手动填写密钥或重启。

## 如果你已经使用过

| 想弄明白的问题 | 阅读位置 |
| --- | --- |
| 为什么有登录，也能不登录？ | [登录与组织](/guide/login)、[BYOK](/guide/byok) |
| 为什么明明安装了却检测不到？ | [检测原理](/principles/detection) |
| 软件怎么知道有新版本？ | [版本检测与升级](/principles/updates) |
| 会不会弄坏原来的 Node 和 PATH？ | [安装流程](/principles/installation) |
| 卸载会不会删会话？ | [卸载流程](/principles/uninstallation) |
| 配置是覆盖还是合并？如何恢复？ | [配置事务](/principles/configuration)、对应 Agent 页 |
| 密钥到底存在哪里？ | [凭据与本地数据](/principles/storage) |
| 为什么测试成功，Agent 仍然失败？ | [协议与测试](/principles/protocols)、[故障排查](/help/troubleshooting) |

## 如果你要审查实现

先读[架构与数据流](/principles/architecture)，然后对照[实现依据](/reference/evidence)中的文件与函数。Agent 页里的配置示例由真实适配器在临时目录生成，使用虚构密钥，不读取当前用户的配置。

## 如何理解文档中的措辞

**“支持”**表示代码提供该路径，不等于每种操作系统、架构和外部版本都经过实机验收。当前能力、自动化测试和实机验证范围见[能力状态](/reference/status)。

**“校验通过”**必须带对象：下载哈希、程序版本、配置文件回读、API 响应各自验证不同问题。

**“保留”**通常指保留非目标字段、会话和用户文件；同一个 OneLinkAI 管理节点的具体替换行为要查看各 Agent 页。不能把它理解为永远只新增一个字段。

**“默认值”**是适配器在未填参数时写出的值，或目标客户端自行采用的默认值，两者会分别说明。模型真实能力仍由服务商决定。
