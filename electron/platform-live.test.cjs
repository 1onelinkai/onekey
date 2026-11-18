const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createLivePlatform } = require('./platform-live.cjs');

test('live adapter authenticates, scopes keys, refreshes once and refuses masked credentials', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-platform-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let expired = true;
  let refreshes = 0;
  let masked = false;
  let searchFailure = false;
  const calls = [];
  const fetcher = async (url, options) => {
    const endpoint = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ endpoint, body });
    let data;
    if (endpoint === '/sso/client/getUserInfo') data = { active: true, userDetails: { userId: 7, nickname: '测试用户' } };
    else if (endpoint === '/sso/client/refreshToken') { refreshes++; data = { access_token: 'new-token', refresh_token: 'new-refresh' }; }
    else if (endpoint === '/user/user/userTenantList') {
      if (expired) { expired = false; return { status: 401, ok: false }; }
      data = [{ id: 8, tenantName: '团队', adminRole: 'false' }];
    } else if (endpoint === '/user/user/apikey/page') {
      assert.equal(body.tenantId, 8); assert.equal(body.isAdmin, false);
      data = { total: 1, records: [{ id: 9, keyName: '开发', apiKey: 'sk-********abcd', status: 1, quota: '100', consumeQuota: '25', quotaMethodName: '月', expired: 9 }] };
    } else if (endpoint === '/user/user/tenant/wallet/personal') {
      assert.equal(new URL(url).searchParams.get('tenantId'), '8');
      assert.equal(new URL(url).searchParams.get('userId'), '7');
      data = { availableAmountRaw: '72.5', budgetLimit: '100', usedAmount: '27.5', tenantBalance: '80', cycleType: 2, status: 1 };
    } else if (endpoint === '/user/user/apikey/detail') data = { status: 1, apiKeyPlain: masked ? 'sk-********abcd' : 'sk-test-complete-key' };
    else if (endpoint === '/v1/public/models/grouped-by-month') {
      if (searchFailure) return { ok: false, status: 503 };
      assert.equal(options.headers?.Authorization, undefined);
      return { ok: true, json: async () => ({ code: 0, data: { data: [
        { month: '2026-11', models: [
          { modelId: 'model-1', showInSquare: false },
          { modelId: 'hidden-model-id', name: 'Hidden', type: '文本模型', showInSquare: false },
        ] },
        { month: '2026-10', models: [{ modelId: 'hidden-model-id' }, { id: 'invalid-record' }] },
      ] } }) };
    }
    else if (endpoint === '/api/v1/models') assert.fail('The square listing excludes hidden models');
    else if (endpoint === '/v1/models') { assert.equal(options.headers.Authorization, 'Bearer sk-test-complete-key'); return { ok: true, json: async () => ({ data: [{ id: 'model-1' }] }) }; }
    else if (endpoint === '/log/user/call/supplierList') data = [{ supplierId: 12, supplierName: '测试供应商' }];
    else if (endpoint === '/log/user/call/modelList') data = [{ modelId: 'model-1', modelName: '测试模型' }];
    else if (endpoint === '/user/user/dictionary/dict/model_type') data = [{ itemValue: 'text', itemName: '文本' }];
    else if (endpoint === '/log/user/call/list') {
      assert.deepEqual(body.apiKey, [9]);
      data = { total: 1, records: [{ id: 'call-1', invokeTime: '2026-10-20 18:30:00', keyValue: '开发 Key', modelName: 'model-1', tokenInput: 120, tokenOutput: 0, sell: '0.00125', responseStatus: 'success' }] };
    }
    else if (endpoint === '/log/user/call/call-1') {
      assert.equal(new URL(url).searchParams.get('tenantId'), '8');
      data = { id: 'call-1', latency: 0.4, throughput: 82, tokenCacheHit: 0, audioInput: 20, streamStatus: { endReason: 'stop' }, apiKeyPlain: 'must-not-expose' };
    }
    else throw new Error('Unexpected endpoint ' + endpoint);
    return { ok: true, status: 200, json: async () => ({ code: 200, data }) };
  };
  const encryption = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: data => data.toString() };
  const service = createLivePlatform({ directory, encryption, fetcher });
  assert.equal((await service.status()).authenticated, false);
  await service.acceptSession({ accessToken: 'test-token', refreshToken: 'test-refresh' });
  const orgs = await service.orgs();
  assert.equal(orgs[1].name, '团队'); assert.equal(refreshes, 1);
  const keys = await service.list('8');
  assert.equal(keys[0].secret, undefined); assert.equal(keys[0].apiKeyPlain, undefined);
  assert.equal(keys[0].budget.remaining, 75);
  assert.equal(keys[0].budget.used, 25);
  assert.equal(keys[0].statuses[0].label, '已启用');
  assert.equal(keys[0].expiresAt, 'permanent');
  const wallet = await service.wallet('8');
  assert.equal(wallet.available, 72.5);
  assert.equal(wallet.limit, 100);
  assert.equal(wallet.used, 27.5);
  assert.equal(wallet.organizationBalance, 80);
  assert.deepEqual(await service.models(keys[0].id), [{ id: 'model-1', name: 'model-1', category: '其他', owner: '', showInSquare: false }]);
  assert.deepEqual(await service.searchModels({ keyId: keys[0].id, query: ' hidden-model-id ' }), [
    { id: 'hidden-model-id', name: 'Hidden', category: '文本模型', owner: '', showInSquare: false },
  ]);
  await assert.rejects(service.searchModels({ keyId: keys[0].id, query: ' ' }), /模型 ID/);
  await assert.rejects(service.searchModels({ keyId: 'missing-key', query: 'hidden-model-id' }), /密钥列表/);
  searchFailure = true;
  await assert.rejects(service.searchModels({ keyId: keys[0].id, query: 'hidden-model-id' }), /HTTP 503/);
  searchFailure = false;
  const logs = await service.requests({ org: '8', keyId: keys[0].id });
  assert.equal(logs.connected, true);
  assert.equal(logs.items[0].time, '2026-10-20 18:30:00');
  assert.equal(logs.items[0].tokens, '输入 120 / 输出 0');
  assert.equal(logs.items[0].fields.tokenOutput, 0);
  assert.equal(logs.items[0].fields.sell, '0.00125');
  const options = await service.requestOptions({ org: '8' });
  assert.deepEqual(options.suppliers, [{ value: '12', label: '测试供应商' }]);
  assert.deepEqual(options.models, [{ value: 'model-1', label: '测试模型' }]);
  assert.deepEqual(options.types, [{ value: 'text', label: '文本' }]);
  await service.requests({ org: '8', keyId: keys[0].id, page: 3, pageSize: 20, modelId: ' model-1,model-2,model-1 ', supplierId: '12' });
  const filteredQuery = calls.filter(call => call.endpoint === '/log/user/call/list').at(-1).body;
  assert.equal(filteredQuery.pageNum, 3);
  assert.equal(filteredQuery.pageSize, 20);
  assert.deepEqual(filteredQuery.modelId, ['model-1', 'model-2']);
  assert.deepEqual(filteredQuery.supplierId, ['12']);
  await service.requests({ org: '8', keyId: keys[0].id, page: -2, pageSize: 999 });
  const boundedQuery = calls.filter(call => call.endpoint === '/log/user/call/list').at(-1).body;
  assert.equal(boundedQuery.pageNum, 1);
  assert.equal(boundedQuery.pageSize, 50);
  await service.requests({ org: '8', keyId: keys[0].id, modelTypes: 'text', startTime: '2026-10-01 00:00:00', endTime: '2026-10-22 23:59:59' });
  const dateQuery = calls.filter(call => call.endpoint === '/log/user/call/list').at(-1).body;
  assert.deepEqual(dateQuery.modelTypes, ['text']);
  assert.equal(dateQuery.startTime, '2026-10-01 00:00:00');
  assert.equal(dateQuery.endTime, '2026-10-22 23:59:59');
  await assert.rejects(service.requests({ org: '8', startTime: '2026-10-23 00:00:00', endTime: '2026-10-22 00:00:00' }), /时间范围/);
  const detail = await service.requestDetail({ org: '8', id: 'call-1' });
  assert.equal(detail.audioInput, 20);
  assert.equal(detail.tokenCacheHit, 0);
  assert.equal(detail.apiKeyPlain, undefined);
  assert.deepEqual(detail.streamStatus, { endReason: 'stop' });
  await assert.rejects(service.requestDetail({ org: '8', id: '../other' }), /ID 无效/);
  await assert.rejects(service.requests({ org: 'personal', keyId: keys[0].id }), /不属于/);
  masked = true;
  await assert.rejects(service.get(keys[0].id), /完整密钥/);
  await service.logout();
  assert.equal((await service.status()).authenticated, false);
  await assert.rejects(service.list('8'), /登录/);
});

test('login stays in memory without touching encryption or existing session files', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-memory-session-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'session.enc');
  const original = Buffer.from('existing-encrypted-session');
  await fs.writeFile(file, original);
  const encryption = new Proxy({}, { get() { assert.fail('Login must not access credential storage'); } });
  const fetcher = async (url, options) => {
    if (url.endsWith('/sso/client/getUserInfo')) return { ok: true, json: async () => ({ code: 200, data: { active: true, userDetails: { userId: 42, nickname: 'test' } } }) };
    assert.equal(options.headers.Authorization, 'Bearer new-private-token');
    return { ok: true, json: async () => ({ code: 200, data: [] }) };
  };
  const service = createLivePlatform({ directory, encryption, fetcher });
  assert.equal((await service.status()).authenticated, false);
  const status = await service.acceptSession({ accessToken: 'new-private-token', refreshToken: 'private-refresh' });
  assert.equal(status.authenticated, true);
  assert.equal(status.notice, undefined);
  assert.equal((await service.orgs())[0].id, 'personal');
  assert.deepEqual(await fs.readFile(file), original);
  assert.deepEqual(await fs.readdir(directory), ['session.enc']);
  assert.equal((await createLivePlatform({ directory, encryption, fetcher }).status()).authenticated, false);
  await service.logout();
  assert.equal((await service.status()).authenticated, false);
  assert.deepEqual(await fs.readFile(file), original);
});

test('login creates no session directory or credential file', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-no-session-file-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = createLivePlatform({
    directory: path.join(directory, 'platform'),
    fetcher: async () => ({ ok: true, json: async () => ({ code: 200, data: { active: true, userDetails: { userId: 42 } } }) }),
  });
  assert.equal((await service.acceptSession({ accessToken: 'private-token' })).authenticated, true);
  assert.deepEqual(await fs.readdir(directory), []);
});

test('current API preserves key types and scopes organization logs by server-provided admin role', async () => {
  const calls = [];
  const service = createLivePlatform({ fetcher: async (url, options) => {
    const endpoint = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ endpoint, body, query: new URL(url).searchParams });
    let data;
    if (endpoint === '/sso/client/getUserInfo') data = { userDetails: { userId: 7 } };
    else if (endpoint === '/user/user/userTenantList') data = [{ id: 8, tenantName: '组织', adminRole: true }, { id: 9, tenantName: '成员组织', adminRole: false }];
    else if (endpoint === '/user/user/apikey/page') data = { total: 4, records: [
      { id: 1, keyType: 0, status: 1, quota: 100, spend: 15 }, { id: 2, keyType: '1' }, { id: 3 }, { id: 4, keyType: 99 },
    ] };
    else if (endpoint === '/log/user/call/tenantConsumptionUsers') data = [{ userId: 11, userName: '成员' }, { userId: 11, userName: '成员' }];
    else if (endpoint.endsWith('/supplierList') || endpoint.endsWith('/modelList') || endpoint.endsWith('/model_type')) data = [];
    else if (endpoint === '/log/user/call/list') data = { total: 1, records: [{ id: 'new-log', callType: 'async', taskStatus: 'processing', firstLatency: 0, totalLatency: 1234, dataRetentionSwitch: 1, retryCount: 2, supplierTimeline: { attempts: [] }, apiKeyPlain: 'secret' }] };
    else throw new Error(endpoint);
    return { ok: true, json: async () => ({ code: 200, data }) };
  } });
  await service.acceptSession({ accessToken: 'test-token' });
  const keys = await service.list('8');
  assert.deepEqual(keys.map(key => key.keyType), [0, 1, null, null]);
  assert.equal(keys[0].budget.used, 15);
  assert.deepEqual((await service.list('personal')).map(key => key.keyType), [0, 0, 0, 0]);
  const filters = await service.requestOptions({ org: '8' });
  assert.deepEqual(filters.users, [{ value: '11', label: '成员' }]);
  assert.equal(calls.find(call => call.endpoint.endsWith('/supplierList')).query.has('userId'), false);
  const logs = await service.requests({ org: '8' });
  assert.equal(logs.items[0].status, 'processing');
  assert.equal(logs.items[0].fields.firstLatency, 0);
  assert.equal(logs.items[0].fields.dataRetentionSwitch, 1);
  assert.equal(logs.items[0].fields.apiKeyPlain, undefined);
  assert.deepEqual(logs.items[0].fields.supplierTimeline, { attempts: [] });
  assert.equal(calls.at(-1).body.userId, undefined);
  assert.equal(calls.at(-1).body.tenantId, 8);
  await service.requests({ org: '8', userId: '11' });
  assert.equal(calls.at(-1).body.userId, '11');
  await assert.rejects(service.requests({ org: '8', userId: '../oops' }), /无权/);
  await service.requests({ org: '9' });
  assert.equal(calls.at(-1).body.userId, 7);
  await assert.rejects(service.requests({ org: '9', userId: '11' }), /无权/);
  await service.requests({ org: 'personal' });
  assert.equal(calls.at(-1).body.userId, 7);
  assert.equal(calls.at(-1).body.tenantId, undefined);
});
