const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const toml = require('@iarna/toml');
const { createAgentService } = require('./agents.cjs');
const { updateCatalog } = require('./codex-catalog.cjs');

test('Codex picker receives selected custom model and retains other managed models', () => {
  const first = updateCatalog(null, 'old-model', 'Old model');
  const next = JSON.parse(updateCatalog(first, 'kimi-k3', 'Kimi K3', { contextWindow: 256000, reasoningEffort: 'none', supportsImages: true }));
  assert.deepEqual(next.models.map(m => m.slug), ['kimi-k3', 'old-model']);
  assert.equal(next.models[0].priority, 0);
  assert.ok(next.models[1].priority > 0);
  assert.equal(next.models[0].context_window, 256000);
  assert.equal(next.models[0].default_reasoning_level, 'none');
  assert.ok(next.models[0].supported_reasoning_levels.some(m => m.effort === 'none'));
  assert.deepEqual(next.models[0].input_modalities, ['text', 'image']);
  assert.equal(JSON.parse(updateCatalog(JSON.stringify(next), 'kimi-k3', 'Updated')).models.length, 2);
  assert.throws(() => updateCatalog('{"models":{}}', 'kimi-k3'), /目录格式/);
});

test('Codex switches legacy catalog and active profile together, preserving and restoring originals', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onekey-catalog-test-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const dir = path.join(home, '.codex');
  await fs.mkdir(dir);
  const config = 'model="gpt-old"\nmodel_provider="custom"\nmodel_catalog_json="cc-switch-model-catalog.json"\nprofile="work"\n[profiles.work]\nmodel="gpt-profile"\nmodel_provider="custom"\nmodel_catalog_json="cc-switch-model-catalog.json"\n';
  const legacy = '{"models":[{"slug":"gpt-old"}]}\n';
  await fs.writeFile(path.join(dir, 'config.toml'), config);
  await fs.writeFile(path.join(dir, 'cc-switch-model-catalog.json'), legacy);
  const apps = path.join(home, 'Applications');
  await fs.mkdir(path.join(apps, 'Codex.app'), { recursive: true });
  const service = createAgentService({ home, dataDir: path.join(home, 'state'), platform: 'darwin',
    applicationDirs: [apps], env: { PATH: '' }, command: async () => ({ stdout: '1.0.0' }) });
  const plan = await service.preview({ client: 'codex', model: 'kimi-k3', protocol: 'responses', baseURL: 'https://api.example.com/v1', apiKey: 'sk-catalog-test-secret' });
  assert.equal(plan.files.length, 2);
  assert.ok(!JSON.stringify(plan).includes('sk-catalog-test-secret'));
  const result = await service.apply(plan.token);
  const after = toml.parse(await fs.readFile(path.join(dir, 'config.toml'), 'utf8'));
  assert.equal(after.model, 'kimi-k3');
  assert.equal(after.model_provider, 'onelinkai');
  assert.equal(after.profiles.work.model, 'kimi-k3');
  assert.equal(after.profiles.work.model_provider, 'onelinkai');
  assert.equal(after.model_catalog_json, path.join(dir, 'onekey-model-catalog.json'));
  assert.equal(after.profiles.work.model_catalog_json, after.model_catalog_json);
  assert.equal(JSON.parse(await fs.readFile(after.model_catalog_json)).models[0].slug, 'kimi-k3');
  assert.equal(await fs.readFile(path.join(dir, 'cc-switch-model-catalog.json'), 'utf8'), legacy);
  await service.restore(result.id);
  assert.equal(await fs.readFile(path.join(dir, 'config.toml'), 'utf8'), config);
  await assert.rejects(fs.access(path.join(dir, 'onekey-model-catalog.json')), { code: 'ENOENT' });
});
