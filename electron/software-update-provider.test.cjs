const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSoftwareRelease, SoftwareUpdateApiProvider } = require('./software-update-provider.cjs');
const options = { endpoint: 'https://example.com/api/releases/latest', currentVersion: '0.3.2' };
test('existing JSON API can return one DMG URL without a separate ZIP or checksum field', () => {
  const result = normalizeSoftwareRelease({ data: { version: '0.4.0', downloadUrl: '/downloads/latest?id=123', releaseNotes: '修复问题' } }, options);
  assert.equal(result.files[0].url, 'https://example.com/downloads/latest?id=123');
  assert.equal(result.files[0].format, 'dmg');
  assert.equal(result.files[0].sha512, undefined); // Mandatory app signature verification remains enforced.
});
test('JSON API preserves optional size and checksum for DMG download verification', () => {
  const result = normalizeSoftwareRelease({ version: '0.4.0', downloadUrl: '/a.dmg', size: 123, sha512: Buffer.alloc(64).toString('base64'), sha256: 'a'.repeat(64) }, options);
  assert.equal(result.files[0].size, 123);
  assert.equal(result.files[0].sha256, 'a'.repeat(64));
});
test('no-update and older versions need no package URL', () => {
  for (const version of ['0.3.2', '0.3.1']) assert.deepEqual(normalizeSoftwareRelease({ version }, options), { version, files: [] });
});
for (const [name, release] of [
  ['invalid version', { version: 'invalid', downloadUrl: '/a.dmg' }],
  ['missing URL', { version: '0.4.0' }],
  ['HTTP URL', { version: '0.4.0', downloadUrl: 'http://example.com/a.dmg' }],
  ['credential URL', { version: '0.4.0', downloadUrl: 'https://user:secret@example.com/a.dmg' }],
  ['bad checksum', { version: '0.4.0', downloadUrl: '/a.dmg', sha512: 'invalid' }],
  ['bad size', { version: '0.4.0', downloadUrl: '/a.dmg', size: -1 }],
]) test(`JSON update metadata rejects ${name}`, () => assert.throws(() => normalizeSoftwareRelease(release, options)));
test('JSON provider queries the existing endpoint with system, architecture and current version', async () => {
  const provider = new SoftwareUpdateApiProvider({ url: options.endpoint, arch: 'arm64' }, { currentVersion: { version: '0.3.2' } }, { executor: {}, platform: 'darwin' });
  let request;
  provider.httpRequest = async url => { request = url; return JSON.stringify({ version: '0.4.0', downloadUrl: '/release.dmg' }); };
  const info = await provider.getLatestVersion();
  assert.equal(request.pathname, '/api/releases/latest');
  assert.equal(request.searchParams.get('arch'), 'arm64');
  assert.equal(request.searchParams.get('platform'), 'darwin');
  assert.equal(request.searchParams.get('currentVersion'), '0.3.2');
  assert.equal(provider.resolveFiles(info)[0].url.pathname, '/release.dmg');
  provider.httpRequest = async () => null;
  assert.equal((await provider.getLatestVersion()).version, '0.3.2');
});
