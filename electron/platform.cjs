const { fetchModelCatalog, searchModelCatalog } = require('./model-catalog.cjs');
// Replace this adapter with authenticated OneLinkAI API calls when backend integration is ready.
function createPlatformService({ modelEndpoint } = {}) {
  const organizations = ["个人工作空间", "OneLink 研发团队"];
  const keys = organizations.flatMap((org, index) => [
    {
      id: `platform-${index}-development`,
      org,
      name: index ? "团队开发" : "日常开发",
      secret: `sk-demo-platform-${index}-development`,
      baseURL: modelEndpoint || "https://api.onelinkai.cloud",
      createdAt: "2026-10-18T08:00:00Z",
    },
    {
      id: `platform-${index}-production`,
      org,
      name: index ? "团队生产" : "项目专用",
      secret: `sk-demo-platform-${index}-production`,
      baseURL: modelEndpoint || "https://api.onelinkai.cloud",
      createdAt: "2026-10-19T08:00:00Z",
    },
  ]);
  async function get(id) {
    const key = keys.find((key) => key.id === id);
    if (!key) throw new Error("API Key 不存在，请刷新列表");
    return { ...key };
  }
  return {
    list: async (org) => keys.filter((key) => key.org === org).map(({ secret, ...key }) => ({
      ...key,
      ...require('./key-metadata.cjs').keyMetadata({ status: 1, quota: null, expired: 9 }),
      masked: "sk-••••••••" + secret.slice(-4),
      source: "demo-platform",
    })),
    wallet: async () => ({ available: 100, limit: 100, used: 0, remaining: 100, unlimited: false, period: "总额", percent: 0, organizationBalance: 100, coupon: 0, cycleType: 1 }),
    get,
    searchModels: async ({ keyId, query } = {}) => {
      await get(keyId);
      if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('请输入有效的模型 ID');
      if (modelEndpoint) return searchModelCatalog(await fetchModelCatalog({ baseURL: modelEndpoint }), query);
      return [];
    },
    models: async (id) => {
      const key = await get(id);
      if (modelEndpoint) {
        const response = await fetch(key.baseURL + "/v1/models", {
          headers: { Authorization: "Bearer " + key.secret },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error("模型列表拉取失败：HTTP " + response.status);
        const body = await response.json();
        if (!Array.isArray(body.data)) throw new Error("模型列表响应格式无效");
        return body.data;
      }
      return ["claude-sonnet-4-6", "gpt-5.4", "gemini-2.5-pro"].map((id) => ({ id, name: id, category: '文本模型' }));
    },
  };
}
module.exports = { createPlatformService };
