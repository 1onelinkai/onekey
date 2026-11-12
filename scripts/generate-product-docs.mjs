// Generate examples using the production adapter in an isolated temporary HOME.
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { createAgentService } = require('../electron/agents.cjs');
const { labels, effortLevels } = require('../electron/model-settings.cjs');
const capabilities = require('../src/client-capabilities.json');
const notes = require('../src/client-setting-notes.json');
const { packages } = require('../electron/installer.cjs');
const { version } = require('../package.json');
const output = path.resolve(import.meta.dirname, '../product-docs/pages/reference/agents');
const check = process.argv.includes('--check');
const definitions = [
 {id:'claude',name:'Claude Code',protocol:'anthropic',directory:'~/.claude',environment:'CLAUDE_CONFIG_DIR',
 scope:'修改 settings.json 中目标 env 项、顶层 model 和按需指定的 effortLevel。其他 env 和其他顶层设置通过 JSONC 定点修改保留。每次基础配置会把 Opus / Sonnet / Haiku 默认映射及子 Agent 模型统一为本次模型；填 subagentModel 时再覆盖子 Agent 映射。',
 key:'settings.json 的 env.ANTHROPIC_AUTH_TOKEN 与 env.ANTHROPIC_API_KEY 都写入本次 Key；这是目标 Agent 配置中的实际凭据。',
 fields:[['env.ANTHROPIC_BASE_URL','根地址，不额外加 /v1'],['env.ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY','本次 API Key'],['env.ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_HAIKU_MODEL','本次模型 ID'],['env.CLAUDE_CODE_SUBAGENT_MODEL','默认同本次模型，填写子代理参数时改为该值'],['model','本次默认模型'],['env.CLAUDE_CODE_MAX_OUTPUT_TOKENS','maxTokens 转十进制字符串'],['effortLevel','reasoningEffort']],
 after:'重启 Claude Code 或开始新会话。环境、项目设置和已运行会话可能覆盖用户 settings.json。原生安装与 npm 安装都使用该用户配置路径，安装来源影响升级方式，不改变这里的配置协议。'},
 {id:'claude-desktop',name:'Claude Desktop',protocol:'anthropic',directory:'~/Library/Application Support/Claude 与 Claude-3p（macOS）',environment:'Windows 使用 LOCALAPPDATA；Linux 使用 XDG_CONFIG_HOME',
 scope:'修改普通目录与 Claude-3p 的 claude_desktop_config.json 中 deploymentMode=3p；创建 / 更新固定 OneLinkAI configLibrary profile 与 _meta.json 的应用选择。已有其他 profile entries 保留，目标 profile 的网关和模型列表会替换。',
 key:'Claude-3p/configLibrary/7c35be79-0924-49ad-9f82-5b07e5c2904a.json 的 inferenceGatewayApiKey；不会替你读取 Claude 官方账号的密钥。',
 fields:[['deploymentMode','两份配置都设置为 3p'],['inferenceProvider / inferenceGatewayAuthScheme','gateway / bearer'],['inferenceGatewayBaseUrl / inferenceGatewayApiKey','根地址 / Key'],['inferenceModels','本次单个模型，必要时含 labelOverride、supports1m、maxEffort'],['coworkEgressAllowedHosts','原字段不存在才写入根地址 hostname；已有列表保留'],['disableDeploymentModeChooser','true'],['_meta.entries / _meta.appliedId','保留其他条目，选中固定 OneLinkAI profile ID']],
 after:'完全退出再启动 Claude Desktop，选择 OneLinkAI profile。只接受 claude- 或 anthropic/claude- 前缀下 sonnet / opus / haiku / fable 角色模型 ID。不会自动部署模型别名映射服务；任意模型名即使 Anthropic 协议兼容也可能被适配器拒绝。'},
 {id:'codex',name:'Codex',protocol:'responses',directory:'~/.codex',environment:'CODEX_HOME',
 scope:'解析 config.toml，设置顶层 model 与 model_provider=onelinkai；合并目标 provider，覆盖连接字段，删除目标 provider 的 env_key 与 env_http_headers。保留其他 provider 的值，但 TOML 会重新序列化，不保留原注释和排版。auth.json 不写。',
 key:'config.toml 的 model_providers.onelinkai.experimental_bearer_token。requires_openai_auth=false，当前配置不依赖官方账号认证。',
 fields:[['model / model_provider','本次模型 / onelinkai'],['model_providers.onelinkai.base_url','根地址 + /v1'],['wire_api / requires_openai_auth','responses / false'],['experimental_bearer_token','实际 Key'],['model_context_window','contextWindow'],['model_reasoning_effort','reasoningEffort'],['model_auto_compact_token_limit','compactThreshold，必须小于新窗口'],['review_model','reviewModel']],
 after:'重启 Codex 或新开会话。该卡片既可能检测到 CLI，也可能检测到桌面内附 CLI；当前不是单独管理所有 Codex 产品实例。maxTokens 不写顶层统一字段。现有 compact 阈值若与新窗口冲突，会要求一起调整。'},
 {id:'gemini',name:'Gemini CLI',protocol:'gemini',directory:'~/.gemini',environment:'GEMINI_CLI_HOME（目录解析为该值下的 .gemini）',
 scope:'更新 .env 中 GEMINI_API_KEY 和 GOOGLE_GEMINI_BASE_URL，其他变量保留。settings.json 定点设置模型与认证类型，合并 modelDefinitions；有生成参数时更新最后一个仅匹配本模型的 customOverrides，保留其其他选项。',
 key:'.env 的 GEMINI_API_KEY；settings.json 只选 gemini-api-key 认证方式。Key 含引号、反引号或反斜线时当前适配器拒绝，避免生成有歧义环境文件。',
 fields:[['GEMINI_API_KEY / GOOGLE_GEMINI_BASE_URL','Key / 根地址'],['model.name','本次模型 ID'],['security.auth.selectedType','gemini-api-key'],['modelConfigs.modelDefinitions.<ID>','displayName、isVisible=true，并保留旧定义其他字段'],['modelConfigs.customOverrides[].modelConfig.generateContentConfig.maxOutputTokens','maxTokens'],['…thinkingConfig.thinkingBudget','thinkingBudget，可为 0']],
 after:'只接受 Gemini 原生协议。重启终端并新开会话，检查项目 .env 和已导出的环境变量；它们可能覆盖全局值。当前列表只接收可生成内容的模型，不支持把其他协议直接写给 Gemini CLI。'},
 {id:'grok',name:'Grok Build',protocol:'responses',directory:'~/.grok',environment:'GROK_CONFIG_DIR',
 scope:'解析 config.toml，设置 models.default=onelinkai；新增 / 合并 model.onelinkai，覆盖本次连接和模型字段并删除 env_key。session_summary 原本未设置或已指向 onelinkai 才更新，不抢占其他独立摘要模型。',
 key:'config.toml 的 model.onelinkai.api_key。',
 fields:[['models.default','onelinkai'],['models.session_summary','条件性设为 onelinkai'],['model.onelinkai.model / name','实际 ID / OneLinkAI'],['base_url / api_key / api_backend','根地址 + /v1 / Key / responses'],['context_window','contextWindow 或 500000']],
 after:'重启 Grok Build 或新开会话。maxTokens 没有已核实的统一映射，故不写。默认 500000 是适配器生成值，不证明所选服务商实际支持该窗口。'},
 {id:'opencode',name:'OpenCode',protocol:'openai',directory:'~/.config/opencode',environment:'XDG_CONFIG_HOME',
 scope:'如果 opencode.jsonc 存在则修改它，否则 opencode.json。整体替换 provider.onelinkai，同时设置 model=onelinkai/<ID>；其他 provider 保留。目标 OneLinkAI provider 中之前的其他模型和自定义选项会被这次定义替换。',
 key:'provider.onelinkai.options.apiKey。',
 fields:[['provider.onelinkai.options.baseURL','根地址 + /v1'],['provider.onelinkai.npm','Chat: @ai-sdk/openai-compatible；Responses: @ai-sdk/openai；Anthropic: @ai-sdk/anthropic'],['provider.onelinkai.models.<ID>.name','显示名或 ID'],['…limit.context / limit.output','仅填对应参数时写入'],['model','onelinkai/<ID>']],
 after:'支持 Chat Completions、Responses、Anthropic 三种适配。当前这条生成路径对 OpenCode 的 baseURL 都追加 /v1，包含 Anthropic；需要与服务商实际 SDK 地址规则核对，不可假定与其他适配器的 Anthropic 根地址行为相同。'},
 {id:'openclaw',name:'OpenClaw',protocol:'openai',directory:'~/.openclaw',environment:'OPENCLAW_CONFIG_PATH 优先；其次 OPENCLAW_STATE_DIR；否则 OPENCLAW_HOME 下的 .openclaw',
 scope:'定点设置 models.mode=merge，整体替换 models.providers.onelinkai，设置 agents.defaults.model.primary；其他 provider 和未覆盖字段保留。merge 是 OpenClaw 字段值，不代表目标 provider 内的旧模型数组被自动合并。',
 key:'models.providers.onelinkai.apiKey。',
 fields:[['models.mode','merge'],['models.providers.onelinkai.baseUrl','Anthropic 用根地址，其他 + /v1'],['…api','anthropic-messages / openai-responses / openai-completions'],['…models[]','单个模型的 ID、name、contextWindow、maxTokens、input、reasoning'],['agents.defaults.model.primary','onelinkai/<ID>'],['agents.defaults.thinkingDefault','reasoningEffort'],['agents.defaults.subagents.model','subagentModel 原值']],
 after:'跨服务商子 Agent 模型应填写完整 provider/model。写入用 JSONC 编辑器，查看器按 JSON5 解析；若已有文件使用仅 JSON5 支持但 JSONC 不支持的语法，预览写入可能被拒绝，不会先无条件覆写。'},
 {id:'pi',name:'Pi',protocol:'openai',directory:'~/.pi/agent',environment:'PI_CODING_AGENT_DIR',
 scope:'整体替换 models.json 的 providers.onelinkai；settings.json 设置默认 provider、模型和可选 thinking 档位。原 enabledModels 是非空数组且缺少新模型时追加，避免原 allowlist 隐藏本次模型；空列表不强制改成限制列表。',
 key:'models.json 的 providers.onelinkai.apiKey。',
 fields:[['providers.onelinkai.baseUrl / api','按协议根地址与 API 枚举'],['…models[].contextWindow','contextWindow 或 128000'],['…models[].maxTokens','maxTokens 或 min(8192,contextWindow)'],['…models[].reasoning / input','supportsReasoning 默认 false；图片输入默认关闭'],['…models[].cost','input/output/cacheRead/cacheWrite 均为 0 的占位配置，不是账单'],['settings.defaultProvider / defaultModel / defaultThinkingLevel','provider / 模型 / 推理档位']],
 after:'支持三种非 Gemini 协议。重启或新建会话；当前只配置一个 OneLinkAI 模型条目，多次配置会替换该 provider 之前的模型列表。不要用本地 cost=0 推断服务商免费。'},
 {id:'minimax',name:'MiniMax Code',protocol:'openai',directory:'~/.minimax',environment:'MINIMAX_DATA_DIR',
 scope:'通过 YAML 文档修改 config.yaml 的 custom_provider.onelinkai 与 defaultModel。其他顶层节点和其他 provider 保留，目标 onelinkai 整个节点替换为本次单模型。要求现有 YAML 为对象。',
 key:'custom_provider.onelinkai.options.apiKey，authMode=api-key。',
 fields:[['custom_provider.onelinkai.kind / enabled','custom / true'],['…api','按三种协议映射 API 枚举'],['…options.baseURL','Anthropic 为根地址，其余 + /v1'],['…models.<ID>.limit.context / output','contextWindow / maxTokens'],['…models.<ID>.capabilities.support_image','supportsImages，仅明确填写时写'],['defaultModel','custom_provider:onelinkai/<ID>']],
 after:'命令入口可能为 mcode、minimax、minimax-code。检测有别名，托管安装额外生成 mcode 别名。模型调用能力需服务商和所选协议真正支持，不由模型 ID 是否含 MiniMax 决定。'},
 {id:'deepseek-harness',name:'DeepSeek Harness',protocol:'openai',directory:'~/.dsh',environment:'DSH_HOME',
 scope:'更新 profiles/desktop/cordis.patch.yml 中最后一条 llm-pi-ai patch 的 onelinkai provider 与 agent-default-model patch；保留其他 provider。更新 .credentials.yaml 中指定引用。存在旧 OneLinkAI DSH_* 环境变量 / onelinkai-model 旧 patch 时，仅清理这些已知旧项。',
 key:'.credentials.yaml 的 refs.ONELINKAI_API_KEY；模型 patch 只写 apiKeyEnv 引用，不内嵌 Key。认证文件预览正文隐藏。',
 fields:[['llm-pi-ai.config.providers.onelinkai.apiKeyEnv','ONELINKAI_API_KEY'],['…api / baseURL','协议枚举 / Anthropic 根地址或其他 + /v1'],['…models[]','ID、显示名、窗口、输出与 input'],['agent-default-model.config','provider=onelinkai 与本次模型'],['.credentials.yaml.version / refs.ONELINKAI_API_KEY','要求 version=1，更新引用值']],
 after:'这是 desktop profile，CLI 若使用其他 profile 需单独配置。不能继续用旧的 DSH_PROVIDER/MODEL/BASE_URL/API_KEY 环境键代替 Cordis 路由。旧 .env 清理只删除这四个名字，其他行保留。'},
 {id:'zed',name:'Zed',protocol:'openai',directory:'~/.config/zed（macOS）',environment:'Linux 遵循 XDG_CONFIG_HOME；Windows 为 APPDATA/Zed',
 scope:'settings.json 定点替换 language_models.openai_compatible.OneLinkAI 并设置 agent.default_model。其他提供方保留，OneLinkAI 的 available_models 本次替换为单模型。',
 key:'当前生产启动没有向适配器注入 credentials；工作台不写 Zed 钥匙串，生成结果不含 API Key。请在 Zed 自己的设置里手动填写。',
 fields:[['language_models.openai_compatible.OneLinkAI.api_url','根地址 + /v1'],['…available_models[].name / display_name','实际 ID / 显示名'],['…max_tokens / max_output_tokens','窗口（默认128000）/ 输出（默认min(8192,窗口)）'],['…capabilities.tools / images','默认 true / false'],['…capabilities.parallel_tool_calls / chat_completions','均为 true 的适配器声明'],['agent.default_model','provider=OneLinkAI 与模型 ID']],
 after:'仅 Chat Completions。写文件成功仍标记 requiresManualCredential=true，必须在 Zed 内补 Key。代码内保留旧可注入凭据分支供测试 / 兼容使用，但不是当前 Electron 生产接线行为。'},
 {id:'vscode',name:'VS Code',protocol:'openai',directory:'~/Library/Application Support/Code/User（macOS）',environment:'Windows 使用 APPDATA/Code/User；Linux 使用 XDG_CONFIG_HOME/Code/User',
 scope:'修改默认用户 chatLanguageModels.json 数组。查找 vendor=customendpoint 且 name=OneLinkAI 的分组，按模型 ID 替换 / 追加，并保留该组其他模型和其他组。不是写所有 Profile。',
 key:'配置定义不包含 API Key。用户要在 VS Code 管理模型中为 OneLinkAI / Custom Endpoint 保存 Key，由 VS Code 自己管理凭据。',
 fields:[['vendor / name','customendpoint / OneLinkAI'],['models[].id / name','请求 ID / 显示名'],['models[].url','按协议补完整 /v1/chat/completions、/v1/responses 或 /v1/messages'],['models[].apiType','chat-completions / responses / messages'],['contextWindow / maxOutputTokens','默认128000 / min(8192,窗口)'],['toolCalling / vision / thinking','supportsTools默认true，图片和推理默认false']],
 after:'重启 / 重新载入后在管理模型中填 Key 并选择模型。其他 VS Code Profile 需要单独配置；只读查看器能发现部分 profiles，不代表写入器也批量写了它们。'},
 {id:'zcode',name:'ZCode',protocol:'openai',directory:'~/.zcode/v2',environment:'当前适配未提供独立目录覆盖变量',
 scope:'在 config.json 整体替换 provider.onelinkai；其他 provider 保留。设置 enabled=true、source=custom；没有另写全局默认模型字段。',
 key:'provider.onelinkai.options.apiKey。',
 fields:[['provider.onelinkai.name','OneLinkAI'],['…kind','anthropic / openai（Responses）/ openai-compatible'],['…options.baseURL','Anthropic 根地址，其余 + /v1'],['…models.<ID>.contextWindow / maxOutputTokens','填写时映射窗口 / 输出'],['…models.<ID>.modalities.input','supportsImages 为 true 时 text,image，否则 text'],['…enabled / source','true / custom']],
 after:'支持三种非 Gemini 协议，重启后在 ZCode 中选 OneLinkAI 模型。不要把模型定义写入等同于已切换当前会话。'},
 {id:'workbuddy',name:'WorkBuddy',protocol:'openai',directory:'~/.workbuddy',environment:'WORKBUDDY_CONFIG_DIR',
 scope:'models.json 支持根数组或带 models 的对象；按 vendor=OneLinkAI 且模型 ID 匹配替换，其他模型保留。同 ID 已由其他 vendor 占用会报冲突，不强抢条目。对象原有 availableModels 非空时追加新 ID。',
 key:'models.json 的目标模型 apiKey。',
 fields:[['id / name / vendor','实际 ID / 显示名 / OneLinkAI'],['url','根地址 + /v1/chat/completions'],['maxInputTokens','contextWindow 或 128000'],['maxOutputTokens','maxTokens 或 min(8192,窗口)'],['supportsToolCall / supportsImages / supportsReasoning','默认 true / false / false']],
 after:'仅 Chat Completions。保存后重启，在 WorkBuddy 模型列表手动选择。目录中的模型文件和应用 User/settings.json 是不同文件，查看器可展示后者但该适配器不改它。'},
 {id:'hermes',name:'Hermes',protocol:'openai',directory:'~/.hermes（macOS / Linux）',environment:'HERMES_HOME；Windows 默认 LOCALAPPDATA/hermes',
 scope:'通过 YAML 文档替换 providers.onelinkai，设置 model.provider 和 model.default，按需设置 model.context_length、agent.reasoning_effort；其他 provider 与顶层节点保留。要求 YAML 为有效对象。',
 key:'config.yaml 的 providers.onelinkai.api_key。',
 fields:[['providers.onelinkai.base_url / api_key','根地址 + /v1 / Key'],['…api_mode','chat_completions'],['…models.<ID>.context_length','填写 contextWindow 时写'],['model.provider / model.default','onelinkai / 实际模型 ID'],['model.context_length','contextWindow'],['agent.reasoning_effort','reasoningEffort']],
 after:'仅 Chat Completions。maxTokens 不写；当前适配把输出上限交给模型 / 提供方。首次源码安装与 stable 更新不是同一发布线，请结合更新页判断。'},
];
const protocolName = {openai:'OpenAI Chat Completions',responses:'OpenAI Responses',anthropic:'Anthropic Messages',gemini:'Google Gemini 原生'};
async function save(file, content) {
 if (check) { if (await readFile(file,'utf8') !== content) throw new Error('生成文档已过期：'+file); }
 else await writeFile(file, content);
}
const home = await mkdtemp(path.join(tmpdir(),'onelink-doc-examples-'));
try {
 const bin = path.join(home,'bin'); await mkdir(bin);
 for (const name of ['claude','claude-desktop','codex','gemini','grok','opencode','openclaw','pi','mcode','dsh','zed','code','zcode','workbuddy','hermes']) await writeFile(path.join(bin,name),'placeholder',{mode:0o700});
 const service = createAgentService({home,dataDir:path.join(home,'state'),platform:'darwin',env:{PATH:bin},applicationDirs:[],command:async()=>({stdout:'1.0.0\n'})});
 const advanced = {name:'示例显示名称',contextWindow:128000,maxTokens:8192,reasoningEffort:'high',subagentModel:'helper-model',compactThreshold:96000,reviewModel:'review-model',thinkingBudget:1024,supportsImages:true,supportsTools:true,supportsReasoning:true,supports1m:true};
 const normalize = value => value.split(home).join('~');
 const index = [];
 for (const d of definitions) {
  const input={client:d.id,model:d.id==='claude-desktop'?'claude-sonnet-example':'example-model',protocol:d.protocol,baseURL:'https://api.example.com',apiKey:'sk-documentation-fictional-secret'};
  const basic = await service.preview(input);
  const selected=Object.fromEntries(Object.entries(advanced).filter(([key])=>capabilities[d.id].includes(key)));
  const configured = await service.preview({...input,modelSettings:selected});
  const render = plan => plan.files.map(file=>`### ${normalize(file.path)}\n\n\`\`\`${file.path.endsWith('.toml')?'toml':/\.ya?ml$/.test(file.path)?'yaml':file.path.endsWith('.env')?'sh':'jsonc'}\n${normalize(file.content).trimEnd()}\n\`\`\``).join('\n\n');
  const paragraphs = [
   `# ${d.name} 配置参考`,
   `本页以 **OneLinkAI Desktop ${version}** 当前适配器为准。示例以 macOS 路径呈现，由 \`generate-product-docs.mjs\` 调用真实适配器生成；输入为虚构地址和 Key，没有读取本机用户配置，也没有进行真实模型调用。`,
   '## 入口与要求',
   `| 项目 | 当前行为 |\n| --- | --- |\n| 配置目录 | ${d.directory} |\n| 路径覆盖规则 | ${d.environment} |\n| 本页示例协议 | ${protocolName[d.protocol]} |\n| 一键初装 | ${packages[d.id]?'macOS / Windows 托管 npm：`'+packages[d.id]+'`':d.id==='hermes'?'macOS / Windows 官方分阶段源码安装':d.id==='grok'?'macOS / Windows 官方二进制':'macOS 官方桌面包；Windows 使用原渠道'} |`,
   '更多协议限制见[协议总表](/principles/protocols)。能安装与能升级分别判断；当前来源决定一键升级条件，不能只按本页应用名称判断。',
   '## 写入范围与保留规则',d.scope,
   '## Key 保存与手动步骤',d.key,
   '## 字段如何映射',
   '| 原生配置字段 | 写入规则 |\n| --- | --- |\n'+d.fields.map(([field,meaning])=>`| \`${field}\` | ${meaning} |`).join('\n'),
   '## 本应用支持的高级参数',
   capabilities[d.id].map(field=>`- \`${field}\`：${labels[field]}。`).join('\n'),
   notes[d.id],
   effortLevels[d.id]?`推理档位：${effortLevels[d.id].map(v=>'`'+v+'`').join('、')}。允许值来自当前客户端专用能力表，不由所有客户端的并集推断。`:'没有为本应用开放额外的通用推理档位映射。',
   '参数数值、默认值和“留空”语义见[共用参数](/reference/parameters)。能力声明不会替你获得服务商本来不支持的能力。',
   '## 最小输入生成结果',
   `示例输入：模型 \`${input.model}\`、服务根地址 \`https://api.example.com\`、${protocolName[d.protocol]}。展示的是空配置文件上的完整结果；已有文件会按前述规则修改。\`<API_KEY>\` 为预览脱敏符号，实际写入由主进程持有的 Key。`,
   render(basic),
   '## 填写高级参数后的生成结果',
   '以下单独展示支持字段全部填写后的结果，不表示每个用户都应该启用所有能力。',
   '```json\n'+JSON.stringify(selected,null,2)+'\n```',
   render(configured),
   '## 生效与使用注意',d.after,
   '**当前写入提示：** '+configured.notice,
   '## 失败、回滚与恢复',
   '预览不修改文件。提交前会核对原文件哈希，成功保存原始备份后才写入；多文件失败尝试倒序回滚。历史恢复要求当前文件仍等于当时写后版本，后续手动编辑会阻止自动覆盖。详细步骤见[配置事务](/principles/configuration)。',
   '查看器只展示脱敏用户配置，认证文件只报告存在；不会把展示文本直接写回。目标应用里的项目级设置、环境与旧会话可能覆盖本页文件。',
   '## 对应实现',
   `\`electron/agents.cjs\` 的 \`build()\` 中 \`client === "${d.id}"\` 分支；能力表为 \`src/client-capabilities.json\`，提示说明为 \`src/client-setting-notes.json\`。共同写入、验证和恢复走 \`preview/apply/restore\`。`,
  ];
  const markdown = paragraphs.map(paragraph => paragraph.includes('```') ? paragraph : paragraph.split(/(`[^`\n]*`)/g).map(part => part.startsWith('`') ? part : part.replace(/<([A-Z][A-Z_]*)>/g, '&lt;$1&gt;')).join('')).join('\n\n')+'\n';
  await save(path.join(output,d.id+'.md'),markdown);
  index.push(`| [${d.name}](/reference/agents/${d.id}) | ${d.directory} | ${d.protocol} | ${['zed','vscode'].includes(d.id)?'在目标应用手动保存':'按原生文件写入'} |`);
 }
 await save(path.join(output,'index.md'),`# 15 个 Agent 配置总表\n\n这里列出当前适配器实际覆盖的客户端。每个详情页包含写入范围、原生字段、凭据位置、最小与高级参数生成示例、手动步骤及限制。所有示例由实际适配器离线生成。\n\n| Agent | 默认配置目录（主要为 macOS） | 示例协议 | Key 处理 |\n| --- | --- | --- | --- |\n${index.join('\n')}\n\n## 选择之前先确认\n\n1. 确认模型 ID 与协议，不按名字猜兼容性。\n2. 确认当前用户级目录以及环境变量覆盖。\n3. 阅读本 Agent 的覆盖范围，尤其是整个 provider 被替换的情形。\n4. 预览文件并确认手动凭据步骤。\n5. 写入后在目标客户端新建会话验证。\n\n这里的目录与字段不代表其他版本 Agent 永远相同。Windows / Linux 路径和实机验证范围另见[当前状态](/reference/status)，共用参数见[参数说明](/reference/parameters)。\n`);
 console.log(`${check?'Checked':'Generated'} ${definitions.length} Agent pages and overview from production adapters.`);
} finally { await rm(home,{recursive:true,force:true}); }
