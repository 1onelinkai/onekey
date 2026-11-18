const supported = ['openai', 'responses', 'anthropic', 'gemini'];
function validateProtocols(value, allowed = supported) {
  if (!Array.isArray(value) || !value.length || value.some(item => !allowed.includes(item))) throw new Error('请至少选择一种受支持的接口协议');
  return [...new Set(value)];
}
const providerProtocols = provider => provider.protocols || [provider.protocol];
const modelProtocols = (provider, model) => model.protocols || [provider.protocol];
function resolveModelProtocol(provider, model, requested) {
  const available = modelProtocols(provider, model).filter(value => providerProtocols(provider).includes(value));
  const protocol = requested || (available.includes(provider.protocol) ? provider.protocol : available[0]);
  if (!available.includes(protocol)) throw new Error('此模型不支持所选接口协议，请修改模型支持的协议或重新选择');
  return protocol;
}
module.exports = { validateProtocols, providerProtocols, modelProtocols, resolveModelProtocol };
