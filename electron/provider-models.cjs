async function fetchProviderModels(provider, fetcher = fetch) {
  const headers = provider.protocol === 'gemini' ? { 'x-goog-api-key': provider.apiKey } : provider.protocol === 'anthropic'
    ? { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' }
    : { Authorization: 'Bearer ' + provider.apiKey };
  const models = new Map();
  const cursors = new Set();
  let cursor = '';
  const signal = AbortSignal.timeout(20000);
  for (let page = 0; page < 100; page++) {
    const url = new URL(provider.baseURL + (provider.protocol === 'gemini' ? '/v1beta/models' : '/v1/models'));
    if (provider.protocol === 'gemini' && cursor) url.searchParams.set('pageToken', cursor);
    if (provider.protocol !== 'gemini' && cursor) url.searchParams.set('after_id', cursor);
    const response = await fetcher(url.href, { headers, redirect: 'error', signal });
    if (!response.ok) throw new Error('模型列表拉取失败：HTTP ' + response.status);
    const body = await response.json();
    if (provider.protocol === 'gemini') {
      if (body.error || !Array.isArray(body.models)) throw new Error('Gemini 模型列表响应格式无效');
      for (const item of body.models) {
        if (item.supportedGenerationMethods && !item.supportedGenerationMethods.includes('generateContent')) continue;
        const id = item.name?.replace(/^models\//, '');
        if (typeof id !== 'string' || !/^[\w./:@+-]{1,200}$/.test(id)) throw new Error('Gemini 模型 ID 无效');
        models.set(id, { id, name: item.displayName || id });
      }
      if (!body.nextPageToken) return [...models.values()];
      if (typeof body.nextPageToken !== 'string' || cursors.has(body.nextPageToken)) throw new Error('Gemini 模型分页游标无效');
      cursor = body.nextPageToken; cursors.add(cursor); continue;
    }
    if (body.error || !Array.isArray(body.data)) throw new Error('模型列表响应格式无效');
    for (const item of body.data) {
      if (!item || typeof item.id !== 'string' || !/^[\w./:@+-]{1,200}$/.test(item.id)) throw new Error('模型列表包含无效模型 ID');
      models.set(item.id, { id: item.id, name: item.display_name || item.name || item.id });
    }
    if (provider.protocol !== 'anthropic' || !body.has_more) return [...models.values()];
    if (!body.last_id || cursors.has(body.last_id)) throw new Error('模型列表分页游标无效');
    cursor = body.last_id; cursors.add(cursor);
  }
  throw new Error('模型列表分页数量超出限制');
}
module.exports = { fetchProviderModels };
