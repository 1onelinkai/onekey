const { fetchModelCatalog, searchModelCatalog } = require('./model-catalog.cjs');
const API = 'https://api.onelinkai.cloud';
const requestFields = require('../src/request-fields.json');
const { keyMetadata } = require('./key-metadata.cjs');
function logFields(record) {
  return Object.fromEntries(requestFields.map(([key]) => [key, record[key] ?? null]));
}

function createLivePlatform({ fetcher = fetch, sessionStore } = {}) {
  let auth;
  let loaded = false;
  let refreshTask;
  let generation = 0;
  const keys = new Map();
  let organizations = [];
  function load() {
    if (loaded) return;
    auth = sessionStore?.load();
    loaded = true;
  }
  function save(value) {
    sessionStore?.save(value);
    auth = value;
    loaded = true;
  }
  async function call(endpoint, { method = 'POST', body = {}, retry = true, token, anonymous = false } = {}) {
    if (!anonymous) load();
    if (!anonymous && !auth?.accessToken) throw new Error('请先登录 OneLinkAI');
    const current = generation;
    const response = await fetcher(API + endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Client-Source': 'tenant', environment: 'domestic',
        ...(!anonymous ? { Authorization: 'Bearer ' + (token || auth.accessToken), 'New-API-User': String(auth.user?.userId || -1) } : {}),
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (response.status === 401 && retry && !anonymous) {
      await refresh();
      return call(endpoint, { method, body, retry: false });
    }
    if (current !== generation) throw new Error('登录状态已变更，请重试');
    if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录' : '平台请求失败：HTTP ' + response.status);
    const result = await response.json();
    if (![0, 200].includes(result.code)) throw new Error(typeof result.message === 'string' ? result.message.slice(0, 200) : '平台响应格式异常');
    return result.data;
  }
  async function refresh() {
    if (refreshTask) return refreshTask;
    const current = generation;
    refreshTask = (async () => {
      if (!auth?.refreshToken) throw new Error('登录已过期，请重新登录');
      try {
        const data = await call('/sso/client/refreshToken', { anonymous: true, retry: false, body: { clientType: 'router', refreshToken: auth.refreshToken } });
        if (!data?.access_token || current !== generation) throw new Error('登录状态已变更，请重新登录');
        await save({ ...auth, accessToken: data.access_token, refreshToken: data.refresh_token || auth.refreshToken });
      } catch (error) {
        if (current === generation) await logout();
        throw error;
      }
    })().finally(() => { refreshTask = null; });
    return refreshTask;
  }
  async function acceptSession(candidate) {
    if (!candidate || typeof candidate.accessToken !== 'string' || candidate.accessToken.length > 16384) throw new Error('登录凭据无效');
    const data = await call('/sso/client/getUserInfo', { anonymous: true, body: { token: candidate.accessToken, clientType: 'router' } });
    if (data?.active === false || !data?.userDetails?.userId) throw new Error('登录未完成或账号不可用');
    generation++;
    keys.clear();
    organizations = [];
    await save({ accessToken: candidate.accessToken, refreshToken: candidate.refreshToken || '', user: data.userDetails });
    return status();
  }
  async function status() {
    load();
    return { authenticated: !!auth?.accessToken, demo: false, user: auth?.user ? { userId: auth.user.userId, nickname: auth.user.nickname || auth.user.userName || 'OneLinkAI 用户' } : null };
  }
  async function logout() {
    generation++;
    auth = null;
    loaded = true;
    sessionStore?.clear();
    keys.clear();
    organizations = [];
    return status();
  }
  async function orgs() {
    load();
    if (!auth?.user) throw new Error('请先登录 OneLinkAI');
    const data = await call('/user/user/userTenantList', { body: { userId: auth.user.userId } });
    if (!Array.isArray(data)) throw new Error('组织列表格式异常');
    organizations = [{ id: 'personal', name: '个人工作空间', personal: true }, ...data.map(org => ({
      id: String(org.id), name: org.tenantName || String(org.id), personal: false,
      admin: org.adminRole === true || org.adminRole === 'true' || org.adminRole === 1,
    }))];
    return organizations;
  }
  async function scope(orgId) {
    load();
    if (!auth?.accessToken) throw new Error('请先登录 OneLinkAI');
    if (!organizations.length) await orgs();
    const org = organizations.find(org => org.id === orgId);
    if (!org) throw new Error('组织不存在或无访问权限');
    return { userId: auth.user.userId, tenantType: org.personal ? 1 : 2, ...(!org.personal ? { tenantId: Number(org.id), isAdmin: org.admin } : {}) };
  }
  const fullSecret = value => typeof value === 'string' && value.length >= 8 && !/[*•\s\0]/.test(value) ? value : null;
  function validRecord(record) {
    if (record.status != null && Number(record.status) !== 1) throw new Error('该密钥已停用，无法配置');
    const metadata = keyMetadata(record);
    if (metadata.statuses.some(item => item.label === '已过期')) throw new Error('该密钥已过期，无法配置');
    if (metadata.statuses.some(item => item.label === '预算已用完')) throw new Error('该密钥预算已用完，无法配置');
    return fullSecret(record.apiKeyPlain) || fullSecret(record.apiKey);
  }
  async function list(orgId) {
    const args = await scope(orgId);
    const records = [];
    for (let page = 1; page <= 100; page++) {
      const data = await call('/user/user/apikey/page', { body: { ...args, currentPage: page, pageSize: 100, language: 1 } });
      if (!Array.isArray(data?.records)) throw new Error('API Key 列表格式异常');
      records.push(...data.records);
      if (data.records.length < 100 || records.length >= Number(data.total)) break;
    }
    for (const [id, key] of keys) if (key.org === orgId) keys.delete(id);
    return records.map(record => {
      const id = orgId + ':' + record.id;
      const secret = fullSecret(record.apiKeyPlain) || fullSecret(record.apiKey);
      keys.set(id, { org: orgId, recordId: record.id, record });
      return { id, org: orgId, name: record.keyName || '未命名密钥', masked: secret ? secret.slice(0, 3) + '••••••••' + secret.slice(-4) : record.apiKey || '不可读取',
        keyType: orgId === 'personal' ? 0 : record.keyType === 0 || record.keyType === 1 || record.keyType === '0' || record.keyType === '1' ? Number(record.keyType) : null,
        baseURL: API, createdAt: record.createTime || record.createdAt, status: record.status,
        ...keyMetadata(record),
        source: 'platform', hasSecret: !!secret };
    });
  }
  function walletMetadata(record) {
    if (!record || typeof record !== 'object') return null;
    const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const available = number(record.availableAmountRaw ?? record.availableAmount);
    const limit = number(record.budgetLimit);
    const used = number(record.usedAmount);
    const cycleType = number(record.cycleType);
    const status = number(record.status);
    const unlimited = cycleType === 5 && status === 1 || limit === -1;
    return {
      available,
      limit: unlimited ? null : limit,
      used,
      remaining: available,
      unlimited,
      period: record.quotaMethodName || (cycleType === 5 ? '总额' : ''),
      percent: !unlimited && limit != null && limit > 0 && used != null ? Math.min(100, Math.max(0, used / limit * 100)) : null,
      organizationBalance: number(record.tenantBalance),
      coupon: number(record.couponAmountRaw ?? record.couponAmount),
      cycleType,
    };
  }
  async function wallet(orgId) {
    const args = await scope(orgId);
    try {
      const params = new URLSearchParams({ userId: String(args.userId), ...(args.tenantId ? { tenantId: String(args.tenantId) } : {}) });
      const endpoint = args.tenantId
        ? '/user/user/tenant/wallet/personal?' + params
        : '/user/user/wallet/getUserWalletByUserId/' + encodeURIComponent(String(args.userId));
      return walletMetadata(await call(endpoint, { method: 'GET' }));
    } catch (error) {
      // Wallet data is supplementary to the key list. Keep the list usable when an older account lacks this endpoint.
      if (/HTTP 404|平台请求失败：HTTP 404/.test(error.message || '')) return null;
      throw error;
    }
  }
  async function get(id) {
    const key = keys.get(id);
    if (!key) throw new Error('密钥列表已失效，请刷新后重试');
    await scope(key.org);
    const params = new URLSearchParams({ id: String(key.recordId), language: '1', ...(key.org === 'personal' ? {} : { tenantId: key.org }) });
    const detail = await call('/user/user/apikey/detail?' + params, { method: 'GET' });
    const secret = validRecord({ ...key.record, ...detail });
    if (!secret) throw new Error('平台未返回完整密钥，无法配置。请联系平台开放受控的密钥授权接口');
    return { id, secret, baseURL: API };
  }
  async function models(id) {
    const key = await get(id);
    const response = await fetcher(API + '/v1/models', { headers: { Authorization: 'Bearer ' + key.secret }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('获取可用模型失败：HTTP ' + response.status);
    const result = await response.json();
    if (!Array.isArray(result.data)) throw new Error('模型列表格式异常');
    let catalog = new Map();
    try {
      catalog = new Map((await fetchModelCatalog({ fetcher })).map(model => [model.id, model]));
    } catch { /* Classification is optional; never replace the key's authorized model list. */ }
    return result.data.filter(model => typeof model.id === 'string').map(model => ({ id: model.id, name: model.name || catalog.get(model.id)?.name || model.id,
      category: model.type || model.category || catalog.get(model.id)?.category || '其他', owner: model.owned_by || '', ...((model.showInSquare === false || catalog.get(model.id)?.showInSquare === false) ? { showInSquare: false } : {}) }));
  }
  async function searchModels({ keyId, query } = {}) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('请输入有效的模型 ID');
    // Validate the selected key, but never send its secret to the public catalog.
    await get(keyId);
    return searchModelCatalog(await fetchModelCatalog({ fetcher }), query);
  }

  async function requestOptions({ org } = {}) {
    const args = await scope(org);
    const query = new URLSearchParams({ ...(!args.isAdmin ? { userId: String(args.userId) } : {}), ...(args.tenantId ? { tenantId: String(args.tenantId) } : {}) });
    const [suppliers, models, types, users] = await Promise.all([
      call('/log/user/call/supplierList?' + query, { method: 'GET' }),
      call('/log/user/call/modelList?' + query, { method: 'GET' }),
      call('/user/user/dictionary/dict/model_type', { method: 'GET' }),
      args.tenantId && args.isAdmin ? call('/log/user/call/tenantConsumptionUsers?' + query, { method: 'GET' }) : [],
    ]);
    const options = (data, id, label) => {
      if (!Array.isArray(data)) throw new Error('请求筛选列表格式异常');
      return data.filter(item => item[id] != null).map(item => ({ value: String(item[id]), label: String(item[label] || item[id]) }));
    };
    return { suppliers: options(suppliers, 'supplierId', 'supplierName'), models: options(models, 'modelId', 'modelName'), types: options(types, 'itemValue', 'itemName'), users: [...new Map(options(users, 'userId', 'userName').map(item => [item.value, item])).values()] };
  }
  async function requests({ org, keyId, userId = '', page = 1, pageSize = 50, modelId = '', supplierId = '', modelTypes = '', startTime = '', endTime = '' } = {}) {
    const args = await scope(org);
    if (keyId && (!keys.has(keyId) || keys.get(keyId).org !== org)) throw new Error('密钥不属于当前组织，请刷新');
    page = Math.max(1, Math.floor(Number(page) || 1));
    pageSize = [20, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 50;
    const filterIds = value => typeof value === 'string' ? [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))].slice(0, 50) : [];
    const validTime = value => !value || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(value.replace(' ', 'T')));
    if (!validTime(startTime) || !validTime(endTime) || startTime && endTime && startTime > endTime) throw new Error('请求时间范围无效');
    if (userId && (!args.isAdmin || !/^\d+$/.test(String(userId)))) throw new Error('无权筛选该用户');
    const { tenantId } = args;
    const data = await call('/log/user/call/list', { body: { ...(tenantId ? { tenantId } : {}), ...(!args.isAdmin ? { userId: args.userId } : userId ? { userId } : {}), pageNum: page, pageSize, startTime: startTime || null, endTime: endTime || null, modelId: filterIds(modelId), supplierId: filterIds(supplierId), apiKey: keyId ? [keys.get(keyId).recordId] : [], modelTypes: filterIds(modelTypes) } });
    if (!Array.isArray(data?.records)) throw new Error('请求记录格式异常');
    return { connected: true, total: data.total, page, pageSize, items: data.records.map(record => ({
      id: record.id,
      time: record.invokeTime ?? record.createTime ?? record.createdAt ?? record.startTime,
      keyName: record.keyValue || record.keyName || '—',
      model: record.modelName || record.model || record.modelId || '—',
      tokens: record.tokenInput != null || record.tokenOutput != null
        ? `输入 ${record.tokenInput ?? '—'} / 输出 ${record.tokenOutput ?? '—'}`
        : record.totalTokens ?? record.tokens ?? '—',
      cost: record.sell ?? record.fee ?? record.cost ?? '—',
      status: record.callType === 'async' && record.taskStatus === 'processing' ? 'processing' : record.responseStatus ?? record.status ?? '—',
      fields: logFields(record),
    })) };
  }
  async function requestDetail({ org, id }) {
    const args = await scope(org);
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('日志 ID 无效');
    if (!/^[\w-]{1,200}$/.test(String(id))) throw new Error('日志 ID 无效');
    const query = args.tenantId ? '?tenantId=' + args.tenantId : '';
    const data = await call('/log/user/call/' + encodeURIComponent(id) + query, { method: 'GET' });
    if (!data || typeof data !== 'object') throw new Error('日志详情格式异常');
    return logFields(data);
  }
  return { status, acceptSession, logout, orgs, list, wallet, get, models, searchModels, requests, requestOptions, requestDetail };
}
module.exports = { createLivePlatform };
