const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalProviderStore, createPersistentLocalProviderStore } = require('./local-providers.cjs');

test('桌面服务商存储重启后恢复密钥、资料和模型选择，不依赖钥匙串', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-persistent-providers-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createPersistentLocalProviderStore(directory);
  const provider = await store.createProvider({ name: 'Private provider', notes: '工作账号', website: 'https://example.com/billing', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'persistent-private-secret' });
  await store.createModel(provider.id, { id: 'keep', name: 'Custom', contextWindow: 128000, enabled: false });
  await store.createModel(provider.id, { id: 'remove' });
  await store.selectModels(provider.id, [{ id: 'keep' }, { id: 'selected' }]);
  await store.setDefaultModel(provider.id, 'selected');

  const restarted = createPersistentLocalProviderStore(directory);
  assert.deepEqual(await restarted.listProviders(), await store.listProviders());
  assert.equal((await restarted.getCredential(provider.id)).apiKey, 'persistent-private-secret');
  const models = await restarted.listModels();
  assert.deepEqual(models.map(model => model.id), ['keep', 'selected']);
  assert.equal(models[0].name, 'Custom');
  assert.equal(models[0].contextWindow, 128000);
  assert.equal(models[0].enabled, false);
  assert.equal(models[1].isDefault, true);
  assert.equal((await restarted.listProviders())[0].apiKey, undefined);
  for (const name of await fs.readdir(directory)) {
    const bytes = await fs.readFile(path.join(directory, name));
    assert.ok(!bytes.includes('persistent-private-secret'));
    assert.ok(!bytes.includes('Private provider'));
    if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(directory, name))).mode & 0o777, 0o600);
  }
  await restarted.selectModels(provider.id, [{ id: 'keep' }]);
  assert.equal((await createPersistentLocalProviderStore(directory).listModels()).some(model => model.isDefault), false);
  await restarted.deleteProvider(provider.id);
  assert.deepEqual(await createPersistentLocalProviderStore(directory).listProviders(), []);
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-providers-'));
  const file = path.join(root, 'providers.enc');
  const encryption = { encrypt: value => Buffer.from('ENC:' + value), decrypt: value => Buffer.from(value).toString().replace(/^ENC:/, '') };
  return { root, file, store: createLocalProviderStore({ file, encryption }) };
}

test('供应商和模型只以加密文件保存，列表不返回密钥', async t => {
  const { root, file, store } = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const provider = await store.createProvider({ name: '自定义 OpenAI', baseURL: 'https://api.example.com/v1', protocol: 'openai', apiKey: 'sk-test-secret-123' });
  assert.equal(provider.baseURL, 'https://api.example.com');
  assert.equal(Object.hasOwn(provider, 'apiKey'), false);
  const model = await store.createModel(provider.id, { id: 'gpt-test', name: 'GPT Test' });
  await store.setDefaultModel(provider.id, model.id);
  assert.equal((await store.listModels())[0].isDefault, true);
  assert.equal((await store.getCredential(provider.id)).apiKey, 'sk-test-secret-123');
  const raw = await fs.readFile(file, 'utf8');
  assert.equal(raw.includes('sk-test-secret-123'), false);
  await store.deleteModel(provider.id, model.id);
  await store.deleteProvider(provider.id);
  assert.deepEqual(await store.listProviders(), []);
});

test('拒绝不安全地址、无效协议和重复模型', async t => {
  const { root, store } = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(() => store.createProvider({ name: 'bad', baseURL: 'http://example.com', protocol: 'openai', apiKey: 'sk-test-secret-123' }));
  await assert.rejects(() => store.createProvider({ name: 'bad', baseURL: 'https://example.com', protocol: 'other', apiKey: 'sk-test-secret-123' }));
  const p = await store.createProvider({ name: 'ok', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'sk-test-secret-123' });
  await store.createModel(p.id, { id: 'model' });
  await assert.rejects(() => store.createModel(p.id, { id: 'model' }));
});

test('并发写入不丢失模型，批量同步验证失败不写入并保留默认设置', async t => {
  const { root, store } = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const p = await store.createProvider({ name: 'provider', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'test-secret' });
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.createModel(p.id, { id: 'model-' + i })));
  assert.equal((await store.listModels()).length, 20);
  await store.setDefaultModel(p.id, 'model-0');
  await store.syncModels(p.id, [{ id: 'model-0', name: 'remote' }, { id: 'new' }]);
  assert.equal((await store.listModels()).find(m => m.id === 'model-0').isDefault, true);
  await assert.rejects(store.syncModels(p.id, [{ id: 'partial' }, { id: 'invalid space' }]));
  assert.equal((await store.listModels()).some(m => m.id === 'partial'), false);
});

test('停用默认模型清除默认标记，编辑服务商留空保留密钥', async t => {
  const { root, store } = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const provider = await store.createProvider({ name: 'before', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'original-secret' });
  await store.createModel(provider.id, { id: 'model' });
  await store.setDefaultModel(provider.id, 'model');
  await store.updateModel(provider.id, 'model', { enabled: false });
  assert.equal((await store.listModels())[0].isDefault, false);
  await assert.rejects(store.setDefaultModel(provider.id, 'model'), /启用/);
  await store.updateProvider(provider.id, { name: 'after', apiKey: '' });
  assert.equal((await store.getCredential(provider.id)).apiKey, 'original-secret');
  assert.equal((await store.listProviders())[0].name, 'after');
});

test('服务商资料和模型规格在编辑、重启、同步后保留，可清空且验证失败不落盘', async t => {
  const { root, file, store } = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const provider = await store.createProvider({ name: 'Shared', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'original-secret', notes: '工作账号', website: 'https://example.com/billing' });
  assert.equal(provider.notes, '工作账号'); assert.equal(provider.website, 'https://example.com/billing');
  await store.createModel(provider.id, { id: 'actual-id', name: '显示名称', contextWindow: '256000', maxTokens: '16000' });
  await store.setDefaultModel(provider.id, 'actual-id');
  await store.updateModel(provider.id, 'actual-id', { name: '另一个名称' });
  await store.syncModels(provider.id, [{ id: 'actual-id', name: 'remote name' }]);
  const model = (await store.listModels())[0];
  assert.equal(model.id, 'actual-id'); assert.equal(model.name, '另一个名称');
  assert.equal(model.contextWindow, 256000); assert.equal(model.maxTokens, 16000); assert.equal(model.isDefault, true);
  const before = await fs.readFile(file);
  for (const values of [{ contextWindow: -1 }, { contextWindow: 3.5 }, { maxTokens: true }, { contextWindow: 1024 }, { maxTokens: 100000001 }])
    await assert.rejects(store.updateModel(provider.id, 'actual-id', values));
  for (const website of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com'])
    await assert.rejects(store.updateProvider(provider.id, { website }));
  await assert.rejects(store.updateProvider(provider.id, { notes: 'x'.repeat(1001) }));
  assert.deepEqual(await fs.readFile(file), before);
  await store.updateProvider(provider.id, { notes: '', website: '', apiKey: '' });
  await store.updateModel(provider.id, 'actual-id', { contextWindow: '', maxTokens: '' });
  const reloaded = createLocalProviderStore({ file, encryption: { encrypt: value => Buffer.from('ENC:' + value), decrypt: value => Buffer.from(value).toString().replace(/^ENC:/, '') } });
  assert.equal((await reloaded.listProviders())[0].notes, '');
  assert.equal((await reloaded.getCredential(provider.id)).apiKey, 'original-secret');
  assert.equal((await reloaded.listModels())[0].contextWindow, undefined);
  assert.equal((await reloaded.listModels())[0].maxTokens, undefined);
});
test('Gemini 服务商及模型能力保存、同步和清空', async t => {
  const { root, store } = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const p = await store.createProvider({ name: 'Gemini', baseURL: 'https://example.com/v1beta', protocol: 'gemini', apiKey: 'gemini-secret' });
  assert.equal(p.baseURL, 'https://example.com');
  await store.createModel(p.id, { id: 'gemini-test', supportsImages: true, supportsTools: false, supportsReasoning: true });
  await store.syncModels(p.id, [{ id: 'gemini-test', name: 'Remote' }]);
  const model = (await store.listModels())[0];
  assert.equal(model.supportsImages, true); assert.equal(model.supportsTools, false); assert.equal(model.supportsReasoning, true);
  await store.updateModel(p.id, model.id, { supportsImages: '', supportsTools: '', supportsReasoning: '' });
  const cleared = (await store.listModels())[0];
  for (const field of ['supportsImages', 'supportsTools', 'supportsReasoning']) assert.equal(cleared[field], undefined);
});

test('默认服务商存储仅在内存中，密钥可用于请求且新实例不恢复', async () => {
  const store = createLocalProviderStore();
  const provider = await store.createProvider({ name: 'Memory provider', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'memory-secret-key' });
  assert.equal((await store.getCredential(provider.id)).apiKey, 'memory-secret-key');
  assert.equal((await store.listProviders())[0].apiKey, undefined);
  await store.createModel(provider.id, { id: 'model-memory' });
  await store.setDefaultModel(provider.id, 'model-memory');
  assert.equal((await store.listModels())[0].isDefault, true);
  await store.updateProvider(provider.id, { apiKey: 'memory-new-secret' });
  assert.equal((await store.getCredential(provider.id)).apiKey, 'memory-new-secret');
  assert.deepEqual(await createLocalProviderStore().listProviders(), []);
});

test('确认选择原子增删模型，保留规格与停用状态并清理被删除的默认模型', async () => {
  const store = createLocalProviderStore();
  const provider = await store.createProvider({ name: 'Selection', baseURL: 'https://example.com', protocol: 'openai', apiKey: 'memory-test-secret' });
  await store.createModel(provider.id, { id: 'keep', name: 'Custom', contextWindow: 128000, enabled: false });
  await store.createModel(provider.id, { id: 'remove' });
  await store.setDefaultModel(provider.id, 'remove');
  await assert.rejects(store.selectModels(provider.id, [{ id: 'partial' }, { id: 'invalid space' }]));
  assert.equal((await store.listModels()).length, 2);
  await store.selectModels(provider.id, [{ id: 'keep', name: 'Remote' }, { id: 'new' }]);
  const models = await store.listModels();
  assert.deepEqual(models.map(model => model.id), ['keep', 'new']);
  assert.equal(models[0].name, 'Custom');
  assert.equal(models[0].contextWindow, 128000);
  assert.equal(models[0].enabled, false);
  assert.equal(models[1].enabled, true);
  assert.equal(models.some(model => model.isDefault), false);
  await store.selectModels(provider.id, []);
  assert.deepEqual(await store.listModels(), []);
});
