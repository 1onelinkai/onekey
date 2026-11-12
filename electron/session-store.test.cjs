const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createSessionStore } = require('./session-store.cjs');
const { createLivePlatform } = require('./platform-live.cjs');

test('local encrypted login survives restart, refreshes tokens and clears on logout without keychain', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-local-login-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let expire = true;
  const fetcher = async (url, options) => {
    let data;
    if (url.endsWith('/getUserInfo')) data = { active: true, userDetails: { userId: 42 } };
    else if (url.endsWith('/refreshToken')) data = { access_token: 'refreshed-private-token', refresh_token: 'refreshed-private-refresh' };
    else if (expire) { expire = false; return { ok: false, status: 401 }; }
    else { assert.equal(options.headers.Authorization, 'Bearer refreshed-private-token'); data = []; }
    return { ok: true, json: async () => ({ code: 200, data }) };
  };
  const service = () => createLivePlatform({ fetcher, sessionStore: createSessionStore(directory) });
  await service().acceptSession({ accessToken: 'private-token', refreshToken: 'private-refresh' });
  const restarted = service();
  assert.equal((await restarted.status()).authenticated, true);
  await restarted.orgs();
  assert.equal(createSessionStore(directory).load().accessToken, 'refreshed-private-token');
  for (const name of await fs.readdir(directory)) {
    const bytes = await fs.readFile(path.join(directory, name));
    assert.ok(!bytes.includes('private-token'));
    assert.ok(!bytes.includes('private-refresh'));
    if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(directory, name))).mode & 0o777, 0o600);
  }
  await restarted.logout();
  assert.equal((await service().status()).authenticated, false);
});

test('tampering is rejected and a new login can replace an unreadable session', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-session-tamper-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createSessionStore(directory);
  store.save({ accessToken: 'old' });
  const file = path.join(directory, 'session.local.enc');
  const raw = await fs.readFile(file); raw[20] ^= 1; await fs.writeFile(file, raw);
  assert.throws(() => store.load());
  const service = createLivePlatform({ sessionStore: store, fetcher: async () => ({ ok: true, json: async () => ({ code: 200, data: { userDetails: { userId: 42 } } }) }) });
  await service.acceptSession({ accessToken: 'new-private-token' });
  assert.equal(store.load().accessToken, 'new-private-token');
});
