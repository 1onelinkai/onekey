# VS Code 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/Library/Application Support/Code/User（macOS） |
| 路径覆盖规则 | Windows 使用 APPDATA/Code/User；Linux 使用 XDG_CONFIG_HOME/Code/User |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS 官方桌面包；Windows 使用原渠道 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

修改默认用户 chatLanguageModels.json 数组。查找 vendor=customendpoint 且 name=OneLinkAI 的分组，按模型 ID 替换 / 追加，并保留该组其他模型和其他组。不是写所有 Profile。

## Key 保存与手动步骤

配置定义不包含 API Key。用户要在 VS Code 管理模型中为 OneLinkAI / Custom Endpoint 保存 Key，由 VS Code 自己管理凭据。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `vendor / name` | customendpoint / OneLinkAI |
| `models[].id / name` | 请求 ID / 显示名 |
| `models[].url` | 按协议补完整 /v1/chat/completions、/v1/responses 或 /v1/messages |
| `models[].apiType` | chat-completions / responses / messages |
| `contextWindow / maxOutputTokens` | 默认128000 / min(8192,窗口) |
| `toolCalling / vision / thinking` | supportsTools默认true，图片和推理默认false |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。
- `supportsTools`：工具调用。
- `supportsReasoning`：推理能力。

支持模型规格、图片、工具与推理能力。仅写入默认 Profile 的模型定义；之后需在 VS Code 的管理模型中为 OneLinkAI / Custom Endpoint 保存 API Key。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/Library/Application Support/Code/User/chatLanguageModels.json

```jsonc
[
  {
    "vendor": "customendpoint",
    "name": "OneLinkAI",
    "models": [
      {
        "id": "example-model",
        "name": "example-model",
        "url": "https://api.example.com/v1/chat/completions",
        "apiType": "chat-completions",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "toolCalling": true,
        "vision": false,
        "thinking": false
      }
    ]
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

### ~/Library/Application Support/Code/User/chatLanguageModels.json

```jsonc
[
  {
    "vendor": "customendpoint",
    "name": "OneLinkAI",
    "models": [
      {
        "id": "example-model",
        "name": "示例显示名称",
        "url": "https://api.example.com/v1/chat/completions",
        "apiType": "chat-completions",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "toolCalling": true,
        "vision": true,
        "thinking": true
      }
    ]
  }
]
```

## 生效与使用注意

重启 / 重新载入后在管理模型中填 Key 并选择模型。其他 VS Code Profile 需要单独配置；只读查看器能发现部分 profiles，不代表写入器也批量写了它们。

**当前写入提示：** 模型定义已生成，密钥尚未写入。请在 VS Code 的管理模型中打开 OneLinkAI / Custom Endpoint，填写 API Key 并保存到 VS Code 密钥存储，再选择模型。此配置写入默认用户配置，其他 VS Code Profile 需单独设置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "vscode"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
