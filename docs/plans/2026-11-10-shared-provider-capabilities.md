# 多应用共用服务商与模型规格

本次从参考截图选择服务商资料和模型规格管理，接入现有服务商、预览、备份和恢复流程。覆盖全部 15 个应用入口，由同一份能力表驱动界面提示与主进程参数筛选，不复制参考产品界面。

## 实现

- 服务商增加备注、HTTPS 官网链接；数据随现有加密存储保存，点击官网通过主进程校验已保存的网址后打开。
- 模型显示名称与实际请求 ID 分开，增加上下文窗口和最大输出 Token。编辑、启停、设默认及重新拉取模型时保留资料；清空规格可以恢复默认行为。
- 一键配置增加折叠的高级模型参数。支持平台 Key 和本地服务商；可临时覆盖本次配置，长期规格在服务商中维护。
- 前后端共享 `src/client-capabilities.json`。不支持的字段在表单中禁用，已保存而无法写入的字段在预览和完成结果中说明。
- 所有设置经主进程检查正整数与范围，输出不得超过上下文。配置沿用既有预览、文件变化检查、备份、写入校验和恢复机制。

## 完整适配范围（补齐版）

| 应用 | 已实现的原生能力 |
| --- | --- |
| Claude Code | 最大输出、推理档位、子代理模型 |
| Claude Desktop | 显示名、1M 变体声明、最大推理档位 |
| Codex | 上下文、推理档位、自动压缩阈值、审查模型 |
| Gemini CLI | 原生协议、模型列表与分页、输出、思考预算、显示名 |
| Grok Build | 上下文窗口 |
| OpenCode | 显示名、上下文、输出 |
| OpenClaw | 显示名、上下文、输出、图片与推理能力、默认推理档位、子代理模型 |
| Pi | 显示名、上下文、输出、图片与推理能力、默认思考档位 |
| MiniMax Code | 显示名、上下文、输出、图片输入 |
| DeepSeek Harness | 显示名、上下文、输出、图片输入，适配 desktop profile |
| Zed | 显示名、上下文、输出、图片、工具调用，macOS 系统钥匙串 |
| VS Code | 默认 Profile 模型定义、显示名、上下文、输出、图片、工具、推理能力，随后在 VS Code 内保存密钥 |
| ZCode | 显示名、上下文、输出、图片输入 |
| WorkBuddy | 显示名、上下文、输出、图片、工具、推理能力 |
| Hermes | 上下文、默认推理档位 |

所有应用均已接入对应配置流程，不再将尚未实现当作不支持。每个应用的详细说明保存在 `src/client-setting-notes.json`，能力列表在 `src/client-capabilities.json`，推理档位在 `src/client-effort-levels.json`，由界面和主进程共用。

### 经核实的限制

- Claude Code、Claude Desktop 的上下文由模型及变体决定，不能把任意数值当作客户端可写字段。Desktop 提供 1M 变体声明，需模型和服务商确实支持。
- Codex schema 提供上下文与压缩阈值，没有顶层通用输出覆盖字段；本次不生成假的 `model_max_output_tokens`。
- Gemini 使用 Google 原生协议，不能把 OpenAI/Anthropic 服务直接当作 Gemini 服务。`.env` 的 API Key 与地址经主进程写入，预览隐藏整份环境文件；工作目录 .env 或已有进程环境可能优先。
- Hermes 官方明确输出 Token 限制由提供方管理，不是用户配置项。UI 提供上下文及推理控制。
- VS Code 官方 Custom Endpoint API Key 是 SecretStorage 数据，不能在用户配置内伪造 Authorization。此流程写入 `Code/User/chatLanguageModels.json` 默认 Profile 的模型定义，返回 `requiresManualCredential` 并引导用户在 VS Code 管理模型中给 OneLinkAI 组填写 Key。未将此状态报告成密钥已配置。
- Grok 保留已核实的上下文参数，其输出参数尚无可靠配置字段证据。

### 核实来源

官方源码与文档清单见 `artifacts/capability-audit/sources.md`；下载证据的哈希清单为 `artifacts/capability-audit/source-manifest.json`。闭源应用使用本机安装包自带的 schema 和配置解析器核实，没有复制厂商实现代码。

## 验证

测试包括：15 个应用逐一生成预览；字段实际映射与请求 ID 保持；非法参数拒绝且不落盘；真实临时文件写入及恢复；服务商资料与模型规格在同步、重启和清空时的行为。Electron 流程测试覆盖资料编辑、同步后规格保留、应用能力提示和通过 IPC 将共用规格送入 Codex 预览。所有文件读写验证使用临时目录。

验证结果：生产构建、Electron 启动检查、完整 UI 流程均通过，已检查 `artifacts/desktop-real-flow.png` 界面截图。流程测试使用真实 AES-GCM 加密实现和仅存在于测试进程内的临时钥匙串，避免依赖当前登录钥匙串。未执行真实付费模型请求，未发布安装包。

补齐版验证增加：15 个应用高级参数实际写入和逐字恢复；真实 JSON/JSONC、YAML、TOML 字段断言；原有配置保留；Gemini 本地服务器端点与认证验证、模型分页过滤、密钥不进入 URL；VS Code 模型定义保留其他组且不写 Key；应用专属推理枚举和 Codex 保留阈值校验。Electron 流程扩展为全部 15 个应用逐一选择、编辑控件并通过 IPC 生成预览。

最终验证（2026-11-10）：完整测试 207/207 通过；生产构建和 Electron 启动检查通过；全部 15 个应用的真实渲染器控件及 IPC 预览流程通过。配置文件实际写入与逐字恢复均在临时目录验证，未执行真实付费模型推理请求。
