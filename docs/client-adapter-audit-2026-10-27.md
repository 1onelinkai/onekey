# OneLinkAI 客户端适配审计

审计日期：2026-10-27。审计范围是 OneLinkAI 自动检测、预览、写入和恢复逻辑。配置文件回读校验不等于客户端已经完成模型请求；本次没有执行付费推理。

API Key 页面同时读取独立的钱包接口，展示当前个人账户或组织空间的可用总预算；这项数据不从单个 Key 的 `quota` 推算。

## 结论

DSH 的问题不是孤例。不同客户端对协议、配置位置、字段名和密钥存储的要求不同，统一写入同一套字段会导致“配置成功但客户端不加载”，甚至启动异常。当前适配器只对有证据的格式自动写入；无法证明读取方式的客户端在界面中标为“暂不支持自动配置”，预览阶段直接拒绝且不创建目录。

## 适配矩阵

| 客户端 | 结果 | 依据与处理 |
|---|---|---|
| Claude Code | 自动配置 | `settings.json` 的 Anthropic 环境变量；仅允许 Anthropic 协议 |
| Claude Desktop | 自动配置 | Anthropic 直连入口，校验 Claude 模型 ID，完全退出重启后生效 |
| Codex | 自动配置 | 官方仓库 `config.schema.json` 的 `model_providers`, `wire_api=responses` |
| Gemini CLI | 暂停自动配置 | 官方配置使用 Google Gemini 原生协议，不能套用 OpenAI/Anthropic；`GEMINI_CLI_HOME` 是父目录 |
| Grok Build | 自动配置 | xAI 官方二进制，Responses 协议；安装、版本查询、升级接入 |
| OpenCode | 自动配置 | 官方 providers 文档；Anthropic baseURL 使用 `/v1`，OpenAI-compatible 使用 `/v1` |
| OpenClaw | 自动配置 | 官方 custom providers 文档；遵循 `OPENCLAW_CONFIG_PATH` / `OPENCLAW_STATE_DIR`，协议不再硬编码 |
| Pi | 自动配置 | 官方 `models.json` / settings 结构；保留已有配置并设置默认模型 |
| MiniMax Code | 自动配置 | 当前 npm 包源码使用 YAML `custom_provider`，不再写无效的 `config.json` |
| DeepSeek Harness | 自动配置 | 已验证 0.2.x desktop profile 的 Cordis patch 和 credential refs；CLI 其他 profile 需单独配置 |
| Zed | 自动配置（macOS） | 官方 OpenAI-compatible settings 与系统凭据接口；写入前后做钥匙串回读校验 |
| VS Code Custom Endpoint | 暂停自动配置 | 官方扩展 schema 要求 SecretStorage 引用，`Authorization` requestHeaders 明确不允许；当前未接入 SecretStorage API |
| ZCode | 自动配置 | 已安装 3.3.4 读取 `~/.zcode/v2/config.json`；移除不存在的 `provider_config.json` |
| WorkBuddy | 自动配置 | 已安装客户端读取 `~/.workbuddy/models.json`；同模型 ID 属于其他 vendor 时拒绝覆盖 |
| Hermes | 自动配置 | 官方配置源码的 providers map 和 `api_mode=chat_completions` |

## 校验

`npm test`：57 项通过。`npm run desktop:check`：Vite 构建和 Electron smoke test 通过。测试覆盖协议约束、路径环境变量、YAML/JSON/TOML 回读、凭据回滚、配置漂移保护、未验证适配器零写入和 WorkBuddy ID 冲突。

## 主要来源

- Codex 官方仓库：`openai/codex` `codex-rs/core/config.schema.json`
- OpenCode 官方文档：<https://opencode.ai/docs/providers/>
- Gemini CLI 官方文档/源码：`google-gemini/gemini-cli` configuration docs and storage
- OpenClaw 官方文档/源码：`openclaw/openclaw` custom providers and paths
- Zed 官方源码：`zed-industries/zed` language model provider and credentials provider
- MiniMax Code 0.6.12 npm 包源码与 README
- 本机安装包源码：WorkBuddy、ZCode、VS Code Custom Endpoint
