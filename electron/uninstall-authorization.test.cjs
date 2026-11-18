const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { windowsAuthorizationScript, runAuthorized } = require('./uninstall-authorization.cjs');

function decodeAuthorization(args) {
  assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  const outer = Buffer.from(args[3], 'base64').toString('utf16le');
  assert.match(outer, /-Verb RunAs -WindowStyle Hidden -PassThru -Wait/);
  const encoded = outer.match(/'-EncodedCommand', '([^']+)'/)[1];
  const child = Buffer.from(encoded, 'base64').toString('utf16le');
  const output = child.match(/Out-File -LiteralPath '((?:''|[^'])*)' -Encoding utf8/)[1].replaceAll("''", "'");
  return { outer, child, output };
}

for (const outcome of ['success', 'failure', 'cancel']) test(`Windows administrator authorization handles ${outcome} and cleans temporary logs`, async () => {
  let output;
  const result = runAuthorized(async (file, args, options) => {
    assert.equal(file, 'powershell.exe');
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 180000);
    ({ output } = decodeAuthorization(args));
    if (outcome === 'cancel') throw Object.assign(new Error('Start-Process failed'), { code: 1223 });
    await fs.writeFile(output, outcome === 'failure' ? 'npm error EPERM: file is still in use' : 'removed 1 package');
    if (outcome === 'failure') throw new Error('Command failed');
    return { stdout: '', stderr: '' };
  }, 'C:\\Program Files\\nodejs\\node.exe', ['npm-cli.js', 'uninstall', '--global', 'openclaw'], 'win32');
  if (outcome === 'success') await result;
  else await assert.rejects(result, outcome === 'cancel' ? /用户取消/ : /file is still in use/);
  await assert.rejects(fs.access(path.dirname(output)), { code: 'ENOENT' });
});

for (const code of [0, 23]) test(`Windows authorization payload preserves arguments and returns native exit code ${code}`, { skip: process.platform !== 'win32' }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onekey-auth-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, "client ' & test.cjs");
  const output = path.join(directory, "npm ' & output.log");
  await fs.writeFile(script, 'console.log(JSON.stringify(process.argv.slice(3))); console.error("stderr captured"); process.exit(Number(process.argv[2]));');
  const values = ["a'b", 'dollar$HOME', '$(Write-Output injected)', 'a;b & c', '--global', 'C:\\Program Files\\node_global'];
  const outer = windowsAuthorizationScript(process.execPath, [script, String(code), ...values], output);
  const encoded = outer.match(/'-EncodedCommand', '([^']+)'/)[1];
  // Run only the harmless child payload; this test never requests UAC elevation.
  const action = promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 15000 });
  if (code) await assert.rejects(action, error => error.code === code);
  else await action;
  const log = await fs.readFile(output, 'utf8');
  const json = log.split(/\r?\n/).map(line => line.trim()).find(line => line.startsWith('['));
  assert.deepEqual(JSON.parse(json), values);
  assert.match(log, /stderr captured/);
});
