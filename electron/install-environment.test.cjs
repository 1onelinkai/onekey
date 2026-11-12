const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const { probeRoutes, configurePath } = require('./install-environment.cjs');

test('route probes validate payloads and rank usable routes by response latency', async () => {
  const results = await probeRoutes([{ name: 'slow', url: 'https://slow' }, { name: 'fast', url: 'https://fast' }, { name: 'bad', url: 'https://bad' }], '/probe', body => body === 'valid', async url => {
    await new Promise(resolve => setTimeout(resolve, url.includes('slow') ? 40 : 1));
    return { ok: true, text: async () => url.includes('bad') ? 'invalid' : 'valid' };
  });
  assert.deepEqual(results.map(route => route.name), ['fast', 'slow', 'bad']);
  assert.equal(results[2].available, false);
});

test('Hermes and managed npm PATH entries coexist after either install order', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-path-coexist-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const managed = path.join(home, '.onelinkai/managed/bin');
  const hermes = path.join(home, '.local/bin');
  await fs.mkdir(path.dirname(managed), { recursive: true });
  const options = { home, platform: 'darwin', shell: '/bin/bash', log: () => {}, execute: async (...args) => (await execute(...args)).stdout };
  for (const bin of [managed, hermes, managed, hermes]) await configurePath({ ...options, bin });
  const text = await fs.readFile(path.join(home, '.bashrc'), 'utf8');
  const output = await execute('/bin/bash', ['-c', text + '\nprintf "%s" "$PATH"'], { env: { PATH: '/usr/bin:/bin' } });
  const paths = output.stdout.split(':');
  assert.equal(paths.filter(p => p === managed).length, 1);
  assert.equal(paths.filter(p => p === hermes).length, 1);
});

test('shell PATH setup preserves content, backs up once, and is idempotent with quoted paths', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "onelink env '"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, '.onelinkai/managed');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(home, '.bashrc'), 'export EXISTING=value\n');
  const bin = path.join(root, 'bin');
  const options = { home, bin, platform: 'darwin', shell: '/bin/bash', log: () => {}, execute: async (...args) => (await execute(...args)).stdout };
  await configurePath(options);
  const first = await fs.readFile(path.join(home, '.bashrc'), 'utf8');
  assert.ok(first.startsWith('export EXISTING=value\n'));
  await configurePath(options);
  assert.equal(await fs.readFile(path.join(home, '.bashrc'), 'utf8'), first);
  assert.equal((await fs.readdir(root)).filter(file => file.endsWith('.bak')).length, 1);
  await fs.writeFile(path.join(home, '.bash_profile'), '# >>> OneLinkAI managed PATH >>>');
  await assert.rejects(configurePath(options), /标记不完整/);
});
