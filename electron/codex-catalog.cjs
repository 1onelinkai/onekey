// Codex desktop's picker reads the model catalog separately from config.model.
// Keep this catalog independent of other configuration managers.
function updateCatalog(text, model, name, settings = {}) {
  const value = text === null ? { models: [] } : JSON.parse(text);
  if (!value || !Array.isArray(value.models)) throw new Error('One Key 的 Codex 模型目录格式无效');
  const effort = settings.reasoningEffort || 'medium';
  const entry = {
    slug: model, display_name: name || model, description: 'One Key · ' + model,
    default_reasoning_level: effort,
    supported_reasoning_levels: [...new Set(['low', 'medium', 'high', effort])].map(effort => ({ effort, description: effort })),
    shell_type: 'shell_command', visibility: 'list', supported_in_api: true, priority: 0,
    availability_nux: null, upgrade: null,
    base_instructions: 'You are a coding assistant. Help the user complete their software development tasks.',
    support_verbosity: false, default_verbosity: null, apply_patch_tool_type: null,
    supports_reasoning_summaries: false, supports_reasoning_summary_parameter: false,
    supports_parallel_tool_calls: false,
    truncation_policy: { mode: 'tokens', limit: 10000 },
    ...(settings.contextWindow ? { context_window: settings.contextWindow } : {}),
    experimental_supported_tools: [], input_modalities: settings.supportsImages ? ['text', 'image'] : ['text'],
  };
  return JSON.stringify({ ...value, models: [entry, ...value.models.filter(item => item.slug !== model).map(item => ({ ...item, priority: Math.max(1, item.priority || 0) }))] }, null, 2) + '\n';
}
module.exports = { updateCatalog };
