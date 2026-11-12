# Pi 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.pi/agent |
| 路径覆盖规则 | PI_CODING_AGENT_DIR |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS / Windows 托管 npm：`@earendil-works/pi-coding-agent` |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

整体替换 models.json 的 providers.onelinkai；settings.json 设置默认 provider、模型和可选 thinking 档位。原 enabledModels 是非空数组且缺少新模型时追加，避免原 allowlist 隐藏本次模型；空列表不强制改成限制列表。

## Key 保存与手动步骤

models.json 的 providers.onelinkai.apiKey。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `providers.onelinkai.baseUrl / api` | 按协议根地址与 API 枚举 |
| `…models[].contextWindow` | contextWindow 或 128000 |
| `…models[].maxTokens` | maxTokens 或 min(8192,contextWindow) |
| `…models[].reasoning / input` | supportsReasoning 默认 false；图片输入默认关闭 |
| `…models[].cost` | input/output/cacheRead/cacheWrite 均为 0 的占位配置，不是账单 |
| `settings.defaultProvider / defaultModel / defaultThinkingLevel` | provider / 模型 / 推理档位 |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。
- `supportsReasoning`：推理能力。
- `reasoningEffort`：推理档位。

支持模型规格、图片与推理能力以及默认思考档位。请确认模型实际支持所选能力。

推理档位：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.pi/agent/models.json

```jsonc
{
  "providers": {
    "onelinkai": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "<REDACTED>",
      "api": "openai-completions",
      "models": [
        {
          "id": "example-model",
          "name": "example-model",
          "reasoning": false,
          "input": [
            "text"
          ],
          "contextWindow": 128000,
          "maxTokens": 8192,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### ~/.pi/agent/settings.json

```jsonc
{
  "defaultProvider": "onelinkai",
  "defaultModel": "example-model"
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
  "supportsImages": true,
  "supportsReasoning": true
}
```

### ~/.pi/agent/models.json

```jsonc
{
  "providers": {
    "onelinkai": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "<REDACTED>",
      "api": "openai-completions",
      "models": [
        {
          "id": "example-model",
          "name": "示例显示名称",
          "reasoning": true,
          "input": [
            "text",
            "image"
          ],
          "contextWindow": 128000,
          "maxTokens": 8192,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### ~/.pi/agent/settings.json

```jsonc
{
  "defaultProvider": "onelinkai",
  "defaultModel": "example-model",
  "defaultThinkingLevel": "high"
}
```

## 生效与使用注意

支持三种非 Gemini 协议。重启或新建会话；当前只配置一个 OneLinkAI 模型条目，多次配置会替换该 provider 之前的模型列表。不要用本地 cost=0 推断服务商免费。

**当前写入提示：** 配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "pi"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
