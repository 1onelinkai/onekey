const MODEL_CATALOG_PATH = '/v1/public/models/grouped-by-month';

async function fetchModelCatalog({ fetcher = fetch, baseURL = 'https://api.onelinkai.cloud' } = {}) {
  const response = await fetcher(baseURL + MODEL_CATALOG_PATH, {
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('模型目录获取失败：HTTP ' + response.status);
  const result = await response.json();
  if (![0, 200].includes(result.code) || !Array.isArray(result.data?.data)) throw new Error('模型目录格式异常');
  const catalog = new Map();
  for (const group of result.data.data) {
    if (!Array.isArray(group?.models)) continue;
    for (const model of group.models) {
      if (typeof model?.modelId !== 'string' || !model.modelId.trim() || catalog.has(model.modelId)) continue;
      catalog.set(model.modelId, {
        id: model.modelId, name: model.name || model.modelId, category: model.type || '其他', owner: '',
        ...(model.showInSquare === false ? { showInSquare: false } : {}),
      });
    }
  }
  return [...catalog.values()];
}

function searchModelCatalog(models, query) {
  const search = query.trim().toLowerCase();
  if (!search) return [];
  return models.filter(model => model.id.toLowerCase().includes(search) ||
    (model.showInSquare !== false && model.name.toLowerCase().includes(search)));
}

module.exports = { MODEL_CATALOG_PATH, fetchModelCatalog, searchModelCatalog };
