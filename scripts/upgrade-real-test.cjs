const fs = require('node:fs/promises');
const path = require('node:path');
const { createProxyBridge } = require('../electron/install-network.cjs');
const { createInstallCommand } = require('../electron/install-command.cjs');
const { createInstaller } = require('../electron/installer.cjs');
const { createAgentUpdates } = require('../electron/agent-updates.cjs');

(async () => {
  const home = await fs.mkdtemp('/tmp/onelink-real-upgrade-');
  const root = path.join(home, '.onelinkai/managed');
  const prefix = path.join(root, 'clients');
  const bin = path.join(root, 'bin');
  const runtime = '/tmp/onelink-real-validation-20261023/.onelinkai/managed/runtime';
  await fs.mkdir(bin, { recursive: true });
  await fs.symlink(runtime, path.join(root, 'runtime'));
  const bridge = await createProxyBridge(process.env.ONELINK_TEST_PROXY || 'DIRECT');
  const { ProxyAgent, fetch: networkFetch } = require(require.resolve('undici', { paths: [require.resolve('node-gyp')] }));
  const dispatcher = bridge.env.HTTPS_PROXY ? new ProxyAgent(bridge.env.HTTPS_PROXY) : null;
  const fetcher = (url, options) => networkFetch(url, { ...options, ...(dispatcher ? { dispatcher } : {}) });
  const logs = [];
  const runner = createInstallCommand(line => { logs.push(line); });
  const executable = path.join(bin, 'codex');
  const env = { ...bridge.env, HOME: home, PATH: runtime + '/bin:' + process.env.PATH };
  try {
    await runner(runtime + '/bin/node', [runtime + '/lib/node_modules/npm/bin/npm-cli.js', 'install', '-g', '--prefix', prefix, '--cache', root + '/cache', '@openai/codex@0.163.0', '--no-audit', '--no-fund'], { env, timeout: 300000 });
    await fs.writeFile(executable, '#!/bin/sh\nexport PATH="' + runtime + '/bin:$PATH"\nexec "' + prefix + '/bin/codex" "$@"\n', { mode: 0o700 });
    const detect = async () => {
      const output = await runner(executable, ['--version'], { env, timeout: 30000 });
      return [{ id: 'codex', installed: true, executable, version: output.match(/\d+\.\d+\.\d+/)[0] }];
    };
    const installer = createInstaller({ home, detect, fetcher, runner, resolveEnvironment: async () => ({ env }) });
    const updates = createAgentUpdates({ home, detect, fetcher, installer });
    const before = await updates.check('codex');
    console.log('BEFORE', JSON.stringify(before));
    if (before.status !== 'available') throw new Error('Expected a real newer official version');
    await updates.upgrade('codex');
    while (installer.status().running) await new Promise(resolve => setTimeout(resolve, 1000));
    const status = installer.status();
    if (status.phase !== 'complete') throw new Error(status.error);
    const after = await updates.check('codex');
    console.log('AFTER', JSON.stringify(after));
    await fs.writeFile('artifacts/install-validation/agent-upgrade-real.json', JSON.stringify({ home, before, after, status, logs }, null, 2));
    if (after.currentVersion !== before.latestVersion) throw new Error('Version mismatch after real upgrade');
  } finally { if (dispatcher) await dispatcher.close(); await bridge.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
