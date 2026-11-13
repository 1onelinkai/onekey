const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configSummary } = require('./config-summary.cjs');
function snapshot(client, data, path = '/config/settings.json') {
  return { client, files: [{ path, format: 'json', status: 'present', content: JSON.stringify(data) }] };
}
test('registries recover multiple configured models without inventing a current selection', () => {
  const result = configSummary(snapshot('workbuddy', [{ id: 'first' }, { id: 'second' }], '/config/models.json'));
  assert.equal(result.state, 'configured'); assert.equal(result.count, 2); assert.equal(result.model, '');
  const registry = configSummary(snapshot('opencode', { provider: { custom: { models: { 'defined-model': {} } } } }, '/config/opencode.json'));
  assert.deepEqual(registry.models, ['defined-model']); assert.equal(registry.model, '');
});
test('summary respects local override precedence and supports Windows paths', () => {
  const data = snapshot('claude', { env: { ANTHROPIC_MODEL: 'base' } }, 'C:\\users\\test\\.claude\\settings.json');
  data.files.push({ path: 'C:\\users\\test\\.claude\\settings.local.json', status: 'present', format: 'json', content: '{"env":{"ANTHROPIC_MODEL":"override"}}' });
  assert.equal(configSummary(data).model, 'override');
});
test('only model configuration counts; unrelated settings and redacted values do not', () => {
  assert.equal(configSummary(snapshot('claude', { permissions: { allow: ['Read'] } })).state, 'none');
  assert.equal(configSummary(snapshot('claude', { model: '<REDACTED>' })).state, 'none');
  assert.equal(configSummary({ client: 'codex', files: [{ status: 'error' }] }).state, 'unreadable');
});
