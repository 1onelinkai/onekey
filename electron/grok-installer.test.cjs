const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installGrok, validateBinary } = require('./grok-installer.cjs');
const { installationPlan, createInstaller } = require('./installer.cjs');
const { createUninstaller } = require('./uninstaller.cjs');
function binary(platform, arch) {
  const bytes = Buffer.alloc(128);
  if (platform === 'darwin') { bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(arch === 'arm64' ? 0x100000c : 0x1000007, 4); }
  else { bytes.write('MZ'); bytes.writeUInt32LE(64, 60); bytes.writeUInt32LE(0x4550, 64); bytes.writeUInt16LE(arch === 'arm64' ? 0xaa64 : 0x8664, 68); }
  return bytes;
}
for (const platform of ['darwin', 'win32']) for (const arch of ['arm64', 'x64']) test(`Grok ${platform}/${arch} install, detect and direct uninstall`, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'grok-test-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed'); await fs.mkdir(root, { recursive: true });
  const system = { platform, arch, release: '24.0' };
  const target = path.join(root, 'bin', platform === 'win32' ? 'grok.exe' : 'grok');
  const config = path.join(home, '.grok'); await fs.mkdir(config); await fs.writeFile(path.join(config, 'config.toml'), 'preserve');
  const detect = async () => [{ id: 'grok', installed: await fs.stat(target).then(() => true, () => false), executable: target }];
  const fetcher = async url => url.endsWith('/stable') ? { ok: true, text: async () => '1.2.3\n' } : { ok: true, body: [binary(platform, arch)] };
  const execute = async (file, args) => args[0] === '--version' ? 'grok 1.2.3' : root + '/bin:/bin';
  const service = createInstaller({ home, system, detect, fetcher, runner: execute });
  assert.equal(installationPlan('grok', system).supported, true);
  await service.install('grok');
  for (let i = 0; i < 200 && service.status().running; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(service.status().phase, 'complete', service.status().error);
  const uninstaller = createUninstaller({ home, platform, detect, execute, trashItem: file => fs.rename(file, file + '.trashed') });
  assert.equal((await uninstaller.plan('grok')).supported, true);
  assert.equal((await uninstaller.uninstall({ client: 'grok', target })).removed, true);
  assert.equal(await fs.readFile(path.join(config, 'config.toml'), 'utf8'), 'preserve');
});
test('binary validation rejects HTML, truncated PE, and wrong architecture', () => {
  for (const platform of ['darwin', 'win32']) {
    assert.throws(() => validateBinary(Buffer.from('<html>blocked</html>'), { platform, arch: 'arm64' }));
    assert.throws(() => validateBinary(binary(platform, 'x64'), { platform, arch: 'arm64' }));
  }
});
for (const failure of ['network', 'version', 'detect', 'existing']) test(`Grok ${failure} failure cleans staging and preserves existing data`, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'grok-failure-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed'); await fs.mkdir(path.join(root, 'bin'), { recursive: true });
  const target = path.join(root, 'bin/grok');
  if (failure === 'existing') await fs.writeFile(target, 'keep');
  let attempts = 0;
  await assert.rejects(installGrok({ home, root, system: { platform: 'darwin', arch: 'arm64' },
    fetcher: async url => { attempts++; if (failure === 'network') throw new Error('offline'); return url.endsWith('/stable') ? { ok: true, text: async () => '1.2.3' } : { ok: true, body: [binary('darwin', 'arm64')] }; },
    execute: async (file, args) => args[0] === '--version' ? (failure === 'version' ? '9.9.9' : '1.2.3') : root + '/bin:/bin',
    detect: async () => [], state: {}, log: () => {} }));
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('grok-install-')), []);
  if (failure === 'existing') assert.equal(await fs.readFile(target, 'utf8'), 'keep');
  else await assert.rejects(fs.access(target));
  assert.ok(attempts >= 1);
});
test('Grok official GCS fallback preserves pinned version', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'grok-fallback-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed'); await fs.mkdir(root, { recursive: true }); const urls = [];
  await installGrok({ home, root, system: { platform: 'darwin', arch: 'arm64' }, state: {}, log: () => {},
    fetcher: async url => { urls.push(url); if (url.startsWith('https://x.ai')) throw new Error('offline'); return url.endsWith('/stable') ? { ok: true, text: async () => '1.2.3' } : { ok: true, body: [binary('darwin', 'arm64')] }; },
    execute: async (file, args) => args[0] === '--version' ? '1.2.3' : root + '/bin:/bin',
    detect: async () => [{ id: 'grok', installed: true, executable: path.join(root, 'bin/grok') }] });
  assert.ok(urls.includes('https://storage.googleapis.com/grok-build-public-artifacts/cli/grok-1.2.3-macos-aarch64'));
});

test('Grok upgrade pins download and restores old executable after failed verification', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'grok-upgrade-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed'); const target = path.join(root, 'bin/grok');
  await fs.mkdir(path.dirname(target), { recursive: true });
  let valid = true;
  const urls = [];
  const service = createInstaller({ home, system: { platform: 'darwin', arch: 'arm64', release: '24.0' },
    detect: async () => [{ id: 'grok', installed: true, executable: target, version: valid ? '1.2.3' : '1.0.0' }],
    fetcher: async url => { urls.push(url); return { ok: true, body: [binary('darwin', 'arm64')] }; },
    runner: async (_file, args) => args[0] === '--version' ? '1.2.3' : root + '/bin:/bin',
  });
  for (const works of [true, false]) {
    valid = works; await fs.writeFile(target, 'old-version');
    await service.install('grok', { update: true, expectedTarget: target, expectedVersion: '1.2.3', kind: 'grok' });
    for (let i = 0; i < 200 && service.status().running; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(service.status().running, false);
    assert.equal(!!service.status().error, !works, service.status().error);
    if (!works) assert.equal(await fs.readFile(target, 'utf8'), 'old-version');
    assert.ok(urls.every(url => url.includes('grok-1.2.3-')));
  }
});
