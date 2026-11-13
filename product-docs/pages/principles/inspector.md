# 本机配置查看器

查看器帮助用户看到目标应用用户目录的真实配置，而不是一份凭空构造的设置列表。它是只读视图，不是任意路径编辑器。

## 展示范围

所有 16 个客户端入口都有预定义候选文件。配置目录遵循检测 / 写入所用环境变量；另外按规则发现 Claude Desktop configLibrary、DSH profiles、VS Code profiles 里的候选文件，最多展示 40 个。

项目目录的 `.env`、项目级配置、命令行参数和运行时环境并没有被自动合并成“最终有效配置”。查看用户文件不等于完整复现 Agent 的配置优先级。

## 读取到页面之前

1. 对候选路径 lstat，拒绝目标是符号链接或非普通文件。
2. 对认证文件只报告存在，不读取内容。
3. 可展示文件上限 1 MiB，避免大文件阻塞。
4. 解析 JSON / JSONC / JSON5、TOML、YAML / ENV。
5. 递归按字段名和文本模式脱敏。
6. 重新格式化后返回，界面做语法高亮、搜索、切换与复制。

格式无法解析时不会退回展示整份原文，避免解析失败绕过脱敏。每个文件单独报告结果，不让一份损坏文件阻断所有文件。

## 凭据如何脱敏

`apiKey/token/secret/password/authorization/credential/cookie` 等敏感字段隐藏；headers、args、command、oauthAccount 等整个值隐藏，降低参数或命令里嵌 Key 的暴露。

部分看起来含 token 的公开规格字段如 maxTokens、contextWindow、tokenizer 和认证模式是例外，可以展示。env 字段只允许少量已知非秘密变量展示，其他隐藏。

字符串会清理常见 Key 前缀、Bearer、URL 中用户名密码和部分敏感查询参数。递归深度超过 60 层拒绝，YAML alias 展开受限。

这是一套规则化脱敏，不保证识别所有自定义字段中的任意秘密。不要因看到页面已脱敏就公开整份原文件；复制前仍应检查具体文本。

## 哪些认证文件不读

包括 `auth.json`、`credentials.json`、`oauth_creds.json`、`.credentials.yaml`。`.env` 只提取变量名，所有值都替换为 `<REDACTED>`，不保留注释和多行内容。

Zed、VS Code 系统 / 客户端凭据存储不读取。查看器不会因为点击“重新读取”而启动钥匙串授权。

## 为什么注释、缩进与原文件不同

查看器是解析、脱敏、重序列化后的呈现。它不保证保留注释与原始排版，也不会把显示内容写回文件。复制得到的是脱敏展示文本，不是可用于完整恢复的原始备份。

| 状态 | 表示 |
| --- | --- |
| present | 可读且已解析脱敏 |
| missing | 尚未创建或不存在 |
| protected | 认证文件存在但不读取正文 |
| error | 无权限、符号链接、格式错误、超限等 |

来源：`electron/config-inspector.cjs` 的 `candidates/inspect/displayContent/sanitize`。
