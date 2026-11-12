# 协议、地址与连接测试

## 服务商名字不能决定协议

一个服务商可以同时支持多种协议，也可能只实现其中一部分。OpenAI 兼容有时只指 Chat Completions，不意味着 Responses、工具调用、流式、图片都兼容。

| 界面协议 | 内部标识 | 推理路径 | 认证头 |
| --- | --- | --- | --- |
| OpenAI Chat Completions | `openai` | `/v1/chat/completions` | `Authorization: Bearer` |
| OpenAI Responses | `responses` | `/v1/responses` | `Authorization: Bearer` |
| Anthropic Messages | `anthropic` | `/v1/messages` | `x-api-key`、`anthropic-version` |
| Google Gemini 原生 | `gemini` | `/v1beta/models/<模型>:generateContent` | `x-goog-api-key` |

## 根地址如何填写

填写服务商 API 根地址，例如 `https://api.example.com`，工作台按协议或适配器补路径。`https://api.example.com/v1` 通常会被去掉末尾 `/v1` 再统一拼接。

不要填写 `.../v1/chat/completions`、带 key 的查询参数、网页控制台地址或 `username:password@host`。末尾版本路径有归一化规则，但不是通用 URL 修复工具。反向代理如果要求自定义前缀，例如 `/gateway`，要确认最终拼接结果符合该服务。

仅本机回环地址允许 HTTP，方便连接本机模型服务；局域网裸 HTTP 不在当前允许范围内。列表和测试均禁止重定向，遇到 301/302 应直接填写最终正确 API 地址。

## 哪些 Agent 支持哪种协议

| 限制 | Agent |
| --- | --- |
| 必须 Anthropic | Claude Code、Claude Desktop |
| 必须 Responses | Codex、Grok Build |
| 必须 Gemini 原生 | Gemini CLI |
| 当前适配必须 Chat Completions | WorkBuddy、Hermes、Zed |
| 适配器接受前三种非 Gemini 协议 | OpenCode、OpenClaw、Pi、MiniMax、DSH、VS Code、ZCode |

Claude Desktop 另限制为 `claude-` / `anthropic/claude-` 前缀的 sonnet、opus、haiku、fable 角色模型 ID。当前应用没有为任意名字提供额外模型映射代理。

## 连接测试真正发出的内容

| 协议 | 测试正文主要字段 |
| --- | --- |
| Chat Completions | model、`max_tokens: 8`、用户消息 `Reply OK` |
| Anthropic | model、`max_tokens: 8`、用户消息 `Reply OK` |
| Responses | model、input `Reply OK`、`max_output_tokens: 16` |
| Gemini | contents 用户文本 `Reply OK`、`maxOutputTokens: 16` |

通过 POST 发起真实请求，超时 30 秒，不跟随重定向。测试不会发送你的项目文件和历史对话，但会发送所选模型、Key 和这条测试文本，可能消耗服务商额度。

测试不把高级参数全部透传，因此某些模型有最小输出要求、特殊参数规则或必须开启特定模式时，简单测试可能失败而实际客户端可工作；反之测试成功也不能证明复杂能力可用。

## 如何判断测试成功

除 HTTP 成功外，还解析 JSON：Chat Completions 要有非空 choices；Anthropic 要有 message 类型和 content 数组；Responses 要有 response 对象、非 failed 状态和 output 数组；Gemini 要有含内容的 candidates。返回 error 字段或结构不符会报错。

它不严格验证文本必须恰好是 OK，不测试 SSE 流、工具执行、图片解析、上下文长度、代理回源和持续会话。小输出请求有响应，说明基本认证、路由及响应结构可用。

## 模型列表成功却调用失败

`/models` 可能仅证明 Key 可查看目录，没有证明你对所有模型有额度和推理权限。还可能存在模型 ID 别名差异、API 协议不匹配、区域限制或请求参数要求。以 HTTP 状态、目标 Agent 错误和服务商后台为依据排查。

来源：`provider-models.cjs`、`agents.cjs` 的 `validate/build/testConnection`。
