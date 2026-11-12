# Grok Build 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.grok |
| 路径覆盖规则 | GROK_CONFIG_DIR |
| 本页示例协议 | OpenAI Responses |
| 一键初装 | macOS / Windows 官方二进制 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

解析 config.toml，设置 models.default=onelinkai；新增 / 合并 model.onelinkai，覆盖本次连接和模型字段并删除 env_key。session_summary 原本未设置或已指向 onelinkai 才更新，不抢占其他独立摘要模型。

## Key 保存与手动步骤

config.toml 的 model.onelinkai.api_key。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `models.default` | onelinkai |
| `models.session_summary` | 条件性设为 onelinkai |
| `model.onelinkai.model / name` | 实际 ID / OneLinkAI |
| `base_url / api_key / api_backend` | 根地址 + /v1 / Key / responses |
| `context_window` | contextWindow 或 500000 |

## 本应用支持的高级参数

- `contextWindow`：上下文窗口。

支持自定义上下文窗口；当前 Grok Build 配置未提供已核实的统一输出上限字段。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Responses。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.grok/config.toml

```toml
[models]
default = "onelinkai"
session_summary = "onelinkai"

[model.onelinkai]
model = "example-model"
base_url = "https://api.example.com/v1"
name = "OneLinkAI"
api_key = "<REDACTED>"
api_backend = "responses"
context_window = 500_000
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "contextWindow": 128000
}
```

### ~/.grok/config.toml

```toml
[models]
default = "onelinkai"
session_summary = "onelinkai"

[model.onelinkai]
model = "example-model"
base_url = "https://api.example.com/v1"
name = "OneLinkAI"
api_key = "<REDACTED>"
api_backend = "responses"
context_window = 128_000
```

## 生效与使用注意

重启 Grok Build 或新开会话。maxTokens 没有已核实的统一映射，故不写。默认 500000 是适配器生成值，不证明所选服务商实际支持该窗口。

**当前写入提示：** 已选择 OneLinkAI Responses 模型，请重启 Grok Build 或开启新会话。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "grok"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
