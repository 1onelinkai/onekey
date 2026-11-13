const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createAgentService } = require('./agents.cjs');
async function fixture(t, env = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-config-reader-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = createAgentService({ home: root, dataDir: path.join(root, 'state'), env, platform: 'darwin', applicationDirs: [] });
  async function put(file, content) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); }
  return { root, service, put };
}
test('all 15 clients expose their actual config paths without installation or provider credentials', async t => {
  const { root, service, put } = await fixture(t);
  const expected = {
    claude: '.claude/settings.json', 'claude-desktop': 'Library/Application Support/Claude/claude_desktop_config.json',
    codex: '.codex/config.toml', gemini: '.gemini/settings.json', grok: '.grok/config.toml', opencode: '.config/opencode/opencode.jsonc',
    openclaw: '.openclaw/openclaw.json', pi: '.pi/agent/settings.json', minimax: '.minimax/config.yaml',
    'deepseek-harness': '.dsh/profiles/web/cordis.patch.yml', 'deepseek-harness-desktop': '.dsh/profiles/desktop/cordis.patch.yml', zed: '.config/zed/settings.json',
    vscode: 'Library/Application Support/Code/User/settings.json', zcode: '.zcode/v2/config.json', workbuddy: '.workbuddy/models.json', hermes: '.hermes/config.yaml',
  };
  for (const [client, relative] of Object.entries(expected)) {
    const file = path.join(root, relative);
    const initial = await service.inspectConfig(client);
    assert.equal(initial.files.find(item => item.path === file)?.status, 'missing', client);
    const original = /\.toml$/.test(file) ? 'model = "custom-model"\nmax_tokens = 12345\n' : /\.ya?ml$/.test(file) ? 'model: custom-model\nmaxTokens: 12345\n' : '// user settings\n{"model":"custom-model","maxTokens":12345,"customOption":true}\n';
    await put(file, original);
    const result = await service.inspectConfig(client);
    const displayed = result.files.find(item => item.path === file);
    assert.equal(displayed.status, 'present', client);
    assert.match(displayed.content, /custom-model/, client);
    assert.match(displayed.content.replaceAll('_', ''), /12345/, client);
    assert.equal(await fs.readFile(file, 'utf8'), original, client + ': reader must not modify files');
  }
  await assert.rejects(service.inspectConfig('../../etc/passwd'), /未知客户端/);
});
test('JSONC, YAML and TOML redact nested secrets while retaining model limits, permissions and settings', async t => {
  const { root, service, put } = await fixture(t);
  await put(path.join(root, '.claude/settings.json'), `// secret-comment-that-must-not-be-copied\n{ "env": {"ANTHROPIC_API_KEY":"private-key", "CUSTOM_CREDENTIAL":"private-env", "ANTHROPIC_MODEL":"test-model"}, "permissions":{"allow":["Read"]}, "mcpServers":{"remote":{"headers":{"Custom":"private-header"},"args":["private-positional-secret"]}}, "maxTokens":16000, }`);
  await put(path.join(root, '.codex/config.toml'), 'model="my-model"\nmodel_context_window=256000\n[model_providers.custom]\nexperimental_bearer_token="private-bearer"\nbase_url="https://name:private-password@example.com/v1?token=private-url"\n');
  await put(path.join(root, '.minimax/config.yaml'), 'custom_provider:\n  mine:\n    options:\n      apiKey: private-yaml\n    models:\n      custom:\n        limit: { context: 128000, output: 16000 }\n');
  const claude = JSON.stringify(await service.inspectConfig('claude'));
  for (const secret of ['private-key', 'private-env', 'private-header', 'private-positional-secret', 'secret-comment-that-must-not-be-copied']) assert.equal(claude.includes(secret), false, secret);
  assert.ok(claude.includes('permissions')); assert.ok(claude.includes('test-model')); assert.ok(claude.includes('16000'));
  const codex = JSON.stringify(await service.inspectConfig('codex'));
  for (const secret of ['private-bearer', 'private-password', 'private-url']) assert.equal(codex.includes(secret), false, secret);
  assert.ok(codex.replaceAll('_', '').includes('256000'));
  const minimax = JSON.stringify(await service.inspectConfig('minimax'));
  assert.equal(minimax.includes('private-yaml'), false); assert.ok(minimax.includes('128000'));
});
test('credential files remain unread, dotenv exposes names only, malformed files fail closed', async t => {
  const { root, service, put } = await fixture(t);
  await put(path.join(root, '.gemini/.env'), 'GEMINI_API_KEY="private-env\ncontinuation-secret"\n# private-comment\nCUSTOM_VALUE=private-value\n');
  await put(path.join(root, '.gemini/oauth_creds.json'), '{"refresh_token":"private-oauth"}');
  await put(path.join(root, '.gemini/settings.json'), '{"apiKey":"private-invalid", BROKEN');
  const snapshot = await service.inspectConfig('gemini');
  const serialized = JSON.stringify(snapshot);
  for (const secret of ['private-env', 'continuation-secret', 'private-comment', 'private-value', 'private-oauth', 'private-invalid']) assert.equal(serialized.includes(secret), false, secret);
  assert.match(snapshot.files.find(item => item.format === 'env').content, /GEMINI_API_KEY=<REDACTED>/);
  assert.equal(snapshot.files.find(item => item.path.endsWith('oauth_creds.json')).status, 'protected');
  assert.equal(snapshot.files.find(item => item.path.endsWith('settings.json')).status, 'error');
});
test('config environment overrides and non-default profiles are included', async t => {
  const { root, put } = await fixture(t);
  const env = { CODEX_HOME: path.join(root, 'custom-codex'), OPENCLAW_CONFIG_PATH: path.join(root, 'custom-claw/settings.json') };
  const service = createAgentService({ home: root, env, dataDir: path.join(root, 'state'), platform: 'darwin' });
  await put(path.join(env.CODEX_HOME, 'config.toml'), 'model="override"');
  await put(env.OPENCLAW_CONFIG_PATH, '{"models":{"mode":"merge"}}');
  await put(path.join(root, 'Library/Application Support/Code/User/profiles/custom/settings.json'), '{"editor.fontSize":16}');
  await put(path.join(root, 'Library/Application Support/Claude-3p/configLibrary/existing-profile.json'), '{"inferenceModels":["existing-model"]}');
  await put(path.join(root, '.dsh/profiles/cli/cordis.patch.yml'), '[]');
  assert.ok((await service.inspectConfig('codex')).files.some(item => item.status === 'present' && item.path.startsWith(env.CODEX_HOME)));
  assert.ok((await service.inspectConfig('openclaw')).files.some(item => item.status === 'present' && item.path === env.OPENCLAW_CONFIG_PATH));
  assert.ok((await service.inspectConfig('vscode')).files.some(item => item.status === 'present' && item.path.includes('/profiles/custom/')));
  assert.ok((await service.inspectConfig('claude-desktop')).files.some(item => item.content?.includes('existing-model')));
  assert.ok((await service.inspectConfig('deepseek-harness')).files.some(item => item.status === 'present' && item.path.includes('/profiles/cli/')));
});
test('symlinks and oversized files are refused, one file failure does not block others', async t => {
  const { root, service, put } = await fixture(t);
  const external = path.join(root, 'external.json'); await put(external, '{"apiKey":"private-link"}');
  await fs.mkdir(path.join(root, '.pi/agent'), { recursive: true });
  await fs.symlink(external, path.join(root, '.pi/agent/settings.json'));
  await put(path.join(root, '.pi/agent/models.json'), ' '.repeat(1024 * 1024 + 1));
  const snapshot = await service.inspectConfig('pi');
  assert.equal(snapshot.files.find(item => item.path.endsWith('settings.json')).status, 'error');
  assert.equal(snapshot.files.find(item => item.path.endsWith('models.json')).status, 'error');
  assert.equal(snapshot.files.find(item => item.path.endsWith('auth.json')).status, 'missing');
  assert.equal(JSON.stringify(snapshot).includes('private-link'), false);
});


test('OpenClaw JSON5 settings retain unquoted settings and redact secrets', async t => {
  const { root, service, put } = await fixture(t);
  await put(path.join(root, '.openclaw/openclaw.json'), "{ // native JSON5\n agents: { defaults: { thinkingDefault: 'high', } }, gateway: { auth: { token: 'json5-private' } }, }");
  const snapshot = await service.inspectConfig('openclaw');
  const file = snapshot.files.find(item => item.format === 'json5');
  assert.equal(file.status, 'present');
  assert.match(file.content, /thinkingDefault/);
  assert.match(file.content, /high/);
  assert.equal(file.content.includes('json5-private'), false);
});
