const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createUninstaller } = require('./uninstaller.cjs');
test('managed uninstall removes only the selected shim and preserves configuration', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-uninstall-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const shim = path.join(home, '.onelinkai/managed/bin/codex');
  await fs.mkdir(path.dirname(shim), { recursive: true });
  await fs.writeFile(shim, 'test');
  await fs.mkdir(path.join(home, '.codex'));
  await fs.writeFile(path.join(home, '.codex/config.toml'), 'keep');
  let removed = false;
  const service = createUninstaller({ home, platform: 'darwin', detect: async () => removed ? [] : [{ id: 'codex', installed: true, executable: shim }], execute: async (_node, args) => {
    assert.ok(args.includes('@openai/codex')); assert.ok(args.includes('--ignore-scripts')); removed = true;
  } });
  assert.equal((await service.plan('codex')).supported, true);
  await assert.rejects(service.uninstall({ client: 'codex', target: '/wrong' }), /变化/);
  assert.equal((await service.uninstall({ client: 'codex', target: shim })).remaining, false);
  assert.equal(await fs.readFile(path.join(home, '.codex/config.toml'), 'utf8'), 'keep');
  await assert.rejects(fs.access(shim));
});
test('unknown external CLI refuses before execution', async () => {
  const service = createUninstaller({ platform: 'darwin', detect: async () => [
    { id: 'hermes', installed: true, executable: '/external/hermes' },
  ], execute: async () => assert.fail('must not execute'), trashItem: async () => assert.fail('must not trash') });
  assert.equal((await service.plan('hermes')).supported, false);
  await assert.rejects(service.uninstall({ client: 'hermes', target: '/external/hermes' }), /外部/);
});

test('Hermes official source install can be trashed while user data and shared tools survive', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-hermes-uninstall-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const source = path.join(home, '.hermes/hermes-agent');
  const shim = path.join(home, '.local/bin/hermes');
  const launcher = path.join(source, '.hermes/bin/hermes');
  await fs.mkdir(path.dirname(launcher), { recursive: true });
  await fs.mkdir(path.join(source, '.git'));
  await fs.writeFile(path.join(source, '.git/config'), '[remote "origin"]\nurl = https://github.com/NousResearch/hermes-agent.git\n');
  await fs.writeFile(launcher, 'program');
  await fs.mkdir(path.dirname(shim), { recursive: true });
  await fs.writeFile(shim, '#!/bin/sh\nexec ' + launcher + ' "$@"\n');
  for (const name of ['config.yaml', 'sessions.db', 'tools/node']) {
    const file = path.join(home, '.hermes', name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'keep');
  }
  let removed = false;
  const trash = path.join(home, 'trash-hermes');
  const service = createUninstaller({ home, platform: 'darwin',
    detect: async () => removed ? [] : [{ id: 'hermes', installed: true, executable: shim }],
    trashItem: async value => { assert.equal(value, source); await fs.rename(value, trash); removed = true; },
  });
  assert.equal((await service.plan('hermes')).kind, 'hermes');
  await fs.writeFile(shim, '#!/bin/sh\nexec /external/hermes "$@"\n');
  assert.equal((await service.plan('hermes')).supported, false);
  await fs.writeFile(shim, '#!/bin/sh\nexec ' + launcher + ' "$@"\n');
  await assert.rejects(service.uninstall({ client: 'hermes', target: '/wrong' }), /变化/);
  assert.equal((await service.uninstall({ client: 'hermes', target: shim })).remaining, false);
  await assert.rejects(fs.access(shim));
  assert.equal(await fs.readFile(path.join(trash, '.hermes/bin/hermes'), 'utf8'), 'program');
  for (const name of ['config.yaml', 'sessions.db', 'tools/node'])
    assert.equal(await fs.readFile(path.join(home, '.hermes', name), 'utf8'), 'keep');
});

async function npmFixture(t, id, packageName, command) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-external-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const prefix = path.join(home, 'tools');
  const module = path.join(prefix, 'lib/node_modules', packageName);
  const executable = path.join(prefix, 'bin', command);
  await fs.mkdir(module, { recursive: true });
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.mkdir(path.join(prefix, 'lib/node_modules/npm/bin'), { recursive: true });
  await fs.writeFile(path.join(module, 'package.json'), JSON.stringify({ name: packageName, bin: { [command]: 'cli.js' } }));
  await fs.writeFile(path.join(module, 'cli.js'), 'program');
  await fs.symlink(path.join(module, 'cli.js'), executable);
  await fs.writeFile(path.join(prefix, 'bin/node'), 'runtime', { mode: 0o755 });
  await fs.writeFile(path.join(prefix, 'lib/node_modules/npm/bin/npm-cli.js'), 'npm');
  return { home, prefix, module, executable, item: { id, installed: true, executable } };
}

for (const [id, packageName] of Object.entries(require('./installer.cjs').packages)) {
  test('external npm ownership and uninstall: ' + id, async t => {
    const command = require('./installer.cjs').commandNames[id] || id;
    const f = await npmFixture(t, id, packageName, command);
    let removed = false;
    const service = createUninstaller({ home: f.home, platform: 'darwin',
      detect: async () => removed ? [] : [f.item],
      execute: async (node, args) => {
        assert.equal(node, path.join(f.prefix, 'bin/node'));
        assert.deepEqual(args.slice(1), ['uninstall', '--global', '--prefix', f.prefix, '--ignore-scripts', '--no-audit', '--no-fund', packageName]);
        await fs.unlink(f.executable); await fs.rm(f.module, { recursive: true }); removed = true;
      },
    });
    assert.equal((await service.plan(id)).kind, 'external-npm');
    assert.equal((await service.uninstall({ client: id, target: f.executable })).remaining, false);
    assert.equal(await fs.readFile(path.join(f.prefix, 'bin/node'), 'utf8'), 'runtime');
  });
}

test('npm rejects mismatched ownership and detects unsuccessful removal', async t => {
  const f = await npmFixture(t, 'openclaw', 'openclaw', 'openclaw');
  const service = createUninstaller({ home: f.home, platform: 'darwin', detect: async () => [f.item], execute: async () => {} });
  await assert.rejects(service.uninstall({ client: 'openclaw', target: f.executable }), /仍存在/);
  await fs.writeFile(path.join(f.module, 'package.json'), JSON.stringify({ name: 'another-package', bin: { openclaw: 'cli.js' } }));
  assert.equal((await service.plan('openclaw')).supported, false);
});

test('Homebrew uses owning formula manager and retains shared prefix', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-brew-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const prefix = path.join(home, 'brew');
  const keg = path.join(prefix, 'Cellar/opencode/1.0');
  await fs.mkdir(path.join(keg, 'bin'), { recursive: true });
  await fs.mkdir(path.join(prefix, 'bin'), { recursive: true });
  await fs.writeFile(path.join(keg, 'INSTALL_RECEIPT.json'), '{}');
  await fs.writeFile(path.join(keg, 'bin/opencode'), 'program');
  const executable = path.join(prefix, 'bin/opencode');
  await fs.symlink(path.join(keg, 'bin/opencode'), executable);
  await fs.writeFile(path.join(prefix, 'bin/brew'), 'brew', { mode: 0o755 });
  const service = createUninstaller({ home, platform: 'darwin', detect: async () => [{ id: 'opencode', installed: true, executable }], execute: async (file, args) => {
    assert.equal(file, await fs.realpath(path.join(prefix, 'bin/brew'))); assert.deepEqual(args, ['uninstall', 'opencode']); await fs.unlink(executable);
  } });
  assert.equal((await service.plan('opencode')).kind, 'brew');
  await service.uninstall({ client: 'opencode', target: executable });
  await fs.access(path.join(prefix, 'bin/brew'));
});

test('Claude native installation preserves user configuration and refuses redirected program trees', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-native-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const program = path.join(home, '.local/share/claude');
  const executable = path.join(home, '.local/bin/claude');
  await fs.mkdir(path.join(program, 'versions'), { recursive: true });
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.mkdir(path.join(home, '.claude'));
  await fs.writeFile(path.join(home, '.claude/settings.json'), 'keep');
  await fs.writeFile(path.join(program, 'versions/2.1.138'), 'program');
  await fs.symlink(path.join(program, 'versions/2.1.138'), executable);
  const service = createUninstaller({ home, platform: 'darwin', detect: async () => [{ id: 'claude', installed: true, executable }], trashItem: async p => {
    assert.equal(p, program); await fs.rename(p, path.join(home, 'trash'));
  } });
  assert.equal((await service.plan('claude')).kind, 'native');
  await service.uninstall({ client: 'claude', target: executable });
  assert.equal(await fs.readFile(path.join(home, '.claude/settings.json'), 'utf8'), 'keep');
  await fs.symlink(path.join(home, 'trash'), program);
  await fs.symlink(path.join(program, 'versions/2.1.138'), executable);
  assert.equal((await service.plan('claude')).supported, false);
});

test('unwritable npm installation uninstalls through system authorization', async t => {
  const f = await npmFixture(t, 'openclaw', 'openclaw', 'openclaw');
  const originalAccess = fs.access;
  t.after(() => { fs.access = originalAccess; });
  fs.access = async (file, mode) => {
    if (mode === fs.constants.W_OK && file === f.module) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return originalAccess(file, mode);
  };
  let executed = false;
  const service = createUninstaller({ home: f.home, platform: 'darwin', detect: async () => [f.item], execute: async (file, args) => { assert.equal(file, '/usr/bin/osascript'); assert.match(args[1], /with administrator privileges$/); assert.match(args[1], /--ignore-scripts/); executed = true; await fs.unlink(f.executable); } });
  const plan = await service.plan('openclaw');
  assert.equal(plan.supported, true);
  assert.equal(plan.requiresAuthorization, true);
  assert.equal(plan.kind, 'external-npm');
  assert.match(plan.command, /^sudo /);
  assert.match(plan.notice, /系统授权/);
  await service.uninstall({ client: 'openclaw', target: f.executable });
  assert.equal(executed, true);
});


test('authorization cancellation is actionable and keeps installation', async t => {
  const f = await npmFixture(t, 'openclaw', 'openclaw', 'openclaw');
  let calls = 0;
  const service = createUninstaller({ home: f.home, platform: 'darwin', detect: async () => [f.item], execute: async file => {
    calls++;
    if (file === '/usr/bin/osascript') throw new Error('User canceled. (-128)');
    throw new Error('EACCES permission denied');
  } });
  await assert.rejects(service.uninstall({ client: 'openclaw', target: f.executable }), /已取消系统授权/);
  assert.equal(calls, 2);
  await fs.access(f.executable);
});

test('authorization escapes shell arguments and AppleScript strings independently', () => {
  const { authorizationScript } = require('./uninstall-authorization.cjs');
  const script = authorizationScript('/tools/node', ["a'b", 'a"b', '$(touch /tmp/never)', 'a\\b']);
  assert.ok(script.startsWith('do shell script "'));
  assert.ok(script.endsWith('" with administrator privileges'));
  assert.ok(script.includes("'$(touch /tmp/never)'"));
  assert.ok(script.includes('a\\"b'));
});

const { packages, commandNames } = require('./installer.cjs');
for (const [id, pkg] of Object.entries(packages)) {
  for (const platform of ['darwin', 'win32', 'linux']) test(`managed ${platform}: ${id} removes aliases and preserves sibling, runtime and data`, async t => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-managed-matrix-'));
    t.after(() => fs.rm(home, { recursive: true, force: true }));
    const root = path.join(home, '.onelinkai/managed');
    const ext = platform === 'win32' ? '.cmd' : '';
    const shim = path.join(root, 'bin', id + ext);
    const alias = path.join(root, 'bin', (commandNames[id] || id) + ext);
    for (const file of new Set([shim, alias, path.join(root, 'bin/sibling'), path.join(root, 'runtime/keep'), path.join(home, 'config/keep')])) {
      await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'keep');
    }
    let removed = false;
    const s = createUninstaller({ home, platform, detect: async () => removed ? [] : [{ id, installed: true, executable: alias }], execute: async (node, args) => {
      assert.equal(node, path.join(root, platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node'));
      assert.equal(args.at(-1), pkg); assert.ok(args.includes('--ignore-scripts')); removed = true;
    } });
    const p = await s.plan(id); assert.equal(p.kind, 'managed');
    assert.equal((await s.uninstall({ client: id, target: p.target })).removed, true);
    for (const file of new Set([shim, alias])) await assert.rejects(fs.lstat(file), { code: 'ENOENT' });
    for (const file of ['bin/sibling', 'runtime/keep']) assert.equal(await fs.readFile(path.join(root, file), 'utf8'), 'keep');
    assert.equal(await fs.readFile(path.join(home, 'config/keep'), 'utf8'), 'keep');
  });

  for (const outcome of ['authorize', 'cancel', 'failure', 'no-removal']) test(`external npm authorization ${id}: ${outcome}`, async t => {
    const f = await npmFixture(t, id, pkg, commandNames[id] || id);
    const data = path.join(f.home, 'config'); await fs.writeFile(data, 'keep');
    let calls = 0;
    const s = createUninstaller({ home: f.home, platform: 'darwin', detect: async () => [f.item], execute: async (file, args) => {
      calls++;
      if (file !== '/usr/bin/osascript') throw new Error('EACCES');
      assert.match(args[1], /with administrator privileges$/);
      assert.ok(args[1].includes(pkg));
      if (outcome === 'cancel') throw new Error('User canceled (-128)');
      if (outcome === 'failure') throw new Error('npm uninstall failed');
      if (outcome === 'authorize') await fs.unlink(f.executable);
    } });
    const action = s.uninstall({ client: id, target: f.executable });
    if (outcome === 'authorize') assert.equal((await action).removed, true);
    else await assert.rejects(action, outcome === 'cancel' ? /取消系统授权/ : outcome === 'no-removal' ? /仍存在/ : /卸载失败/);
    assert.equal(calls, 2);
    assert.equal(await fs.readFile(data, 'utf8'), 'keep');
    if (outcome !== 'authorize') await fs.access(f.executable);
  });
}

const desktopApps = { 'claude-desktop': 'Claude.app', codex: 'Codex.app', 'deepseek-harness': 'DeepSeek Harness.app', zed: 'Zed.app', vscode: 'Visual Studio Code.app', zcode: 'ZCode.app', workbuddy: 'WorkBuddy.app' };
for (const [id, name] of Object.entries(desktopApps)) {
  for (const outcome of ['success', 'cancel', 'no-removal']) test(`desktop ${id}: ${outcome}`, async t => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-app-matrix-'));
    t.after(() => fs.rm(home, { recursive: true, force: true }));
    const bundle = path.join(home, 'Applications', name);
    await fs.mkdir(bundle, { recursive: true }); await fs.writeFile(path.join(home, 'data'), 'keep');
    const s = createUninstaller({ home, platform: 'darwin', detect: async () => [{ id, installed: true, bundle }], trashItem: async p => {
      assert.equal(p, bundle);
      if (outcome === 'cancel') throw new Error('Trash denied');
      if (outcome === 'success') await fs.rename(p, path.join(home, 'trash'));
    } });
    assert.equal((await s.plan(id)).kind, 'app');
    if (outcome === 'success') { const r = await s.uninstall({ client: id, target: bundle }); assert.equal(r.removed, true); await fs.access(path.join(home, 'trash')); }
    else await assert.rejects(s.uninstall({ client: id, target: bundle }), outcome === 'cancel' ? /Trash denied/ : /仍存在/);
    assert.equal(await fs.readFile(path.join(home, 'data'), 'utf8'), 'keep');
  });
}

test('OpenCode native trashes only executable and refuses redirected binary', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-opencode-native-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const executable = path.join(home, '.opencode/bin/opencode');
  await fs.mkdir(path.dirname(executable), { recursive: true }); await fs.writeFile(executable, 'program');
  const data = path.join(home, '.opencode/data'); await fs.writeFile(data, 'keep');
  const s = createUninstaller({ home, platform: 'darwin', detect: async () => [{ id: 'opencode', installed: true, executable }], trashItem: async p => fs.rename(p, path.join(home, 'trash')) });
  assert.equal((await s.plan('opencode')).kind, 'native-file');
  await s.uninstall({ client: 'opencode', target: executable });
  assert.equal(await fs.readFile(data, 'utf8'), 'keep');
  await fs.symlink(path.join(home, 'trash'), executable);
  assert.equal((await s.plan('opencode')).supported, false);
});

test('managed npm failure leaves command and data intact', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-managed-fail-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const executable = path.join(home, '.onelinkai/managed/bin/codex');
  await fs.mkdir(path.dirname(executable), { recursive: true }); await fs.writeFile(executable, 'keep');
  const s = createUninstaller({ home, detect: async () => [{ id: 'codex', installed: true, executable }], execute: async () => { throw new Error('npm failed'); } });
  await assert.rejects(s.uninstall({ client: 'codex', target: executable }), /npm failed/);
  assert.equal(await fs.readFile(executable, 'utf8'), 'keep');
});

for (const [id, pkg] of Object.entries(packages)) test(`real npm process uninstalls isolated ${id}`, async t => {
  const { execFile } = require('node:child_process');
  const execute = require('node:util').promisify(execFile);
  const npmCli = process.env.npm_execpath || '/usr/local/lib/node_modules/npm/bin/npm-cli.js';
  await fs.access(npmCli);
  const f = await npmFixture(t, id, pkg, commandNames[id] || id);
  await fs.unlink(path.join(f.prefix, 'bin/node'));
  await fs.symlink(process.execPath, path.join(f.prefix, 'bin/node'));
  const fixtureNpm = path.join(f.prefix, 'lib/node_modules/npm/bin/npm-cli.js');
  await fs.unlink(fixtureNpm); await fs.symlink(npmCli, fixtureNpm);
  const config = path.join(f.home, 'user-data'); await fs.writeFile(config, 'keep');
  const detect = async () => { try { await fs.access(f.executable); return [f.item]; } catch { return []; } };
  const s = createUninstaller({ home: f.home, platform: process.platform, detect, execute });
  const p = await s.plan(id); assert.equal(p.kind, 'external-npm');
  const result = await s.uninstall({ client: id, target: f.executable });
  assert.equal(result.remaining, false);
  await assert.rejects(fs.access(f.module), { code: 'ENOENT' });
  await fs.access(path.join(f.prefix, 'bin/node')); await fs.access(fixtureNpm);
  assert.equal(await fs.readFile(config, 'utf8'), 'keep');
});

for (const mode of ['failed', 'unchanged', 'unwritable', 'missing-receipt']) test('Homebrew edge case: ' + mode, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-brew-edge-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const prefix = path.join(home, 'brew'); const keg = path.join(prefix, 'Cellar/gemini-cli/1.0');
  await fs.mkdir(path.join(keg, 'bin'), { recursive: true }); await fs.mkdir(path.join(prefix, 'bin'), { recursive: true });
  if (mode !== 'missing-receipt') await fs.writeFile(path.join(keg, 'INSTALL_RECEIPT.json'), '{}');
  await fs.writeFile(path.join(keg, 'bin/gemini'), 'keep');
  const executable = path.join(prefix, 'bin/gemini'); await fs.symlink(path.join(keg, 'bin/gemini'), executable);
  await fs.writeFile(path.join(prefix, 'bin/brew'), 'brew', { mode: 0o755 });
  if (mode === 'unwritable') {
    const access = fs.access; t.after(() => { fs.access = access; });
    fs.access = async (p, flags) => { if (flags === fs.constants.W_OK) throw new Error('denied'); return access(p, flags); };
  }
  let calls = 0;
  const s = createUninstaller({ home, platform: 'darwin', detect: async () => [{ id: 'gemini', installed: true, executable }], execute: async () => { calls++; if (mode === 'failed') throw new Error('brew failed'); } });
  const p = await s.plan('gemini');
  if (mode === 'unwritable' || mode === 'missing-receipt') { assert.equal(p.supported, false); await assert.rejects(s.uninstall({ client: 'gemini', target: executable })); assert.equal(calls, 0); }
  else await assert.rejects(s.uninstall({ client: 'gemini', target: executable }), mode === 'failed' ? /brew failed/ : /仍存在/);
  await fs.access(executable);
});
