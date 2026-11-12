const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const enabled = process.platform === 'darwin';
let root, launcher;
before(async () => {
  if (!enabled) return;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-launcher-tests-'));
  launcher = path.join(root, 'launcher');
  await execute('xcrun', ['clang', '-fobjc-arc', '-mmacosx-version-min=12.0', '-framework', 'AppKit', '-framework', 'Foundation', path.join(__dirname, 'native/launcher.m'), '-o', launcher]);
});
after(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });
async function fixture(name, script) {
  const app = path.join(root, name + '.app');
  const macos = path.join(app, 'Contents/MacOS');
  await fs.mkdir(macos, { recursive: true });
  await fs.writeFile(path.join(app, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>cloud.onelinkai.launcher.test</string><key>CFBundleExecutable</key><string>OneLinkAI</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>test-version</string></dict></plist>');
  const binary = path.join(macos, 'OneLinkAI');
  await fs.copyFile(launcher, binary);
  await fs.chmod(binary, 0o755);
  if (script !== undefined) await fs.writeFile(path.join(macos, 'OneLinkAI Runtime'), '#!/bin/sh\n' + script, { mode: 0o755 });
  return binary;
}
test('native launcher preserves argument boundaries, unicode, stdout and success status', { skip: !enabled }, async () => {
  const binary = await fixture('args', 'printf "%s\\n" "$@"\n');
  const args = ['--smoke-test', 'space in value', '中文参数', '--user-data-dir=/tmp/profile with spaces'];
  const { stdout } = await execute(binary, args, { timeout: 10000 });
  assert.equal(stdout, args.join('\n') + '\n');
});
test('native launcher captures a missing runtime before Electron or JavaScript can start', { skip: !enabled }, async () => {
  const binary = await fixture('missing');
  await assert.rejects(execute(binary, ['--smoke-test'], { timeout: 10000 }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Runtime launch failed/);
    assert.match(error.stderr, /OneLinkAI Runtime/);
    return true;
  });
});
test('native launcher preserves failure code and redacts credentials in the failure report', { skip: !enabled }, async () => {
  const binary = await fixture('failure', 'printf "Library not loaded: fixture.dylib\\napi_key=sk-secret-fixture\\nAuthorization: Bearer token-fixture\\n" >&2\nexit 23\n');
  await assert.rejects(execute(binary, ['--smoke-test'], { timeout: 10000 }), error => {
    assert.equal(error.code, 23);
    const report = error.stderr.slice(error.stderr.lastIndexOf('OneLinkAI test-version'));
    assert.match(report, /Runtime exit: 23/);
    assert.match(report, /Library not loaded/);
    assert.match(report, /\[redacted\]/);
    assert.ok(!report.includes('sk-secret-fixture'));
    assert.ok(!report.includes('token-fixture'));
    return true;
  });
});
test('native launcher records a runtime signal rather than treating it as a normal exit', { skip: !enabled }, async () => {
  const binary = await fixture('signal', 'kill -TERM $$\n');
  await assert.rejects(execute(binary, ['--smoke-test'], { timeout: 10000 }), error => {
    assert.equal(error.code, 143);
    assert.match(error.stderr, /143 \(signal\)/);
    return true;
  });
});
