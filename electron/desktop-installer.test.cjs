const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveArtifact, installDesktop } = require('./desktop-installer.cjs');

test('desktop metadata selects correct architecture and rejects untrusted URLs or missing hash', () => {
  const metadata = { url: 'https://github.com/zed-industries/zed/releases/download/v1/Zed-aarch64.dmg', sha256: 'a'.repeat(64), variations: { sonoma: { url: 'https://github.com/zed-industries/zed/releases/download/v1/Zed-x86_64.dmg', sha256: 'b'.repeat(64) } } };
  assert.match(resolveArtifact('zed', metadata, 'arm64').url, /aarch64/);
  assert.equal(resolveArtifact('zed', metadata, 'x64').sha256, 'b'.repeat(64));
  assert.throws(() => resolveArtifact('zed', { ...metadata, url: 'https://evil.test/zed.dmg' }, 'arm64'), /官方地址/);
  assert.throws(() => resolveArtifact('zed', { ...metadata, sha256: 'no_check' }, 'arm64'), /SHA-256/);
  assert.throws(() => resolveArtifact('zed', { ...metadata, variations: {} }, 'x64'), /Intel/);
  assert.throws(() => resolveArtifact('zed', metadata, 'ia32'), /架构/);
  assert.match(resolveArtifact('claude-desktop', { url: 'https://downloads.claude.ai/releases/darwin/universal/1/Claude.zip', sha256: 'a'.repeat(64) }, 'arm64').url, /universal/);
});

test('desktop corrupt downloads never reach extraction or applications directory', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-failure-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'managed'); await fs.mkdir(root);
  let executed = false;
  await assert.rejects(installDesktop({ client: 'vscode', home, root, system: { platform: 'darwin', arch: 'arm64' }, state: {}, log: () => {}, detect: async () => [],
    execute: async () => { executed = true; }, fetcher: async url => url.includes('/api/cask/') ? { ok: true, json: async () => ({ url: 'https://update.code.visualstudio.com/1/darwin-arm64/stable', sha256: 'a'.repeat(64) }) } : { ok: true, body: [Buffer.from('corrupt')] },
  }), /所有安装包线路失败/);
  assert.equal(executed, false);
  assert.deepEqual(await fs.readdir(root), ['downloads']);
  await assert.rejects(fs.access(path.join(home, 'Applications')));
});

test('desktop signature failure prevents installation and cleans staging', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-signature-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'managed'); await fs.mkdir(root);
  const data = Buffer.from('fixture');
  await assert.rejects(installDesktop({ client: 'vscode', home, root, system: { platform: 'darwin', arch: 'arm64' }, state: {}, log: () => {}, detect: async () => [],
    execute: async file => { if (file.endsWith('codesign')) throw new Error('signature invalid'); return ''; },
    fetcher: async url => url.includes('/api/cask/') ? { ok: true, json: async () => ({ url: 'https://update.code.visualstudio.com/1/darwin-arm64/stable', sha256: crypto.createHash('sha256').update(data).digest('hex') }) } : { ok: true, body: [data] },
  }), /signature invalid/);
  assert.deepEqual(await fs.readdir(root), ['downloads']);
  await assert.rejects(fs.access(path.join(home, 'Applications')));
});

test('interrupted desktop download resumes at saved offset and validates complete hash', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-resume-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'managed'); await fs.mkdir(root);
  const data = Buffer.from('first-second');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  let attempt = 0;
  const options = { client: 'vscode', home, root, system: { platform: 'darwin', arch: 'arm64' }, state: {}, log: () => {}, detect: async () => [],
    execute: async file => { if (file.endsWith('codesign')) throw new Error('reached extraction'); return ''; },
    fetcher: async (url, request) => {
      if (url.includes('/api/cask/')) return { ok: true, json: async () => ({ url: 'https://update.code.visualstudio.com/1/darwin-arm64/stable', sha256: hash }) };
      attempt++;
      if (attempt === 1) return { ok: true, status: 200, body: (async function* () { yield data.subarray(0, 6); throw new Error('connection reset'); })() };
      assert.equal(request.headers.Range, 'bytes=6-');
      return { ok: true, status: 206, headers: new Headers({ 'content-range': 'bytes 6-11/12' }), body: [data.subarray(6)] };
    },
  };
  await assert.rejects(installDesktop(options), /所有安装包线路失败/);
  await assert.rejects(installDesktop(options), /reached extraction/);
  assert.deepEqual(await fs.readFile(path.join(root, 'downloads', hash + '.zip')), data);
});
