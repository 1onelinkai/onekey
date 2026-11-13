const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createAgentService, testConnection } = require("./agents.cjs");

async function fixture(t, fast = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onelink-agent-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  await fs.mkdir(bin);
  for (const name of [
    "claude",
    "claude-desktop",
    "codex",
    "gemini",
    "grok",
    "opencode",
    "openclaw",
    "pi",
    "minimax",
    "dsh",
    "zed",
    "code",
    "zcode",
    "workbuddy",
    "hermes",
  ])
    await fs.writeFile(
      path.join(bin, name),
      '#!/bin/sh\nprintf "1.122.0\\n"\n',
      { mode: 0o700 },
    );
  await fs.mkdir(path.join(root, "Applications/DeepSeek Harness.app"), { recursive: true });
  const secrets = new Map();
  const credentials = {
    get: async (url) => secrets.get(url) ?? null,
    set: async (url, key) => {
      if (key === null) secrets.delete(url);
      else secrets.set(url, key);
    },
    encrypt: (text) => Buffer.from(text),
    decrypt: (buf) => buf.toString(),
  };
  const service = createAgentService({
    home: root,
    dataDir: path.join(root, "state"),
    platform: "darwin",
    env: { PATH: bin },
    credentials,
    ...(fast ? { command: async () => ({ stdout: "1.122.0\n" }) } : {}),
    applicationDirs: [path.join(root, "Applications")],
  });
  return { root, bin, service, secrets };
}
function input(client, protocol = "openai") {
  return {
    client,
    protocol,
    model: "test-model",
    apiKey: "sk-test-private-secret",
    baseURL: "https://api.example.com/v1",
  };
}

test("detect executable evidence without treating leftover directories as installed", async (t) => {
  const { root, bin, service } = await fixture(t);
  const found = await service.detect();
  for (const id of ["claude", "codex", "opencode", "pi", "zed", "vscode", "zcode", "workbuddy", "hermes"])
    assert.equal(found.find((c) => c.id === id).installed, true);
  assert.equal(found.find((c) => c.id === "claude").version, "1.122.0");
  await fs.rm(path.join(bin, "workbuddy"));
  await fs.mkdir(path.join(root, ".workbuddy"));
  const client = (await service.detect()).find((c) => c.id === "workbuddy");
  assert.equal(client.installed, false);
  assert.equal(client.configExists, true);
});

test("detect DeepSeek Harness desktop without the CLI in either Applications directory", async (t) => {
  const { root, bin } = await fixture(t);
  await fs.rm(path.join(bin, "dsh"));
  const applicationDirs = [path.join(root, "Applications"), path.join(root, "user/Applications")];
  const service = createAgentService({
    home: root,
    dataDir: path.join(root, "state"),
    platform: "darwin",
    env: { PATH: bin },
    applicationDirs,
  });
  for (const base of applicationDirs) {
    const bundle = path.join(base, "DeepSeek Harness.app");
    await fs.mkdir(path.join(bundle, "Contents"), { recursive: true });
    await fs.writeFile(path.join(bundle, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>0.2.1-rc.3</string></dict></plist>`);
    const client = (await service.detect()).find((c) => c.id === "deepseek-harness-desktop");
    assert.equal(client.installed, true);
    assert.equal(client.executable, null);
    assert.equal(client.bundle, bundle);
    assert.equal(client.evidence, bundle);
    assert.equal(client.version, "0.2.1-rc.3");
    await fs.rm(bundle, { recursive: true });
  }
  await fs.mkdir(path.join(root, ".dsh"));
  const missing = (await service.detect()).find((c) => c.id === "deepseek-harness-desktop");
  assert.equal(missing.installed, false);
  assert.equal(missing.configExists, true);
});

for (const client of [
  "claude",
  "codex",
  "opencode",
  "openclaw",
  "pi",
  "minimax",
  "deepseek-harness",
  "deepseek-harness-desktop",
  "zed",
  "zcode",
  "workbuddy",
  "hermes",
])
  test(`${client}: preview, real writes, readback and byte-for-byte restore`, async (t) => {
    const { root, service, secrets } = await fixture(t);
    const dir =
      client === "claude"
        ? path.join(root, ".claude")
        : ["deepseek-harness", "deepseek-harness-desktop"].includes(client)
          ? path.join(root, ".dsh")
        : client === "vscode"
          ? path.join(root, "Library/Application Support/Code/User")
          : null;
    let original;
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
      original =
        '// existing user comment\n{ "unrelated": { "keep": true } }\n';
      await fs.writeFile(path.join(dir, "settings.json"), original);
    }
    const plan = await service.preview(
      input(
        client,
        client === "claude"
          ? "anthropic"
          : client === "codex"
            ? "responses"
            : "openai",
      ),
    );
    assert.ok(plan.files.length);
    assert.ok(!JSON.stringify(plan).includes("sk-test-private-secret"));
    const result = await service.apply(plan.token);
    assert.equal(result.verified, true);
    for (const file of plan.files) {
      const value = await fs.readFile(file.path, "utf8");
      assert.ok(value.includes(["deepseek-harness", "deepseek-harness-desktop"].includes(client) && file.path.endsWith(".credentials.yaml") ? "sk-test-private-secret" : "test-model"));
      assert.equal((await fs.stat(file.path)).mode & 0o777, 0o600);
    }
    if (client === "zed") assert.equal(secrets.size, 1);
    await service.restore(result.id);
    for (const file of plan.files)
      if (!file.existed) await assert.rejects(fs.access(file.path));
    if (original)
      assert.equal(
        await fs.readFile(path.join(dir, "settings.json"), "utf8"),
        original,
      );
    if (client === "zed") assert.equal(secrets.size, 0);
    assert.equal((await service.history())[0].restored, true);
  });

test("preview refuses invalid existing config and malformed keys", async (t) => {
  const { root, service } = await fixture(t);
  await fs.mkdir(path.join(root, ".claude"));
  await fs.writeFile(path.join(root, ".claude/settings.json"), "{broken");
  await assert.rejects(service.preview(input("claude", "anthropic")), /JSON/);
  await assert.rejects(
    service.preview({
      ...input("codex", "responses"),
      apiKey: "sk-invalid\ncredential",
    }),
    /API Key 格式无效/,
  );
});

test("Gemini refuses mismatched protocols before touching files", async (t) => {
  const { root, service } = await fixture(t);
  await assert.rejects(service.preview(input('gemini')), /原生协议/);
  await assert.rejects(service.preview(input('codex', 'gemini')), /不支持 Google Gemini/);
  await assert.rejects(fs.access(path.join(root, '.gemini')));
  assert.deepEqual(await service.history(), []);
});

test("Claude Desktop writes a direct 3P profile and restores all files byte-for-byte", async (t) => {
  const { root, bin } = await fixture(t);
  const applications = path.join(root, "Applications");
  const bundle = path.join(applications, "Claude.app");
  await fs.mkdir(path.join(bundle, "Contents"), { recursive: true });
  await fs.writeFile(path.join(bundle, "Contents/Info.plist"), "test bundle");
  const service = createAgentService({
    home: root,
    dataDir: path.join(root, "state"),
    platform: "darwin",
    env: { PATH: bin },
    command: async () => ({ stdout: "1.0.0\n" }),
    applicationDirs: [applications],
  });
  const support = path.join(root, "Library/Application Support");
  const normal = path.join(support, "Claude/claude_desktop_config.json");
  const threep = path.join(support, "Claude-3p/claude_desktop_config.json");
  const profile = path.join(support, "Claude-3p/configLibrary/7c35be79-0924-49ad-9f82-5b07e5c2904a.json");
  const meta = path.join(support, "Claude-3p/configLibrary/_meta.json");
  const originals = new Map([
    [normal, '{"deploymentMode":"1p","keep":"normal"}\n'],
    [threep, '{"deploymentMode":"1p","keep":"third-party"}\n'],
    [profile, '{"userAutoMode":true}\n'],
    [meta, '{"entries":[{"id":"other","name":"Other"}],"appliedId":"other"}\n'],
  ]);
  for (const [file, contents] of originals) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }

  const plan = await service.preview({ ...input("claude-desktop", "anthropic"), model: "claude-sonnet-4-6" });
  assert.equal(plan.files.length, 4);
  assert.ok(!JSON.stringify(plan).includes("sk-test-private-secret"));
  const result = await service.apply(plan.token);
  const normalConfig = JSON.parse(await fs.readFile(normal, "utf8"));
  const threepConfig = JSON.parse(await fs.readFile(threep, "utf8"));
  const profileConfig = JSON.parse(await fs.readFile(profile, "utf8"));
  const metaConfig = JSON.parse(await fs.readFile(meta, "utf8"));
  assert.equal(normalConfig.deploymentMode, "3p");
  assert.equal(normalConfig.keep, "normal");
  assert.equal(threepConfig.deploymentMode, "3p");
  assert.equal(profileConfig.inferenceProvider, "gateway");
  assert.equal(profileConfig.inferenceGatewayBaseUrl, "https://api.example.com");
  assert.equal(profileConfig.inferenceGatewayAuthScheme, "bearer");
  assert.equal(profileConfig.inferenceGatewayApiKey, "sk-test-private-secret");
  assert.deepEqual(profileConfig.inferenceModels, ["claude-sonnet-4-6"]);
  assert.deepEqual(profileConfig.coworkEgressAllowedHosts, ["api.example.com"]);
  assert.equal(profileConfig.userAutoMode, true);
  assert.equal(metaConfig.appliedId, "7c35be79-0924-49ad-9f82-5b07e5c2904a");
  assert.equal(metaConfig.entries[0].id, "other");
  assert.equal(metaConfig.entries[1].name, "OneLinkAI");
  assert.equal(result.verified, true);

  await service.restore(result.id);
  for (const [file, contents] of originals)
    assert.equal(await fs.readFile(file, "utf8"), contents);
  assert.equal((await service.history())[0].restored, true);
});

test("Claude Desktop rejects non-Anthropic protocol before creating files", async (t) => {
  const { root, bin } = await fixture(t);
  const applications = path.join(root, "Applications");
  const bundle = path.join(applications, "Claude.app");
  await fs.mkdir(path.join(bundle, "Contents"), { recursive: true });
  await fs.writeFile(path.join(bundle, "Contents/Info.plist"), "test bundle");
  const service = createAgentService({ home: root, dataDir: path.join(root, "state"), platform: "darwin", env: { PATH: bin }, command: async () => ({ stdout: "1.0.0" }), applicationDirs: [applications] });
  await assert.rejects(service.preview(input("claude-desktop", "openai")), /Anthropic Messages/);
  await assert.rejects(fs.access(path.join(root, "Library/Application Support/Claude-3p")));
});

test("Grok Build writes a Responses profile, preserves other tables and restores exact TOML", async (t) => {
  const { root, service } = await fixture(t);
  const dir = path.join(root, ".grok");
  const file = path.join(dir, "config.toml");
  const original = '# user settings\n[ui]\ntheme = "dark"\n\n[models]\ndefault = "existing"\nweb_search = "grok-4.7"\n\n[model.existing]\nmodel = "grok-4.7"\nbase_url = "https://old.example.com/v1"\nname = "Existing"\napi_key = "sk-existing-secret"\napi_backend = "responses"\ncontext_window = 500000\n\n[mcp_servers.local]\ncommand = "my-tool"\n';
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, original);
  const plan = await service.preview(input("grok", "responses"));
  assert.equal(plan.files.length, 1);
  assert.ok(!JSON.stringify(plan).includes("sk-test-private-secret"));
  const result = await service.apply(plan.token);
  const parsed = require("@iarna/toml").parse(await fs.readFile(file, "utf8"));
  assert.equal(parsed.models.default, "onelinkai");
  assert.equal(parsed.models.web_search, "grok-4.7");
  assert.equal(parsed.model.onelinkai.model, "test-model");
  assert.equal(parsed.model.onelinkai.base_url, "https://api.example.com/v1");
  assert.equal(parsed.model.onelinkai.name, "OneLinkAI");
  assert.equal(parsed.model.onelinkai.api_key, "sk-test-private-secret");
  assert.equal(parsed.model.onelinkai.api_backend, "responses");
  assert.equal(parsed.model.onelinkai.context_window, 500000);
  assert.equal(parsed.model.existing.model, "grok-4.7");
  assert.equal(parsed.mcp_servers.local.command, "my-tool");
  assert.equal(result.verified, true);
  await service.restore(result.id);
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.equal((await service.history())[0].restored, true);
});

test("Grok Build rejects unsupported protocol and invalid TOML without writing", async (t) => {
  const { root, service } = await fixture(t);
  await assert.rejects(service.preview(input("grok", "openai")), /Responses/);
  const file = path.join(root, ".grok/config.toml");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const invalid = "[models\ndefault = broken\n";
  await fs.writeFile(file, invalid);
  await assert.rejects(service.preview(input("grok", "responses")), /config\.toml 格式无效/);
  assert.equal(await fs.readFile(file, "utf8"), invalid);
});

test("Claude Desktop rejects invalid metadata and unsupported model IDs without changing deployment", async (t) => {
  const { root, service } = await fixture(t);
  await assert.rejects(service.preview(input("claude-desktop", "anthropic")), /模型映射代理/);
  const meta = path.join(root, "Library/Application Support/Claude-3p/configLibrary/_meta.json");
  await fs.mkdir(path.dirname(meta), { recursive: true });
  await fs.writeFile(meta, '{"entries":{}}');
  await assert.rejects(service.preview({ ...input("claude-desktop", "anthropic"), model: "claude-sonnet-4-6" }), /entries 必须是数组/);
  await assert.rejects(fs.access(path.join(root, "Library/Application Support/Claude/claude_desktop_config.json")));
  assert.equal(await fs.readFile(meta, "utf8"), '{"entries":{}}');
});

test("WorkBuddy refuses a same-ID model owned by another vendor", async (t) => {
  const { root, service } = await fixture(t);
  const dir = path.join(root, ".workbuddy");
  await fs.mkdir(dir, { recursive: true });
  const original = JSON.stringify({ models: [{ id: "test-model", vendor: "OtherVendor" }] });
  await fs.writeFile(path.join(dir, "models.json"), original);
  await assert.rejects(service.preview(input("workbuddy")), /相同模型 ID/);
  assert.equal(await fs.readFile(path.join(dir, "models.json"), "utf8"), original);
});
test("write and restore reject drift instead of overwriting changes", async (t) => {
  const { service } = await fixture(t);
  const p = await service.preview(input("opencode"));
  await fs.mkdir(path.dirname(p.files[0].path), { recursive: true });
  await fs.writeFile(p.files[0].path, "{}");
  await assert.rejects(service.apply(p.token), /其他程序修改/);
  const p2 = await service.preview(input("opencode"));
  const r = await service.apply(p2.token);
  await fs.appendFile(p2.files[0].path, "\n// new user comment");
  await assert.rejects(service.restore(r.id), /已变化/);
});
test("forced restore preserves changed files before restoring the original", async t => {
  const { root, service } = await fixture(t, true);
  const config = (await service.preview(input("opencode"))).files[0].path;
  await fs.mkdir(path.dirname(config), { recursive: true });
  const original = '{"theme":"original"}\n';
  await fs.writeFile(config, original);
  const plan = await service.preview(input("opencode"));
  const entry = await service.apply(plan.token);
  const file = entry.files.find(file => file.existed);
  const changed = '{"theme":"changed-by-user"}\n';
  await fs.writeFile(file.path, changed);
  await assert.rejects(service.restore(entry.id), /已变化/);
  const result = await service.restore(entry.id, { force: true });
  assert.equal(await fs.readFile(file.path, "utf8"), original);
  assert.equal(await fs.readFile(path.join(result.recoveryDir, file.index + ".bak"), "utf8"), changed);
  assert.equal(JSON.parse(await fs.readFile(path.join(result.recoveryDir, "manifest.json"))).files.find(item => item.index === file.index).existed, true);
  assert.equal((await service.history())[0].restored, true);
});

test("forced restore tolerates deleted new files and still requires original backups", async t => {
  const { root, service } = await fixture(t, true);
  const plan = await service.preview(input("codex", "responses"));
  const entry = await service.apply(plan.token);
  await fs.rm(entry.files[0].path);
  const result = await service.restore(entry.id, { force: true });
  for (const file of entry.files) await assert.rejects(fs.access(file.path), { code: "ENOENT" });
  const manifest = JSON.parse(await fs.readFile(path.join(result.recoveryDir, "manifest.json")));
  assert.equal(manifest.files[0].existed, false);

  const next = await service.apply((await service.preview(input("codex", "responses"))).token);
  const latest = await service.apply((await service.preview(input("codex", "responses"))).token);
  const file = latest.files.find(file => file.existed);
  await fs.rm(path.join(root, "state/backups", latest.id, file.index + ".bak"));
  const current = await fs.readFile(file.path, "utf8");
  await assert.rejects(service.restore(latest.id, { force: true }), /备份文件缺失/);
  assert.equal(await fs.readFile(file.path, "utf8"), current);
  assert.equal((await service.history()).find(item => item.id === next.id).restored, false);
});

test("manual restore exposes only the selected backup's file locations", async t => {
  const { service } = await fixture(t, true);
  const entry = await service.apply((await service.preview(input("codex", "responses"))).token);
  const files = await service.restoreFiles(entry.id);
  assert.deepEqual(files.map(file => file.path), entry.files.map(file => file.path));
  assert.ok(files.every(file => file.exists && file.backupPath === null));
  await assert.rejects(service.restoreFiles("unknown"), /备份不存在/);
  await service.restore(entry.id);
  await assert.rejects(service.restoreFiles(entry.id), /已恢复/);
});

test("failed forced restore rolls back missing files and the actual current credential", async t => {
  const { root, service, secrets } = await fixture(t, true);
  const entry = await service.apply((await service.preview(input("zed"))).token);
  const url = [...secrets.keys()][0];
  secrets.set(url, "user-updated-secret");
  await fs.rm(entry.files[0].path);
  const rename = fs.rename;
  // Discover the journal path from the service's data directory, independent of its filename.
  const journals = (await fs.readdir(path.join(root, "state"))).filter(name => name.endsWith(".json"));
  fs.rename = async (...args) => {
    if (journals.some(name => args[1] === path.join(root, "state", name))) throw new Error("injected journal failure");
    return rename(...args);
  };
  try {
    await assert.rejects(service.restore(entry.id, { force: true }), /injected journal failure/);
    await assert.rejects(fs.access(entry.files[0].path), { code: "ENOENT" });
    assert.equal(secrets.get(url), "user-updated-secret");
    assert.equal((await service.history())[0].restored, false);
  } finally { fs.rename = rename; }
});

test("write failure rolls earlier files back", async (t) => {
  const { service, root } = await fixture(t);
  const p = await service.preview(input("pi"));
  const folder = path.join(root, ".pi/agent");
  await fs.mkdir(folder, { recursive: true });
  await fs.mkdir(path.join(folder, "settings.json.onelink-obstacle")); // no effect on output paths
  // Force the second rename to fail after the first file was written.
  const rename = fs.rename;
  let count = 0;
  fs.rename = async (...args) => {
    if (args[1] === path.join(folder, "settings.json") && ++count === 1)
      throw new Error("injected write failure");
    return rename(...args);
  };
  try {
    await assert.rejects(service.apply(p.token), /已回滚/);
  } finally {
    fs.rename = rename;
  }
  await assert.rejects(fs.access(path.join(folder, "models.json")));
});
test("protocol connection test accepts valid responses and rejects 200 error payloads", async (t) => {
  let valid = true;
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer sk-test-private-secret");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        valid
          ? { choices: [{ message: { content: "OK" } }] }
          : { error: "invalid key" },
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const params = {
    ...input("opencode"),
    baseURL: "http://127.0.0.1:" + server.address().port,
  };
  assert.equal((await testConnection(params)).ok, true);
  valid = false;
  await assert.rejects(testConnection(params), /预期的模型响应/);
});

 test("DSH migrates forbidden dotenv keys and preserves other routes and credentials", async t => {
  const { root, service } = await fixture(t);
  const dir = path.join(root, ".dsh");
  await fs.mkdir(path.join(dir, "profiles/desktop"), { recursive: true });
  const originals = {
    ".env": "# keep\nOTHER=value\nDSH_API_KEY=old-secret\nDSH_MODEL=old\nDSH_PROVIDER=onelinkai\nDSH_BASE_URL=https://old.example\n",
    "config.yaml": "- id: onelinkai-model\n  config: { api_key: old-secret }\n- id: unrelated\n",
    ".credentials.yaml": "version: 1\nrefs:\n  OTHER_KEY: another-private-key\nrecords: {}\n",
    "profiles/desktop/cordis.patch.yml": "# keep patch\n- id: llm-pi-ai\n  config:\n    providers:\n      existing: { api: openai-completions, baseURL: 'https://existing/v1', models: [{ id: old }] }\n- id: ui-chat\n  config: { transcriptView: standard }\n"
  };
  for (const [name, value] of Object.entries(originals)) await fs.writeFile(path.join(dir, name), value);
  const plan = await service.preview(input("deepseek-harness-desktop"));
  assert.ok(!JSON.stringify(plan).includes("another-private-key"));
  const result = await service.apply(plan.token);
  const YAML = require("yaml");
  const patches = YAML.parse(await fs.readFile(path.join(dir, "profiles/desktop/cordis.patch.yml"), "utf8"));
  const providers = patches.find(p => p.id === "llm-pi-ai").config.providers;
  assert.equal(providers.onelinkai.api, "openai-completions");
  assert.equal(providers.onelinkai.apiKeyEnv, "ONELINKAI_API_KEY");
  assert.equal(providers.onelinkai.baseURL, "https://api.example.com/v1");
  assert.ok(providers.existing);
  assert.deepEqual(patches.find(p => p.id === "agent-default-model").config, {provider:"onelinkai", model:"test-model"});
  assert.equal(await fs.readFile(path.join(dir, ".env"), "utf8"), "# keep\nOTHER=value\n");
  assert.deepEqual(YAML.parse(await fs.readFile(path.join(dir, "config.yaml"), "utf8")), [{ id: "unrelated" }]);
  const creds = YAML.parse(await fs.readFile(path.join(dir, ".credentials.yaml"), "utf8"));
  assert.equal(creds.refs.OTHER_KEY, "another-private-key");
  assert.equal(creds.refs.ONELINKAI_API_KEY, "sk-test-private-secret");
  await service.restore(result.id);
  for (const [name,value] of Object.entries(originals)) assert.equal(await fs.readFile(path.join(dir,name),"utf8"),value);
});

test('所有应用共用模型规格，按能力写入并明确说明忽略项', async t => {
  const { service } = await fixture(t, true);
  const capabilities = require('../src/client-capabilities.json');
  const toml = require('@iarna/toml');
  const yaml = require('yaml');
  for (const [client, fields] of Object.entries(capabilities)) {
    const protocol = client === 'gemini' ? 'gemini' : ['claude', 'claude-desktop'].includes(client) ? 'anthropic' : ['codex', 'grok'].includes(client) ? 'responses' : 'openai';
    const data = { ...input(client, protocol), modelSettings: { name: 'Shared display name', contextWindow: 256000, maxTokens: 16000 } };
    if (client === 'claude-desktop') data.model = 'claude-sonnet-test';
    const plan = await service.preview(data);
    const contents = plan.files.map(file => file.content).join('\n');
    assert.equal(contents.includes('Shared display name'), fields.includes('name'), client + ': display name capability');
    assert.equal(plan.notice.includes('上下文窗口'), !fields.includes('contextWindow'), client + ': context capability notice');
    assert.equal(plan.notice.includes('最大输出 Token'), !fields.includes('maxTokens'), client + ': output capability notice');
    assert.equal(contents.replaceAll('_', '').includes('256000'), fields.includes('contextWindow'), client + ': context value');
    assert.equal(contents.replaceAll('_', '').includes('16000'), fields.includes('maxTokens'), client + ': output value');
    assert.equal(contents.includes('sk-test-private-secret'), false);
    assert.equal(plan.model, data.model);
    if (client === 'codex') assert.equal(toml.parse(plan.files[0].content).model_context_window, 256000);
    if (client === 'grok') assert.equal(toml.parse(plan.files[0].content).model.onelinkai.context_window, 256000);
    if (client === 'pi') assert.equal(JSON.parse(plan.files[0].content).providers.onelinkai.models[0].maxTokens, 16000);
    if (client === 'zed') assert.equal(JSON.parse(plan.files[0].content).language_models.openai_compatible.OneLinkAI.available_models[0].max_tokens, 256000);
    if (client === 'workbuddy') assert.equal(JSON.parse(plan.files[0].content)[0].maxOutputTokens, 16000);
    if (client === 'minimax') assert.equal(yaml.parse(plan.files[0].content).custom_provider.onelinkai.models['test-model'].name, 'Shared display name');
  }
});

test('模型参数真实写入与恢复，并验证小上下文默认输出和非法组合', async t => {
  const { service, root } = await fixture(t);
  const data = { ...input('pi'), modelSettings: { name: 'Short context', contextWindow: 4096 } };
  const plan = await service.preview(data);
  const result = await service.apply(plan.token);
  const file = path.join(root, '.pi/agent/models.json');
  const model = JSON.parse(await fs.readFile(file, 'utf8')).providers.onelinkai.models[0];
  assert.equal(model.id, 'test-model'); assert.equal(model.name, 'Short context');
  assert.equal(model.contextWindow, 4096); assert.equal(model.maxTokens, 4096);
  await service.restore(result.id);
  await assert.rejects(fs.access(file));
  for (const modelSettings of [{ contextWindow: 'bad' }, { contextWindow: 4096, maxTokens: 8192 }, { maxTokens: 200000 }, { maxTokens: true }])
    await assert.rejects(service.preview({ ...input('pi'), modelSettings }));
});

test('15 个应用的高级配置实际写入、保留原文件并逐字恢复', async t => {
  const { service } = await fixture(t, true);
  const capabilities = require('../src/client-capabilities.json');
  const toml = require('@iarna/toml'); const YAML = require('yaml');
  const protocolFor = client => client === 'gemini' ? 'gemini' : ['claude', 'claude-desktop'].includes(client) ? 'anthropic' : ['codex', 'grok'].includes(client) ? 'responses' : 'openai';
  for (const client of Object.keys(capabilities)) {
    const settings = { name: 'Shared model', contextWindow: 256000, maxTokens: 16000, supportsImages: true, supportsTools: false, supportsReasoning: true };
    if (['claude', 'claude-desktop', 'codex', 'openclaw', 'pi', 'hermes'].includes(client)) settings.reasoningEffort = 'high';
    if (['claude', 'openclaw'].includes(client)) settings.subagentModel = client === 'claude' ? 'helper-model' : 'onelinkai/helper-model';
    if (client === 'codex') { settings.compactThreshold = 200000; settings.reviewModel = 'review-model'; }
    if (client === 'gemini') settings.thinkingBudget = 4096;
    if (client === 'claude-desktop') settings.supports1m = true;
    const data = { ...input(client, protocolFor(client)), model: client === 'claude-desktop' ? 'claude-sonnet-test' : client === 'gemini' ? 'gemini-test' : 'test-model', modelSettings: settings };
    const preview = await service.preview(data);
    const originals = new Map();
    for (const file of preview.files) {
      let original;
      if (file.path.endsWith('.env')) original = '# existing env\nOTHER_SECRET=keep-private\nGEMINI_API_KEY="old-key-123"\n';
      else if (file.path.endsWith('.toml')) original = 'unrelated = "keep"\n';
      else if (file.path.endsWith('.yaml') || file.path.endsWith('.yml')) original = file.path.endsWith('cordis.patch.yml') ? '- id: unrelated\n  config: { keep: true }\n' : file.path.endsWith('.credentials.yaml') ? 'version: 1\nrefs: { OLD_KEY: keep-private }\n' : 'unrelated: keep\n';
      else if (client === 'vscode') original = '[{"vendor":"other","name":"Keep","models":[]}]\n';
      else if (client === 'workbuddy') original = '[{"id":"other","vendor":"Other","name":"keep"}]\n';
      else original = '// existing comment\n{"unrelated":"keep"}\n';
      await fs.mkdir(path.dirname(file.path), { recursive: true }); await fs.writeFile(file.path, original); originals.set(file.path, original);
    }
    const plan = await service.preview(data);
    assert.equal(JSON.stringify(plan).includes('keep-private'), false, client + ' must redact credentials');
    const result = await service.apply(plan.token);
    const contents = new Map();
    for (const file of plan.files) { const value = await fs.readFile(file.path, 'utf8'); assert.ok(value.toLowerCase().includes('keep'), client + ': preserve unrelated data'); contents.set(path.basename(file.path), value); }
    const readJSON = name => require('jsonc-parser').parse(contents.get(name));
    if (client === 'claude') { const v = readJSON('settings.json'); assert.equal(v.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '16000'); assert.equal(v.effortLevel, 'high'); assert.equal(v.env.CLAUDE_CODE_SUBAGENT_MODEL, 'helper-model'); }
    if (client === 'claude-desktop') { const v = readJSON('7c35be79-0924-49ad-9f82-5b07e5c2904a.json').inferenceModels[0]; assert.deepEqual(v, { name: 'claude-sonnet-test', labelOverride: 'Shared model', supports1m: true, maxEffort: 'high' }); }
    if (client === 'codex') { const v = toml.parse(contents.get('config.toml')); assert.equal(v.model_reasoning_effort, 'high'); assert.equal(v.model_auto_compact_token_limit, 200000); assert.equal(v.review_model, 'review-model'); }
    if (client === 'grok') assert.equal(toml.parse(contents.get('config.toml')).model.onelinkai.context_window, 256000);
    if (client === 'opencode') assert.deepEqual(readJSON('opencode.json').provider.onelinkai.models['test-model'].limit, { context: 256000, output: 16000 });
    if (client === 'openclaw') { const v = readJSON('openclaw.json'); const m = v.models.providers.onelinkai.models[0]; assert.equal(m.contextWindow, 256000); assert.equal(m.maxTokens, 16000); assert.deepEqual(m.input, ['text', 'image']); assert.equal(m.reasoning, true); assert.equal(v.agents.defaults.thinkingDefault, 'high'); assert.equal(v.agents.defaults.subagents.model, 'onelinkai/helper-model'); }
    if (client === 'pi') { const m = readJSON('models.json').providers.onelinkai.models[0]; assert.equal(m.reasoning, true); assert.deepEqual(m.input, ['text', 'image']); assert.equal(readJSON('settings.json').defaultThinkingLevel, 'high'); }
    if (client === 'minimax') { const m = YAML.parse(contents.get('config.yaml')).custom_provider.onelinkai.models['test-model']; assert.deepEqual(m.limit, { context: 256000, output: 16000 }); assert.equal(m.capabilities.support_image, true); }
    if (['deepseek-harness', 'deepseek-harness-desktop'].includes(client)) { const v = YAML.parse(contents.get('cordis.patch.yml')).find(item => item.id === 'llm-pi-ai').config.providers.onelinkai.models[0]; assert.equal(v.contextWindow, 256000); assert.equal(v.maxTokens, 16000); assert.deepEqual(v.input, ['text', 'image']); }
    if (client === 'zcode') { const m = readJSON('config.json').provider.onelinkai.models['test-model']; assert.equal(m.contextWindow, 256000); assert.equal(m.maxOutputTokens, 16000); assert.deepEqual(m.modalities.input, ['text', 'image']); }
    if (client === 'hermes') { const v = YAML.parse(contents.get('config.yaml')); assert.equal(v.providers.onelinkai.models['test-model'].context_length, 256000); assert.equal(v.model.context_length, 256000); assert.equal(v.agent.reasoning_effort, 'high'); assert.ok(!contents.get('config.yaml').includes('max_tokens')); }
    if (client === 'zed') { const m = readJSON('settings.json').language_models.openai_compatible.OneLinkAI.available_models[0]; assert.equal(m.capabilities.images, true); assert.equal(m.capabilities.tools, false); }
    if (client === 'workbuddy') { const m = readJSON('models.json').find(item => item.vendor === 'OneLinkAI'); assert.equal(m.supportsImages, true); assert.equal(m.supportsToolCall, false); assert.equal(m.supportsReasoning, true); }
    if (client === 'gemini') { const v = readJSON('settings.json'); assert.equal(v.security.auth.selectedType, 'gemini-api-key'); assert.equal(v.model.name, 'gemini-test'); assert.equal(v.modelConfigs.modelDefinitions['gemini-test'].displayName, 'Shared model'); const config = v.modelConfigs.customOverrides.at(-1).modelConfig.generateContentConfig; assert.equal(config.maxOutputTokens, 16000); assert.equal(config.thinkingConfig.thinkingBudget, 4096); assert.match(contents.get('.env'), /GOOGLE_GEMINI_BASE_URL="https:\/\/api.example.com"/); }
    if (client === 'vscode') { const groups = readJSON('chatLanguageModels.json'); assert.equal(groups[0].name, 'Keep'); const m = groups.find(g => g.name === 'OneLinkAI').models[0]; assert.equal(m.contextWindow, 256000); assert.equal(m.maxOutputTokens, 16000); assert.equal(m.vision, true); assert.equal(m.toolCalling, false); assert.equal(m.thinking, true); assert.equal(m.apiType, 'chat-completions'); assert.equal(contents.get('chatLanguageModels.json').includes(data.apiKey), false); assert.equal(plan.requiresManualCredential, true); assert.equal(result.requiresManualCredential, true); assert.match(result.notice, /密钥尚未写入/); }
    await service.restore(result.id);
    for (const [file, original] of originals) { assert.equal(await fs.readFile(file, 'utf8'), original, client + ': exact restore'); await fs.rm(file); }
  }
});

test('Gemini native connection verifies endpoint, header authentication and response shape', async t => {
  let received;
  const server = http.createServer(async (req, res) => { let body = ''; for await (const part of req) body += part; received = { url: req.url, headers: req.headers, body: JSON.parse(body) }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  await testConnection({ ...input('gemini', 'gemini'), model: 'gemini-test', baseURL: 'http://127.0.0.1:' + server.address().port + '/v1beta' });
  assert.equal(received.url, '/v1beta/models/gemini-test:generateContent'); assert.equal(received.headers['x-goog-api-key'], 'sk-test-private-secret'); assert.equal(received.headers.authorization, undefined); assert.equal(received.body.contents[0].parts[0].text, 'Reply OK'); assert.equal(received.body.generationConfig.maxOutputTokens, 16);
});

test('Codex rejects preserved compaction threshold above a new smaller window', async t => {
  const { service, root } = await fixture(t, true);
  const dir = path.join(root, '.codex'); await fs.mkdir(dir);
  const original = 'model_auto_compact_token_limit = 200000\n'; await fs.writeFile(path.join(dir, 'config.toml'), original);
  await assert.rejects(service.preview({ ...input('codex', 'responses'), modelSettings: { contextWindow: 128000 } }), /阈值/);
  assert.equal(await fs.readFile(path.join(dir, 'config.toml'), 'utf8'), original);
});

test('DSH detects CLI and Desktop independently, with independent versions and evidence', async t => {
  const { root, bin } = await fixture(t, true);
  const appDir = path.join(root, 'Applications');
  const bundle = path.join(appDir, 'DeepSeek Harness.app');
  const service = createAgentService({ home: root, dataDir: path.join(root, 'state'), platform: 'darwin',
    env: { PATH: bin }, applicationDirs: [appDir],
    command: async (file, args) => ({ stdout: file === path.join(bin, 'dsh') ? '0.2.1-rc.2' : args.some(arg => arg.includes('CFBundleShortVersionString')) ? '0.2.1-rc.3' : '' }),
  });
  await fs.rm(bundle, { recursive: true });
  let all = await service.detect();
  assert.equal(all.find(c => c.id === 'deepseek-harness').installed, true);
  assert.equal(all.find(c => c.id === 'deepseek-harness-desktop').installed, false);
  await fs.mkdir(bundle, { recursive: true });
  all = await service.detect();
  const cli = all.find(c => c.id === 'deepseek-harness');
  const desktop = all.find(c => c.id === 'deepseek-harness-desktop');
  assert.equal(cli.version, '0.2.1-rc.2');
  assert.equal(cli.executable, path.join(bin, 'dsh')); assert.equal(cli.bundle, undefined);
  assert.equal(desktop.version, '0.2.1-rc.3');
  assert.equal(desktop.bundle, bundle); assert.equal(desktop.executable, null);
  await fs.rm(path.join(bin, 'dsh'));
  all = await service.detect();
  assert.equal(all.find(c => c.id === 'deepseek-harness').installed, false);
  assert.equal(all.find(c => c.id === 'deepseek-harness-desktop').installed, true);
});

test('DSH CLI profiles and Desktop keep separate patches and credential references', async t => {
  const { root, service } = await fixture(t, true);
  const YAML = require('yaml');
  const desktop = await service.apply((await service.preview({ ...input('deepseek-harness-desktop'), apiKey: 'sk-desktop-secret' })).token);
  const desktopFile = path.join(root, '.dsh/profiles/desktop/cordis.patch.yml');
  const before = await fs.readFile(desktopFile, 'utf8');
  for (const profile of ['web', 'headless', 'custom-Web']) {
    const request = { ...input('deepseek-harness'), apiKey: 'sk-cli-secret-' + profile, ...(profile === 'web' ? {} : { dshProfile: profile }) };
    const plan = await service.preview(request);
    assert.match(plan.notice, new RegExp('dsh --profile ' + profile));
    assert.ok(plan.files.some(f => f.path.endsWith('/profiles/' + profile + '/cordis.patch.yml')));
    assert.ok(!JSON.stringify(plan).includes('sk-desktop-secret'));
    const result = await service.apply(plan.token);
    assert.equal(result.dshProfile, profile); assert.equal(result.client, 'deepseek-harness');
    const patch = YAML.parse(await fs.readFile(path.join(root, '.dsh/profiles', profile, 'cordis.patch.yml'), 'utf8'));
    const ref = patch.find(p => p.id === 'llm-pi-ai').config.providers.onelinkai.apiKeyEnv;
    assert.notEqual(ref, 'ONELINKAI_API_KEY');
    const creds = YAML.parse(await fs.readFile(path.join(root, '.dsh/.credentials.yaml'), 'utf8'));
    assert.equal(creds.refs.ONELINKAI_API_KEY, 'sk-desktop-secret');
    assert.equal(creds.refs[ref], request.apiKey);
    assert.equal(await fs.readFile(desktopFile, 'utf8'), before);
    // Restore the last operation to exercise shared-file hash protection and exact recovery.
    await service.restore(result.id);
  }
  await service.restore(desktop.id);
});

test('DSH profile validation blocks desktop, traversal and invalid names before writes', async t => {
  const { root, service } = await fixture(t, true);
  for (const dshProfile of ['desktop', 'Desktop', '../desktop', '', '/tmp/config', 'a/b', 'a\\b', '.', 12])
    await assert.rejects(service.preview({ ...input('deepseek-harness'), dshProfile }), /profile 无效/);
  await assert.rejects(fs.access(path.join(root, '.dsh')), { code: 'ENOENT' });
});

test('DSH legacy desktop history is attributed to Desktop and remains restorable', async t => {
  const { root, service } = await fixture(t, true);
  const result = await service.apply((await service.preview(input('deepseek-harness-desktop'))).token);
  const journal = path.join(root, 'state/history.json');
  const entries = JSON.parse(await fs.readFile(journal, 'utf8'));
  entries[0].client = 'deepseek-harness'; delete entries[0].dshProfile;
  await fs.writeFile(journal, JSON.stringify(entries));
  const [entry] = await service.history();
  assert.equal(entry.client, 'deepseek-harness-desktop'); assert.equal(entry.dshProfile, 'desktop');
  assert.equal(entry.id, result.id);
  await service.restore(entry.id);
  assert.equal((await service.history())[0].restored, true);
});

test('fresh installation recovers on-disk models without its configuration journal', async t => {
  const { root, bin, service } = await fixture(t, true);
  const clients = ['claude', 'claude-desktop', 'codex', 'gemini', 'grok', 'opencode', 'openclaw', 'pi', 'minimax', 'deepseek-harness', 'deepseek-harness-desktop', 'zed', 'vscode', 'zcode', 'workbuddy', 'hermes'];
  for (const client of clients) {
    const protocol = ['claude', 'claude-desktop'].includes(client) ? 'anthropic' : client === 'gemini' ? 'gemini' : ['codex', 'grok'].includes(client) ? 'responses' : 'openai';
    const preview = await service.preview({ ...input(client, protocol), model: 'claude-sonnet-recovery' });
    await service.apply(preview.token);
  }
  // Simulate a fresh OneLinkAI data directory while keeping installed clients and their settings.
  const fresh = createAgentService({ home: root, dataDir: path.join(root, 'fresh-state'), platform: 'darwin', env: { PATH: bin }, applicationDirs: [path.join(root, 'Applications')], command: async () => ({ stdout: '1.0.0' }) });
  assert.deepEqual(await fresh.history(), []);
  const detected = await fresh.detect();
  for (const client of clients) {
    const configuration = detected.find(item => item.id === client).configuration;
    assert.equal(configuration.state, 'configured', client);
    assert.ok(configuration.models.includes('claude-sonnet-recovery'), client);
    assert.equal(configuration.count, 1, client);
    if (!['workbuddy', 'vscode', 'zcode'].includes(client)) assert.equal(configuration.model, 'claude-sonnet-recovery', client);
    assert.equal(JSON.stringify(configuration).includes('sk-test-private-secret'), false, client);
  }
  assert.deepEqual(await fresh.history(), []);
  await fs.writeFile(path.join(root, '.codex/config.toml'), 'model="externally-changed"\n');
  assert.equal((await fresh.detect()).find(item => item.id === 'codex').configuration.model, 'externally-changed');
  await fs.writeFile(path.join(root, '.codex/config.toml'), 'invalid = [');
  assert.equal((await fresh.detect()).find(item => item.id === 'codex').configuration.state, 'unreadable');
  await fs.rm(path.join(root, '.codex/config.toml'));
  assert.equal((await fresh.detect()).find(item => item.id === 'codex').configuration.state, 'none');
});

test('selection readers recover client choices without a journal or model registry', async t => {
  const { root, bin } = await fixture(t, true);
  const service = createAgentService({
    home: root, env: { PATH: bin }, platform: 'darwin', dataDir: path.join(root, 'fresh-state'),
    applicationDirs: [path.join(root, 'Applications')], command: async () => ({ stdout: '1.0.0' }),
    readClientSelection: async id => id === 'vscode' ? { model: 'chosen-in-client', selectionSource: 'last-selection' } : null,
  });
  const config = (await service.detect()).find(item => item.id === 'vscode').configuration;
  assert.equal(config.model, 'chosen-in-client');
  assert.equal(config.state, 'configured');
  assert.equal(config.count, 1);
  assert.deepEqual(config.models, ['chosen-in-client']);
  assert.equal(config.selectionSource, 'last-selection');
  assert.equal(config.selectionStatus, undefined);
});
