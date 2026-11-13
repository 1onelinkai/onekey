// Source IDs can contain colons (organization ID + key record ID).
export function parseConfigSource(value) {
  const separator = value.indexOf(':');
  return separator < 0 ? { kind: '', id: '' } : { kind: value.slice(0, separator), id: value.slice(separator + 1) };
}

export function selectAvailableModel(models, preferred = '') {
  return (models.find(item => item.id === preferred) || models.find(item => item.isDefault) || models[0])?.id || '';
}

export function configModelPresentation(config, client) {
  if (!config?.model) {
    const count = config?.count || config?.models?.length || 0;
    const reason = config?.selectionStatus === 'unreadable' ? '选择记录暂无法读取' : config?.selectionStatus === 'session-scoped' ? '模型按工作区或会话分别保存' : config?.selectionStatus === 'multiple-agents' ? '各 Agent 选择不同' : client === 'vscode' ? '未读取到聊天面板选择' : client === 'claude-desktop' ? '选择由客户端会话管理' : '未读取到默认项';
    return { label: '本机模型配置', text: `已配置 ${count} 个模型`, title: `${reason}；${config?.models?.join('、') || ''}` };
  }
  const label = config.selectionSource === 'new-task-default' ? '新任务默认模型'
    : config.selectionSource === 'last-selection' ? '上次选择模型'
    : config.selectionSource === 'last-used' ? '最近使用模型'
    : config.selectionSource === 'single-available' ? '已配置模型'
    : config.dshProfile ? `本机默认 · ${config.dshProfile}` : '本机默认模型';
  return { label, text: config.model, title: `${config.selectionScope ? config.selectionScope + ' · ' : ''}${config.model}；会话、项目配置或启动参数可能覆盖此项` };
}
