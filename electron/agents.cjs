const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const jsonc = require("jsonc-parser");
const toml = require("@iarna/toml");
const YAML = require("yaml");
const { settingsForClient } = require("./model-settings.cjs");
const exec = promisify(execFile);
const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(value ?? "<missing>")
    .digest("hex");
const ids = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grok",
  "opencode",
  "openclaw",
  "pi",
  "minimax",
  "deepseek-harness",
  "zed",
  "vscode",
  "zcode",
  "workbuddy",
  "hermes",
];
const claudeDesktopProfileId = "7c35be79-0924-49ad-9f82-5b07e5c2904a";
// Automatic writes require a verified format and an available authentication path.
const unsupportedAdapters = {
};
const providerApi = protocol => protocol === "anthropic" ? "anthropic-messages" : protocol === "responses" ? "openai-responses" : "openai-completions";
const json = (value) => JSON.stringify(value, null, 2) + "\n";

function parseJSON(text, fallback = {}) {
  if (text === null) return fallback;
  const errors = [];
  const data = jsonc.parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length || data === undefined)
    throw new Error("配置文件不是有效的 JSON/JSONC，已停止以保护原文件");
  return data;
}
function editJSON(text, changes, fallback = {}) {
  let output = text ?? json(fallback);
  const original = parseJSON(output);
  if (!original || typeof original !== "object")
    throw new Error("配置文件必须是对象或数组");
  for (const [key, value] of changes)
    output = jsonc.applyEdits(
      output,
      jsonc.modify(output, key, value, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      }),
    );
  return output;
}
async function read(file) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("拒绝修改符号链接或非普通文件：" + file);
    if (stat.size > 4 * 1024 * 1024) throw new Error("配置文件过大：" + file);
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function atomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + ".onelink-" + crypto.randomUUID();
  try {
    await fs.writeFile(tmp, content, { mode: 0o600, flag: "wx" });
    await fs.rename(tmp, file);
    await fs.chmod(file, 0o600);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
function validate(input) {
  if (!input || !ids.includes(input.client)) throw new Error("未知客户端");
  if (
    typeof input.model !== "string" ||
    !/^[\w./:+-]{1,200}$/.test(input.model)
  )
    throw new Error("模型 ID 无效");
  if (
    typeof input.apiKey !== "string" ||
    input.apiKey.length < 8 ||
    input.apiKey.length > 2048 ||
    /[\r\n\0]/.test(input.apiKey)
  )
    throw new Error("API Key 格式无效");
  const url = new URL(input.baseURL);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("接口地址必须使用 HTTPS（本机测试地址除外）");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("接口地址不能包含凭据、查询参数或片段");
  if (!["anthropic", "openai", "responses", "gemini"].includes(input.protocol))
    throw new Error("请选择接口协议");
  return {
    ...input,
    baseURL: url.href.replace(/\/+$/, "").replace(input.protocol === "gemini" ? /\/v1(?:beta)?$/ : /\/v1$/, ""),
  };
}

function createAgentService({
  home = os.homedir(),
  dataDir,
  platform = process.platform,
  env = process.env,
  command = exec,
  credentials,
  applicationDirs = ["/Applications", path.join(home, "Applications")],
} = {}) {
  const config = env.XDG_CONFIG_HOME || path.join(home, ".config");
  const claudeDesktopRoot = platform === "darwin"
    ? path.join(home, "Library/Application Support")
    : platform === "win32"
      ? env.LOCALAPPDATA || path.join(home, "AppData/Local")
      : config;
  const claudeDesktopNormalDir = path.join(claudeDesktopRoot, "Claude");
  const claudeDesktopThreepDir = path.join(claudeDesktopRoot, "Claude-3p");
  const codeDir = path.join(
    platform === "darwin"
      ? path.join(home, "Library/Application Support")
      : platform === "win32"
        ? env.APPDATA || path.join(home, "AppData/Roaming")
        : config,
    "Code/User",
  );
  const dirs = {
    claude: env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"),
    "claude-desktop": claudeDesktopNormalDir,
    codex: env.CODEX_HOME || path.join(home, ".codex"),
    gemini: path.join(env.GEMINI_CLI_HOME || home, ".gemini"),
    grok: env.GROK_CONFIG_DIR || path.join(home, ".grok"),
    opencode: path.join(config, "opencode"),
    openclaw: env.OPENCLAW_CONFIG_PATH ? path.dirname(env.OPENCLAW_CONFIG_PATH) : env.OPENCLAW_STATE_DIR || path.join(env.OPENCLAW_HOME || home, ".openclaw"),
    pi: env.PI_CODING_AGENT_DIR || path.join(home, ".pi/agent"),
    minimax: env.MINIMAX_DATA_DIR || path.join(home, ".minimax"),
    "deepseek-harness": env.DSH_HOME || path.join(home, ".dsh"),
    zed: path.join(
      platform === "win32"
        ? env.APPDATA || path.join(home, "AppData/Roaming")
        : platform === "darwin"
          ? path.join(home, ".config")
          : config,
      platform === "win32" ? "Zed" : "zed",
    ),
    vscode: codeDir,
    zcode: path.join(home, ".zcode/v2"),
    workbuddy: env.WORKBUDDY_CONFIG_DIR || path.join(home, ".workbuddy"),
    hermes:
      env.HERMES_HOME ||
      (platform === "win32"
        ? path.join(
            env.LOCALAPPDATA || path.join(home, "AppData/Local"),
            "hermes",
          )
        : path.join(home, ".hermes")),
  };
  const names = {
    claude: ["claude"],
    "claude-desktop": ["claude-desktop"],
    codex: ["codex"],
    gemini: ["gemini"],
    grok: ["grok"],
    opencode: ["opencode"],
    openclaw: ["openclaw"],
    pi: ["pi"],
    minimax: ["mcode", "minimax", "minimax-code"],
    "deepseek-harness": ["dsh", "deepseek-harness"],
    zed: ["zed", "zeditor"],
    vscode: ["code"],
    zcode: ["zcode"],
    workbuddy: ["workbuddy"],
    hermes: ["hermes"],
  };
  const bundles = {
    "deepseek-harness": "DeepSeek Harness.app",
    "claude-desktop": "Claude.app",
    zed: "Zed.app",
    vscode: "Visual Studio Code.app",
    zcode: "ZCode.app",
    workbuddy: "WorkBuddy.app",
    codex: "Codex.app",
  };
  const plans = new Map();
  let locked = false;
  const journalPath = path.join(dataDir, "history.json");
  async function history() {
    const value = await read(journalPath);
    return value ? JSON.parse(value) : [];
  }
  async function serialize(fn) {
    if (locked) throw new Error("另一项配置或恢复正在进行，请稍后重试");
    locked = true;
    try {
      return await fn();
    } finally {
      locked = false;
    }
  }
  async function locate(id) {
    const searchDirs = [
      path.join(home, '.onelinkai/managed/bin'),
      ...(platform === 'win32' ? [path.join(env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'hermes/bin')] : []),
      ...(env.PATH || "").split(path.delimiter),
      path.join(home, ".local/bin"),
      path.join(home, ".npm-global/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      path.join(home, ".cargo/bin"),
      path.join(home, ".bun/bin"),
      path.join(home, ".opencode/bin"),
      path.join(home, ".grok/bin"),
      path.join(home, ".hermes/venv/bin"),
    ];
    if (id === "codex" && platform === "darwin")
      searchDirs.push(
        "/Applications/Codex.app/Contents/Resources",
        "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS",
      );
    if (id === "vscode" && platform === "darwin")
      searchDirs.push(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin",
      );
    try {
      for (const dir of await fs.readdir(path.join(home, ".nvm/versions/node")))
        searchDirs.push(path.join(home, ".nvm/versions/node", dir, "bin"));
    } catch {}
    for (const dir of searchDirs.filter(Boolean))
      for (const name of names[id])
        for (const ext of platform === "win32"
          ? [".exe", ".cmd", ".bat", ""]
          : [""]) {
          const file = path.join(dir, name + ext);
          try {
            await fs.access(
              file,
              platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
            );
            if ((await fs.stat(file)).isFile()) return file;
          } catch {}
        }
    return null;
  }
  async function detect() {
    return Promise.all(
      ids.map(async (id) => {
        const executable = await locate(id);
        let bundle;
        if (platform === "darwin" && bundles[id])
          for (const base of applicationDirs) {
            const candidate = path.join(base, bundles[id]);
            try {
              await fs.access(candidate);
              bundle = candidate;
              break;
            } catch {}
          }
        let version = "";
        // Read the selected managed package directly, including Windows .cmd shims.
        const managedBin = path.join(home, '.onelinkai/managed/bin');
        const packageName = require('./installer.cjs').packages[id];
        if (executable && packageName && path.dirname(executable) === managedBin) {
          try {
            const manifest = JSON.parse(await fs.readFile(path.join(home, '.onelinkai/managed/clients', platform === 'win32' ? 'node_modules' : 'lib/node_modules', packageName, 'package.json'), 'utf8'));
            if (require('semver').valid(manifest.version)) version = manifest.version;
          } catch {}
        }
        if (executable && !version) {
          try {
            // Windows command shims need a shell; do not interpolate or execute them here.
            if (platform !== "win32" || executable.endsWith(".exe")) {
              const out = await command(executable, ["--version"], {
                timeout: 4000,
                maxBuffer: 8192,
                env: {
                  ...env,
                  PATH: [
                    ...(env.PATH || "").split(path.delimiter),
                    "/usr/bin",
                    "/bin",
                    "/opt/homebrew/bin",
                    path.dirname(executable),
                  ].join(path.delimiter),
                },
              });
              version =
                (out.stdout || "").match(
                  /\d+\.\d+(?:\.\d+)?(?:[-.\w]*)/,
                )?.[0] || "";
            }
          } catch {}
        }
        if (bundle && (['vscode', 'zed', 'zcode', 'workbuddy', 'claude-desktop'].includes(id) || !version))
          try {
            const { stdout } = await command(
              "/usr/libexec/PlistBuddy",
              [
                "-c",
                "Print :CFBundleShortVersionString",
                path.join(bundle, "Contents/Info.plist"),
              ],
              { timeout: 3000 },
            );
            version = stdout.trim();
          } catch {}
        const configExists = await fs.access(dirs[id]).then(
          () => true,
          () => false,
        );
        const installed = !!(executable || bundle);
        return {
          id,
          installed,
          version,
          executable,
          bundle,
          configExists,
          path: dirs[id],
          evidence:
            executable ||
            bundle ||
            (configExists
              ? "仅发现残留配置目录，未确认安装"
              : "未发现可执行文件或应用"),
          supported: !unsupportedAdapters[id],
          reason: unsupportedAdapters[id] || "",
        };
      }),
    );
  }
  async function build(raw) {
    const input = validate(raw);
    const { client, model, apiKey, baseURL, protocol } = input;
    const { settings, ignored } = settingsForClient(client, input.modelSettings);
    const modelName = settings.name || model;
    const limits = { ...(settings.contextWindow ? { context: settings.contextWindow } : {}), ...(settings.maxTokens ? { output: settings.maxTokens } : {}) };
    const modelTraits = { ...(settings.contextWindow ? { contextWindow: settings.contextWindow } : {}), ...(settings.maxTokens ? { maxTokens: settings.maxTokens } : {}), ...(settings.supportsImages !== undefined ? { input: settings.supportsImages ? ["text", "image"] : ["text"] } : {}) };
    if (["pi", "zed", "workbuddy", "vscode"].includes(client) && settings.maxTokens > (settings.contextWindow || 128000))
      throw new Error("最大输出 Token 不能大于上下文窗口；如需更大输出，请同时填写模型的实际上下文窗口");
    if (unsupportedAdapters[client]) throw new Error(unsupportedAdapters[client]);
    if (client === "gemini" && protocol !== "gemini") throw new Error("Gemini CLI 需要 Google Gemini 原生协议，请选择支持此协议的服务商");
    if (client !== "gemini" && protocol === "gemini") throw new Error("当前应用不支持 Google Gemini 原生协议");
    if (["claude", "claude-desktop"].includes(client) && protocol !== "anthropic")
      throw new Error(
        "Claude 客户端需要 Anthropic Messages 协议，请选择兼容协议",
      );
    if (client === "claude-desktop" && !/^(?:claude-|anthropic\/claude-)(?:sonnet|opus|haiku|fable)-.+$/i.test(model))
      throw new Error("Claude Desktop 直连只支持 claude-sonnet/opus/haiku/fable-* 模型 ID；其他模型需要模型映射代理");
    if (client === "codex" && protocol !== "responses")
      throw new Error("Codex 需要 OpenAI Responses 协议");
    if (client === "grok" && protocol !== "responses")
      throw new Error("Grok Build 需要 OpenAI Responses 协议");
    if (
      ["workbuddy", "hermes", "zed"].includes(client) &&
      protocol !== "openai"
    )
      throw new Error("此客户端适配器需要 OpenAI Chat Completions 协议");
    const dir = dirs[client];
    const files = [];
    async function addPath(file, edit) {
      const before = await read(file);
      files.push({ path: file, before, after: edit(before) });
    }
    async function add(name, edit) {
      await addPath(path.join(dir, name), edit);
    }
    const provider = {
      name: "OneLinkAI",
      options: {
        baseURL: baseURL + (protocol === "anthropic" ? "" : "/v1"),
        apiKey,
      },
      models: { [model]: { name: modelName } },
    };
    if (client === "claude")
      await add("settings.json", (text) =>
        editJSON(text, [
          [["env", "ANTHROPIC_BASE_URL"], baseURL],
          [["env", "ANTHROPIC_AUTH_TOKEN"], apiKey],
          [["env", "ANTHROPIC_API_KEY"], apiKey],
          ...[
            "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "CLAUDE_CODE_SUBAGENT_MODEL",
          ].map((key) => [["env", key], model]),
          [["model"], model],
          ...(settings.maxTokens ? [[["env", "CLAUDE_CODE_MAX_OUTPUT_TOKENS"], String(settings.maxTokens)]] : []),
          ...(settings.reasoningEffort ? [[["effortLevel"], settings.reasoningEffort]] : []),
          ...(settings.subagentModel ? [[["env", "CLAUDE_CODE_SUBAGENT_MODEL"], settings.subagentModel]] : []),
        ]),
      );
    if (client === "claude-desktop") {
      const normalConfig = path.join(claudeDesktopNormalDir, "claude_desktop_config.json");
      const threepConfig = path.join(claudeDesktopThreepDir, "claude_desktop_config.json");
      const profilePath = path.join(claudeDesktopThreepDir, "configLibrary", `${claudeDesktopProfileId}.json`);
      const metaPath = path.join(claudeDesktopThreepDir, "configLibrary", "_meta.json");
      const hostname = new URL(baseURL).hostname;
      const deploymentEdit = text => {
        const value = parseJSON(text);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("Claude Desktop 配置必须是 JSON 对象，未修改");
        return editJSON(text, [[["deploymentMode"], "3p"]]);
      };
      await addPath(normalConfig, deploymentEdit);
      await addPath(threepConfig, deploymentEdit);
      await addPath(profilePath, text => {
        const existing = parseJSON(text);
        if (!existing || typeof existing !== "object" || Array.isArray(existing))
          throw new Error("Claude Desktop profile 必须是 JSON 对象，未修改");
        return editJSON(text, [
        ...(!Object.hasOwn(existing, "coworkEgressAllowedHosts") ? [[["coworkEgressAllowedHosts"], [hostname]]] : []),
        [["disableDeploymentModeChooser"], true],
        [["inferenceGatewayApiKey"], apiKey],
        [["inferenceGatewayAuthScheme"], "bearer"],
        [["inferenceGatewayBaseUrl"], baseURL],
        [["inferenceModels"], [settings.name || settings.supports1m !== undefined || settings.reasoningEffort
          ? { name: model, ...(settings.name ? { labelOverride: modelName } : {}), ...(settings.supports1m !== undefined ? { supports1m: settings.supports1m } : {}), ...(settings.reasoningEffort ? { maxEffort: settings.reasoningEffort } : {}) }
          : model]],
        [["inferenceProvider"], "gateway"],
      ]);
      });
      await addPath(metaPath, text => {
        const meta = parseJSON(text);
        if (Array.isArray(meta) || !meta || typeof meta !== "object")
          throw new Error("Claude Desktop profile 元数据必须是 JSON 对象，未修改");
        const entries = meta.entries ?? [];
        if (!Array.isArray(entries))
          throw new Error("Claude Desktop profile entries 必须是数组，未修改");
        const existingIndex = entries.findIndex(entry => entry?.id === claudeDesktopProfileId);
        const nextEntries = [...entries];
        if (existingIndex < 0)
          nextEntries.push({ id: claudeDesktopProfileId, name: "OneLinkAI" });
        else
          nextEntries[existingIndex] = { ...nextEntries[existingIndex], name: "OneLinkAI" };
        return editJSON(text, [
          [["entries"], nextEntries],
          [["appliedId"], claudeDesktopProfileId],
        ]);
      });
    }
    if (client === "gemini") {
      if (/["'`\\]/.test(apiKey)) throw new Error("Gemini 环境文件密钥包含不支持的引号或转义字符");
      await add(".env", text => {
        for (const line of (text || "").split(/\r?\n/)) {
          const match = line.match(/^\s*(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_GEMINI_BASE_URL)\s*=\s*(["'`])/);
          if (match && !line.trimEnd().endsWith(match[1])) throw new Error("Gemini 已有凭据使用多行环境变量，请先在客户端整理为单行配置");
        }
        const rest = (text || "").split(/(?<=\n)/).filter(line => !/^\s*(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_GEMINI_BASE_URL)\s*=/.test(line)).join("");
        return rest + (rest && !rest.endsWith("\n") ? "\n" : "") + `GEMINI_API_KEY="${apiKey}"\nGOOGLE_GEMINI_BASE_URL="${baseURL}"\n`;
      });
      await add("settings.json", text => {
        const old = parseJSON(text);
        const overrides = old.modelConfigs?.customOverrides ?? [];
        if (!Array.isArray(overrides)) throw new Error("Gemini customOverrides 必须为数组");
        const generateContentConfig = { ...(settings.maxTokens ? { maxOutputTokens: settings.maxTokens } : {}), ...(settings.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: settings.thinkingBudget } } : {}) };
        const changes = [
          [["model", "name"], model], [["security", "auth", "selectedType"], "gemini-api-key"],
          [["modelConfigs", "modelDefinitions", model], { ...old.modelConfigs?.modelDefinitions?.[model], displayName: modelName, isVisible: true }],
        ];
        if (Object.keys(generateContentConfig).length) {
          const entry = { match: { model }, modelConfig: { generateContentConfig } };
          // No private schema keys: replace an exact model-only override, preserving its options.
          const exact = overrides.findLastIndex(item => item?.match?.model === model && Object.keys(item.match).length === 1);
          const next = [...overrides];
          if (exact >= 0 && generateContentConfig.thinkingConfig) {
            generateContentConfig.thinkingConfig = { ...next[exact].modelConfig?.generateContentConfig?.thinkingConfig, ...generateContentConfig.thinkingConfig };
          }
          if (exact >= 0) next[exact] = { ...next[exact], modelConfig: { ...next[exact].modelConfig, generateContentConfig: { ...next[exact].modelConfig?.generateContentConfig, ...generateContentConfig } } };
          else next.push(entry);
          changes.push([["modelConfigs", "customOverrides"], next]);
        }
        return editJSON(text, changes);
      });
    }
    if (client === "vscode") {
      await add("chatLanguageModels.json", text => {
        const old = parseJSON(text, []);
        if (!Array.isArray(old)) throw new Error("VS Code 模型配置必须为数组");
        const index = old.findIndex(group => group?.vendor === "customendpoint" && group?.name === "OneLinkAI");
        const group = index >= 0 ? old[index] : { vendor: "customendpoint", name: "OneLinkAI" };
        if (group.models !== undefined && !Array.isArray(group.models)) throw new Error("VS Code models 必须为数组");
        const entry = { id: model, name: modelName, url: baseURL + (protocol === "anthropic" ? "/v1/messages" : protocol === "responses" ? "/v1/responses" : "/v1/chat/completions"), apiType: protocol === "anthropic" ? "messages" : protocol === "responses" ? "responses" : "chat-completions", contextWindow: settings.contextWindow || 128000, maxOutputTokens: settings.maxTokens || Math.min(8192, settings.contextWindow || 128000), toolCalling: settings.supportsTools ?? true, vision: settings.supportsImages ?? false, thinking: settings.supportsReasoning ?? false };
        const next = [...old];
        const updated = { ...group, models: [...(group.models || []).filter(item => item.id !== model), entry] };
        if (index >= 0) next[index] = updated; else next.push(updated);
        return editJSON(text, [[[], next]], []);
      });
    }
    if (client === "grok")
      await add("config.toml", text => {
        let data;
        try {
          data = text === null ? {} : toml.parse(text);
        } catch (error) {
          throw new Error(`Grok Build config.toml 格式无效，未修改：${error.message}`);
        }
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("Grok Build config.toml 必须是 TOML 表结构，未修改");
        const models = data.models ?? {};
        const modelTables = data.model ?? {};
        if (!models || typeof models !== "object" || Array.isArray(models) || !modelTables || typeof modelTables !== "object" || Array.isArray(modelTables))
          throw new Error("Grok Build models/model 必须是 TOML 表结构，未修改");
        const currentProfile = modelTables.onelinkai ?? {};
        if (!currentProfile || typeof currentProfile !== "object" || Array.isArray(currentProfile))
          throw new Error("Grok Build [model.onelinkai] 必须是 TOML 表结构，未修改");
        data.models = { ...models, default: "onelinkai" };
        if (!models.session_summary || models.session_summary === "onelinkai")
          data.models.session_summary = "onelinkai";
        data.model = {
          ...modelTables,
          onelinkai: {
            ...currentProfile,
            model,
            base_url: baseURL + "/v1",
            name: "OneLinkAI",
            api_key: apiKey,
            api_backend: "responses",
            context_window: settings.contextWindow || 500000,
          },
        };
        delete data.model.onelinkai.env_key;
        return toml.stringify(data);
      });
    if (client === "codex") {
      await add("config.toml", (text) => {
        const data = text === null ? {} : toml.parse(text);
        data.model = model;
        if (settings.contextWindow) data.model_context_window = settings.contextWindow;
        if (settings.compactThreshold) {
          if (data.model_context_window && settings.compactThreshold >= data.model_context_window) throw new Error("自动压缩阈值必须小于上下文窗口");
          data.model_auto_compact_token_limit = settings.compactThreshold;
        }
        if (settings.reasoningEffort) data.model_reasoning_effort = settings.reasoningEffort;
        if (settings.reviewModel) data.review_model = settings.reviewModel;
        if (data.model_context_window && data.model_auto_compact_token_limit >= data.model_context_window) throw new Error("现有自动压缩阈值不小于新上下文窗口，请一并调整阈值");
        data.model_provider = "onelinkai";
        data.model_providers ||= {};
        data.model_providers.onelinkai = {
          ...(data.model_providers.onelinkai || {}),
          name: "OneLinkAI",
          base_url: baseURL + "/v1",
          wire_api: "responses",
          experimental_bearer_token: apiKey,
          requires_openai_auth: false,
        };
        delete data.model_providers.onelinkai.env_key;
        delete data.model_providers.onelinkai.env_http_headers;
        return toml.stringify(data);
      });
    }
    if (client === "opencode") {
      const file = await fs.access(path.join(dir, "opencode.jsonc")).then(
        () => "opencode.jsonc",
        () => "opencode.json",
      );
      if (Object.keys(limits).length) provider.models[model].limit = limits;
      provider.options.baseURL = baseURL + "/v1";
      provider.npm =
        protocol === "anthropic"
          ? "@ai-sdk/anthropic"
          : "@ai-sdk/openai-compatible";
      if (protocol === "responses") provider.npm = "@ai-sdk/openai";
      await add(file, (text) =>
        editJSON(text, [
          [["provider", "onelinkai"], provider],
          [["model"], "onelinkai/" + model],
        ]),
      );
    }
    if (client === "pi") {
      await add("models.json", (text) =>
        editJSON(text, [
          [
            ["providers", "onelinkai"],
            {
              baseUrl: baseURL + (protocol === "anthropic" ? "" : "/v1"),
              apiKey,
              api:
                protocol === "anthropic"
                  ? "anthropic-messages"
                  : protocol === "responses"
                    ? "openai-responses"
                    : "openai-completions",
              models: [
                {
                  id: model,
                  name: modelName,
                  reasoning: settings.supportsReasoning ?? false,
                  input: settings.supportsImages ? ["text", "image"] : ["text"],
                  contextWindow: settings.contextWindow || 128000,
                  maxTokens: settings.maxTokens || Math.min(8192, settings.contextWindow || 128000),
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                },
              ],
            },
          ],
        ]),
      );
      await add("settings.json", (text) => {
        const old = parseJSON(text);
        const changes = [
          [["defaultProvider"], "onelinkai"],
          [["defaultModel"], model],
          ...(settings.reasoningEffort ? [[["defaultThinkingLevel"], settings.reasoningEffort]] : []),
        ];
        if (
          Array.isArray(old.enabledModels) &&
          old.enabledModels.length &&
          !old.enabledModels.includes("onelinkai/" + model)
        )
          changes.push([
            ["enabledModels"],
            [...old.enabledModels, "onelinkai/" + model],
          ]);
        return editJSON(text, changes);
      });
    }
    if (client === "openclaw")
      await add(env.OPENCLAW_CONFIG_PATH ? path.basename(env.OPENCLAW_CONFIG_PATH) : "openclaw.json", (text) => editJSON(text, [
        [["models", "mode"], "merge"],
        [["models", "providers", "onelinkai"], { baseUrl: baseURL + (protocol === "anthropic" ? "" : "/v1"), apiKey, api: providerApi(protocol), models: [{ id: model, name: modelName, ...modelTraits, ...(settings.supportsReasoning !== undefined ? { reasoning: settings.supportsReasoning } : {}) }] }],
        [["agents", "defaults", "model", "primary"], "onelinkai/" + model],
        ...(settings.reasoningEffort ? [[["agents", "defaults", "thinkingDefault"], settings.reasoningEffort]] : []),
        ...(settings.subagentModel ? [[["agents", "defaults", "subagents", "model"], settings.subagentModel]] : []),
      ]));
    if (client === "minimax")
      await add("config.yaml", text => {
        const doc = YAML.parseDocument(text ?? "{}");
        if (doc.errors.length || !YAML.isMap(doc.contents)) throw new Error("MiniMax YAML 配置必须是有效对象，未修改");
        doc.setIn(["custom_provider", "onelinkai"], {
          name: "OneLinkAI", kind: "custom", enabled: true, api: providerApi(protocol),
          options: { baseURL: baseURL + (protocol === "anthropic" ? "" : "/v1"), apiKey, authMode: "api-key" },
          models: { [model]: { name: modelName, ...(Object.keys(limits).length ? { limit: limits } : {}), ...(settings.supportsImages !== undefined ? { capabilities: { support_image: settings.supportsImages } } : {}) } },
        });
        doc.set("defaultModel", "custom_provider:onelinkai/" + model);
        return doc.toString();
      });
    if (client === "deepseek-harness") {
      // DSH 0.2 uses Cordis entry patches and credential references, never DSH_* dotenv keys.
      const patchFile = "profiles/desktop/cordis.patch.yml";
      await add(patchFile, (text) => {
        const doc = YAML.parseDocument(text ?? "[]");
        if (doc.errors.length || !YAML.isSeq(doc.contents))
          throw new Error("DeepSeek Harness cordis.patch.yml 必须是有效补丁列表，未修改");
        const patches = doc.toJS();
        const providerIndex = patches.findLastIndex(item => item?.id === "llm-pi-ai");
        const oldConfig = providerIndex < 0 ? {} : patches[providerIndex].config || {};
        const route = {
          displayName: "OneLinkAI", apiKeyEnv: "ONELINKAI_API_KEY",
          api: protocol === "anthropic" ? "anthropic-messages" : protocol === "responses" ? "openai-responses" : "openai-completions",
          baseURL: baseURL + (protocol === "anthropic" ? "" : "/v1"),
          models: [{ id: model, name: modelName, ...modelTraits }],
        };
        const config = { ...oldConfig, providers: { ...oldConfig.providers, onelinkai: route } };
        if (providerIndex < 0) doc.add({ id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config });
        else doc.setIn([providerIndex, "config"], config);
        const defaultIndex = patches.findLastIndex(item => item?.id === "agent-default-model");
        const selection = { provider: "onelinkai", model };
        if (defaultIndex < 0) doc.add({ id: "agent-default-model", config: selection });
        else doc.setIn([defaultIndex, "config"], selection);
        return doc.toString();
      });
      await add(".credentials.yaml", (text) => {
        const doc = YAML.parseDocument(text ?? "version: 1\nrefs: {}\n");
        if (doc.errors.length || !YAML.isMap(doc.contents) || doc.get("version") !== 1)
          throw new Error("DeepSeek Harness 凭据文件格式无效，未修改");
        doc.setIn(["refs", "ONELINKAI_API_KEY"], apiKey);
        return doc.toString();
      });
      // Migrate only the four names emitted by the old OneLinkAI adapter.
      const envText = await read(path.join(dir, ".env"));
      if (envText !== null && /^\s*(?:export\s+)?DSH_(?:PROVIDER|MODEL|BASE_URL|API_KEY)\s*=/m.test(envText))
        await add(".env", text => text.split(/(?<=\n)/).filter(line => !/^\s*(?:export\s+)?DSH_(?:PROVIDER|MODEL|BASE_URL|API_KEY)\s*=/.test(line)).join(""));
      const legacyText = await read(path.join(dir, "config.yaml"));
      if (legacyText?.includes("onelinkai-model")) {
        const doc = YAML.parseDocument(legacyText);
        if (doc.errors.length || !YAML.isSeq(doc.contents)) throw new Error("旧版 DSH 配置无效，未修改");
        if (doc.toJS().some(item => item?.id === "onelinkai-model"))
          await add("config.yaml", () => {
            for (let i = doc.contents.items.length; i-- > 0;)
              if (doc.getIn([i, "id"]) === "onelinkai-model") doc.delete(i);
            return doc.toString();
          });
      }
    }

    if (client === "hermes")
      await add("config.yaml", (text) => {
        const doc = YAML.parseDocument(text || "{}");
        if (doc.errors.length || !YAML.isMap(doc.contents)) throw new Error("Hermes YAML 配置必须是有效对象，未修改");
        doc.setIn(["providers", "onelinkai"], {
          name: "OneLinkAI",
          base_url: baseURL + "/v1",
          api_key: apiKey,
          api_mode: "chat_completions",
          models: { [model]: { ...(settings.contextWindow ? { context_length: settings.contextWindow } : {}) } },
        });
        doc.setIn(["model", "provider"], "onelinkai");
        doc.setIn(["model", "default"], model);
        if (settings.contextWindow) doc.setIn(["model", "context_length"], settings.contextWindow);
        if (settings.reasoningEffort) doc.setIn(["agent", "reasoning_effort"], settings.reasoningEffort);
        return doc.toString();
      });
    if (client === "workbuddy")
      await add("models.json", (text) => {
        const old = parseJSON(text, []);
        const list = Array.isArray(old) ? old : old.models || [];
        if (!Array.isArray(list))
          throw new Error("WorkBuddy models 必须是列表");
        if (list.some(m => m.id === model && m.vendor !== "OneLinkAI"))
          throw new Error("WorkBuddy 已有相同模型 ID 的其他提供方配置，请先在客户端处理冲突");
        const entry = {
          id: model,
          name: modelName,
          vendor: "OneLinkAI",
          apiKey,
          url: baseURL + "/v1/chat/completions",
          maxInputTokens: settings.contextWindow || 128000,
          maxOutputTokens: settings.maxTokens || Math.min(8192, settings.contextWindow || 128000),
          supportsToolCall: settings.supportsTools ?? true,
          supportsImages: settings.supportsImages ?? false,
          supportsReasoning: settings.supportsReasoning ?? false,
        };
        const updated = [
          ...list.filter((m) => !(m.vendor === "OneLinkAI" && m.id === model)),
          entry,
        ];
        if (Array.isArray(old)) return editJSON(text, [[[], updated]], []);
        const changes = [[["models"], updated]];
        if (Array.isArray(old.availableModels) && old.availableModels.length)
          changes.push([
            ["availableModels"],
            [...new Set([...old.availableModels, model])],
          ]);
        return editJSON(text, changes);
      });
    if (client === "zcode") {
      if (settings.contextWindow) provider.models[model].contextWindow = settings.contextWindow;
      if (settings.maxTokens) provider.models[model].maxOutputTokens = settings.maxTokens;
      if (settings.supportsImages !== undefined) provider.models[model].modalities = { input: settings.supportsImages ? ["text", "image"] : ["text"] };
      await add("config.json", (text) =>
        editJSON(text, [
          [
            ["provider", "onelinkai"],
            {
              ...provider,
              kind: protocol === "anthropic" ? "anthropic" : protocol === "responses" ? "openai" : "openai-compatible",
              enabled: true,
              source: "custom",
            },
          ],
        ]),
      );
    }
    let credential;
    if (client === "zed") {
      if (credentials) credential = {
        url: baseURL + "/v1",
        before: await credentials.get(baseURL + "/v1"),
        after: apiKey,
      };
      await add("settings.json", (text) =>
        editJSON(text, [
          [
            ["language_models", "openai_compatible", "OneLinkAI"],
            {
              api_url: baseURL + "/v1",
              available_models: [
                {
                  name: model,
                  display_name: modelName,
                  max_tokens: settings.contextWindow || 128000,
                  max_output_tokens: settings.maxTokens || Math.min(8192, settings.contextWindow || 128000),
                  capabilities: {
                    tools: settings.supportsTools ?? true,
                    images: settings.supportsImages ?? false,
                    parallel_tool_calls: true,
                    chat_completions: true,
                  },
                },
              ],
            },
          ],
          [["agent", "default_model"], { provider: "OneLinkAI", model }],
        ]),
      );
    }
    return {
      input,
      ignored: ignored.filter(label => label !== "模型显示名称" || input.modelSettings?.name !== model),
      files,
      credential,
      notice: client === "zed" && !credentials ? "模型定义已写入，请在 Zed 的模型设置中为 OneLinkAI 手动填写 API Key。本应用不访问系统钥匙串。" : client === "vscode" ? "模型定义已生成，密钥尚未写入。请在 VS Code 的管理模型中打开 OneLinkAI / Custom Endpoint，填写 API Key 并保存到 VS Code 密钥存储，再选择模型。此配置写入默认用户配置，其他 VS Code Profile 需单独设置。" : client === "gemini" ? "已配置 Google Gemini 原生协议；重启终端后开启新会话。项目 .env 或已导出的环境变量可能覆盖全局凭据，请在 Gemini 内确认。" : client === "claude-desktop" ? "已生成 Claude Desktop 第三方网关 profile，请完全退出并重启 Claude Desktop 后选择 OneLinkAI。直连使用 Anthropic Messages 与 Claude 角色模型。" : client === "grok" ? "已选择 OneLinkAI Responses 模型，请重启 Grok Build 或开启新会话。" : client === "deepseek-harness" ? "已配置 DSH desktop profile；CLI 使用其他 profile 时需单独配置。配置写入校验不代表模型请求成功。" : ["workbuddy", "zcode"].includes(client)
        ? "配置后重启客户端，在模型列表中选择 OneLinkAI 模型。"
        : "配置后请重启客户端或开启新会话；已运行会话可能继续使用旧配置。",
    };
  }
  function publicPlan(plan) {
    const redact = (value) => value?.replaceAll(plan.input.apiKey, "<API_KEY>")
      .replace(/("(?:apiKey|api_key|inferenceGatewayApiKey|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|Authorization|token|password)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, '$1"<REDACTED>"')
      .replace(/^(\s*(?:experimental_bearer_token|api_key|token|password)\s*[:=]\s*).*$/gmi, '$1"<REDACTED>"');
    return {
      token: plan.token,
      files: plan.files.map((f) => ({
        path: f.path,
        existed: f.before !== null,
        content: plan.input.client === "deepseek-harness" && f.path.endsWith(".credentials.yaml")
          ? "version: 1\nrefs:\n  ONELINKAI_API_KEY: <API_KEY>\n# 已有凭据保留，预览隐藏全部凭据内容\n"
          : plan.input.client === "gemini" && f.path.endsWith(".env") ? "# Gemini 环境凭据文件：预览隐藏全部内容\n# 将更新 GEMINI_API_KEY 和 GOOGLE_GEMINI_BASE_URL，其他环境变量保留\n" : redact(f.after),
      })),
      credential: plan.credential
        ? "macOS 钥匙串：" + plan.credential.url
        : null,
      notice: plan.notice + (plan.ignored?.length ? ` 以下参数由当前客户端或服务端管理，未写入：${plan.ignored.join("、")}。` : ""),
      model: plan.input.model,
      requiresManualCredential: plan.input.client === "vscode" || (plan.input.client === "zed" && !plan.credential),
    };
  }
  async function preview(raw) {
    const plan = await build(raw);
    const detected = (await detect()).find((c) => c.id === raw.client);
    if (!detected.installed)
      throw new Error("未检测到此客户端，请先安装或检查可执行文件路径");
    if (plans.size > 20) plans.clear();
    plan.token = crypto.randomUUID();
    plan.created = Date.now();
    plans.set(plan.token, plan);
    return publicPlan(plan);
  }
  async function apply(token) {
    return serialize(async () => {
      const plan = plans.get(token);
      plans.delete(token);
      if (!plan || Date.now() - plan.created > 10 * 60 * 1000)
        throw new Error("配置预览已过期，请重新预览");
      for (const file of plan.files)
        if (hash(await read(file.path)) !== hash(file.before))
          throw new Error("配置已被其他程序修改，请重新预览：" + file.path);
      if (
        plan.credential &&
        (await credentials.get(plan.credential.url)) !== plan.credential.before
      )
        throw new Error("Zed 凭据已变化，请重新预览");
      const id = crypto.randomUUID();
      const backupDir = path.join(dataDir, "backups", id);
      await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
      for (let i = 0; i < plan.files.length; i++)
        if (plan.files[i].before !== null)
          await atomic(path.join(backupDir, i + ".bak"), plan.files[i].before);
      if (plan.credential)
        await atomic(
          path.join(backupDir, "credential.enc"),
          credentials.encrypt(JSON.stringify(plan.credential)),
        );
      const changed = [];
      let credentialChanged = false;
      try {
        if (plan.credential) {
          await credentials.set(plan.credential.url, plan.credential.after);
          credentialChanged = true;
        }
        for (const file of plan.files) {
          await atomic(file.path, file.after);
          changed.push(file);
          if (hash(await read(file.path)) !== hash(file.after))
            throw new Error("写入后校验失败：" + file.path);
        }
        const entry = {
          id,
          client: plan.input.client,
          model: plan.input.model,
      requiresManualCredential: plan.input.client === "vscode" || (plan.input.client === "zed" && !plan.credential),
          time: new Date().toISOString(),
          files: plan.files.map((f, index) => ({
            path: f.path,
            index,
            existed: f.before !== null,
            hash: hash(f.after),
          })),
          credential: !!plan.credential,
          requiresManualCredential: plan.input.client === "vscode" || (plan.input.client === "zed" && !plan.credential),
          notice: plan.notice + (plan.ignored?.length ? ` 以下参数由当前客户端或服务端管理，未写入：${plan.ignored.join("、")}。` : ""),
          restored: false,
        };
        await atomic(journalPath, json([entry, ...(await history())]));
        return { ...entry, verified: true, verification: "file-readback" };
      } catch (error) {
        const failures = [];
        for (const file of changed.reverse())
          try {
            if (file.before === null) await fs.rm(file.path);
            else await atomic(file.path, file.before);
          } catch (e) {
            failures.push(e.message);
          }
        if (credentialChanged)
          try {
            await credentials.set(plan.credential.url, plan.credential.before);
          } catch (e) {
            failures.push(e.message);
          }
        throw new Error(
          error.message +
            (failures.length
              ? "；回滚失败，备份位于 " + backupDir
              : "；已回滚本次修改"),
        );
      }
    });
  }
  async function restore(id) {
    return serialize(async () => {
      const entries = await history();
      const entry = entries.find((e) => e.id === id);
      if (!entry || entry.restored) throw new Error("备份不存在或已恢复");
      const backupDir = path.join(dataDir, "backups", entry.id);
      const files = [];
      for (const file of entry.files) {
        const current = await read(file.path);
        if (hash(current) !== file.hash)
          throw new Error(
            "配置在写入后已变化，为避免覆盖请手动处理：" + file.path,
          );
        files.push({
          ...file,
          current,
          backup: file.existed
            ? await read(path.join(backupDir, file.index + ".bak"))
            : null,
        });
        if (file.existed && files.at(-1).backup === null)
          throw new Error("备份文件缺失，无法恢复");
      }
      let credential;
      if (entry.credential) {
        credential = JSON.parse(
          credentials.decrypt(
            await fs.readFile(path.join(backupDir, "credential.enc")),
          ),
        );
        if ((await credentials.get(credential.url)) !== credential.after)
          throw new Error("Zed 凭据已变化，无法自动恢复");
      }
      const changed = [];
      try {
        for (const file of files) {
          if (file.backup === null) await fs.rm(file.path);
          else await atomic(file.path, file.backup);
          changed.push(file);
        }
        if (credential)
          await credentials.set(credential.url, credential.before);
        entry.restored = true;
        entry.restoredAt = new Date().toISOString();
        await atomic(journalPath, json(entries));
        return entry;
      } catch (error) {
        for (const file of changed.reverse())
          await atomic(file.path, file.current);
        if (credential) await credentials.set(credential.url, credential.after);
        throw error;
      }
    });
  }
  const configInspector = require('./config-inspector.cjs').createConfigInspector({
    dirs, home, env, platform, claudeDesktopThreepDir, profileId: claudeDesktopProfileId, read,
  });
  return { detect, preview, apply, restore, history, inspectConfig: configInspector.inspect };
}

async function testConnection(raw) {
  const input = validate(raw);
  const { baseURL, model, apiKey, protocol } = input;
  const endpoint =
    protocol === "gemini" ? "/v1beta/models/" + encodeURIComponent(model.replace(/^models\//, "")) + ":generateContent" : protocol === "anthropic"
      ? "/v1/messages"
      : protocol === "responses"
        ? "/v1/responses"
        : "/v1/chat/completions";
  const body =
    protocol === "gemini" ? { contents: [{ role: "user", parts: [{ text: "Reply OK" }] }], generationConfig: { maxOutputTokens: 16 } } : protocol === "anthropic"
      ? {
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "Reply OK" }],
        }
      : protocol === "responses"
        ? { model, input: "Reply OK", max_output_tokens: 16 }
        : {
            model,
            max_tokens: 8,
            messages: [{ role: "user", content: "Reply OK" }],
          };
  const response = await fetch(baseURL + endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      ...(protocol === "gemini" ? { "x-goog-api-key": apiKey } : protocol === "anthropic"
        ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        : { Authorization: "Bearer " + apiKey }),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      "模型连接失败：HTTP " +
        response.status +
        "，请检查地址、密钥、模型和协议",
    );
  }
  const data = await response.json();
  const valid =
    protocol === "gemini" ? Array.isArray(data.candidates) && data.candidates.some(candidate => candidate.content?.parts?.length) : protocol === "anthropic"
      ? data.type === "message" && Array.isArray(data.content)
      : protocol === "responses"
        ? data.object === "response" &&
          data.status !== "failed" &&
          Array.isArray(data.output)
        : Array.isArray(data.choices) && data.choices.length > 0;
  if (!valid || data.error)
    throw new Error("服务返回成功状态，但不是预期的模型响应");
  return { ok: true, protocol, model };
}
module.exports = { createAgentService, testConnection };
