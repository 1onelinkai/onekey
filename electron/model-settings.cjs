const capabilities = require('../src/client-capabilities.json');
const labels = { name: '模型显示名称', contextWindow: '上下文窗口', maxTokens: '最大输出 Token', reasoningEffort: '推理档位', subagentModel: '子代理模型', compactThreshold: '自动压缩阈值', reviewModel: '审查模型', thinkingBudget: '思考 Token 预算', supportsImages: '图片输入', supportsTools: '工具调用', supportsReasoning: '推理能力', supports1m: '1M 上下文变体' };
const effortLevels = require('../src/client-effort-levels.json');
function validateModelSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('模型参数必须是对象');
  const result = {};
  for (const field of ['contextWindow', 'maxTokens', 'compactThreshold', 'thinkingBudget']) {
    const value = input[field];
    if (value === undefined || value === null || value === '') continue;
    const min = field === 'thinkingBudget' ? 0 : 1;
    if ((typeof value !== 'string' && typeof value !== 'number') || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > 100000000)
      throw new Error(`${labels[field]}必须是 ${min} 到 100000000 的整数`);
    result[field] = Number(value);
  }
  if (result.contextWindow && result.maxTokens > result.contextWindow) throw new Error('最大输出 Token 不能大于上下文窗口');
  if (result.contextWindow && result.compactThreshold >= result.contextWindow) throw new Error('自动压缩阈值必须小于上下文窗口');
  if (result.maxTokens && result.thinkingBudget >= result.maxTokens) throw new Error('思考预算必须小于最大输出 Token');
  for (const field of ['supportsImages', 'supportsTools', 'supportsReasoning', 'supports1m']) {
    if (input[field] === undefined || input[field] === null || input[field] === '') continue;
    if (typeof input[field] !== 'boolean') throw new Error(`${labels[field]}必须为布尔值`);
    result[field] = input[field];
  }
  for (const field of ['subagentModel', 'reviewModel']) {
    if (input[field] === undefined || input[field] === null || input[field] === '') continue;
    if (typeof input[field] !== 'string' || !/^[\w./:@+-]{1,200}$/.test(input[field])) throw new Error(`${labels[field]} ID 无效`);
    result[field] = input[field];
  }
  if (input.reasoningEffort !== undefined && input.reasoningEffort !== '') {
    if (!Object.values(effortLevels).flat().includes(input.reasoningEffort)) throw new Error('推理档位无效');
    result.reasoningEffort = input.reasoningEffort;
  }
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.length > 120 || /[\r\n\0]/.test(input.name)) throw new Error('模型显示名称格式无效');
    if (input.name.trim()) result.name = input.name.trim();
  }
  return result;
}
function settingsForClient(client, raw) {
  const all = validateModelSettings(raw);
  const supported = capabilities[client] || [];
  if (supported.includes('reasoningEffort') && all.reasoningEffort && !effortLevels[client]?.includes(all.reasoningEffort)) throw new Error('当前应用不支持此推理档位');
  return { settings: Object.fromEntries(Object.entries(all).filter(([key]) => supported.includes(key))), ignored: Object.keys(all).filter(key => !supported.includes(key)).map(key => labels[key]) };
}
module.exports = { validateModelSettings, settingsForClient, effortLevels, labels };
