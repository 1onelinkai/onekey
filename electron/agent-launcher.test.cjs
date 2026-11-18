const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { createAgentLauncher, launchChoices } = require('./agent-launcher.cjs');
const cliClients = Object.keys(require('../src/client-capabilities.json')).filter(id =>
  launchChoices({ id, executable: '/test/client' }).some(choice => choice.kind === 'cli'));

test('desktop bundle opens directly and propagates system errors', async () => {
  const bundle = '/Applications/DeepSeek Harness.app';
  let opened, error = '';
  const service = createAgentLauncher({ detect: async () => [{ id: 'deepseek-harness-desktop', installed: true, bundle }],
    openPath: async file => { opened = file; return error; }, execute: async () => assert.fail('must not launch CLI'),
  });
  assert.equal((await service.launch('deepseek-harness-desktop')).kind, 'desktop');
  assert.equal(opened, bundle);
  error = 'application unavailable'; await assert.rejects(service.launch('deepseek-harness-desktop'), /application unavailable/);
});

test('uninstalled and unknown clients cannot supply arbitrary launch paths', async () => {
  const service = createAgentLauncher({ detect: async () => [{ id: 'codex', installed: false }], openPath: async () => assert.fail() });
  for (const client of ['codex', '/tmp/payload', { id: 'codex', executable: '/tmp/payload' }])
    await assert.rejects(service.launch(client), /请选择|未检测到/);
});

test('macOS CLI command preserves special characters and arguments without shell injection', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-launch-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, "space '中文 $() `home`"); await fs.mkdir(home);
  const file = path.join(home, "dsh ' $(touch injected) `quote`");
  await fs.writeFile(file, '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n', { mode: 0o700 });
  let script;
  const service = createAgentLauncher({ home, env: {}, platform: 'darwin',
    detect: async () => [{ id: 'deepseek-harness', installed: true, executable: file }],
    history: async () => [{ client: 'deepseek-harness', restored: true, dshProfile: 'old' }, { client: 'deepseek-harness', dshProfile: 'custom-Web' }],
    execute: async (program, args) => { assert.equal(program, '/usr/bin/open'); assert.deepEqual(args.slice(0, 2), ['-a', '/System/Applications/Utilities/Terminal.app']); script = path.join(path.dirname(args[2]), 'launch.sh'); },
  });
  const result = await service.launch('deepseek-harness');
  assert.match(result.message, /custom-Web/);
  assert.equal((await fs.stat(script)).mode & 0o777, 0o700);
  const profile = await fs.readFile(path.join(path.dirname(script), 'One Key CLI.terminal'), 'utf8');
  assert.match(profile, /<key>RunCommandAsShell<\/key><true\/>/);
  assert.match(profile, /<key>CommandString<\/key><string>.*launch\.sh<\/string>/);
  const { stdout } = await exec('/bin/sh', [script]);
  assert.deepEqual(stdout.trimEnd().split('\n'), [home, '--profile', 'custom-Web']);
  await assert.rejects(fs.access(path.join(home, 'injected')), { code: 'ENOENT' });
  await assert.rejects(fs.access(script), { code: 'ENOENT' });
});

test('macOS failed terminal request removes the temporary launcher and reports failure', async () => {
  let script;
  const service = createAgentLauncher({ home: '/tmp', platform: 'darwin', env: {},
    detect: async () => [{ id: 'codex', installed: true, executable: '/bin/echo' }],
    execute: async (_file, args) => { script = path.join(path.dirname(args[2]), 'launch.sh'); throw new Error('Terminal unavailable'); },
  });
  await assert.rejects(service.launch('codex'), /Terminal unavailable/);
  await assert.rejects(fs.access(script), { code: 'ENOENT' });
});

test('Windows opens a separate PowerShell with encoded literal paths and managed runtime', async () => {
  let outer;
  const home = "C:\\Users\\中文 O'Brian";
  const service = createAgentLauncher({ home, platform: 'win32', env: {},
    detect: async () => [{ id: 'deepseek-harness', installed: true, executable: path.join(os.tmpdir(), 'dsh.cmd') }],
    execute: async (file, args) => { assert.equal(file, 'powershell.exe'); outer = Buffer.from(args.at(-1), 'base64').toString('utf16le'); },
  });
  await service.launch('deepseek-harness');
  assert.match(outer, /Start-Process powershell.exe/);
  const payload = outer.match(/'-EncodedCommand', '([^']+)'/)[1];
  const inner = Buffer.from(payload, 'base64').toString('utf16le');
  assert.match(inner, /--profile' 'web/); assert.ok(inner.includes("O''Brian"));
  assert.match(inner, /managed/); assert.match(inner, /runtime/);
});

test('invalid DSH profiles fail before starting a terminal', async () => {
  for (const profile of ['Desktop', '../web', '', 'web; touch injected']) {
    const service = createAgentLauncher({ detect: async () => [{ id: 'deepseek-harness', installed: true, executable: '/bin/echo' }],
      history: async () => [{ client: 'deepseek-harness', dshProfile: profile }], execute: async () => assert.fail(),
    });
    await assert.rejects(service.launch('deepseek-harness'), /profile 无效/);
  }
});

test('editor executable opens as a desktop process; CLI on Linux opens in terminal', async () => {
  const calls = [];
  const service = createAgentLauncher({ platform: 'linux', home: '/tmp', env: {},
    detect: async () => [{ id: 'vscode', installed: true, executable: '/usr/bin/code' }, { id: 'codex', installed: true, executable: '/usr/bin/codex' }],
    start: async (...args) => calls.push(args),
  });
  await service.launch('vscode'); assert.equal(calls[0][0], '/usr/bin/code'); assert.deepEqual(calls[0][1], []);
  await service.launch('codex'); assert.equal(calls[1][0], 'x-terminal-emulator'); assert.ok(calls[1][1].at(-1).includes('/usr/bin/codex'));
});

test('terminal launch carries the configured DSH_HOME without exposing API keys', async t => {
  let script;
  const env = { DSH_HOME: "/tmp/custom dsh 'home'", ONELINK_API_KEY: 'sk-never-copy-secret' };
  const service = createAgentLauncher({ home: '/tmp', platform: 'darwin', env,
    detect: async () => [{ id: 'deepseek-harness', installed: true, executable: '/bin/echo' }],
    execute: async (_file, args) => { script = path.join(path.dirname(args[2]), 'launch.sh'); },
  });
  await service.launch('deepseek-harness');
  t.after(() => fs.rm(path.dirname(script), { recursive: true, force: true }));
  const content = await fs.readFile(script, 'utf8');
  assert.ok(content.includes('DSH_HOME=')); assert.ok(content.includes('custom dsh'));
  assert.equal(content.includes('sk-never-copy-secret'), false);
});

test('Windows editor command shim uses PowerShell and never spawns a cmd file directly', async () => {
  let payload;
  const service = createAgentLauncher({ home: '/tmp', platform: 'win32', env: {},
    detect: async () => [{ id: 'vscode', installed: true, executable: '/tmp/VS Code/code.cmd' }],
    execute: async (file, args) => { assert.equal(file, 'powershell.exe'); payload = Buffer.from(args.at(-1), 'base64').toString('utf16le'); },
    start: async () => assert.fail('Node cannot directly spawn a cmd file'),
  });
  assert.equal((await service.launch('vscode')).kind, 'desktop');
  assert.match(payload, /& '\/tmp\/VS Code\/code.cmd'/);
});

test('dual Codex installation offers choice and resolves selected target in main process', async () => {
 let opened, terminal=0;
 const service=createAgentLauncher({platform:'linux',home:'/tmp',env:{},detect:async()=>[{id:'codex',installed:true,bundle:'/Applications/Codex.app',executable:'/usr/bin/codex'}],openPath:async file=>{opened=file;return '';},start:async()=>{terminal++;}});
 assert.deepEqual((await service.launch('codex')).choices.map(x=>x.kind),['desktop','cli']);
 assert.equal((await service.launch({client:'codex',target:'desktop'})).kind,'desktop');assert.equal(opened,'/Applications/Codex.app');
 assert.equal((await service.launch({client:'codex',target:'cli'})).kind,'terminal');assert.equal(terminal,1);
 await assert.rejects(service.launch({client:'codex',target:'/tmp/evil'}),/启动方式/);
});

for (const client of cliClients) test(`macOS Terminal starts ${client} directly with a TTY, runtime PATH and literal home`, { skip: process.platform !== 'darwin' || process.env.ONEKEY_TERMINAL_TEST !== '1' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-terminal-regression-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, "中文 'space $() & <home>");
  await fs.mkdir(home);
  const executable = path.join(home, client);
  const output = path.join(root, 'result.json');
  await fs.writeFile(executable, '#!/usr/bin/env node\n' + `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const grandparentPid = execFileSync('/bin/ps', ['-p', String(process.ppid), '-o', 'ppid='], { encoding: 'utf8' }).trim();
fs.writeFileSync(${JSON.stringify(output)}, JSON.stringify({ tty: process.stdin.isTTY, cwd: process.cwd(),
  parent: execFileSync('/bin/ps', ['-p', String(process.ppid), '-o', 'command='], { encoding: 'utf8' }).trim(),
  grandparent: execFileSync('/bin/ps', ['-p', grandparentPid, '-o', 'command='], { encoding: 'utf8' }).trim(),
  config: process.env.GEMINI_CLI_HOME, dshHome: process.env.DSH_HOME, args: process.argv.slice(2) }));
`, { mode: 0o700 });
  let profile;
  const service = createAgentLauncher({ home, platform: 'darwin', env: { PATH: path.dirname(process.execPath), GEMINI_CLI_HOME: path.join(home, '.gemini'), DSH_HOME: path.join(home, '.dsh') },
    detect: async () => [{ id: client, installed: true, executable }],
    history: async () => [{ client: 'deepseek-harness', dshProfile: 'custom-Web' }],
    execute: async (file, args, options) => { profile = args[2]; return exec(file, args, options); },
  });
  t.after(async () => { if (profile) await fs.rm(path.dirname(profile), { recursive: true, force: true }); });
  await service.launch(client);
  let result;
  for (let i = 0; i < 100; i++) {
    try { result = JSON.parse(await fs.readFile(output, 'utf8')); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(result, 'Terminal must actually execute the CLI');
  assert.equal(result.tty, true);
  assert.equal(result.cwd, await fs.realpath(home));
  assert.equal(result.config, path.join(home, '.gemini'));
  assert.equal(result.dshHome, path.join(home, '.dsh'));
  assert.deepEqual(result.args, client === 'deepseek-harness' ? ['--profile', 'custom-Web'] : []);
  assert.match(result.parent, /^\/bin\/sh .*launch\.sh$/);
  assert.match(result.grandparent, /^(?:login -.*launch\.sh|.*Terminal\.app\/Contents\/MacOS\/Terminal)$/);
  for (let i = 0; i < 50; i++) {
    if (!await fs.access(profile).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await assert.rejects(fs.access(profile), { code: 'ENOENT' });
});
