const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createInstaller } = require('../electron/installer.cjs');
const { createInstallCommand } = require('../electron/install-command.cjs');
const { createProxyBridge } = require('../electron/install-network.cjs');
const { desktops } = require('../electron/desktop-installer.cjs');

(async () => {
  const home = process.env.ONELINK_TEST_HOME || await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-real-install-'));
  await fs.mkdir(home, { recursive: true });
  const output = path.join(home, 'results-' + process.argv.slice(2).join('-') + '.json');
  const results = [];
  const run = createInstallCommand(line => process.stdout.write(line));
  const bridge = await createProxyBridge(process.env.ONELINK_TEST_PROXY || 'DIRECT');
  const { ProxyAgent, fetch: proxyFetch } = require(require.resolve('undici', { paths: [require.resolve('node-gyp')] }));
  const dispatcher = bridge.env.HTTPS_PROXY ? new ProxyAgent(bridge.env.HTTPS_PROXY) : null;
  try {
    const service = createInstaller({ home,
      fetcher: dispatcher ? (url, options) => proxyFetch(url, { ...options, dispatcher }) : fetch,
      resolveEnvironment: async () => ({ ...bridge.env, HOME: home, USERPROFILE: home, UV_PYTHON_INSTALL_DIR: path.join(home, 'python'), UV_CACHE_DIR: path.join(home, 'uv-cache') }),
      detect: async () => {
        const items = [];
        for (const [id, spec] of Object.entries(desktops)) {
          const bundle = path.join(home, 'Applications', spec.app);
          try {
            await fs.access(path.join(bundle, 'Contents/Info.plist'));
            const version = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(bundle, 'Contents/Info.plist')], { timeout: 10000 });
            items.push({ id, installed: /\d+\.\d+/.test(version), version: version.trim(), bundle });
          } catch { items.push({ id, installed: false }); }
        }
        for (const id of ['claude', 'codex', 'opencode', 'pi', 'gemini', 'openclaw', 'deepseek-harness', 'minimax', 'hermes']) {
          const executable = path.join(home, id === 'hermes' ? '.local/bin/hermes' : '.onelinkai/managed/bin/' + id);
          try {
            const version = await run(executable, ['--version'], { timeout: 30000, env: { ...bridge.env, HOME: home } });
            items.push({ id, installed: /\d+\.\d+/.test(version), version: version.trim(), executable });
          } catch { items.push({ id, installed: false }); }
        }
        return items;
      },
    });
    for (const client of process.argv.slice(2)) {
      const started = Date.now();
      console.log('\nREAL INSTALL', client, home);
      try {
        await service.install(client);
        let previousLogs = '';
        while (service.status().running) {
          const state = service.status();
          const currentLogs = state.logs.join('\n');
          if (currentLogs !== previousLogs) { console.log(state.logs.at(-1)); previousLogs = currentLogs; }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        const state = service.status();
        results.push({ client, phase: state.phase, error: state.error, detected: state.detected, seconds: Math.round((Date.now() - started) / 1000), logs: state.logs });
      } catch (error) { results.push({ client, phase: 'failed', error: error.message }); }
      await fs.writeFile(output, JSON.stringify({ home, system: { platform: process.platform, arch: process.arch, release: os.release() }, results }, null, 2));
      console.log('RESULT', JSON.stringify(results.at(-1)));
    }
    console.log('REPORT', output);
    if (results.some(result => result.phase !== 'complete')) process.exitCode = 1;
  } finally { if (dispatcher) await dispatcher.close(); await bridge.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
