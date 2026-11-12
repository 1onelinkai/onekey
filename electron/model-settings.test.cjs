const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateModelSettings, settingsForClient } = require('./model-settings.cjs');
test('高级字段校验、布尔 false、应用专属推理枚举和跨字段限制', () => {
  assert.deepEqual(validateModelSettings({ supportsImages: false, supportsTools: true, thinkingBudget: 0 }), { thinkingBudget: 0, supportsImages: false, supportsTools: true });
  for (const input of [{ supportsImages: 'false' }, { supportsTools: 1 }, { reasoningEffort: 'danger' }, { subagentModel: '../bad model' }, { thinkingBudget: -1 }, { thinkingBudget: 4096, maxTokens: 4096 }, { contextWindow: 1000, compactThreshold: 1000 }]) assert.throws(() => validateModelSettings(input));
  assert.throws(() => settingsForClient('claude', { reasoningEffort: 'xhigh' }));
  assert.throws(() => settingsForClient('codex', { reasoningEffort: 'max' }));
  assert.equal(settingsForClient('hermes', { reasoningEffort: 'high' }).settings.reasoningEffort, 'high');
  const result = settingsForClient('hermes', { maxTokens: 16000, contextWindow: 128000 });
  assert.deepEqual(result.settings, { contextWindow: 128000 }); assert.deepEqual(result.ignored, ['最大输出 Token']);
});
