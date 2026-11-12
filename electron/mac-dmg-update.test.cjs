const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { prepareDmgUpdate, createMacDmgUpdaterClass, APP_ID, TEAM_ID } = require('./mac-dmg-update.cjs');

async function conversionFixture(t, { id = APP_ID, version = '0.4.0', arch = 'arm64', signatureError = false, extraApp = false, unmountError = false } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-dmg-tests-'));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, args]);
    if (file.endsWith('/hdiutil') && args[0] === 'attach') {
      const mount = args[args.indexOf('-mountpoint') + 1];
      await fs.mkdir(path.join(mount, 'OneLinkAI.app/Contents/MacOS'), { recursive: true });
      await fs.writeFile(path.join(mount, 'OneLinkAI.app/Contents/MacOS/OneLinkAI'), 'signed executable fixture');
      if (extraApp) await fs.mkdir(path.join(mount, 'Other.app'));
    }
    if (file.endsWith('/hdiutil') && args[0] === 'detach' && unmountError) throw new Error('device busy');
    if (file.endsWith('/PlistBuddy')) return { stdout: args[1].includes('CFBundleIdentifier') ? id : args[1].includes('CFBundleShortVersionString') ? version : 'OneLinkAI' };
    if (file.endsWith('/lipo')) return { stdout: arch };
    if (file.endsWith('/codesign') && signatureError) throw new Error('invalid signature');
    if (file.endsWith('/ditto')) await fs.writeFile(args.at(-1), 'local signed app zip');
    return { stdout: '' };
  };
  const prepare = () => prepareDmgUpdate({ dmgFile: '/download/OneLinkAI.dmg', version: '0.4.0', arch: 'arm64', tempDir, run });
  return { prepare, calls, tempDir };
}
test('DMG conversion mounts read-only, verifies app identity, version, architecture and signing team, then detaches', async t => {
  const fixture = await conversionFixture(t);
  const result = await fixture.prepare();
  assert.equal(await fs.readFile(result.zipFile, 'utf8'), 'local signed app zip');
  const mount = fixture.calls.find(([file, args]) => file.endsWith('/hdiutil') && args[0] === 'attach');
  assert.ok(mount[1].includes('-readonly'));
  const signing = fixture.calls.find(([file]) => file.endsWith('/codesign'));
  assert.ok(signing[1].includes('--deep'));
  assert.ok(signing[1].some(arg => arg.includes(APP_ID) && arg.includes(TEAM_ID)));
  assert.equal(fixture.calls.at(-1)[1][0], 'detach');
  await result.cleanup();
  assert.deepEqual(await fs.readdir(fixture.tempDir), []);
});
for (const [name, options, pattern] of [
  ['different app', { id: 'com.other.app' }, /应用标识/],
  ['wrong version', { version: '0.3.9' }, /应用版本/],
  ['wrong architecture', { arch: 'x86_64' }, /当前架构/],
  ['invalid signature', { signatureError: true }, /invalid signature/],
  ['ambiguous payload', { extraApp: true }, /唯一/],
]) test(`DMG conversion rejects ${name}, detaches and removes temporary files`, async t => {
  const fixture = await conversionFixture(t, options);
  await assert.rejects(fixture.prepare(), pattern);
  assert.equal(fixture.calls.some(([file]) => file.endsWith('/ditto')), false);
  assert.equal(fixture.calls.at(-1)[1][0], 'detach');
  assert.deepEqual(await fs.readdir(fixture.tempDir), []);
});
test('failed unmount never recursively deletes a potentially mounted directory', async t => {
  const fixture = await conversionFixture(t, { unmountError: true });
  await assert.rejects(fixture.prepare(), error => error.preserveUpdateDirectory === true);
  assert.equal(fixture.calls.filter(([file, args]) => file.endsWith('/hdiutil') && args[0] === 'detach').length, 2);
  assert.equal((await fs.readdir(fixture.tempDir)).length, 1);
});

async function updaterFixture(t, { preparationError = false, size = 3, url = 'https://example.com/OneLinkAI.dmg' } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-dmg-adapter-'));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const calls = [];
  class Base extends EventEmitter {
    constructor() { super(); this.httpExecutor = { download: async (url, file, options) => { calls.push(['download', options]); await fs.writeFile(file, 'dmg'); } }; }
    closeServerIfExists() { calls.push(['close']); }
    async updateDownloaded(file, event) { calls.push(['bridge', file, event]); this.emit('update-downloaded', event); }
  }
  const Updater = createMacDmgUpdaterClass(Base);
  const updater = new Updater(null, null, { tempDir, arch: 'arm64', prepare: async options => {
    calls.push(['prepare', options]);
    if (preparationError) throw new Error('signature rejected');
    const zipFile = path.join(tempDir, 'temporary.zip');
    await fs.writeFile(zipFile, 'local ZIP is larger than DMG');
    return { zipFile, cleanup: async () => { calls.push(['cleanup']); await fs.rm(zipFile, { force: true }); } };
  } });
  updater.on('update-preparing', () => calls.push(['preparing']));
  const options = { requestHeaders: { Accept: '*/*' }, cancellationToken: {}, updateInfoAndProvider: {
    info: { version: '0.4.0' }, provider: { resolveFiles: () => [{ url: new URL(url), info: { url, size, sha512: 'original-dmg-checksum' } }] },
  } };
  return { updater, calls, options, tempDir };
}
test('DMG adapter downloads the original artifact and hands the local ZIP and its size to the native bridge', async t => {
  const fixture = await updaterFixture(t);
  await fixture.updater.doDownloadUpdate(fixture.options);
  const download = fixture.calls.find(([name]) => name === 'download');
  assert.equal(download[1].sha512, 'original-dmg-checksum');
  const bridge = fixture.calls.find(([name]) => name === 'bridge');
  assert.equal(bridge[1].url.protocol, 'file:');
  assert.equal(bridge[1].info.size, Buffer.byteLength('local ZIP is larger than DMG'));
  assert.ok(bridge[2].downloadedFile.endsWith('.zip'));
  assert.ok(fixture.calls.findIndex(([name]) => name === 'preparing') < fixture.calls.findIndex(([name]) => name === 'prepare'));
  await fixture.updater.disposePreparedUpdate();
  assert.deepEqual(await fs.readdir(fixture.tempDir), []);
});
for (const [name, options] of [['signature failure', { preparationError: true }], ['size mismatch', { size: 99 }], ['HTTP artifact', { url: 'http://example.com/update.dmg' }]]) {
  test(`DMG adapter never announces ready after ${name}`, async t => {
    const fixture = await updaterFixture(t, options);
    await assert.rejects(fixture.updater.doDownloadUpdate(fixture.options));
    assert.equal(fixture.calls.some(([name]) => name === 'bridge'), false);
    assert.deepEqual(await fs.readdir(fixture.tempDir), []);
  });
}
test('pinned updater exposes the native bridge used by the adapter', () => {
  assert.equal(require('electron-updater/package.json').version, '6.8.3');
  const { MacUpdater } = require('electron-updater');
  assert.equal(typeof MacUpdater.prototype.updateDownloaded, 'function');
  assert.equal(typeof MacUpdater.prototype.quitAndInstall, 'function');
});
test('quitting during preparation waits for unmount/cleanup and never offers a ZIP for installation', async t => {
  const fixture = await updaterFixture(t);
  let finish;
  const original = fixture.updater.prepareDmg;
  fixture.updater.prepareDmg = async options => {
    await new Promise(resolve => { finish = resolve; });
    return original(options);
  };
  fixture.options.cancellationToken = { cancelled: false, cancel() { this.cancelled = true; } };
  const download = fixture.updater.doDownloadUpdate(fixture.options);
  // Attach rejection handler immediately, before triggering cancellation.
  const rejection = assert.rejects(download, /已取消/);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  let disposed = false;
  const dispose = fixture.updater.disposePreparedUpdate().then(() => { disposed = true; });
  assert.equal(disposed, false);
  finish();
  await Promise.all([dispose, rejection]);
  assert.equal(disposed, true);
  assert.equal(fixture.calls.some(([name]) => name === 'bridge'), false);
  assert.deepEqual(await fs.readdir(fixture.tempDir), []);
});
