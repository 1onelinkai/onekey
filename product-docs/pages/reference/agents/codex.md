# Codex 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.codex |
| 路径覆盖规则 | CODEX_HOME |
| 本页示例协议 | OpenAI Responses |
| 一键初装 | macOS / Windows 托管 npm：`@openai/codex` |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

解析 config.toml，设置顶层 model 与 model_provider=onelinkai；合并目标 provider，覆盖连接字段，删除目标 provider 的 env_key 与 env_http_headers。保留其他 provider 的值，但 TOML 会重新序列化，不保留原注释和排版。auth.json 不写。

## Key 保存与手动步骤

config.toml 的 model_providers.onelinkai.experimental_bearer_token。requires_openai_auth=false，当前配置不依赖官方账号认证。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `model / model_provider` | 本次模型 / onelinkai |
| `model_providers.onelinkai.base_url` | 根地址 + /v1 |
| `wire_api / requires_openai_auth` | responses / false |
| `experimental_bearer_token` | 实际 Key |
| `model_context_window` | contextWindow |
| `model_reasoning_effort` | reasoningEffort |
| `model_auto_compact_token_limit` | compactThreshold，必须小于新窗口 |
| `review_model` | reviewModel |

## 本应用支持的高级参数

- `contextWindow`：上下文窗口。
- `reasoningEffort`：推理档位。
- `compactThreshold`：自动压缩阈值。
- `reviewModel`：审查模型。

支持上下文、推理档位、自动压缩阈值和审查模型。输出上限由模型目录管理，顶层配置没有统一覆盖字段。

推理档位：`none`、`minimal`、`low`、`medium`、`high`、`xhigh`。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Responses。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.codex/config.toml

```toml
model = "example-model"
model_provider = "onelinkai"

[model_providers.onelinkai]
name = "OneLinkAI"
base_url = "https://api.example.com/v1"
wire_api = "responses"
experimental_bearer_token = "<REDACTED>"
requires_openai_auth = false
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "contextWindow": 128000,
  "reasoningEffort": "high",
  "compactThreshold": 96000,
  "reviewModel": "review-model"
}
```

### ~/.codex/config.toml

```toml
model = "example-model"
model_context_window = 128_000
model_auto_compact_token_limit = 96_000
model_reasoning_effort = "high"
review_model = "review-model"
model_provider = "onelinkai"

[model_providers.onelinkai]
name = "OneLinkAI"
base_url = "https://api.example.com/v1"
wire_api = "responses"
experimental_bearer_token = "<REDACTED>"
requires_openai_auth = false
```

## 生效与使用注意

重启 Codex 或新开会话。该卡片既可能检测到 CLI，也可能检测到桌面内附 CLI；当前不是单独管理所有 Codex 产品实例。maxTokens 不写顶层统一字段。现有 compact 阈值若与新窗口冲突，会要求一起调整。

**当前写入提示：** 配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "codex"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
