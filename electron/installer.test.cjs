const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createInstaller, installationPlan, environment, runtimeSupported, preflight } = require('./installer.cjs');

test('preflight rejects insufficient disk space and unwritable home before downloads', async () => {
  const io = { statfs: async () => ({ bavail: 1, bsize: 1024 }), writeFile: async () => { throw new Error('EACCES'); }, rm: async () => {} };
  await assert.rejects(preflight('/test', 'codex', io), /空间不足/);
  io.statfs = async () => ({ bavail: 10 * 1024 ** 3, bsize: 1 });
  await assert.rejects(preflight('/test', 'codex', io), /不可写.*EACCES/);
  let cleaned = false; io.writeFile = async () => {}; io.rm = async () => { cleaned = true; };
  assert.equal(await preflight('/test', 'hermes', io), 10 * 1024 ** 3);
  assert.equal(cleaned, true);
});

test('managed runtime must satisfy OpenClaw minimum Node minor version', () => {
  for (const version of ['v24.12.0', 'v24.22.0', 'v22.19.0', 'v26.1.0', 'invalid']) assert.equal(runtimeSupported(version), false);
  for (const version of ['v24.22.1', 'v24.23.0\n']) assert.equal(runtimeSupported(version), true);
});

test('installation matrix distinguishes Windows platform from 32-bit architecture', () => {
  for (const platform of ['darwin', 'win32']) for (const arch of ['arm64', 'x64']) {
    assert.equal(installationPlan('codex', { platform, arch, release: platform === 'darwin' ? '24.6.0' : '10.0.22631' }).supported, true);
  }
  assert.equal(installationPlan('codex', { platform: 'win32', arch: 'ia32', release: '10.0' }).supported, false);
  assert.equal(installationPlan('pi', { platform: 'darwin', arch: 'x64', release: '21.0' }).supported, false);
  assert.equal(installationPlan('vscode', { platform: 'darwin', arch: 'arm64', release: '24.0' }).supported, true);
  assert.equal(environment({ platform: 'darwin', arch: 'x64', machine: 'arm64', env: {} }).arch, 'arm64');
  assert.throws(() => installationPlan('arbitrary-command', {}), /未知/);
});

test('installer skips installed client and reports a completed state', async () => {
  const service = createInstaller({ system: { platform: 'darwin', arch: 'arm64', release: '24.0' }, detect: async () => [{ id: 'codex', installed: true, version: '1.0' }] });
  await service.install('codex');
  for (let i = 0; i < 50 && service.status().running; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(service.status().phase, 'complete');
  assert.equal(service.status().detected.version, '1.0');
});

test('existing managed DeepSeek install repairs canonical dsh alias without reinstalling', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-alias-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const bin = path.join(home, '.onelinkai/managed/bin');
  await fs.mkdir(bin, { recursive: true });
  const executable = path.join(bin, 'deepseek-harness');
  await fs.writeFile(executable, '#!/bin/sh\necho 1.0.0\n', { mode: 0o700 });
  const service = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' },
    detect: async () => [{ id: 'deepseek-harness', installed: true, executable }],
    runner: async () => bin + ':/usr/bin:/bin',
    fetcher: async () => { throw new Error('must not download'); },
  });
  await service.install('deepseek-harness');
  for (let i = 0; i < 100 && service.status().running; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(service.status().phase, 'complete');
  assert.equal(await fs.readFile(path.join(bin, 'dsh'), 'utf8'), await fs.readFile(executable, 'utf8'));
});

test('runtime download failure ends installation with actionable status', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-install-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const service = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' }, detect: async () => [], runner: async () => { throw new Error('missing'); }, fetcher: async () => ({ ok: false }) });
  await service.install('codex');
  await assert.rejects(service.install('pi'), /正在进行/);
  for (let i = 0; i < 100 && service.status().running; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(service.status().phase, 'failed');
  assert.match(service.status().error, /下载线路均不可用/);
});

test('failed runtime hash checks preserve existing runtime and close proxy resources', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-runtime-rollback-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const runtime = path.join(home, '.onelinkai/managed/runtime');
  await fs.mkdir(runtime, { recursive: true });
  await fs.writeFile(path.join(runtime, 'old-runtime'), 'preserve');
  let closed = false; let extracts = 0;
  const service = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' }, detect: async () => [],
    resolveEnvironment: async () => ({ env: {}, close: async () => { closed = true; } }),
    runner: async command => { if (command.endsWith('/tar')) extracts++; return 'v24.12.0'; },
    fetcher: async url => url.endsWith('SHASUMS256.txt') ? { ok: true, text: async () => 'a'.repeat(64) + '  node-v24.22.1-darwin-arm64.tar.gz' } : url.endsWith('/latest') ? { ok: true, text: async () => JSON.stringify({ name: '@openai/codex', version: '1.0.0' }) } : { ok: true, body: [Buffer.from('invalid archive')] },
  });
  await service.install('codex');
  for (let i = 0; i < 100 && service.status().running; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(service.status().phase, 'failed');
  assert.match(service.status().logs.join('\n'), /SHA-256/);
  assert.equal(closed, true); assert.equal(extracts, 0);
  assert.equal(await fs.readFile(path.join(runtime, 'old-runtime'), 'utf8'), 'preserve');
  assert.deepEqual((await fs.readdir(path.dirname(runtime))).filter(p => p.startsWith('runtime-')), []);
});

test('WorkBuddy installation plan describes its official metadata and CDN', () => {
  const plan = installationPlan('workbuddy', { platform: 'darwin', arch: 'arm64', release: '24.0' });
  assert.equal(plan.supported, true);
  assert.match(plan.notice, /WorkBuddy 官方更新接口/);
  assert.doesNotMatch(plan.notice + plan.steps.join(' '), /Homebrew|GitHub/);
});

test('Windows desktop download guides use the official WorkBuddy and DeepSeek Harness sites', () => {
  for (const arch of ['x64', 'arm64']) {
    const system = { platform: 'win32', arch, release: '10.0.22631' };
    for (const [client, guide] of [['workbuddy', 'https://www.workbuddy.cn/'], ['deepseek-harness-desktop', 'https://www.deepseek.com/harness/']]) {
      const plan = installationPlan(client, system);
      assert.equal(plan.supported, false);
      assert.equal(plan.guide, guide);
    }
    const cli = installationPlan('deepseek-harness', system);
    assert.equal(cli.supported, true);
    assert.equal(cli.guide, 'https://www.deepseek.com/harness/');
  }
});

test('missing Windows Git Bash triggers automatic download before runtime downloads', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onekey-win-git-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  let downloads = 0;
  const service = createInstaller({ home, system: { platform: 'win32', arch: 'x64', release: '10.0' },
    detect: async () => [], resolveEnvironment: async () => ({ PATH: '' }),
    runner: async () => { throw Error('not installed'); },
    fetcher: async () => { downloads++; throw Error('must not download'); },
  });
  await service.install('claude');
  for(let i=0;i<100 && service.status().running;i++) await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(service.status().phase, 'failed');
  assert.match(service.status().error, /Git for Windows 自动安装失败/);
  assert.equal(downloads, 1);
});
