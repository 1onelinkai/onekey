const crypto = require('node:crypto');
const path = require('node:path');
const JSON5 = require('json5');
const jsonc = require('jsonc-parser');
const toml = require('@iarna/toml');
const YAML = require('yaml');
const secretName = /api.?key|token|secret|password|passwd|authorization|credential|cookie|private.?key|client.?secret|^(headers|http_headers|args|command|oauthAccount)$/i;
const publicSetting = /^(apiKeyEnv|apiKeyEnvVar|env_key|requires_openai_auth|authMode|authType|selectedType|inferenceGatewayAuthScheme|tokenizer|maxTokens|max_tokens|max_output_tokens|maxInputTokens|maxOutputTokens|contextWindow|context_length|model_context_window|model_auto_compact_token_limit|CLAUDE_CODE_MAX_OUTPUT_TOKENS)$/i;
function parse(content, format) {
  let value;
  if (format === '.toml') value = toml.parse(content);
  else if (['.yaml', '.yml'].includes(format)) {
    const doc = YAML.parseDocument(content);
    if (doc.errors.length) throw new Error('YAML 格式无效');
    value = doc.toJS({ maxAliasCount: 30 });
  } else if (format === '.json5') value = JSON5.parse(content);
  else {
    const errors = [];
    value = jsonc.parse(content, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length) throw new Error('JSON/JSONC 格式无效');
  }
  if (!value || typeof value !== 'object') throw new Error('配置必须是对象或数组');
  return value;
}
function stringify(value, format) {
  return format === '.toml' ? toml.stringify(value) : ['.yaml', '.yml'].includes(format) ? YAML.stringify(value) : JSON.stringify(value, null, 2) + '\n';
}
function createEditable(file, apiKey) {
  const format = path.extname(file.path).toLowerCase();
  if (!['.json', '.jsonc', '.json5', '.toml', '.yaml', '.yml'].includes(format) || /credentials|auth\.json/i.test(path.basename(file.path))) return { editable: false };
  const secrets = new Map();
  function mask(value, key = '', location = [], depth = 0) {
    if (depth > 60) throw new Error('配置嵌套层级过深');
    if ((secretName.test(key) && !publicSetting.test(key)) || (typeof value === 'string' &&
      (value.includes(apiKey) || /\b(sk-|gh[pousr]_|github_pat_|AIza)|Bearer\s|https?:\/\/[^/\s]+:[^/\s]+@|[?&](api_key|token|password)=/i.test(value)))) {
      const token = '__ONEKEY_SECRET_' + crypto.randomUUID().replaceAll('-', '') + '__';
      secrets.set(token, { value, location: JSON.stringify(location) }); return token;
    }
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((item, index) => mask(item, '', [...location, index], depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, mask(item, name, [...location, name], depth + 1)]));
    return value;
  }
  const content = stringify(mask(parse(file.after, format)), format);
  return { editable: true, content, format, secrets };
}
function resolveEdit(editor, content) {
  if (!editor.editable) throw new Error('此凭据文件不允许编辑');
  if (typeof content !== 'string' || Buffer.byteLength(content) > 4 * 1024 * 1024) throw new Error('编辑内容无效或过大');
  const used = new Set();
  function restore(value, location = [], depth = 0) {
    if (depth > 60) throw new Error('配置嵌套层级过深');
    if (typeof value === 'string' && value.includes('__ONEKEY_SECRET_')) {
      const saved = editor.secrets.get(value);
      if (!saved || saved.location !== JSON.stringify(location) || used.has(value)) throw new Error('请保留原位置的密钥占位符');
      used.add(value); return saved.value;
    }
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((item, index) => restore(item, [...location, index], depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, restore(item, [...location, name], depth + 1)]));
    return value;
  }
  let result;
  try { result = stringify(restore(parse(content, editor.format)), editor.format); }
  catch (error) { if (/占位符|层级/.test(error.message)) throw error; throw new Error('编辑内容格式无效，请检查后重试'); }
  if (used.size !== editor.secrets.size) throw new Error('请保留所有密钥占位符；修改密钥请返回服务商设置');
  return result;
}
module.exports = { createEditable, resolveEdit };
