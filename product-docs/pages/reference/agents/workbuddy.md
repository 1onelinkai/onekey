# WorkBuddy 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.workbuddy |
| 路径覆盖规则 | WORKBUDDY_CONFIG_DIR |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS 官方桌面包；Windows 使用原渠道 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

models.json 支持根数组或带 models 的对象；按 vendor=OneLinkAI 且模型 ID 匹配替换，其他模型保留。同 ID 已由其他 vendor 占用会报冲突，不强抢条目。对象原有 availableModels 非空时追加新 ID。

## Key 保存与手动步骤

models.json 的目标模型 apiKey。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `id / name / vendor` | 实际 ID / 显示名 / OneLinkAI |
| `url` | 根地址 + /v1/chat/completions |
| `maxInputTokens` | contextWindow 或 128000 |
| `maxOutputTokens` | maxTokens 或 min(8192,窗口) |
| `supportsToolCall / supportsImages / supportsReasoning` | 默认 true / false / false |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。
- `supportsTools`：工具调用。
- `supportsReasoning`：推理能力。

支持上下文、输出上限、图片、工具和推理能力；配置后需在应用中选择模型。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.workbuddy/models.json

```jsonc
[
  {
    "id": "example-model",
    "name": "example-model",
    "vendor": "OneLinkAI",
    "apiKey": "<REDACTED>",
    "url": "https://api.example.com/v1/chat/completions",
    "maxInputTokens": 128000,
    "maxOutputTokens": 8192,
    "supportsToolCall": true,
    "supportsImages": false,
    "supportsReasoning": false
  }
]
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "name": "示例显示名称",
  "contextWindow": 128000,
  "maxTokens": 8192,
  "supportsImages": true,
  "supportsTools": true,
  "supportsReasoning": true
}
```

### ~/.workbuddy/models.json

```jsonc
[
  {
    "id": "example-model",
    "name": "示例显示名称",
    "vendor": "OneLinkAI",
    "apiKey": "<REDACTED>",
    "url": "https://api.example.com/v1/chat/completions",
    "maxInputTokens": 128000,
    "maxOutputTokens": 8192,
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true
  }
]
```

## 生效与使用注意

仅 Chat Completions。保存后重启，在 WorkBuddy 模型列表手动选择。目录中的模型文件和应用 User/settings.json 是不同文件，查看器可展示后者但该适配器不改它。

**当前写入提示：** 配置后重启客户端，在模型列表中选择 OneLinkAI 模型。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "workbuddy"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
