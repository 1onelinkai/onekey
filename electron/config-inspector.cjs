const fs = require('node:fs/promises');
const path = require('node:path');
const jsonc = require('jsonc-parser');
const JSON5 = require('json5');
const toml = require('@iarna/toml');
const YAML = require('yaml');

const hidden = '<REDACTED>';
const secretName = /api.?key|token|secret|password|passwd|authorization|credential|cookie|private.?key|client.?secret/i;
const publicSetting = /^(?:apiKeyEnv|apiKeyEnvVar|env_key|requires_openai_auth|authMode|authType|selectedType|inferenceGatewayAuthScheme|tokenizer|maxTokens|max_tokens|max_output_tokens|maxInputTokens|maxOutputTokens|contextWindow|context_length|model_context_window|model_auto_compact_token_limit|CLAUDE_CODE_MAX_OUTPUT_TOKENS)$/i;
function scrubString(text) {
  return text
    .replace(/\b(?:sk-|gh[pousr]_|github_pat_|AIza)[A-Za-z0-9_.-]{8,}/g, hidden)
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer ' + hidden)
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1<REDACTED>@')
    .replace(/([?&](?:api[_-]?key|token|secret|password|signature|access[_-]?token)=)[^&#\s]*/gi, '$1' + hidden);
}
function sanitize(value, key = '', depth = 0) {
  if (depth > 60) throw new Error('配置嵌套层级过深');
  if ((secretName.test(key) && !publicSetting.test(key)) || /^(?:headers|http_headers|args|command|oauthAccount)$/i.test(key)) return hidden;
  if (key === 'env' && value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).map(name => [name, /^(?:ANTHROPIC_(?:BASE_URL|MODEL|DEFAULT_\w+_MODEL)|CLAUDE_CODE_(?:SUBAGENT_MODEL|MAX_OUTPUT_TOKENS)|GOOGLE_GEMINI_BASE_URL|DSH_(?:PROVIDER|MODEL|BASE_URL))$/.test(name) ? sanitize(value[name], name, depth + 1) : hidden]));
  }
  if (typeof value === 'string') return scrubString(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(item => sanitize(item, '', depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, sanitize(item, name, depth + 1)]));
  return value;
}
function displayContent(text, format) {
  if (format === 'json5') return JSON5.stringify(sanitize(JSON5.parse(text)), null, 2) + '\n';
  if (format === 'env') {
    // Multiline values and comments may also contain credentials: expose names only.
    return text.split(/\r?\n/).flatMap(line => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return match ? [match[1] + '=' + hidden] : [];
    }).join('\n') + '\n';
  }
  let value;
  if (format === 'toml') value = toml.parse(text);
  else if (format === 'yaml') {
    const doc = YAML.parseDocument(text);
    if (doc.errors.length) throw new Error('invalid YAML');
    value = doc.toJS({ maxAliasCount: 30 });
  } else {
    const errors = [];
    value = jsonc.parse(text, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length || value === undefined) throw new Error('invalid JSON');
  }
  const safe = sanitize(value);
  if (format === 'toml') return toml.stringify(safe);
  if (format === 'yaml') return YAML.stringify(safe);
  return JSON.stringify(safe, null, 2) + '\n';
}

function createConfigInspector({ dirs, home, env, claudeDesktopThreepDir, profileId, platform, read }) {
  function candidates(client) {
    const names = {
      claude: ['settings.json', 'settings.local.json', '.mcp.json'],
      'claude-desktop': ['claude_desktop_config.json'],
      codex: ['config.toml', 'onekey-model-catalog.json', 'auth.json'], gemini: ['settings.json', '.env', 'oauth_creds.json'],
      grok: ['config.toml'], opencode: ['opencode.jsonc', 'opencode.json'],
      openclaw: [env.OPENCLAW_CONFIG_PATH ? path.basename(env.OPENCLAW_CONFIG_PATH) : 'openclaw.json', '.env'],
      pi: ['settings.json', 'models.json', 'models-store.json', 'auth.json'], minimax: ['config.yaml'],
      'deepseek-harness': ['profiles/web/cordis.patch.yml', 'cordis.patch.yml', 'config.yaml', '.credentials.yaml', '.env'],
      'deepseek-harness-desktop': ['profiles/desktop/cordis.patch.yml', 'cordis.patch.yml', '.credentials.yaml'],
      zed: ['settings.json'], vscode: ['settings.json', 'chatLanguageModels.json'],
      zcode: ['config.json', 'setting.json', 'model-providers.json', 'credentials.json'], workbuddy: ['models.json', 'settings.json', 'mcp.json', 'mcp-approvals.json'], hermes: ['config.yaml', '.env'],
    };
    if (!Object.hasOwn(names, client)) throw new Error('未知客户端');
    const files = names[client].map(name => ({ path: path.join(dirs[client], name), label: name }));
    if (client === 'workbuddy') {
      const appRoot = platform === 'darwin' ? path.join(home, 'Library/Application Support')
        : platform === 'win32' ? env.APPDATA || path.join(home, 'AppData/Roaming')
        : env.XDG_CONFIG_HOME || path.join(home, '.config');
      files.push({ path: path.join(appRoot, 'WorkBuddy/User/settings.json'), label: 'WorkBuddy / User / settings.json' });
    }
    if (client === 'opencode') files.push({ path: path.join(env.XDG_STATE_HOME || path.join(home, '.local/state'), 'opencode/model.json'), label: 'OpenCode / model preference' });
    if (client === 'claude') files.push({ path: path.join(home, '.claude.json'), label: '~/.claude.json' });
    if (client === 'claude-desktop') files.push(
      { path: path.join(claudeDesktopThreepDir, 'claude_desktop_config.json'), label: 'Claude-3p / claude_desktop_config.json' },
      { path: path.join(claudeDesktopThreepDir, 'configLibrary', `${profileId}.json`), label: 'Claude-3p / OneLinkAI profile' },
      { path: path.join(claudeDesktopThreepDir, 'configLibrary/_meta.json'), label: 'Claude-3p / configLibrary / _meta.json' },
    );
    return files;
  }
  async function inspect(client) {
    const files = candidates(client);
    const notes = ['读取本机用户级配置；项目级配置、命令行参数和环境变量可能覆盖这些设置。', '结构化配置经脱敏并格式化显示，注释不展示；环境文件仅展示变量名，认证文件仅展示存在状态。'];
    const add = (file, label) => { if (!files.some(item => item.path === file)) files.push({ path: file, label }); };
    // Discover client profiles only within known configuration directories.
    let discovery;
    if (client === 'claude-desktop') discovery = { root: path.join(claudeDesktopThreepDir, 'configLibrary'), file: true };
    if (client === 'deepseek-harness') discovery = { root: path.join(dirs[client], 'profiles'), names: ['cordis.patch.yml'] };
    if (client === 'vscode') discovery = { root: path.join(dirs[client], 'profiles'), names: ['settings.json', 'chatLanguageModels.json'] };
    if (discovery) {
      try {
        const entries = (await fs.readdir(discovery.root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (files.length >= 40) { notes.push('配置文件较多，本次最多展示 40 个，请在客户端检查其余 Profile。'); break; }
          if (discovery.file && entry.isFile() && /^[\w-]+\.json$/.test(entry.name)) add(path.join(discovery.root, entry.name), 'Claude-3p / configLibrary / ' + entry.name);
          else if (!discovery.file && entry.isDirectory() && /^[\w-]+$/.test(entry.name) && !(client === 'deepseek-harness' && entry.name.toLowerCase() === 'desktop')) {
            for (const name of discovery.names) if (files.length < 40) add(path.join(discovery.root, entry.name, name), 'profiles / ' + entry.name + ' / ' + name);
          }
        }
      } catch (error) { if (error.code !== 'ENOENT') notes.push('部分 Profile 目录无法读取。'); }
    }
    if (client === 'zed' || client === 'vscode') notes.push('系统钥匙串 / 客户端密钥存储中的凭据不读取。');
    const result = await Promise.all(files.map(async item => {
      const name = path.basename(item.path);
      const protectedFile = /^(?:auth\.json|credentials\.json|oauth_creds\.json|\.credentials\.yaml)$/.test(name);
      const format = client === 'openclaw' && item.path === files[0].path ? 'json5' : name === '.env' ? 'env' : /\.toml$/.test(name) ? 'toml' : /\.ya?ml$/.test(name) ? 'yaml' : /\.jsonc$/.test(name) ? 'jsonc' : 'json';
      const file = { ...item, format };
      try {
        const stat = await fs.lstat(item.path);
        if (stat.isSymbolicLink() || !stat.isFile()) return { ...file, status: 'error', message: '不是普通文件，未读取。' };
        if (protectedFile) return { ...file, status: 'protected', size: stat.size, message: '认证文件已存在，内容不读取、不展示。' };
        if (stat.size > 1024 * 1024) return { ...file, status: 'error', message: '文件超过 1 MiB，请在本机编辑器中查看。' };
        const text = await read(item.path);
        if (text === null) return { ...file, status: 'missing', message: '文件尚未创建。' };
        let content;
        try { content = text.trim() ? displayContent(text, format) : ''; }
        catch { return { ...file, status: 'error', message: '文件格式无法解析，未展示原文，以免泄露凭据。' }; }
        return { ...file, status: 'present', size: stat.size, modifiedAt: stat.mtime.toISOString(), content };
      } catch (error) {
        return { ...file, status: error.code === 'ENOENT' ? 'missing' : 'error', message: error.code === 'ENOENT' ? '文件尚未创建。' : '无法读取此文件，请检查访问权限。' };
      }
    }));
    result.sort((a, b) => (a.status === 'missing') - (b.status === 'missing'));
    return { client, directory: dirs[client], readAt: new Date().toISOString(), notes, files: result };
  }
  return { inspect };
}
module.exports = { createConfigInspector };
