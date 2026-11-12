# OpenClaw 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.openclaw |
| 路径覆盖规则 | OPENCLAW_CONFIG_PATH 优先；其次 OPENCLAW_STATE_DIR；否则 OPENCLAW_HOME 下的 .openclaw |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS / Windows 托管 npm：`openclaw` |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

定点设置 models.mode=merge，整体替换 models.providers.onelinkai，设置 agents.defaults.model.primary；其他 provider 和未覆盖字段保留。merge 是 OpenClaw 字段值，不代表目标 provider 内的旧模型数组被自动合并。

## Key 保存与手动步骤

models.providers.onelinkai.apiKey。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `models.mode` | merge |
| `models.providers.onelinkai.baseUrl` | Anthropic 用根地址，其他 + /v1 |
| `…api` | anthropic-messages / openai-responses / openai-completions |
| `…models[]` | 单个模型的 ID、name、contextWindow、maxTokens、input、reasoning |
| `agents.defaults.model.primary` | onelinkai/&lt;ID&gt; |
| `agents.defaults.thinkingDefault` | reasoningEffort |
| `agents.defaults.subagents.model` | subagentModel 原值 |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。
- `supportsReasoning`：推理能力。
- `reasoningEffort`：推理档位。
- `subagentModel`：子代理模型。

支持模型规格、图片与推理能力、默认推理档位及子代理模型。跨服务商子代理请填写完整 provider/model ID。

推理档位：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.openclaw/openclaw.json

```jsonc
{
  "models": {
    "mode": "merge",
    "providers": {
      "onelinkai": {
        "baseUrl": "https://api.example.com/v1",
        "apiKey": "<REDACTED>",
        "api": "openai-completions",
        "models": [
          {
            "id": "example-model",
            "name": "example-model"
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "onelinkai/example-model"
      }
    }
  }
}
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "name": "示例显示名称",
  "contextWindow": 128000,
  "maxTokens": 8192,
  "reasoningEffort": "high",
  "subagentModel": "helper-model",
  "supportsImages": true,
  "supportsReasoning": true
}
```

### ~/.openclaw/openclaw.json

```jsonc
{
  "models": {
    "mode": "merge",
    "providers": {
      "onelinkai": {
        "baseUrl": "https://api.example.com/v1",
        "apiKey": "<REDACTED>",
        "api": "openai-completions",
        "models": [
          {
            "id": "example-model",
            "name": "示例显示名称",
            "contextWindow": 128000,
            "maxTokens": 8192,
            "input": [
              "text",
              "image"
            ],
            "reasoning": true
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "onelinkai/example-model"
      },
      "thinkingDefault": "high",
      "subagents": {
        "model": "helper-model"
      }
    }
  }
}
```

## 生效与使用注意

跨服务商子 Agent 模型应填写完整 provider/model。写入用 JSONC 编辑器，查看器按 JSON5 解析；若已有文件使用仅 JSON5 支持但 JSONC 不支持的语法，预览写入可能被拒绝，不会先无条件覆写。

**当前写入提示：** 配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "openclaw"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
