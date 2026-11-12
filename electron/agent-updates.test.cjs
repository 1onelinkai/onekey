const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAgentUpdates, compareVersions } = require('./agent-updates.cjs');
const { createInstaller } = require('./installer.cjs');

test('version comparison handles numeric segments, prereleases, build metadata and unknown versions', () => {
  for (const [a, b, expected] of [['1.10.0', '1.9.9', 1], ['1.0.0', '1.0.0-rc.2', 1], ['1.0.0-rc.10', '1.0.0-rc.2', 1], ['v1.2', '1.2.0', 0], ['1.2.3+9.gabc', '1.2.3', 0], ['', '1.2.3', null]])
    assert.equal(compareVersions(a, b), expected);
});

test('updates prefer official latest, distinguish external installs and isolate failed queries', async () => {
  let installedVersion = '1.0.0'; let upgraded;
  const home = '/test';
  const service = createAgentUpdates({ home, system: { platform: 'darwin', arch: 'arm64' },
    detect: async () => [
      { id: 'codex', installed: true, version: installedVersion, executable: '/test/.onelinkai/managed/bin/codex' },
      { id: 'claude', installed: true, version: '1.0.0', executable: '/opt/homebrew/bin/claude' },
      { id: 'grok', installed: true, version: '' },
    ],
    installer: { install: async (...args) => { upgraded = args; return { running: true }; } },
    fetcher: async url => ({ ok: true, text: async () => JSON.stringify({ name: url.includes('claude-code') ? '@anthropic-ai/claude-code' : '@openai/codex', version: url.startsWith('https://registry.npmjs.org') ? '1.10.0' : '1.9.0' }) }),
  });
  const items = await service.check();
  assert.equal(items[0].latestVersion, '1.10.0');
  assert.equal(items[0].status, 'available');
  assert.equal(items[1].upgradable, false);
  assert.equal(items[2].status, 'error');
  await assert.rejects(service.upgrade('claude'), /其他工具/);
  assert.equal((await service.upgrade('codex')).running, true);
  assert.equal(upgraded[1].expectedVersion, '1.10.0');
  assert.equal(upgraded[1].expectedTarget, '/test/.onelinkai/managed/bin/codex');
  installedVersion = '2.0.0';
  await assert.rejects(service.upgrade('codex'), /无需降级/);
  installedVersion = '';
  await assert.rejects(service.upgrade('codex'), /未读取/);
});

test('Claude native installation uses its updater and restores its prior version link on verification failure', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-claude-native-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const versions = path.join(home, '.local/share/claude/versions');
  const bin = path.join(home, '.local/bin');
  const executable = path.join(bin, 'claude');
  const oldVersion = path.join(versions, '2.1.138');
  const newVersion = path.join(versions, '2.1.318');
  await fs.mkdir(versions, { recursive: true });
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(oldVersion, 'old');
  await fs.writeFile(newVersion, 'new');
  await fs.symlink(oldVersion, executable);
  let updateWorks = true;
  let reportWrongVersion = false;
  const detect = async () => [{ id: 'claude', installed: true, version: path.basename(await fs.realpath(executable)), executable }];
  const installer = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' }, detect,
    runner: async (_command, args) => {
      if (args[0] === 'update') {
        if (updateWorks) { await fs.rm(oldVersion, { force: true }); await fs.rm(executable); await fs.symlink(newVersion, executable); }
        return 'Updated';
      }
      if (args[0] === '--version') return (reportWrongVersion ? '2.1.317' : path.basename(await fs.realpath(executable))) + ' (Claude Code)';
      return '';
    },
  });
  const updates = createAgentUpdates({ home, system: { platform: 'darwin', arch: 'arm64' }, detect, installer,
    fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ name: '@anthropic-ai/claude-code', version: '2.1.318' }) }),
  });
  const plan = await updates.plan('claude');
  assert.equal(plan.kind, 'claude-native');
  assert.equal(plan.supported, true);
  assert.equal(plan.origin, 'Anthropic Claude Code 原生安装器');
  await updates.upgrade('claude');
  const wait = async () => { for (let i = 0; i < 300 && installer.status().running; i++) await new Promise(r => setTimeout(r, 5)); assert.equal(installer.status().running, false); };
  await wait();
  assert.equal(installer.status().phase, 'complete', installer.status().error);
  assert.equal(await fs.realpath(executable), await fs.realpath(newVersion));

  await fs.writeFile(oldVersion, 'old');
  await fs.rm(executable);
  await fs.symlink(oldVersion, executable);
  updateWorks = true;
  reportWrongVersion = true;
  await updates.upgrade('claude');
  await wait();
  assert.equal(installer.status().phase, 'failed');
  assert.match(installer.status().error, /未达到目标/);
  assert.equal(await fs.realpath(executable), await fs.realpath(oldVersion));
  assert.equal(await fs.readFile(oldVersion, 'utf8'), 'old');
  assert.match(installer.status().logs.join('\n'), /已恢复 Claude Code 升级前版本入口/);
});

test('npm upgrade verifies target version and restores complete old prefix after failed download', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-upgrade-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed');
  const prefix = path.join(root, 'clients');
  const moduleRoot = path.join(prefix, 'lib/node_modules/@openai/codex');
  const executable = path.join(root, 'bin/codex');
  await fs.mkdir(moduleRoot, { recursive: true });
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.writeFile(executable, 'original-shim');
  await fs.writeFile(path.join(prefix, 'other-client'), 'keep');
  await fs.writeFile(path.join(moduleRoot, 'package.json'), JSON.stringify({ version: '1.0.0', bin: 'cli.js' }));
  await fs.mkdir(path.join(home, '.codex'));
  await fs.writeFile(path.join(home, '.codex/config.toml'), 'secret-config');
  let fail = true;
  const service = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' },
    detect: async () => [{ id: 'codex', installed: true, executable, version: fail ? '1.0.0' : '2.0.0' }],
    runner: async (command, args) => {
      if (args.includes('install')) {
        await fs.writeFile(path.join(prefix, 'other-client'), 'changed-by-install');
        if (fail) throw new Error('network disconnected');
        assert.ok(args.includes('@openai/codex@2.0.0'));
        await fs.mkdir(moduleRoot, { recursive: true });
        await fs.writeFile(path.join(moduleRoot, 'package.json'), JSON.stringify({ version: '2.0.0', bin: 'cli.js' }));
        return '';
      }
      if (command.endsWith('/runtime/bin/node') && args.length === 1) return 'v24.22.1';
      if (args.includes('--version')) return 'codex-cli 2.0.0';
      return path.join(root, 'bin') + ':/usr/bin:/bin';
    },
    fetcher: async url => ({ ok: true, text: async () => url.endsWith('SHASUMS256.txt') ? 'a'.repeat(64) + '  node-v24.22.1-darwin-arm64.tar.gz' : JSON.stringify({ name: '@openai/codex', version: '2.0.0' }) }),
  });
  const wait = async () => { for (let i = 0; i < 300 && service.status().running; i++) await new Promise(r => setTimeout(r, 5)); assert.equal(service.status().running, false); };
  const options = { update: true, expectedTarget: executable, expectedVersion: '2.0.0', kind: 'npm' };
  await service.install('codex', options); await wait();
  assert.equal(service.status().phase, 'failed');
  assert.equal(await fs.readFile(path.join(prefix, 'other-client'), 'utf8'), 'keep');
  assert.equal(JSON.parse(await fs.readFile(path.join(moduleRoot, 'package.json'))).version, '1.0.0');
  assert.equal(await fs.readFile(executable, 'utf8'), 'original-shim');
  fail = false;
  await service.install('codex', options); await wait();
  assert.equal(service.status().phase, 'complete', service.status().error);
  assert.equal(service.status().operation, 'update');
  assert.equal(JSON.parse(await fs.readFile(path.join(moduleRoot, 'package.json'))).version, '2.0.0');
  assert.equal(await fs.readFile(path.join(home, '.codex/config.toml'), 'utf8'), 'secret-config');
  assert.deepEqual((await fs.readdir(root)).filter(n => n.startsWith('.onelink-upgrade-')), []);
  await service.install('codex', { ...options, expectedTarget: '/wrong' }); await wait();
  assert.match(service.status().error, /位置已变化/);
});

test('desktop failed metadata restores previous app without touching user config', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-desktop-upgrade-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const bundle = path.join(home, 'Applications/Zed.app');
  await fs.mkdir(bundle, { recursive: true });
  await fs.writeFile(path.join(bundle, 'old-program'), 'keep');
  const service = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' },
    detect: async () => [{ id: 'zed', installed: true, bundle, version: '1.0.0' }],
    fetcher: async () => { throw new Error('offline'); },
  });
  await service.install('zed', { update: true, kind: 'desktop', expectedTarget: bundle, expectedVersion: '2.0.0' });
  for (let i = 0; i < 100 && service.status().running; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(service.status().phase, 'failed');
  assert.equal(await fs.readFile(path.join(bundle, 'old-program'), 'utf8'), 'keep');
  assert.match(service.status().logs.join('\n'), /已恢复/);
});

test('WorkBuddy four-part release maps to bundle product version and retains build identifier', async () => {
  const service = createAgentUpdates({ home: '/test', system: { platform: 'darwin', arch: 'arm64' },
    detect: async () => [{ id: 'workbuddy', installed: true, version: '5.8.2', bundle: '/test/Applications/WorkBuddy.app' }],
    fetcher: async () => ({ ok: true, json: async () => ({ version: '5.8.3.41334564', url: 'https://download.codebuddy.cn/workbuddy/app.zip', sha256hash: 'a'.repeat(64) }) }),
  });
  const value = await service.check('workbuddy');
  assert.equal(value.status, 'available');
  assert.equal(value.latestVersion, '5.8.3');
  assert.equal(value.releaseVersion, '5.8.3.41334564');
});

test('OpenCode native upgrades use pinned official updater and restore executable on failure', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-opencode-native-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const executable = path.join(home, '.opencode/bin/opencode');
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.writeFile(executable, '1.0.0', { mode: 0o755 });
  let fail = false;
  const detect = async () => [{ id: 'opencode', installed: true, executable, version: await fs.readFile(executable, 'utf8') }];
  const installer = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' }, detect,
    runner: async (command, args) => {
      assert.equal(command, executable);
      if (args[0] === 'upgrade') { assert.deepEqual(args, ['upgrade', '1.2.0', '--method', 'curl']); await fs.writeFile(executable, fail ? 'broken' : '1.2.0'); if (fail) throw new Error('upstream failed'); return ''; }
      return fs.readFile(executable, 'utf8');
    }, resolveEnvironment: async () => ({ env: {} }), preflight: async () => 1e10,
  });
  const service = createAgentUpdates({ home, system: { platform: 'darwin', arch: 'arm64' }, detect, installer,
    fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ name: 'opencode-ai', version: '1.2.0' }) }),
  });
  assert.equal((await service.plan('opencode')).kind, 'opencode-native');
  for (const fails of [false, true]) {
    await fs.writeFile(executable, '1.0.0'); fail = fails;
    await service.upgrade('opencode');
    for (let i = 0; installer.status().running && i < 100; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(installer.status().running, false);
    assert.equal(await fs.readFile(executable, 'utf8'), fails ? '1.0.0' : '1.2.0');
    assert.equal(!!installer.status().error, fails);
  }
});

test('托管 Grok 从官方 stable 检测版本更新', async () => {
  const service = createAgentUpdates({ home: '/test', system: { platform: 'darwin', arch: 'arm64' }, installer: {},
    detect: async () => [{ id: 'grok', installed: true, executable: '/test/.onelinkai/managed/bin/grok', version: '1.0.0' }],
    fetcher: async url => { assert.match(url, /\/stable$/); return { ok: true, text: async () => '1.1.0' }; },
  });
  const plan = await service.plan('grok'); assert.equal(plan.supported, true); assert.equal(plan.kind, 'grok');
});

test('local capability matrix covers all 15 clients without querying remote versions', async () => {
  const { packages, commandNames } = require('./installer.cjs');
  const { desktops } = require('./desktop-installer.cjs');
  const home = '/capability-test';
  const items = [
    ...Object.keys(packages).map(id => ({ id, installed: true, executable: path.join(home, '.onelinkai/managed/bin', commandNames[id] || id) })),
    { id: 'grok', installed: true, executable: path.join(home, '.onelinkai/managed/bin/grok') },
    ...Object.entries(desktops).map(([id, spec]) => ({ id, installed: true, bundle: path.join(home, 'Applications', spec.app) })),
    { id: 'hermes', installed: true, executable: '/capability-test/.local/bin/hermes' },
  ];
  const service = createAgentUpdates({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' },
    detect: async () => items, uninstallPlan: async () => ({ kind: 'hermes', target: '/capability-test/.hermes' }),
    fetcher: async () => { throw new Error('Local capabilities must not make network requests'); },
  });
  const described = await service.describe(items);
  assert.equal(described.length, 15);
  for (const item of described) {
    assert.equal(item.management.installable, true, item.id);
    assert.equal(item.management.upgradable, true, item.id);
    assert.ok(item.management.origin, item.id);
  }
  const external = await service.describe([
    { id: 'codex', installed: true, executable: '/opt/homebrew/bin/codex' },
    { id: 'zed', installed: true, bundle: '/Applications/Zed.app' },
    { id: 'gemini', installed: false },
  ]);
  assert.equal(external[0].management.upgradable, false);
  assert.equal(external[1].management.upgradable, false);
  assert.match(external[1].management.reason, /原安装渠道/);
  assert.equal(external[2].management.installable, true);
  assert.equal(external[2].management.upgradable, undefined);
});

test('Windows desktop clients require manual installation and do not query macOS update metadata', async () => {
  const { packages } = require('./installer.cjs');
  const { desktops } = require('./desktop-installer.cjs');
  const items = Object.keys(desktops).map(id => ({ id, installed: true, version: '1.0.0' }));
  const service = createAgentUpdates({ system: { platform: 'win32', arch: 'x64', release: '10.0' }, detect: async () => items,
    fetcher: async () => { throw new Error('Windows must not use macOS release metadata'); },
  });
  for (const item of await service.describe([...items, ...Object.keys(packages).map(id => ({ id, installed: false })), { id: 'grok', installed: false }, { id: 'hermes', installed: false }])) {
    assert.equal(item.management.installable, !desktops[item.id], item.id);
    if (item.installed) assert.equal(item.management.upgradable, false, item.id);
  }
  for (const item of await service.check()) assert.equal(item.status, 'unsupported', item.client);
});

test('failed version queries retain local upgrade capability and installation origin', async () => {
  const service = createAgentUpdates({ home: '/offline-test', system: { platform: 'darwin', arch: 'arm64', release: '24.0' },
    detect: async () => [{ id: 'codex', installed: true, version: '1.0.0', executable: '/offline-test/.onelinkai/managed/bin/codex' }],
    fetcher: async () => { throw new Error('offline'); },
  });
  const [item] = await service.check();
  assert.equal(item.status, 'error');
  assert.equal(item.upgradable, true);
  assert.equal(item.origin, 'OneLinkAI 托管 npm');
});
