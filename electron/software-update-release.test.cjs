const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const YAML = require('yaml');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-software-release-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  const name = 'OneLinkAI Setup 0.4.0.exe';
  const data = Buffer.from('full application package fixture');
  await fs.writeFile(path.join(source, name), data);
  const manifest = { version: '0.4.0', files: [{ url: name, sha512: createHash('sha512').update(data).digest('base64'), size: data.length }], path: name };
  const write = () => fs.writeFile(path.join(source, 'latest.yml'), YAML.stringify(manifest));
  await write();
  return { source, output: path.join(root, 'output'), manifest, name, write };
}
test('release preparation preserves builder metadata and verified full packages', async t => {
  const options = await fixture(t);
  const { prepareSoftwareUpdate } = await import('../scripts/prepare-software-update.mjs');
  const target = await prepareSoftwareUpdate({ ...options, platform: 'win32', arch: 'x64' });
  assert.equal(target, path.join(options.output, 'win32/x64'));
  assert.deepEqual(YAML.parse(await fs.readFile(path.join(target, 'latest.yml'), 'utf8')), options.manifest);
  assert.deepEqual(await fs.readFile(path.join(target, options.name)), await fs.readFile(path.join(options.source, options.name)));
});
test('release preparation rejects corrupt packages before publishing metadata', async t => {
  const options = await fixture(t);
  await fs.appendFile(path.join(options.source, options.name), 'corrupt');
  const { prepareSoftwareUpdate } = await import('../scripts/prepare-software-update.mjs');
  await assert.rejects(prepareSoftwareUpdate({ ...options, platform: 'win32', arch: 'x64' }), /SHA512/);
  await assert.rejects(fs.stat(options.output), { code: 'ENOENT' });
});
test('release preparation rejects directory traversal and remote file references', async t => {
  const options = await fixture(t);
  const { prepareSoftwareUpdate } = await import('../scripts/prepare-software-update.mjs');
  for (const url of ['../secret.zip', '%2e%2e%2fsecret.zip', 'https://example.com/file.zip', '..\\secret.zip']) {
    options.manifest.files[0].url = url;
    await options.write();
    await assert.rejects(prepareSoftwareUpdate({ ...options, platform: 'win32', arch: 'x64' }), /发布目录/);
  }
});
test('mac release generates metadata from the same final DMG used for website downloads', async t => {
  const options = await fixture(t);
  const name = 'OneLinkAI-0.4.0-arm64-notarized.dmg';
  await fs.rename(path.join(options.source, options.name), path.join(options.source, name));
  const { prepareSoftwareUpdate } = await import('../scripts/prepare-software-update.mjs');
  const output = await prepareSoftwareUpdate({ ...options, platform: 'darwin', arch: 'arm64', version: '0.4.0' });
  const info = YAML.parse(await fs.readFile(path.join(output, 'latest-mac.yml'), 'utf8'));
  assert.equal(info.version, '0.4.0');
  assert.equal(info.files.length, 1);
  assert.equal(info.files[0].url, name);
  assert.equal(info.files[0].sha512, options.manifest.files[0].sha512);
  assert.deepEqual(await fs.readFile(path.join(output, name)), await fs.readFile(path.join(options.source, name)));
  assert.equal((await fs.readdir(output)).some(file => file.endsWith('.zip')), false);
});
test('mac release rejects ZIP-only or ambiguous release directories', async t => {
  const options = await fixture(t);
  const { prepareSoftwareUpdate } = await import('../scripts/prepare-software-update.mjs');
  await assert.rejects(prepareSoftwareUpdate({ ...options, platform: 'darwin', arch: 'arm64' }), /唯一的 DMG/);
  await fs.writeFile(path.join(options.source, 'one.dmg'), 'one');
  await fs.writeFile(path.join(options.source, 'two.dmg'), 'two');
  await assert.rejects(prepareSoftwareUpdate({ ...options, platform: 'darwin', arch: 'arm64' }), /唯一的 DMG/);
});
test('manifest filenames match the installed generic provider platform convention', async () => {
  const { manifestName } = await import('../scripts/prepare-software-update.mjs');
  assert.equal(manifestName('darwin', 'arm64'), 'latest-mac.yml');
  assert.equal(manifestName('win32', 'x64'), 'latest.yml');
  assert.equal(manifestName('linux', 'x64'), 'latest-linux.yml');
  assert.equal(manifestName('linux', 'arm64'), 'latest-linux-arm64.yml');
  assert.throws(() => manifestName('../darwin', 'arm64'));
});
