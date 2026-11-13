# 16 个 Agent 配置总表

这里列出当前适配器实际覆盖的客户端。每个详情页包含写入范围、原生字段、凭据位置、最小与高级参数生成示例、手动步骤及限制。所有示例由实际适配器离线生成。

| Agent | 默认配置目录（主要为 macOS） | 示例协议 | Key 处理 |
| --- | --- | --- | --- |
| [Claude Code](/reference/agents/claude) | ~/.claude | anthropic | 按原生文件写入 |
| [Claude Desktop](/reference/agents/claude-desktop) | ~/Library/Application Support/Claude 与 Claude-3p（macOS） | anthropic | 按原生文件写入 |
| [Codex](/reference/agents/codex) | ~/.codex | responses | 按原生文件写入 |
| [Gemini CLI](/reference/agents/gemini) | ~/.gemini | gemini | 按原生文件写入 |
| [Grok Build](/reference/agents/grok) | ~/.grok | responses | 按原生文件写入 |
| [OpenCode](/reference/agents/opencode) | ~/.config/opencode | openai | 按原生文件写入 |
| [OpenClaw](/reference/agents/openclaw) | ~/.openclaw | openai | 按原生文件写入 |
| [Pi](/reference/agents/pi) | ~/.pi/agent | openai | 按原生文件写入 |
| [MiniMax Code](/reference/agents/minimax) | ~/.minimax | openai | 按原生文件写入 |
| [DeepSeek Harness CLI](/reference/agents/deepseek-harness) | ~/.dsh | openai | 按原生文件写入 |
| [DeepSeek Harness Desktop](/reference/agents/deepseek-harness-desktop) | ~/.dsh | openai | 按原生文件写入 |
| [Zed](/reference/agents/zed) | ~/.config/zed（macOS） | openai | 在目标应用手动保存 |
| [VS Code](/reference/agents/vscode) | ~/Library/Application Support/Code/User（macOS） | openai | 在目标应用手动保存 |
| [ZCode](/reference/agents/zcode) | ~/.zcode/v2 | openai | 按原生文件写入 |
| [WorkBuddy](/reference/agents/workbuddy) | ~/.workbuddy | openai | 按原生文件写入 |
| [Hermes](/reference/agents/hermes) | ~/.hermes（macOS / Linux） | openai | 按原生文件写入 |

## 选择之前先确认

1. 确认模型 ID 与协议，不按名字猜兼容性。
2. 确认当前用户级目录以及环境变量覆盖。
3. 阅读本 Agent 的覆盖范围，尤其是整个 provider 被替换的情形。
4. 预览文件并确认手动凭据步骤。
5. 写入后在目标客户端新建会话验证。

这里的目录与字段不代表其他版本 Agent 永远相同。Windows / Linux 路径和实机验证范围另见[当前状态](/reference/status)，共用参数见[参数说明](/reference/parameters)。
