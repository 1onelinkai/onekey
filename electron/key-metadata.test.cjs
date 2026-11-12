const { test } = require('node:test');
const assert = require('node:assert/strict');
const { keyMetadata } = require('./key-metadata.cjs');

test('key budgets preserve missing, unlimited, zero and exhausted values', () => {
  assert.equal(keyMetadata({ status: 1 }).budget.unlimited, false);
  assert.equal(keyMetadata({ status: 1 }).budget.limit, null);
  for (const quota of [null, -1, '-1']) assert.equal(keyMetadata({ quota }).budget.unlimited, true);
  const limited = keyMetadata({ status: 1, quota: '100', consumeQuota: '25', quotaMethodName: '月' });
  assert.equal(limited.budget.remaining, 75);
  assert.equal(limited.budget.percent, 25);
  assert.equal(limited.budget.period, '月');
  assert.equal(limited.canConfigure, true);
  for (const [quota, consumeQuota] of [[0, 0], [10, 12]]) {
    const item = keyMetadata({ status: 1, quota, consumeQuota });
    assert.equal(item.canConfigure, false);
    assert.equal(item.budget.remaining, 0);
    assert.equal(item.budget.percent, 100);
    assert.equal(item.statuses[0].label, '预算已用完');
  }
});

test('key status combines disabled, expired and depleted without expiring permanent keys', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  const record = { status: 0, expiredTime: now - 1000, quota: 0, consumeQuota: 0 };
  assert.deepEqual(keyMetadata(record, now).statuses.map(s => s.label), ['已禁用', '已过期', '预算已用完']);
  assert.equal(keyMetadata({ status: 1, expired: 9, expiredTime: now - 1000 }, now).canConfigure, true);
  assert.equal(keyMetadata({ status: 1 }, now).expiresAt, null);
});
