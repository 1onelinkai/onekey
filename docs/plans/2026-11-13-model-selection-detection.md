# 各客户端模型选择识别

截图没有客户端名称，不能根据模型数量确定客户端。本次覆盖所有已支持的客户端，分清模型注册列表、配置默认值、新任务默认值、上次选择和最近使用。

- Claude Code、Codex、Gemini、Grok、OpenClaw、Pi、MiniMax、Hermes、Zed、DSH 两种入口继续使用真实配置默认字段；补充 Codex 指定 profile、Gemini 字符串格式、OpenClaw 字符串格式。
- OpenCode 优先配置模型，缺少时读取默认 agent 的模型，仍缺少则读取 XDG state 目录下 model.json 的最近使用项，明确标注“最近使用模型”。
- WorkBuddy 读取新任务模型偏好；ZCode 读取各 agent 的全局选择偏好，解码自定义 provider 模型。用副本打开本地存储，仅查询模型选择字段。账户或 agent 存在歧义时不猜测统一默认值。
- VS Code 只读默认 Profile 的 globalStorage/state.vscdb 中聊天面板选择键，标注“上次选择模型”和 Profile 范围；忽略旧的隐式默认标记，不混用编辑器与远程会话的选择。
- Claude Desktop 单一 inferenceModels 项只称“已配置模型”，多个项不推断默认。
- 卡片无确定选择时展示“已配置 N 个模型”，提示中解释未读取到默认、按会话保存或 agent 选择不同，移除笼统的“默认项请在客户端确认”。

配置弹窗沿用检测模型在授权模型列表中的优先选择。运行中的会话、项目配置和启动参数可能覆盖用户级默认值；卡片不宣称实时读取活动会话。

验证：覆盖所有配置格式、profile、最近使用优先级、WorkBuddy 账户作用域、ZCode 自定义模型和 agent 歧义、VS Code 真实 SQLite BLOB/只读不修改、存储快照文件范围及 UI 语义。另在 Electron 运行时检查真实本机 WorkBuddy 新任务偏好。
