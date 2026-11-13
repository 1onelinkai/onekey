const JSON5 = require('json5');
const toml = require('@iarna/toml');
const YAML = require('yaml');

// Consume only the inspector's sanitized snapshot, never credentials or raw files.
function configSummary(snapshot) {
  const docs = snapshot.files.filter(file => file.status === 'present' && file.format !== 'env').flatMap(file => {
    try {
      return [{ file: { ...file, path: file.path.replaceAll('\\', '/') }, value: file.format === 'toml' ? toml.parse(file.content) : file.format === 'yaml' ? YAML.parse(file.content) : JSON5.parse(file.content) }];
    } catch { return []; }
  });
  const values = name => docs.filter(doc => doc.file.path.endsWith('/' + name));
  const first = name => values(name)[0]?.value || {};
  const models = new Set();
  const clean = value => typeof value === 'string' && value.trim() && value.length <= 300 && !/[\n\r\0]/.test(value) && !value.includes('<REDACTED>') ? value.trim() : '';
  const add = value => { const id = clean(value); if (id) models.add(id); return id; };
  const stripProvider = value => typeof value === 'string' && value.includes('/') ? value.slice(value.indexOf('/') + 1) : value;
  const collect = entries => { if (Array.isArray(entries)) entries.forEach(item => add(typeof item === 'string' ? item : item?.id || item?.name)); };
  const collectProviders = providers => Object.values(providers || {}).forEach(provider => {
    if (Array.isArray(provider?.models)) collect(provider.models);
    else Object.keys(provider?.models || {}).forEach(add);
  });
  let model = '', dshProfile, selectionSource = 'config-default';
  switch (snapshot.client) {
    case 'claude': {
      const merged = Object.assign({}, first('settings.json'), first('settings.local.json'));
      const env = { ...first('settings.json').env, ...first('settings.local.json').env };
      model = add(env.ANTHROPIC_MODEL || merged.model);
      break;
    }
    case 'codex': {
      const data = first('config.toml');
      model = add(data.profiles?.[data.profile]?.model || data.model); break;
    }
    case 'gemini': { const value = first('settings.json').model; model = add(typeof value === 'string' ? value : value?.name); break; }
    case 'grok': {
      const data = first('config.toml');
      model = add(data.model?.[data.models?.default]?.model); break;
    }
    case 'opencode': {
      const data = values('opencode.jsonc')[0]?.value || first('opencode.json');
      model = add(stripProvider(data.model || data.agent?.[data.default_agent || 'build']?.model));
      collectProviders(data.provider);
      if (!model) { model = add(first('model.json').recent?.[0]?.modelID); selectionSource = 'last-used'; }
      break;
    }
    case 'openclaw': {
      const data = docs[0]?.value || {}, value = data.agents?.defaults?.model;
      model = add(stripProvider(typeof value === 'string' ? value : value?.primary));
      collectProviders(data.models?.providers); break;
    }
    case 'pi': model = add(first('settings.json').defaultModel); collectProviders(first('models.json').providers); break;
    case 'minimax': model = add(stripProvider(first('config.yaml').defaultModel)); collectProviders(first('config.yaml').custom_provider); break;
    case 'hermes': {
      const value = first('config.yaml').model;
      model = add(typeof value === 'string' ? value : value?.default); break;
    }
    case 'zed': model = add(first('settings.json').agent?.default_model?.model); break;
    case 'workbuddy': {
      const data = first('models.json');
      collect(Array.isArray(data) ? data : data.models);
      // A registry is not proof that any one entry is currently selected.
      model = add(values('settings.json').map(doc => doc.value.defaultModel).find(Boolean) || data.defaultModel);
      break;
    }
    case 'zcode': {
      const data = first('config.json');
      model = add(stripProvider(data.model));
      Object.values(data.provider || {}).forEach(provider => Object.keys(provider?.models || {}).forEach(add));
      break;
    }
    case 'vscode':
      for (const { value, file } of values('chatLanguageModels.json')) {
        if (file.path.includes('/profiles/')) continue;
        if (Array.isArray(value)) value.forEach(group => collect(group?.models));
      }
      break;
    case 'claude-desktop': {
      const meta = first('_meta.json');
      const active = clean(meta.appliedId);
      const profile = active && /^[\w-]+$/.test(active) ? first(active + '.json') : null;
      if (profile) {
        collect(profile.inferenceModels);
        // Multiple gateway models are choices, not an explicit default.
        if (models.size === 1) { model = [...models][0]; selectionSource = 'single-available'; }
      } else {
        const data = first('claude_desktop_config.json');
        collect(data.inferenceModels);
        if (models.size === 1) { model = [...models][0]; selectionSource = 'single-available'; }
      }
      break;
    }
    case 'deepseek-harness':
    case 'deepseek-harness-desktop': {
      const wanted = snapshot.client.endsWith('-desktop') ? 'desktop' : 'web';
      const profileDocs = values('cordis.patch.yml');
      const selected = profileDocs.find(doc => doc.file.path.includes('/profiles/' + wanted + '/')) || profileDocs.find(doc => !doc.file.path.includes('/profiles/'));
      if (selected && Array.isArray(selected.value)) {
        const selection = selected.value.findLast(item => item?.id === 'agent-default-model')?.config;
        model = add(selection?.model);
        dshProfile = wanted;
      }
      break;
    }
  }
  const uncertain = snapshot.files.some(file => file.status === 'error');
  return {
    ...(model ? { selectionSource } : { selectionStatus: 'not-saved' }),
    source: 'disk', state: models.size ? 'configured' : uncertain ? 'unreadable' : 'none',
    model, models: [...models], count: models.size,
    ...(dshProfile ? { dshProfile } : {}),
  };
}
module.exports = { configSummary };
