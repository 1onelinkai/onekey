# 共用参数、默认值与覆盖语义

本页描述工作台自己的参数模型。最终会写哪些字段，由目标 Agent 的能力表决定。

## 每个参数代表什么

| 字段 | 含义 | 校验与注意 |
| --- | --- | --- |
| `name` | 模型显示名称 | 最长 120 字符，不允许换行与空字符；不改变请求 ID |
| `contextWindow` | 上下文窗口 | 1–100000000 整数；只是客户端预算配置，不扩大真实模型能力 |
| `maxTokens` | 最大输出 token | 同范围整数，不能大于同时填写的上下文 |
| `compactThreshold` | 自动压缩阈值 | 整数，必须小于同时设置的上下文；仅 Codex 映射 |
| `thinkingBudget` | 思考 token 预算 | 0–100000000 整数，0 有意义；须小于同时填写的 maxTokens |
| `reasoningEffort` | 推理档位 | 取值由目标客户端专用列表校验 |
| `subagentModel` | 子 Agent 模型 | 字符和长度校验；跨 provider 的完整 ID 由目标客户端解释 |
| `reviewModel` | 审查模型 | 字符和长度校验，仅当前允许的适配器映射 |
| `supportsImages` | 图片输入声明 | 布尔值，不执行视觉功能测试 |
| `supportsTools` | 工具调用声明 | 布尔值，不验证每种工具格式 |
| `supportsReasoning` | 推理能力声明 | 布尔值，不让普通模型自动具备推理能力 |
| `supports1m` | Claude Desktop 1M 变体声明 | 布尔值，不是任意窗口扩容接口 |

数值接受数字或可转为安全整数的字符串，拒绝小数、布尔、负数及超限。子模型 ID 支持 `@` 等存储允许字符，最终目标客户端可能仍有自己的限制。

## 永久模型资料与单次参数

BYOK 模型资料长期保存 name、contextWindow、maxTokens、supportsImages、supportsTools、supportsReasoning、enabled 等。专用于某 Agent 的 effort、reviewModel、compactThreshold 等通过本次配置表单传入，不表示同步写回所有服务商模型。

修改永久资料不会自动更新 Agent 文件，单次调整不会自动修改永久资料。需要复用新规格时应保存模型资料，再对目标客户端重新配置。

## “留空”不总是“清除旧原生字段”

在 BYOK 模型编辑中，空值可移除该模型保存的规格。在生成 Agent 配置时，未填的参数通常被过滤不写；若原生文件已有对应字段，可能保留旧值。部分适配器会整体替换 provider，或为未填字段写默认值。

例如 Codex 未填 reasoningEffort 会保留原来的顶层 model_reasoning_effort；Pi 重建 provider 时对未填窗口写 128000。因此每次都应看预览，而不是推断“空框意味着恢复官方默认”。

## 常见适配器默认值

| Agent | 未填时的主要生成行为 |
| --- | --- |
| Grok | context_window=500000 |
| Pi | 窗口128000；输出min(8192,窗口)；图片false；reasoning=false；cost四项0占位 |
| Zed | 窗口128000；输出min(8192,窗口)；工具true；图片false |
| VS Code | 窗口128000；输出min(8192,窗口)；工具true；图片false；thinking=false |
| WorkBuddy | 输入128000；输出min(8192,窗口)；工具true；图片false；推理false |
| Claude Code / Codex / Hermes 等 | 多数可选字段不填则不主动写入；检查现有字段和具体页 |

Pi、Zed、WorkBuddy、VS Code 若只填一个大于默认128000的 maxTokens，会要求同时提供足够大的真实上下文。

## 能力过滤

`settingsForClient()` 先校验全部输入，再只选能力表允许的字段；不支持的字段汇总到预览 notice。共享表单可出现某个参数，不等于每个 Agent 都会写它。

以下矩阵由当前 `client-capabilities.json` 自动生成；支持表示有映射，实际效果仍依赖目标版本和服务商。

<!-- CAPABILITY_MATRIX -->

| Agent | 当前允许写入的共用字段 |
| --- | --- |
| [claude](/reference/agents/claude) | 最大输出 Token、推理档位、子代理模型 |
| [claude-desktop](/reference/agents/claude-desktop) | 模型显示名称、1M 上下文变体、推理档位 |
| [codex](/reference/agents/codex) | 上下文窗口、推理档位、自动压缩阈值、审查模型 |
| [gemini](/reference/agents/gemini) | 模型显示名称、最大输出 Token、思考 Token 预算 |
| [grok](/reference/agents/grok) | 上下文窗口 |
| [opencode](/reference/agents/opencode) | 模型显示名称、上下文窗口、最大输出 Token |
| [openclaw](/reference/agents/openclaw) | 模型显示名称、上下文窗口、最大输出 Token、图片输入、推理能力、推理档位、子代理模型 |
| [pi](/reference/agents/pi) | 模型显示名称、上下文窗口、最大输出 Token、图片输入、推理能力、推理档位 |
| [minimax](/reference/agents/minimax) | 模型显示名称、上下文窗口、最大输出 Token、图片输入 |
| [deepseek-harness](/reference/agents/deepseek-harness) | 模型显示名称、上下文窗口、最大输出 Token、图片输入 |
| [zed](/reference/agents/zed) | 模型显示名称、上下文窗口、最大输出 Token、图片输入、工具调用 |
| [vscode](/reference/agents/vscode) | 模型显示名称、上下文窗口、最大输出 Token、图片输入、工具调用、推理能力 |
| [zcode](/reference/agents/zcode) | 模型显示名称、上下文窗口、最大输出 Token、图片输入 |
| [workbuddy](/reference/agents/workbuddy) | 模型显示名称、上下文窗口、最大输出 Token、图片输入、工具调用、推理能力 |
| [hermes](/reference/agents/hermes) | 上下文窗口、推理档位 |

<!-- /CAPABILITY_MATRIX -->

## 推理档位

当前专用列表保存在 `client-effort-levels.json`。例如 Claude Code 接受 low/medium/high/max；Codex 接受 none/minimal/low/medium/high/xhigh；Pi / OpenClaw 接受 off/minimal/low/medium/high/xhigh。不要把 `off`、`none`、`max` 在不同客户端间直接互换。

配置参考页列出各自准确列表。工作台只验证声明和映射，不测试模型实际支持每档的行为。
