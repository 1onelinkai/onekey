const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchProviderModels } = require('./provider-models.cjs');
test('Anthropic uses native authentication, paginates and deduplicates models', async () => {
  const calls = [];
  const models = await fetchProviderModels({ baseURL: 'https://api.anthropic.com', protocol: 'anthropic', apiKey: 'secret' }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => calls.length === 1 ? { data: [{ id: 'claude', display_name: 'Claude' }], has_more: true, last_id: 'claude' } : { data: [{ id: 'claude', display_name: 'Claude' }, { id: 'second' }] } };
  });
  assert.equal(models.length, 2); assert.equal(models[0].name, 'Claude');
  assert.equal(calls[0].options.headers['x-api-key'], 'secret');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.match(calls[1].url, /after_id=claude/);
});
test('Responses uses Bearer and rejects malformed success or failed HTTP', async () => {
  const provider = { baseURL: 'https://example.com', protocol: 'responses', apiKey: 'secret' };
  await fetchProviderModels(provider, async (_, options) => { assert.equal(options.headers.Authorization, 'Bearer secret'); return { ok: true, json: async () => ({ data: [] }) }; });
  for (const body of [{ error: {} }, { data: [{ id: null }] }]) await assert.rejects(fetchProviderModels(provider, async () => ({ ok: true, json: async () => body })), /无效/);
  await assert.rejects(fetchProviderModels(provider, async () => ({ ok: false, status: 401 })), /401/);
});
test('Gemini native models paginate, filter generation models and keep API Key out of URL', async () => {
  const calls = [];
  const provider = { baseURL: 'https://example.com', protocol: 'gemini', apiKey: 'gemini-secret' };
  const models = await fetchProviderModels(provider, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => calls.length === 1 ? { models: [{ name: 'models/gemini-test', displayName: 'Gemini Test', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'page2' } : { models: [{ name: 'models/gemini-second', supportedGenerationMethods: ['generateContent'] }] } };
  });
  assert.deepEqual(models.map(model => model.id), ['gemini-test', 'gemini-second']);
  assert.equal(calls[0].options.headers['x-goog-api-key'], provider.apiKey);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.match(calls[0].url, /\/v1beta\/models$/); assert.match(calls[1].url, /pageToken=page2/);
  assert.equal(calls.some(call => call.url.includes(provider.apiKey)), false);
  await assert.rejects(fetchProviderModels(provider, async () => ({ ok: true, json: async () => ({ data: [] }) })), /无效/);
  await assert.rejects(fetchProviderModels(provider, async () => ({ ok: true, json: async () => ({ models: [], nextPageToken: 'repeated' }) })), /游标/);
});
