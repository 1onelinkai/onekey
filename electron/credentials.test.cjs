const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { macCredentials } = require('./credentials.cjs');

test('Zed macOS credential can be created, replaced, read and deleted through the system keychain', {
  skip: process.platform !== 'darwin' || process.env.ONEKEY_KEYCHAIN_TEST !== '1',
}, async t => {
  const url = `https://onekey-keychain-test-${crypto.randomUUID()}.invalid/v1`;
  const credentials = macCredentials({});
  t.after(() => credentials.set(url, null));
  assert.equal(await credentials.get(url), null);
  await credentials.set(url, 'test-key-1');
  assert.equal(await credentials.get(url), 'test-key-1');
  await credentials.set(url, 'test-key-2');
  assert.equal(await credentials.get(url), 'test-key-2');
  await credentials.set(url, null);
  assert.equal(await credentials.get(url), null);
});
