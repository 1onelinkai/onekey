const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSoftwareUpdates, updateFeed } = require('./software-updates.cjs');

function fixture({ answers = [], result = { isUpdateAvailable: true, updateInfo: { version: '0.4.0', releaseNotes: '改进稳定性' } }, enabled = true, baseURL, apiURL } = {}) {
  const updater = new EventEmitter();
  const calls = { checks: 0, downloads: 0, installs: [], dialogs: [] };
  updater.setFeedURL = value => { calls.feed = value; };
  updater.checkForUpdates = async () => { calls.checks++; return result; };
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit('download-progress', { percent: 54 }); updater.emit('update-downloaded'); return ['/verified/package']; };
  updater.quitAndInstall = (...args) => calls.installs.push(args);
  const dialog = { showMessageBox: async options => { calls.dialogs.push(options); return { response: answers.shift() ?? 1 }; } };
  const service = createSoftwareUpdates({ updater, dialog, version: '0.3.2', platform: 'darwin', arch: 'arm64', enabled, baseURL, apiURL });
  return { updater, calls, service };
}

test('software update routes by OS and architecture and rejects unsafe feeds', () => {
  assert.equal(updateFeed('https://updates.example/stable/', 'win32', 'x64'), 'https://updates.example/stable/win32/x64/');
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com?q=1', 'https://example.com/#x']) {
    assert.throws(() => updateFeed(url, 'darwin', 'arm64'));
  }
  assert.throws(() => updateFeed('https://example.com', '../x', 'arm64'));
});
test('startup checks only; declining downloads nothing and never installs', async () => {
  const { service, updater, calls } = fixture();
  await service.check();
  assert.equal(service.status().status, 'available');
  assert.equal(calls.downloads, 0);
  assert.equal(calls.installs.length, 0);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.disableDifferentialDownload, true);
  assert.equal(updater.allowDowngrade, false);
});
test('explicit download and restart choices install the full verified update', async () => {
  const { service, calls } = fixture({ answers: [0, 0] });
  await service.check();
  assert.equal(calls.downloads, 1);
  assert.deepEqual(calls.installs, [[false, true]]);
  assert.equal(service.status().status, 'installing');
});
test('postponed restart keeps ready state; manual action can resume installation', async () => {
  const { service, calls } = fixture({ answers: [0, 1, 0] });
  await service.check();
  assert.equal(service.status().status, 'ready');
  assert.equal(calls.installs.length, 0);
  await service.check(true);
  assert.equal(calls.checks, 1);
  assert.equal(calls.downloads, 1);
  assert.equal(calls.installs.length, 1);
});
test('manual action reopens a previously declined download offer', async () => {
  const { service, calls } = fixture({ answers: [1, 0, 1] });
  await service.check();
  await service.check(true);
  assert.equal(calls.downloads, 1);
  assert.equal(service.status().status, 'ready');
});
test('updater eligibility (including staged rollout / OS limits) is respected', async () => {
  const { service, calls } = fixture({ result: { isUpdateAvailable: false, updateInfo: { version: '0.4.0' } } });
  await service.check();
  assert.equal(service.status().status, 'current');
  assert.equal(calls.dialogs.length, 0);
});
test('stable software updater never offers a prerelease returned by a generic or custom API', async () => {
  const { service, calls } = fixture({ result: { isUpdateAvailable: true, updateInfo: { version: '0.4.0-beta.1' } } });
  await service.check();
  assert.equal(service.status().status, 'current');
  assert.equal(calls.dialogs.length, 0);
});
test('network failures allow retry without blocking application startup', async () => {
  const { service, updater, calls } = fixture();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  await service.check();
  assert.equal(service.status().status, 'error');
  assert.equal(service.status().error, 'offline');
  updater.checkForUpdates = async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.3.2' } });
  await service.check(true);
  assert.equal(service.status().status, 'current');
  assert.equal(service.status().error, null);
  assert.equal(calls.dialogs.length, 0);
});
test('checksum/signature/download failure never offers installation', async () => {
  const { service, updater, calls } = fixture({ answers: [0] });
  updater.downloadUpdate = async () => { throw new Error('checksum mismatch'); };
  await service.check();
  assert.equal(service.status().status, 'error');
  assert.equal(calls.installs.length, 0);
  assert.equal(calls.dialogs.length, 1);
});
test('download completion without a verified event does not install', async () => {
  const { service, updater, calls } = fixture({ answers: [0, 0] });
  updater.downloadUpdate = async () => [];
  await service.check();
  assert.equal(calls.installs.length, 0);
  assert.equal(service.status().status, 'error');
});
test('parallel clicks share one check and one dialog', async () => {
  const { service, updater, calls } = fixture();
  let resolve;
  updater.checkForUpdates = () => { calls.checks++; return new Promise(done => { resolve = done; }); };
  const first = service.check();
  const second = service.check(true);
  assert.equal(first, second);
  resolve({ isUpdateAvailable: true, updateInfo: { version: '0.4.0' } });
  await Promise.all([first, second]);
  assert.equal(calls.checks, 1);
  assert.equal(calls.dialogs.length, 1);
});
test('development/test environment never checks or prompts', async () => {
  const { service, calls } = fixture({ enabled: false });
  await service.check(true);
  assert.equal(service.status().status, 'disabled');
  assert.equal(calls.checks, 0);
  assert.equal(calls.dialogs.length, 0);
});
test('invalid deployment config reports error without crashing or using another feed', async () => {
  const { service, calls } = fixture({ baseURL: 'http://unsafe.example' });
  await service.check();
  assert.equal(service.status().status, 'error');
  assert.equal(calls.checks, 0);
  assert.equal(calls.feed, undefined);
});
test('asynchronous install errors remain visible and permit another check', async () => {
  const { service, updater } = fixture({ answers: [0, 0] });
  await service.check();
  updater.emit('error', new Error('installation denied'));
  assert.equal(service.status().status, 'error');
  assert.equal(service.status().error, 'installation denied');
});
test('existing JSON API uses a custom provider instead of requiring an uploaded YAML/ZIP', () => {
  const { calls } = fixture({ apiURL: 'https://example.com/existing/version' });
  assert.equal(calls.feed.provider, 'custom');
  assert.equal(calls.feed.url, 'https://example.com/existing/version');
  assert.equal(calls.feed.arch, 'arm64');
});
test('DMG preparation remains busy until verified ZIP reaches the native bridge', async () => {
  const { service, updater } = fixture({ answers: [0, 1] });
  let complete;
  updater.downloadUpdate = async () => {
    updater.emit('update-preparing');
    await new Promise(resolve => { complete = resolve; });
    updater.emit('update-downloaded');
  };
  const pending = service.check();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.status().status, 'preparing');
  assert.equal(service.check(true), pending);
  complete();
  await pending;
  assert.equal(service.status().status, 'ready');
});
