const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const { createAgentService } = require('../electron/agents.cjs');

(async () => {
  const home = process.env.ONELINK_TEST_HOME;
  if (!home || !path.isAbsolute(home)) throw new Error('Set ONELINK_TEST_HOME to the isolated installation HOME');
  const root = path.join(home, '.onelinkai/managed');
  const results = [];
  const check = async (name, file, args, env = {}) => {
    try {
      const output = await execute(file, args, { timeout: 60000, maxBuffer: 1024 ** 2, env: { ...process.env, HOME: home, PATH: '/usr/bin:/bin', ...env } });
      results.push({ name, ok: true, stdout: output.stdout.slice(-4000), stderr: output.stderr.slice(-4000) });
    } catch (error) { results.push({ name, ok: false, error: error.message.slice(-4000) }); }
    console.log(name, results.at(-1).ok ? 'PASS' : 'FAIL');
  };
  for (const client of ['claude', 'codex', 'opencode', 'pi', 'gemini', 'openclaw', 'deepseek-harness', 'minimax', 'hermes']) {
    const file = client === 'hermes' ? path.join(home, '.local/bin/hermes') : path.join(root, 'bin', client);
    await check(client + ' version', file, ['--version']);
    await check(client + ' help', file, ['--help']);
  }
  const nativeScript = `
const {createRequire}=require('node:module');
const r=createRequire(process.argv[1]+'/package.json');
for(const name of process.argv.slice(2)) {
  const m=r(name);
  if(name==='better-sqlite3') {
    const db=new m(':memory:');
    if(db.prepare('select 1 as ok').get().ok!==1) throw new Error('SQLite query failed');
    db.close();
  }
  if(name==='node-pty') {
    const child=m.spawn('/bin/echo',['pty-ok'],{env:process.env});
    let text=''; child.onData(chunk=>text+=chunk);
    child.onExit(event=>{if(event.exitCode!==0||!text.includes('pty-ok'))process.exitCode=1;console.log(text)});
  }
  console.log(name+' loaded');
}`;
  for (const [pkg, ...dependencies] of [['@google/gemini-cli', 'node-pty', '@github/keytar'], ['@deepseek-ai/dsh', 'node-pty', 'koffi'], ['@minimax-ai/code', 'better-sqlite3'], ['openclaw', 'esbuild', 'koffi']]) {
    await check(pkg + ' native components', path.join(root, 'runtime/bin/node'), ['-e', nativeScript, path.join(root, 'clients/lib/node_modules', pkg), ...dependencies]);
  }
  await check('persisted shell PATH', '/bin/zsh', ['-c', 'source "$HOME/.zshrc"; command -v claude; command -v mcode; command -v hermes']);
  const agents = createAgentService({ home, dataDir: path.join(home, 'runtime-validation'), env: { ...process.env, HOME: home, PATH: '/usr/bin:/bin' }, applicationDirs: [] });
  const detected = (await agents.detect()).filter(item => item.installed && item.executable?.startsWith(home));
  const output = { home, testedAt: new Date().toISOString(), system: { platform: process.platform, arch: process.arch }, results, detected };
  await fs.writeFile(path.join(home, 'runtime-validation.json'), JSON.stringify(output, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
