# Zed 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.config/zed（macOS） |
| 路径覆盖规则 | Linux 遵循 XDG_CONFIG_HOME；Windows 为 APPDATA/Zed |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS 官方桌面包；Windows 使用原渠道 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

settings.json 定点替换 language_models.openai_compatible.OneLinkAI 并设置 agent.default_model。其他提供方保留，OneLinkAI 的 available_models 本次替换为单模型。

## Key 保存与手动步骤

当前生产启动没有向适配器注入 credentials；工作台不写 Zed 钥匙串，生成结果不含 API Key。请在 Zed 自己的设置里手动填写。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `language_models.openai_compatible.OneLinkAI.api_url` | 根地址 + /v1 |
| `…available_models[].name / display_name` | 实际 ID / 显示名 |
| `…max_tokens / max_output_tokens` | 窗口（默认128000）/ 输出（默认min(8192,窗口)） |
| `…capabilities.tools / images` | 默认 true / false |
| `…capabilities.parallel_tool_calls / chat_completions` | 均为 true 的适配器声明 |
| `agent.default_model` | provider=OneLinkAI 与模型 ID |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。
- `supportsTools`：工具调用。

支持模型规格、图片输入与工具调用。仅写入模型定义，API Key 请在 Zed 中手动填写。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.config/zed/settings.json

```jsonc
{
  "language_models": {
    "openai_compatible": {
      "OneLinkAI": {
        "api_url": "https://api.example.com/v1",
        "available_models": [
          {
            "name": "example-model",
            "display_name": "example-model",
            "max_tokens": 128000,
            "max_output_tokens": 8192,
            "capabilities": {
              "tools": true,
              "images": false,
              "parallel_tool_calls": true,
              "chat_completions": true
            }
          }
        ]
      }
    }
  },
  "agent": {
    "default_model": {
      "provider": "OneLinkAI",
      "model": "example-model"
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
  "supportsImages": true,
  "supportsTools": true
}
```

### ~/.config/zed/settings.json

```jsonc
{
  "language_models": {
    "openai_compatible": {
      "OneLinkAI": {
        "api_url": "https://api.example.com/v1",
        "available_models": [
          {
            "name": "example-model",
            "display_name": "示例显示名称",
            "max_tokens": 128000,
            "max_output_tokens": 8192,
            "capabilities": {
              "tools": true,
              "images": true,
              "parallel_tool_calls": true,
              "chat_completions": true
            }
          }
        ]
      }
    }
  },
  "agent": {
    "default_model": {
      "provider": "OneLinkAI",
      "model": "example-model"
    }
  }
}
```

## 生效与使用注意

仅 Chat Completions。写文件成功仍标记 requiresManualCredential=true，必须在 Zed 内补 Key。代码内保留旧可注入凭据分支供测试 / 兼容使用，但不是当前 Electron 生产接线行为。

**当前写入提示：** 模型定义已写入，请在 Zed 的模型设置中为 OneLinkAI 手动填写 API Key。本应用不访问系统钥匙串。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "zed"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
