const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateModelSettings } = require('./model-settings.cjs');
const providerDetails = input => {
  const result = {};
  if (input.notes !== undefined) {
    if (typeof input.notes !== 'string' || input.notes.length > 1000) throw new Error('备注不能超过 1000 字');
    result.notes = input.notes.trim();
  }
  if (input.website !== undefined) {
    if (typeof input.website !== 'string' || input.website.length > 2048) throw new Error('官网链接格式无效');
    result.website = '';
    if (input.website.trim()) {
      const url = new URL(input.website.trim());
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('官网链接必须使用 HTTPS 且不能包含凭据');
      result.website = url.href;
    }
  }
  return result;
};

const { validateProtocols, providerProtocols, modelProtocols } = require('./provider-protocols.cjs');
const protocols = new Set(['openai', 'anthropic', 'responses', 'gemini']);
const id = () => crypto.randomUUID();
const cleanUrl = value => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('接口地址不能为空');
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('接口地址必须使用 HTTPS（本机测试地址除外）');
  if (url.username || url.password || url.search || url.hash) throw new Error('接口地址不能包含凭据、查询参数或片段');
  return url.href.replace(/\/+$/, '').replace(/\/v1$/, '');
};
const validateSecret = value => {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048 || /[\r\n\0]/.test(value)) throw new Error('API Key 格式无效');
  return value;
};
const validateModel = value => {
  if (typeof value !== 'string' || !/^[\w./:@+-]{1,200}$/.test(value)) throw new Error('模型 ID 无效');
  return value;
};

function createLocalProviderStore({ file, storage, encryption = { encrypt: value => Buffer.from(value), decrypt: value => value.toString('utf8') } } = {}) {
  let memory = { providers: [], defaultModel: null };
  if (!encryption?.encrypt || !encryption?.decrypt) throw new Error('本地模型服务商存储未配置加密能力');
  async function read() {
    if (storage) return storage.load() ?? { providers: [], defaultModel: null };
    if (!file) return structuredClone(memory);
    try {
      const raw = await fs.readFile(file);
      return JSON.parse(encryption.decrypt(raw));
    } catch (error) {
      if (error.code === 'ENOENT') return { providers: [], defaultModel: null };
      if (error instanceof SyntaxError) throw new Error('本地模型服务商数据损坏');
      throw error;
    }
  }
  async function write(value) {
    if (storage) { storage.save(value); return; }
    if (!file) { memory = structuredClone(value); return; }
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = file + '.' + crypto.randomUUID();
    await fs.writeFile(tmp, encryption.encrypt(JSON.stringify(value)), { mode: 0o600, flag: 'wx' });
    await fs.rename(tmp, file);
    await fs.chmod(file, 0o600);
  }
  const publicProvider = provider => ({
    id: provider.id, name: provider.name, notes: provider.notes || '', website: provider.website || '', baseURL: provider.baseURL, protocol: provider.protocol, protocols: providerProtocols(provider),
    models: provider.models.map(model => ({ ...model, protocols: modelProtocols(provider, model) })),
    createdAt: provider.createdAt, updatedAt: provider.updatedAt,
  });
  async function listProviders() { const data = await read(); return data.providers.map(publicProvider); }
  async function getProvider(providerId) {
    const data = await read(); const provider = data.providers.find(item => item.id === providerId);
    if (!provider) throw new Error('模型服务商不存在');
    return provider;
  }
  async function createProvider(input = {}) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new Error('模型服务商名称不能为空');
    if (!protocols.has(input.protocol)) throw new Error('请选择接口协议');
    const supportedProtocols = validateProtocols(input.protocols || [input.protocol]);
    if (!supportedProtocols.includes(input.protocol)) throw new Error('默认协议必须在支持的协议中');
    const secret = validateSecret(input.apiKey);
    const details = providerDetails(input);
    const now = new Date().toISOString();
    const data = await read();
    const provider = { ...details, id: id(), name: input.name.trim(), baseURL: cleanUrl(input.baseURL).replace(input.protocol === 'gemini' ? /\/v1beta$/ : /$^/, ''), protocol: input.protocol, protocols: supportedProtocols, apiKey: encryption.encrypt(secret).toString('base64'), models: [], createdAt: now, updatedAt: now };
    data.providers.push(provider); await write(data); return publicProvider(provider);
  }
  async function updateProvider(providerId, input = {}) {
    const data = await read(); const provider = data.providers.find(item => item.id === providerId); if (!provider) throw new Error('模型服务商不存在');
    // Freeze legacy models to their original protocol before editing the provider.
    provider.models.forEach(model => { model.protocols = modelProtocols(provider, model); });
    const nextProtocols = validateProtocols(input.protocols || (input.protocol && !provider.protocols ? [input.protocol] : providerProtocols(provider)));
    const nextDefault = input.protocol || provider.protocol;
    if (!nextProtocols.includes(nextDefault)) throw new Error('默认协议必须在支持的协议中');
    if (provider.models.some(model => model.protocols.some(value => !nextProtocols.includes(value)))) throw new Error('有模型正在使用待移除的协议，请先修改这些模型的协议');
    provider.protocols = nextProtocols;
    Object.assign(provider, providerDetails(input));
    if (input.name !== undefined) { if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new Error('模型服务商名称不能为空'); provider.name = input.name.trim(); }
    if (input.baseURL !== undefined) provider.baseURL = cleanUrl(input.baseURL);
    if (input.protocol !== undefined) { if (!protocols.has(input.protocol)) throw new Error('请选择接口协议'); provider.protocol = input.protocol; }
    if (provider.protocol === 'gemini') provider.baseURL = provider.baseURL.replace(/\/v1beta$/, '');
    if (input.apiKey !== undefined && input.apiKey !== '') provider.apiKey = encryption.encrypt(validateSecret(input.apiKey)).toString('base64');
    provider.updatedAt = new Date().toISOString(); await write(data); return publicProvider(provider);
  }
  async function deleteProvider(providerId) {
    const data = await read(); const index = data.providers.findIndex(item => item.id === providerId); if (index < 0) throw new Error('模型服务商不存在');
    data.providers.splice(index, 1); if (data.defaultModel?.providerId === providerId) data.defaultModel = null; await write(data); return { deleted: true };
  }
  async function createModel(providerId, input = {}) {
    const data = await read(); const provider = data.providers.find(item => item.id === providerId); if (!provider) throw new Error('模型服务商不存在');
    const modelId = validateModel(input.id); const model = { ...Object.fromEntries(Object.entries(validateModelSettings(input)).filter(([key]) => ['name', 'contextWindow', 'maxTokens', 'supportsImages', 'supportsTools', 'supportsReasoning'].includes(key))), id: modelId, protocols: validateProtocols(input.protocols || [provider.protocol], providerProtocols(provider)), name: String(input.name || modelId).trim().slice(0, 120), enabled: input.enabled !== false, isDefault: false };
    if (provider.models.some(item => item.id === modelId)) throw new Error('模型已存在'); provider.models.push(model); provider.updatedAt = new Date().toISOString(); await write(data); return model;
  }
  async function updateModel(providerId, modelId, input = {}) {
    const data = await read(); const provider = data.providers.find(item => item.id === providerId); if (!provider) throw new Error('模型服务商不存在'); const model = provider.models.find(item => item.id === modelId); if (!model) throw new Error('模型不存在');
    if (input.protocols !== undefined) model.protocols = validateProtocols(input.protocols, providerProtocols(provider));
    const settings = validateModelSettings({ ...model, ...input });
    for (const field of ['contextWindow', 'maxTokens', 'supportsImages', 'supportsTools', 'supportsReasoning']) {
      if (settings[field] !== undefined) model[field] = settings[field]; else delete model[field];
    }
    if (input.name !== undefined) model.name = String(input.name || model.id).trim().slice(0, 120); if (input.enabled !== undefined) {
      model.enabled = !!input.enabled;
      if (!model.enabled && model.isDefault) { model.isDefault = false; data.defaultModel = null; }
    } provider.updatedAt = new Date().toISOString(); await write(data); return model;
  }
  async function deleteModel(providerId, modelId) {
    const data = await read(); const provider = data.providers.find(item => item.id === providerId); if (!provider) throw new Error('模型服务商不存在'); const index = provider.models.findIndex(item => item.id === modelId); if (index < 0) throw new Error('模型不存在');
    provider.models.splice(index, 1); if (data.defaultModel?.providerId === providerId && data.defaultModel.modelId === modelId) data.defaultModel = null; await write(data); return { deleted: true };
  }
  async function setDefaultModel(providerId, modelId) {
    const provider = await getProvider(providerId); if (!provider.models.some(item => item.id === modelId && item.enabled)) throw new Error('只能将启用的模型设为默认'); const data = await read(); data.defaultModel = { providerId, modelId }; data.providers.forEach(item => item.models.forEach(model => { model.isDefault = item.id === providerId && model.id === modelId; })); await write(data); return data.defaultModel;
  }
  async function getCredential(providerId) { const provider = await getProvider(providerId); return { ...provider, apiKey: encryption.decrypt(Buffer.from(provider.apiKey, 'base64')) }; }
  async function listModels() { const data = await read(); return data.providers.flatMap(provider => provider.models.map(model => ({ ...model, providerId: provider.id, providerName: provider.name, protocol: provider.protocol, protocols: modelProtocols(provider, model), baseURL: provider.baseURL }))); }
  async function syncModels(providerId, models) {
    // Validate the complete response before changing the encrypted store.
    const incoming = models.map(model => ({ id: validateModel(model.id), name: String(model.name || model.id).slice(0, 120), ...(model.protocols !== undefined ? { protocols: validateProtocols(model.protocols) } : {}) }));
    const data = await read();
    const provider = data.providers.find(item => item.id === providerId);
    if (!provider) throw new Error('模型服务商不存在');
    incoming.forEach(model => validateProtocols(model.protocols || [provider.protocol], providerProtocols(provider)));
    for (const model of incoming) if (!provider.models.some(item => item.id === model.id)) provider.models.push({ ...model, enabled: true, isDefault: false });
    provider.updatedAt = new Date().toISOString();
    await write(data);
    return incoming;
  }
  async function selectModels(providerId, models) {
    if (!Array.isArray(models) || models.length > 10000) throw new Error('模型选择无效');
    const incoming = models.map(model => ({ id: validateModel(model.id), name: String(model.name || model.id).slice(0, 120), ...(model.protocols !== undefined ? { protocols: validateProtocols(model.protocols) } : {}) }));
    if (new Set(incoming.map(model => model.id)).size !== incoming.length) throw new Error('模型选择包含重复 ID');
    const data = await read();
    const provider = data.providers.find(item => item.id === providerId);
    if (!provider) throw new Error('模型服务商不存在');
    incoming.forEach(model => validateProtocols(model.protocols || [provider.protocol], providerProtocols(provider)));
    provider.models = incoming.map(model => provider.models.find(item => item.id === model.id) || { ...model, enabled: true, isDefault: false });
    if (data.defaultModel?.providerId === providerId && !provider.models.some(model => model.id === data.defaultModel.modelId)) data.defaultModel = null;
    provider.updatedAt = new Date().toISOString();
    await write(data);
    return publicProvider(provider);
  }
  let pending = Promise.resolve();
  const serial = fn => (...args) => {
    const result = pending.then(() => fn(...args));
    pending = result.catch(() => {});
    return result;
  };
  return { listProviders, listModels, getCredential, ...Object.fromEntries(Object.entries({ createProvider, updateProvider, deleteProvider, createModel, updateModel, deleteModel, setDefaultModel, syncModels, selectModels }).map(([name, fn]) => [name, serial(fn)])) };
}

// Use the same local file encryption as login persistence, in a separate directory.
// The complete document (including API keys) is encrypted without OS keychain access.
function createPersistentLocalProviderStore(directory) {
  const { createSessionStore } = require('./session-store.cjs');
  return createLocalProviderStore({ storage: createSessionStore(directory) });
}

module.exports = { createLocalProviderStore, createPersistentLocalProviderStore };
