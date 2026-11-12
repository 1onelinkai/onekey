# ZCode 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.zcode/v2 |
| 路径覆盖规则 | 当前适配未提供独立目录覆盖变量 |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS 官方桌面包；Windows 使用原渠道 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

在 config.json 整体替换 provider.onelinkai；其他 provider 保留。设置 enabled=true、source=custom；没有另写全局默认模型字段。

## Key 保存与手动步骤

provider.onelinkai.options.apiKey。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `provider.onelinkai.name` | OneLinkAI |
| `…kind` | anthropic / openai（Responses）/ openai-compatible |
| `…options.baseURL` | Anthropic 根地址，其余 + /v1 |
| `…models.<ID>.contextWindow / maxOutputTokens` | 填写时映射窗口 / 输出 |
| `…models.<ID>.modalities.input` | supportsImages 为 true 时 text,image，否则 text |
| `…enabled / source` | true / custom |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。

支持上下文、输出上限和图片输入能力，写入 v2 模型配置。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.zcode/v2/config.json

```jsonc
{
  "provider": {
    "onelinkai": {
      "name": "OneLinkAI",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "<REDACTED>"
      },
      "models": {
        "example-model": {
          "name": "example-model"
        }
      },
      "kind": "openai-compatible",
      "enabled": true,
      "source": "custom"
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
  "supportsImages": true
}
```

### ~/.zcode/v2/config.json

```jsonc
{
  "provider": {
    "onelinkai": {
      "name": "OneLinkAI",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "<REDACTED>"
      },
      "models": {
        "example-model": {
          "name": "示例显示名称",
          "contextWindow": 128000,
          "maxOutputTokens": 8192,
          "modalities": {
            "input": [
              "text",
              "image"
            ]
          }
        }
      },
      "kind": "openai-compatible",
      "enabled": true,
      "source": "custom"
    }
  }
}
```

## 生效与使用注意

支持三种非 Gemini 协议，重启后在 ZCode 中选 OneLinkAI 模型。不要把模型定义写入等同于已切换当前会话。

**当前写入提示：** 配置后重启客户端，在模型列表中选择 OneLinkAI 模型。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "zcode"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
