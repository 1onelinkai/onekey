# DeepSeek Harness 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/.dsh |
| 路径覆盖规则 | DSH_HOME |
| 本页示例协议 | OpenAI Chat Completions |
| 一键初装 | macOS / Windows 托管 npm：`@deepseek-ai/dsh` |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

更新 profiles/desktop/cordis.patch.yml 中最后一条 llm-pi-ai patch 的 onelinkai provider 与 agent-default-model patch；保留其他 provider。更新 .credentials.yaml 中指定引用。存在旧 OneLinkAI DSH_* 环境变量 / onelinkai-model 旧 patch 时，仅清理这些已知旧项。

## Key 保存与手动步骤

.credentials.yaml 的 refs.ONELINKAI_API_KEY；模型 patch 只写 apiKeyEnv 引用，不内嵌 Key。认证文件预览正文隐藏。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `llm-pi-ai.config.providers.onelinkai.apiKeyEnv` | ONELINKAI_API_KEY |
| `…api / baseURL` | 协议枚举 / Anthropic 根地址或其他 + /v1 |
| `…models[]` | ID、显示名、窗口、输出与 input |
| `agent-default-model.config` | provider=onelinkai 与本次模型 |
| `.credentials.yaml.version / refs.ONELINKAI_API_KEY` | 要求 version=1，更新引用值 |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `contextWindow`：上下文窗口。
- `maxTokens`：最大输出 Token。
- `supportsImages`：图片输入。

支持上下文、输出上限与图片输入，写入 desktop profile 的 pi-ai 模型条目。其他 profile 需单独配置。

没有为本应用开放额外的通用推理档位映射。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `example-model`、服务根地址 `https://api.example.com`、OpenAI Chat Completions。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/.dsh/profiles/desktop/cordis.patch.yml

```yaml
[
  {
      id: llm-pi-ai,
      name: "@deepseek-ai/dsh-llm-pi-ai",
      config:
        {
          providers:
            {
              onelinkai:
                {
                  displayName: OneLinkAI,
                  apiKeyEnv: ONELINKAI_API_KEY,
                  api: openai-completions,
                  baseURL: https://api.example.com/v1,
                  models: [ { id: example-model, name: example-model } ]
                }
            }
        }
    },
  {
      id: agent-default-model,
      config: { provider: onelinkai, model: example-model }
    }
]
```

### ~/.dsh/.credentials.yaml

```yaml
version: 1
refs:
  ONELINKAI_API_KEY: <API_KEY>
# 已有凭据保留，预览隐藏全部凭据内容
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

### ~/.dsh/profiles/desktop/cordis.patch.yml

```yaml
[
  {
      id: llm-pi-ai,
      name: "@deepseek-ai/dsh-llm-pi-ai",
      config:
        {
          providers:
            {
              onelinkai:
                {
                  displayName: OneLinkAI,
                  apiKeyEnv: ONELINKAI_API_KEY,
                  api: openai-completions,
                  baseURL: https://api.example.com/v1,
                  models:
                    [
                      {
                          id: example-model,
                          name: 示例显示名称,
                          contextWindow: 128000,
                          maxTokens: 8192,
                          input: [ text, image ]
                        }
                    ]
                }
            }
        }
    },
  {
      id: agent-default-model,
      config: { provider: onelinkai, model: example-model }
    }
]
```

### ~/.dsh/.credentials.yaml

```yaml
version: 1
refs:
  ONELINKAI_API_KEY: <API_KEY>
# 已有凭据保留，预览隐藏全部凭据内容
```

## 生效与使用注意

这是 desktop profile，CLI 若使用其他 profile 需单独配置。不能继续用旧的 DSH_PROVIDER/MODEL/BASE_URL/API_KEY 环境键代替 Cordis 路由。旧 .env 清理只删除这四个名字，其他行保留。

**当前写入提示：** 已配置 DSH desktop profile；CLI 使用其他 profile 时需单独配置。配置写入校验不代表模型请求成功。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "deepseek-harness"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
