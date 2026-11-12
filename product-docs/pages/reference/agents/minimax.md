# MiniMax Code 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.minimax |
| 路径覆盖规则 | MINIMAX_DATA_DIR |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS / Windows 托管 npm：`@minimax-ai/code` |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

通过 YAML 文档修改 config.yaml 的 custom_provider.onelinkai 与 defaultModel。其他顶层节点和其他 provider 保留，目标 onelinkai 整个节点替换为本次单模型。要求现有 YAML 为对象。

## Key 保存与手动步骤

custom_provider.onelinkai.options.apiKey，authMode=api-key。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `custom_provider.onelinkai.kind / enabled` | custom / true |
| `…api` | 按三种协议映射 API 枚举 |
| `…options.baseURL` | Anthropic 为根地址，其余 + /v1 |
| `…models.<ID>.limit.context / output` | contextWindow / maxTokens |
| `…models.<ID>.capabilities.support_image` | supportsImages，仅明确填写时写 |
| `defaultModel` | custom_provider:onelinkai/&lt;ID&gt; |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。

支持上下文、输出上限和图片输入能力，采用自定义模型的 limit 与 capabilities 字段。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.minimax/config.yaml

```yaml
{
  custom_provider:
    {
      onelinkai:
        {
          name: OneLinkAI,
          kind: custom,
          enabled: true,
          api: openai-completions,
          options:
            {
              baseURL: https://api.example.com/v1,
              apiKey: <API_KEY>,
              authMode: api-key
            },
          models: { example-model: { name: example-model } }
        }
    },
  defaultModel: custom_provider:onelinkai/example-model
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

### ~/.minimax/config.yaml

```yaml
{
  custom_provider:
    {
      onelinkai:
        {
          name: OneLinkAI,
          kind: custom,
          enabled: true,
          api: openai-completions,
          options:
            {
              baseURL: https://api.example.com/v1,
              apiKey: <API_KEY>,
              authMode: api-key
            },
          models:
            {
              example-model:
                {
                  name: 示例显示名称,
                  limit: { context: 128000, output: 8192 },
                  capabilities: { support_image: true }
                }
            }
        }
    },
  defaultModel: custom_provider:onelinkai/example-model
}
```

## 生效与使用注意

命令入口可能为 mcode、minimax、minimax-code。检测有别名，托管安装额外生成 mcode 别名。模型调用能力需服务商和所选协议真正支持，不由模型 ID 是否含 MiniMax 决定。

**当前写入提示：** 配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "minimax"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
