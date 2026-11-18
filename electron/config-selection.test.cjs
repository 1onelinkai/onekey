const { test } = require('node:test');
const assert = require('node:assert/strict');

test('configuration source preserves full personal and organization key IDs', async () => {
  const { parseConfigSource } = await import('../src/config-selection.mjs');
  assert.deepEqual(parseConfigSource('key:personal:123'), { kind: 'key', id: 'personal:123' });
  assert.deepEqual(parseConfigSource('key:88:456'), { kind: 'key', id: '88:456' });
  assert.deepEqual(parseConfigSource('provider:local-id'), { kind: 'provider', id: 'local-id' });
});

test('configuration keeps the visible current model and leaves missing or hidden models unselected', async () => {
  const { selectAvailableModel } = await import('../src/config-selection.mjs');
  const list = [{ id: 'music' }, { id: 'default', isDefault: true }, { id: 'glm-5.3' }];
  assert.equal(selectAvailableModel(list, 'glm-5.3'), 'glm-5.3');
  assert.equal(selectAvailableModel(list, 'not-authorized'), '');
  assert.equal(selectAvailableModel([{ id: 'first' }], 'old'), '');
  assert.equal(selectAvailableModel([], 'old'), '');
  const hidden = { id: 'hidden', isDefault: true, showInSquare: false };
  assert.equal(selectAvailableModel([hidden, ...list], 'hidden'), '');
  assert.equal(selectAvailableModel([hidden, ...list]), 'default');
  assert.equal(selectAvailableModel([hidden]), '');
  assert.equal(selectAvailableModel([{ id: 'first' }]), 'first');
});
