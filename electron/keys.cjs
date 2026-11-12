const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createKeyStore({ directory, encryption, fetcher = fetch }) {
  const file = path.join(directory, "keys.enc");
  let queue = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(encryption.decryptString(await fs.readFile(file)));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new Error("无法解密密钥库，请检查系统凭据存储");
    }
  }
  const publicKey = ({ secret, ...key }) => ({
    ...key,
    masked: "sk-••••••••" + secret.slice(-4),
  });
  async function list(org) {
    return (await read()).filter((k) => !org || k.org === org).map(publicKey);
  }
  function mutate(fn) {
    const task = queue.then(async () => {
      if (!encryption.isEncryptionAvailable())
        throw new Error("系统加密不可用，不能保存密钥");
      const keys = await read();
      const result = fn(keys);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const tmp = file + "." + crypto.randomUUID();
      try {
        await fs.writeFile(
          tmp,
          encryption.encryptString(JSON.stringify(keys)),
          { mode: 0o600 },
        );
        await fs.rename(tmp, file);
      } finally {
        await fs.rm(tmp, { force: true });
      }
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  async function add(input) {
    if (
      !input ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 60
    )
      throw new Error("请输入密钥名称");
    if (
      typeof input.secret !== "string" ||
      input.secret.length < 8 ||
      input.secret.length > 2048 ||
      /[\r\n\0]/.test(input.secret) ||
      input.secret.startsWith("sk-demo")
    )
      throw new Error("请输入有效 API Key");
    const url = new URL(input.baseURL);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )
    )
      throw new Error("API 地址必须为 HTTPS，本机测试除外");
    if (url.username || url.password || url.search || url.hash)
      throw new Error("API 地址不能包含认证或查询信息");
    if (!["个人工作空间", "OneLink 研发团队"].includes(input.org))
      throw new Error("组织无效");
    return mutate((keys) => {
      const key = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        org: input.org,
        baseURL: url.href.replace(/\/+$/, "").replace(/\/v1$/, ""),
        secret: input.secret,
        createdAt: new Date().toISOString(),
      };
      keys.push(key);
      return publicKey(key);
    });
  }
  async function get(id) {
    const key = (await read()).find((k) => k.id === id);
    if (!key) throw new Error("API Key 不存在，请刷新列表");
    return key;
  }
  async function models(id) {
    const key = await get(id);
    const response = await fetcher(key.baseURL + "/v1/models", {
      headers: { Authorization: "Bearer " + key.secret },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("模型列表拉取失败：HTTP " + response.status);
    }
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error("模型列表响应格式无效");
    return [
      ...new Map(
        body.data
          .filter((m) => typeof m.id === "string" && m.id.length < 201)
          .map((m) => [
            m.id,
            {
              id: m.id,
              name: m.name || m.id,
              owner: m.owned_by || "",
              protocols: Array.isArray(m.supported_endpoint_types)
                ? m.supported_endpoint_types
                : [],
            },
          ]),
      ).values(),
    ].sort((a, b) => a.id.localeCompare(b.id));
  }
  return {
    list,
    add,
    get,
    models,
    remove: (id) =>
      mutate((keys) => {
        const index = keys.findIndex((k) => k.id === id);
        if (index < 0) throw new Error("API Key 不存在");
        keys.splice(index, 1);
        return true;
      }),
  };
}
module.exports = { createKeyStore };
