# Claude Desktop 配置参考

本页以 **OneLinkAI Desktop 0.3.2** 当前适配器为准。示例以 macOS 路径呈现，由 `generate-product-docs.mjs` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。

## 入口与要求

| 项目 | 当前行为 |
| --- | --- |
| 配置目录 | ~/Library/Application Support/Claude 与 Claude-3p（macOS） |
| 路径覆盖规则 | Windows 使用 LOCALAPPDATA；Linux 使用 XDG_CONFIG_HOME |
| 本页示例协议 | Anthropic Messages |
| 一键初装 | macOS 官方桌面包；Windows 使用原渠道 |

更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。

## 写入范围与保留规则

修改普通目录与 Claude-3p 的 claude_desktop_config.json 中 deploymentMode=3p；创建 / 更新固定 OneLinkAI configLibrary profile 与 _meta.json 的应用选择。已有其他 profile entries 保留，目标 profile 的网关和模型列表会替换。

## Key 保存与手动步骤

Claude-3p/configLibrary/7c35be79-0924-49ad-9f82-5b07e5c2904a.json 的 inferenceGatewayApiKey；不会替你读取 Claude 官方账号的密钥。

## 字段如何映射

| 原生配置字段 | 写入规则 |
| --- | --- |
| `deploymentMode` | 两份配置都设置为 3p |
| `inferenceProvider / inferenceGatewayAuthScheme` | gateway / bearer |
| `inferenceGatewayBaseUrl / inferenceGatewayApiKey` | 根地址 / Key |
| `inferenceModels` | 本次单个模型，必要时含 labelOverride、supports1m、maxEffort |
| `coworkEgressAllowedHosts` | 原字段不存在才写入根地址 hostname；已有列表保留 |
| `disableDeploymentModeChooser` | true |
| `_meta.entries / _meta.appliedId` | 保留其他条目，选中固定 OneLinkAI profile ID |

## 本应用支持的高级参数

- `name`：模型显示名称。
- `supports1m`：1M 上下文变体。
- `reasoningEffort`：推理档位。

支持菜单显示名、1M 上下文变体和最大推理档位。1M 开关只声明模型能力，需服务商实际支持；不接受任意窗口或输出上限。

推理档位：`low`、`medium`、`high`、`xhigh`、`max`。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。

参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。

## 最小输入生成结果

示例输入：模型 `claude-sonnet-example`、服务根地址 `https://api.example.com`、Anthropic Messages。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。`<API_KEY>` 为预览脱敏符号，实际写入由主进程持有的 Key。

### ~/Library/Application Support/Claude/claude_desktop_config.json

```jsonc
{
  "deploymentMode": "3p"
}
```

### ~/Library/Application Support/Claude-3p/claude_desktop_config.json

```jsonc
{
  "deploymentMode": "3p"
}
```

### ~/Library/Application Support/Claude-3p/configLibrary/7c35be79-0924-49ad-9f82-5b07e5c2904a.json

```jsonc
{
  "coworkEgressAllowedHosts": [
    "api.example.com"
  ],
  "disableDeploymentModeChooser": true,
  "inferenceGatewayApiKey": "<REDACTED>",
  "inferenceGatewayAuthScheme": "bearer",
  "inferenceGatewayBaseUrl": "https://api.example.com",
  "inferenceModels": [
    "claude-sonnet-example"
  ],
  "inferenceProvider": "gateway"
}
```

### ~/Library/Application Support/Claude-3p/configLibrary/_meta.json

```jsonc
{
  "entries": [
    {
      "id": "7c35be79-0924-49ad-9f82-5b07e5c2904a",
      "name": "OneLinkAI"
    }
  ],
  "appliedId": "7c35be79-0924-49ad-9f82-5b07e5c2904a"
}
```

## 填写高级参数后的生成结果

以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。

```json
{
  "name": "示例显示名称",
  "reasoningEffort": "high",
  "supports1m": true
}
```

### ~/Library/Application Support/Claude/claude_desktop_config.json

```jsonc
{
  "deploymentMode": "3p"
}
```

### ~/Library/Application Support/Claude-3p/claude_desktop_config.json

```jsonc
{
  "deploymentMode": "3p"
}
```

### ~/Library/Application Support/Claude-3p/configLibrary/7c35be79-0924-49ad-9f82-5b07e5c2904a.json

```jsonc
{
  "coworkEgressAllowedHosts": [
    "api.example.com"
  ],
  "disableDeploymentModeChooser": true,
  "inferenceGatewayApiKey": "<REDACTED>",
  "inferenceGatewayAuthScheme": "bearer",
  "inferenceGatewayBaseUrl": "https://api.example.com",
  "inferenceModels": [
    {
      "name": "claude-sonnet-example",
      "labelOverride": "示例显示名称",
      "supports1m": true,
      "maxEffort": "high"
    }
  ],
  "inferenceProvider": "gateway"
}
```

### ~/Library/Application Support/Claude-3p/configLibrary/_meta.json

```jsonc
{
  "entries": [
    {
      "id": "7c35be79-0924-49ad-9f82-5b07e5c2904a",
      "name": "OneLinkAI"
    }
  ],
  "appliedId": "7c35be79-0924-49ad-9f82-5b07e5c2904a"
}
```

## 生效与使用注意

完全退出再启动 Claude Desktop，选择 OneLinkAI profile。只接受 claude- 或 anthropic/claude- 前缀下 sonnet / opus / haiku / fable 角色模型 ID。不会自动部署模型别名映射服务；任意模型名即使 Anthropic 协议兼容也可能被适配器拒绝。

**当前写入提示：** 已生成 Claude Desktop 第三方网关 profile，请完全退出并重启 Claude Desktop 后选择 OneLinkAI。直连使用 Anthropic Messages 与 Claude 角色模型。

## 失败、回滚与恢复

预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。

查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。

## 对应实现

`electron/agents.cjs` 的 `build()` 中 `client === "claude-desktop"` 分支；能力表为 `src/client-capabilities.json`，提示说明为 `src/client-setting-notes.json`。共同写入、验证和恢复走 `preview/apply/restore`。
