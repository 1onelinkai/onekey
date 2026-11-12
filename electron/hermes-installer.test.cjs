const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { installHermes } = require('./hermes-installer.cjs');
const { installationPlan } = require('./installer.cjs');

test('Hermes executes official installation stages and verifies command, rather than opening a URL', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-hermes-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed');
  await fs.mkdir(root, { recursive: true });
  const ambientCache = path.join(home, 'existing-user-cache');
  const oldCache = { npm_config_cache: process.env.npm_config_cache, NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE };
  process.env.npm_config_cache = ambientCache;
  process.env.NPM_CONFIG_CACHE = ambientCache;
  t.after(() => {
    for (const [key, value] of Object.entries(oldCache)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const state = {};
  const stages = [];
  const source = '# Hermes stage installer\n' + '#'.repeat(1500);
  const execute = async (command, args, options) => {
    if (command === 'git' && args[0] === 'ls-remote') return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/heads/main\n';
    assert.ok(!args.includes('--skip-computer-use'), 'unsupported optional flags must not be passed');
    if (args.includes('--manifest')) return JSON.stringify({ protocol_version: 1, stages: [
      { name: 'prerequisites' }, { name: 'repository' }, { name: 'venv' }, { name: 'python-deps' }, { name: 'products' }, { name: 'setup', needs_user_input: true }, { name: 'complete' },
    ] });
    if (args.includes('--stage')) {
      assert.equal(options.env.npm_config_cache, path.join(root, 'hermes-npm-cache'));
      assert.equal(options.env.NPM_CONFIG_CACHE, options.env.npm_config_cache);
      const stage = args[args.indexOf('--stage') + 1];
      if (stage === 'products') {
        const { stdout } = await promisify(execFile)('npm', ['config', 'get', 'cache'], { env: options.env });
        assert.equal(stdout.trim(), path.join(root, 'hermes-npm-cache'), 'real npm must ignore the inherited user cache');
      }
      stages.push(stage); assert.ok(args.includes('--commit'));
      if (stage === 'repository') assert.match(await fs.readFile(options.env.GIT_CONFIG_GLOBAL, 'utf8'), /insteadOf = "https:\/\/ghfast.top/);
      return '';
    }
    if (args.includes('--version')) return 'Hermes 1.0.0';
    return path.join(home, '.local/bin') + ':/usr/bin:/bin';
  };
  await installHermes({ home, root, system: { platform: 'darwin', arch: 'arm64' }, execute,
    fetcher: async url => url.includes('/commits/') ? { ok: true, json: async () => ({ sha: 'a'.repeat(40) }) } : { ok: true, text: async () => source },
    log: () => {}, state, detect: async () => [{ id: 'hermes', installed: true, version: '1.0.0' }],
  });
  assert.deepEqual(stages, ['prerequisites', 'repository', 'venv', 'python-deps', 'products', 'complete']);
  assert.equal(state.detected.installed, true);
  assert.equal((await fs.readdir(root)).some(name => name.startsWith('hermes-install-')), false);
  assert.equal(installationPlan('hermes', { platform: 'darwin', arch: 'arm64', release: '24.0' }).supported, true);
  assert.equal(installationPlan('hermes', { platform: 'win32', arch: 'x64', release: '10.0' }).supported, true);
});
