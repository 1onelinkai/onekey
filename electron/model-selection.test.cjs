const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { configSummary } = require('./config-summary.cjs');
const { resolveSelection, resolveZcodeSelection, copySnapshot } = require('./workbuddy-selection.cjs');
const { readVscodeSelection, resolveVscodeSelection } = require('./vscode-selection.cjs');
const file = (name, data) => ({ path: '/config/' + name, format: 'json', status: 'present', content: JSON.stringify(data) });
const summary = (client, ...files) => configSummary({ client, files });

test('configured defaults across all agent formats are distinguished from registries', () => {
  const cases = [
    ['claude', file('settings.json', { model: 'chosen' })],
    ['codex', { ...file('config.toml'), format: 'toml', content: 'model="base"\nprofile="work"\n[profiles.work]\nmodel="chosen"' }],
    ['gemini', file('settings.json', { model: { name: 'chosen' } })],
    ['grok', { ...file('config.toml'), format: 'toml', content: '[models]\ndefault="active"\n[model.active]\nmodel="chosen"' }],
    ['opencode', file('opencode.jsonc', { model: 'provider/chosen', provider: { p: { models: { other: {} } } } })],
    ['openclaw', file('openclaw.json', { agents: { defaults: { model: { primary: 'p/chosen' } } } })],
    ['pi', file('settings.json', { defaultModel: 'chosen' })],
    ['minimax', file('config.yaml', { defaultModel: 'custom_provider:p/chosen' })],
    ['hermes', file('config.yaml', { model: { default: 'chosen' } })],
    ['zed', file('settings.json', { agent: { default_model: { model: 'chosen' } } })],
    ['zcode', file('config.json', { model: 'p/chosen' })],
    ['workbuddy', file('models.json', [{ id: 'other' }]), file('settings.json', { defaultModel: 'chosen' })],
    ['deepseek-harness', file('profiles/web/cordis.patch.yml', [{ id: 'agent-default-model', config: { model: 'chosen' } }])],
    ['deepseek-harness-desktop', file('profiles/desktop/cordis.patch.yml', [{ id: 'agent-default-model', config: { model: 'chosen' } }])],
  ];
  for (const [client, ...files] of cases) {
    const result = summary(client, ...files);
    assert.equal(result.model, 'chosen', client);
    assert.equal(result.selectionSource, 'config-default', client);
  }
});

test('OpenCode recent choice is recovered only when no configured default exists', () => {
  const recent = file('model.json', { recent: [{ providerID: 'vendor', modelID: 'last' }, { modelID: 'older' }] });
  assert.equal(summary('opencode', recent).model, 'last');
  assert.equal(summary('opencode', recent).selectionSource, 'last-used');
  assert.equal(summary('opencode', file('opencode.json', { model: 'p/default' }), recent).model, 'default');
  assert.equal(summary('opencode', file('model.json', { favorite: [{ modelID: 'favorite' }] })).model, '');
});

test('a single available desktop model is not mislabeled as an explicit default', () => {
  const result = summary('claude-desktop', file('claude_desktop_config.json', { inferenceModels: ['only'] }));
  assert.equal(result.selectionSource, 'single-available');
  assert.equal(summary('claude-desktop', file('claude_desktop_config.json', { inferenceModels: ['one', 'two'] })).model, '');
});

test('WorkBuddy account preferences do not mix buddy-app scopes or ambiguous accounts', () => {
  assert.equal(resolveSelection([{ key: 'cb-newtask:model:account', id: 'selected' }, { key: 'cb-newtask:model:account:buddy', id: 'other' }]).model, 'selected');
  assert.equal(resolveSelection([{ key: 'cb-newtask:model:a', id: 'one' }, { key: 'cb-newtask:model:b', id: 'two' }]), null);
  assert.equal(resolveSelection([{ key: 'cb-newtask:model', id: '<REDACTED>' }]), null);
});

test('ZCode global preferences decode model IDs and preserve ambiguous agent scope', () => {
  const entry = id => ({ key: 'zcode-last-agent-model:glm:__global__', id });
  assert.equal(resolveZcodeSelection([entry('custom:provider:my%2Fmodel')]).model, 'my/model');
  assert.equal(resolveZcodeSelection([entry('custom:builtin:zai:glm-5')]).model, 'glm-5');
  assert.equal(resolveZcodeSelection([entry('custom:provider')]), null);
  assert.equal(resolveZcodeSelection([{ key: 'zcode-last-agent-model:glm:/project', id: 'project-only' }]), null);
  assert.deepEqual(resolveZcodeSelection([{ key: 'session-scoped' }]), { selectionStatus: 'session-scoped' });
  assert.deepEqual(resolveZcodeSelection([entry('one'), { key: 'zcode-last-agent-model:claude:__global__', id: 'two' }]), { selectionStatus: 'multiple-agents' });
});

test('VS Code reads only explicit panel preference and strips vendor prefix', () => {
  const row = { key: 'chat.currentLanguageModel.panel', value: 'customoai:chosen' };
  assert.equal(resolveVscodeSelection([row]).model, 'chosen');
  assert.equal(resolveVscodeSelection([row, { key: row.key + '.isDefault', value: 'true' }]), null);
  assert.equal(resolveVscodeSelection([{ key: 'chat.currentLanguageModel.editor', value: 'other' }]), null);
});

test('VS Code SQLite preference is read without modifying client state', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-model-sqlite-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'globalStorage'); await fs.mkdir(dir);
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = path.join(dir, 'state.vscdb');
  const db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE ItemTable (key TEXT, value BLOB)');
  const insert = db.prepare('INSERT INTO ItemTable VALUES (?, ?)');
  insert.run('chat.currentLanguageModel.panel', Buffer.from('customoai:from-db'));
  insert.run('secret', 'private-credential');
  db.close();
  const before = await fs.readFile(dbFile);
  const result = await readVscodeSelection(root);
  assert.equal(result.model, 'from-db');
  assert.equal(JSON.stringify(result).includes('private-credential'), false);
  assert.deepEqual(await fs.readFile(dbFile), before);
  assert.equal(await readVscodeSelection(path.join(root, 'missing')), null);
});

test('LevelDB snapshots copy only database files and leave the original untouched', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-model-level-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'CURRENT'), 'MANIFEST-000001\n');
  await fs.writeFile(path.join(source, 'MANIFEST-000001'), 'manifest');
  await fs.writeFile(path.join(source, 'LOCK'), 'lock');
  const target = path.join(root, 'copy');
  await copySnapshot(source, target);
  assert.deepEqual((await fs.readdir(target)).sort(), ['CURRENT', 'MANIFEST-000001']);
  assert.equal(await fs.readFile(path.join(source, 'LOCK'), 'utf8'), 'lock');
});

test('UI labels separate defaults, recent usage, and unavailable choices', async () => {
  const { configModelPresentation: present } = await import('../src/config-selection.mjs');
  assert.equal(present({ model: 'm', selectionSource: 'last-used' }).label, '最近使用模型');
  assert.equal(present({ model: 'm', selectionSource: 'last-selection' }).label, '上次选择模型');
  assert.equal(present({ model: 'm', selectionSource: 'single-available' }).label, '已配置模型');
  const missing = present({ models: ['a', 'b'], count: 2, selectionStatus: 'multiple-agents' }, 'zcode');
  assert.equal(missing.text, '已配置 2 个模型');
  assert.match(missing.title, /各 Agent 选择不同/);
});
