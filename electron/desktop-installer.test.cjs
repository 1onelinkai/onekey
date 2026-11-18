const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { desktops, resolveArtifact, installDesktop } = require('./desktop-installer.cjs');

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

for (const [client, spec] of Object.entries(desktops))
for (const format of client === 'vscode' ? ['zip'] : ['zip', 'dmg'])
for (const failure of [null, 'signature', 'verification']) test(`${client} ${format}: cleanup cannot replace ${failure || 'successful installation'}`, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'workbuddy-cleanup-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'managed');
  const cache = path.join(root, 'downloads');
  await fs.mkdir(cache, { recursive: true });
  const data = Buffer.from('verified-workbuddy-fixture');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  await fs.writeFile(path.join(cache, hash + '.' + format), data);
  const logs = []; const state = {}; const cleanupCalls = [];
  const destination = path.join(home, 'Applications', spec.app);
  const options = { client, home, root, system: { platform: 'darwin', arch: 'arm64' }, state, log: text => logs.push(text),
    fetcher: async url => {
      assert.equal(url, client === 'workbuddy' ? 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-arm64' : `https://formulae.brew.sh/api/cask/${spec.cask}.json`);
      return { ok: true, json: async () => ({ url: `https://${spec.host}/fixture-arm64.${format}`, sha256: hash, sha256hash: hash }) };
    },
    execute: async (file, args) => {
      if ((file.endsWith('ditto') && args[0] === '-x') || (file.endsWith('hdiutil') && args[0] === 'attach')) {
        const unpacked = args[0] === 'attach' ? args[args.indexOf('-mountpoint') + 1] : args.at(-1);
        await fs.mkdir(path.join(unpacked, spec.app, 'Contents/Resources'), { recursive: true });
        await fs.writeFile(path.join(unpacked, spec.app, 'Contents/Resources/app.txt'), 'installed');
      } else if (file.endsWith('hdiutil') && args[0] === 'detach') {
        await fs.rm(args[1], { recursive: true, force: true });
      } else if (file.endsWith('ditto')) await fs.cp(args[0], args[1], { recursive: true });
      else if (file.endsWith('codesign') && failure === 'signature') throw new Error('signature invalid');
      else if (file.endsWith('PlistBuddy')) return args[1].includes('Executable') ? 'WorkBuddy' : args[1].includes('Minimum') ? '11.0' : '5.11.3';
      else if (file.endsWith('lipo')) return 'arm64';
      else if (file.endsWith('sw_vers')) return '15.7.3';
      return '';
    },
    detect: async () => failure === 'verification' ? [] : [{ id: client, installed: true, bundle: destination }],
    removeDirectory: async (directory, settings) => {
      cleanupCalls.push({ directory, settings });
      throw Object.assign(new Error('ENOTEMPTY: directory not empty'), { code: 'ENOTEMPTY' });
    },
  };
  if (failure) await assert.rejects(installDesktop(options), failure === 'signature' ? /signature invalid/ : /安装后检测失败/);
  else {
    await installDesktop(options);
    assert.equal(state.detected.bundle, destination);
    assert.equal(await fs.readFile(path.join(destination, 'Contents/Resources/app.txt'), 'utf8'), 'installed');
    assert.ok(logs.some(line => line.includes('安装完成')));
  }
  assert.ok(logs.some(line => line.includes('临时文件清理未完成')));
  assert.ok(cleanupCalls.some(call => path.dirname(call.directory) === root));
  if (failure !== 'signature') assert.ok(cleanupCalls.some(call => path.dirname(call.directory) === path.join(home, 'Applications')));
  assert.ok(cleanupCalls.every(call => call.settings.maxRetries === 3 && call.settings.retryDelay === 100));
  assert.equal(state.routes.downloads[0].available, true);
  assert.equal(state.routes.downloads[0].selected, true);
  if (failure === 'signature') await assert.rejects(fs.access(destination), { code: 'ENOENT' });
});
