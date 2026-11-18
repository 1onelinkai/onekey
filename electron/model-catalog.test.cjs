const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchModelCatalog, searchModelCatalog, MODEL_CATALOG_PATH } = require('./model-catalog.cjs');

// Same nesting and public fields returned by the live directory on 2026-11-16.
const directory = { code: 0, data: { data: [
  { month: '2026-11', models: [
    { modelId: 'glm-5.3-flash', name: 'Z.AI: GLM 5.3 FLASH', type: '文本模型', showInSquare: true },
  ] },
  { month: '2026-10', models: [
    { modelId: 'gpt-6.1-sol-k', name: 'OpenAI: GPT 6.1 SOL K', type: '文本模型', showInSquare: false },
    { modelId: 'gpt-6.1-sol-k' }, { modelId: '' }, { id: 'not-a-model-id' }, null,
  ] },
] } };

test('complete directory finds the reported hidden ID absent from the square listing', async () => {
  const models = await fetchModelCatalog({ fetcher: async (url, options) => {
    assert.equal(new URL(url).pathname, MODEL_CATALOG_PATH);
    assert.equal(options.headers?.Authorization, undefined);
    return { ok: true, json: async () => directory };
  } });
  assert.equal(models.length, 2);
  const found = searchModelCatalog(models, ' GPT-6.1-SOL-K ');
  assert.deepEqual(found.map(model => model.id), ['gpt-6.1-sol-k']);
  assert.equal(found[0].showInSquare, false);
  assert.equal(searchModelCatalog(models, 'SOL K').length, 0);
  const { filterModels } = await import('../src/model-visibility.mjs');
  const visible = models.filter(model => model.showInSquare !== false);
  assert.equal(filterModels(visible, 'gpt-6.1-sol-k').length, 0);
  assert.deepEqual(filterModels([...visible, ...found], 'gpt-6.1-sol-k', '音频模型').map(model => model.id), ['gpt-6.1-sol-k']);
  assert.deepEqual(filterModels([...visible, ...found]).map(model => model.id), ['glm-5.3-flash']);
});

test('visible names remain searchable and an empty query produces no extra search results', async () => {
  const models = await fetchModelCatalog({ fetcher: async () => ({ ok: true, json: async () => directory }) });
  assert.deepEqual(searchModelCatalog(models, 'Z.AI').map(model => model.id), ['glm-5.3-flash']);
  assert.deepEqual(searchModelCatalog(models, ' '), []);
});

test('catalog errors remain errors instead of appearing as an empty search', async () => {
  await assert.rejects(fetchModelCatalog({ fetcher: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  for (const result of [{ code: 0, data: { models: [] } }, { code: 50301, data: { data: [] } }]) {
    await assert.rejects(fetchModelCatalog({ fetcher: async () => ({ ok: true, json: async () => result }) }), /格式异常/);
  }
});
