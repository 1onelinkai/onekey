# 本地路径、网络与接口清单

## 路径中的符号

`~` 表示当前用户 home，`userData` 表示 Electron 分配的数据目录。macOS 开发源码运行本项目通常为 `~/Library/Application Support/onelink-desktop-demo`；打包版本受应用名称 / 标识影响，应核对实际运行的版本，不假设两者自动共用。

下方均为行为说明，不是在指导用户直接删除整个目录。清理前先理解哪些文件含 Key 和备份。

## 工作台数据

| 路径 | 内容 | 清理 / 复制影响 |
| --- | --- | --- |
| `userData/platform/session.local.enc` | 平台登录会话 | 删除后需重新登录 |
| `userData/platform/session.local.key` | 对应解密密钥 | 只丢 Key 会使原密文不可解 |
| `userData/local-providers/session.local.enc` | BYOK 服务商、Key、模型、默认选择 | 删除后服务商列表消失 |
| `userData/local-providers/session.local.key` | BYOK 解密密钥 | 与密文一并保管 |
| `userData/agent-config/history.json` | 文件配置操作记录 | 不是模型对话 / 平台请求日志 |
| `userData/agent-config/backups/<ID>/*.bak` | 原始配置备份 | 可能含明文旧 Key |
| `~/.onelinkai/managed/runtime` | 独立 Node | 共享给托管客户端 |
| `~/.onelinkai/managed/clients` | npm prefix | 多个托管包共享 |
| `~/.onelinkai/managed/bin` | 命令 shim 与 Grok 程序 | 在用户 PATH 中 |
| `~/.onelinkai/managed/cache` | npm 缓存 | 安装速度与复用相关 |
| `~/.onelinkai/managed/downloads` | 桌面包缓存 | 支持续传，最终核对哈希 |
| `~/.hermes/hermes-agent` | Hermes 源码与程序环境 | 卸载与用户资料区分 |
| `~/Applications/*.app` | 工作台安装的 macOS 桌面应用 | 系统 `/Applications` 可能另有一份 |
| `~/Library/Logs/OneLinkAI/startup-error.txt` | 部分 macOS 发行启动失败报告 | 包含启动诊断，已做有限模式脱敏 |

原生启动器报告发生在正式 macOS 包的特定路径，不表示每次源码启动都会生成该文件。

## 会修改哪些 shell / 环境文件

macOS zsh：`.zshrc`、`.zprofile`；bash：`.bashrc`、`.bash_profile`。使用标记块，原文件修改前保存到 managed 下的随机备份。Windows 修改用户环境变量 Path，并在 managed 中保存旧值 JSON。

Agent 自己的路径见[15 个 Agent 总表](/reference/agents/)。PATH 配置与 Agent API 配置是两类不同写入。

## 平台 API（当前实现）

以下为相对 `https://api.onelinkai.cloud` 的路径。它们是客户端实现依据，不是另行承诺的公开稳定 API 合约。

| 用途 | 方法与路径 |
| --- | --- |
| 登录窗口接入 | POST `/sso/client/token` 成功响应（窗口捕获） |
| 校验登录 | POST `/sso/client/getUserInfo` |
| 刷新 token | POST `/sso/client/refreshToken` |
| 组织列表 | POST `/user/user/userTenantList` |
| Key 列表 | POST `/user/user/apikey/page` |
| Key 详情 | GET `/user/user/apikey/detail` |
| 个人钱包 | GET `/user/user/wallet/getUserWalletByUserId/<userId>` |
| 组织个人钱包 | GET `/user/user/tenant/wallet/personal` |
| Key 授权模型 | GET `/v1/models` |
| 补充模型分类 | GET `/v1/public/models/grouped-by-month`，失败不替换授权模型列表 |
| 请求列表与详情 | POST `/log/user/call/list`；GET `/log/user/call/<id>` |
| 供应商 / 模型筛选 | GET `/log/user/call/supplierList`、`/log/user/call/modelList` |
| 类型筛选 | GET `/user/user/dictionary/dict/model_type` |

## 网络目的地按操作区分

| 操作 | 可能访问的服务 | 会带什么 |
| --- | --- | --- |
| 官网登录 | 官网、SSO 与允许的第三方登录域名 | 用户在登录窗中的认证交互 |
| 平台组织 / Key / 日志 | OneLinkAI API | 平台 token、用户与组织范围 |
| BYOK 拉取模型 | 用户填写的服务商 | 服务商 Key、分页参数 |
| 连接测试 | 所选服务商 / 平台 | Key、模型 ID、固定短测试文本 |
| 版本检测 | npm 官方与镜像、GitHub API、Cask、厂商接口 | 包名、应用 / 架构等查询信息，不需要模型 Key |
| 程序安装 | Node/npm 源、官方 CDN、GitHub/代理、PyPI等 | 下载请求，子命令环境可能使用代理凭据 |
| Agent 实际对话 | 由写入地址决定 | 由目标 Agent 发送会话、工具上下文与模型 Key |

文档站自身是静态站，启用本地搜索，没有配置远程搜索服务或统计脚本。浏览器仍会按需请求部署站点的静态资源。

## 版本 / 安装源中的主域名

Node：`nodejs.org`、`npmmirror.com`、`mirrors.huaweicloud.com`；npm：`registry.npmjs.org`、`registry.npmmirror.com`、`mirrors.cloud.tencent.com`；Cask：`formulae.brew.sh`；WorkBuddy：`www.codebuddy.cn` 与 `download.codebuddy.cn`；Grok：`x.ai` 与官方 GCS；GitHub 及所列代理用于源码与发布资源；Hermes Python 镜像为 `pypi.tuna.tsinghua.edu.cn`。

依赖下载可能访问包自身声明的其他地址，不能把上表当作已穷尽所有第三方安装脚本的网络 allowlist。精确源和安装器变动以源码与实际日志为准。
