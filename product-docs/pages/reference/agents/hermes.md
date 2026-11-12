# Hermes 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.hermes（macOS / Linux） |
| 路径覆盖规则 | HERMES_HOME；Windows 默认 LOCALAPPDATA/hermes |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS / Windows 官方分阶段源码安装 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

通过 YAML 文档替换 providers.onelinkai，设置 model.provider 和 model.default，按需设置 model.context_length、agent.reasoning_effort；其他 provider 与顶层节点保留。要求 YAML 为有效对象。

## Key 保存与手动步骤

config.yaml 的 providers.onelinkai.api_key。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `providers.onelinkai.base_url / api_key` | 根地址 + /v1 / Key |
| `…api_mode` | chat_completions |
| `…models.<ID>.context_length` | 填写 contextWindow 时写 |
| `model.provider / model.default` | onelinkai / 实际模型 ID |
| `model.context_length` | contextWindow |
| `agent.reasoning_effort` | reasoningEffort |

## 本应用支持的高级参数

- `contextWindow`：上下文窗口。
- `reasoningEffort`：推理档位。

支持上下文与默认推理档位。Hermes 官方将输出上限交给提供方管理，不提供用户配置项。

推理档位：`none`、`minimal`、`low`、`medium`、`high`、`xhigh`。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.hermes/config.yaml

```yaml
{
  providers:
    {
      onelinkai:
        {
          name: OneLinkAI,
          base_url: https://api.example.com/v1,
          api_key: "<REDACTED>"
          api_mode: chat_completions,
          models: { example-model: {} }
        }
    },
  model: { provider: onelinkai, default: example-model }
}
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "contextWindow": 128000,
  "reasoningEffort": "high"
}
```

### ~/.hermes/config.yaml

```yaml
{
  providers:
    {
      onelinkai:
        {
          name: OneLinkAI,
          base_url: https://api.example.com/v1,
          api_key: "<REDACTED>"
          api_mode: chat_completions,
          models: { example-model: { context_length: 128000 } }
        }
    },
  model: { provider: onelinkai, default: example-model, context_length: 128000 },
  agent: { reasoning_effort: high }
}
```

## 生效与使用注意

仅 Chat Completions。maxTokens 不写；当前适配把输出上限交给模型 / 提供方。首次源码安装与 stable 更新不是同一发布线，请结合更新页判断。

**当前写入提示：** 配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "hermes"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
