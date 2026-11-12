# Claude Code 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.claude |
| 路径覆盖规则 | CLAUDE_CONFIG_DIR |
| 本页示例协议 | Anthropic Messages |
| 一键初装 | macOS / Windows 托管 npm：`@anthropic-ai/claude-code` |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

修改 settings.json 中目标 env 项、顶层 model 和按需指定的 effortLevel。其他 env 和其他顶层设置通过 JSONC 定点修改保留。每次基础配置会把 Opus / Sonnet / Haiku 默认映射及子 Agent 模型统一为本次模型；填 subagentModel 时再覆盖子 Agent 映射。

## Key 保存与手动步骤

settings.json 的 env.ANTHROPIC_AUTH_TOKEN 与 env.ANTHROPIC_API_KEY 都写入本次 Key；这是目标 Agent 配置中的实际凭据。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `env.ANTHROPIC_BASE_URL` | 根地址，不额外加 /v1 |
| `env.ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY` | 本次 API Key |
| `env.ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_HAIKU_MODEL` | 本次模型 ID |
| `env.CLAUDE_CODE_SUBAGENT_MODEL` | 默认同本次模型，填写子代理参数时改为该值 |
| `model` | 本次默认模型 |
| `env.CLAUDE_CODE_MAX_OUTPUT_TOKENS` | maxTokens 转十进制字符串 |
| `effortLevel` | reasoningEffort |

## 本应用支持的高级参数

- `maxTokens`：最大输出 Token。
- `reasoningEffort`：推理档位。
- `subagentModel`：子代理模型。

支持输出限制、推理档位和子代理模型。上下文由模型及其变体决定，不提供任意窗口覆盖。

推理档位：`low`、`medium`、`high`、`max`。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、Anthropic Messages。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.claude/settings.json

```jsonc
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_AUTH_TOKEN": "<REDACTED>",
    "ANTHROPIC_API_KEY": "<REDACTED>",
    "ANTHROPIC_MODEL": "example-model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "example-model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "example-model",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "example-model",
    "CLAUDE_CODE_SUBAGENT_MODEL": "example-model"
  },
  "model": "example-model"
}
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "maxTokens": 8192,
  "reasoningEffort": "high",
  "subagentModel": "helper-model"
}
```

### ~/.claude/settings.json

```jsonc
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_AUTH_TOKEN": "<REDACTED>",
    "ANTHROPIC_API_KEY": "<REDACTED>",
    "ANTHROPIC_MODEL": "example-model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "example-model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "example-model",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "example-model",
    "CLAUDE_CODE_SUBAGENT_MODEL": "helper-model",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "8192"
  },
  "model": "example-model",
  "effortLevel": "high"
}
```

## 生效与使用注意

重启 Claude Code 或开始新会话。环境、项目设置和已运行会话可能覆盖用户 settings.json。原生安装与 npm 安装都使用该用户配置路径，安装来源影响升级方式，不改变这里的配置协议。

**当前写入提示：** 配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "claude"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
