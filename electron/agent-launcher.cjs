const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const desktopClients = new Set(['claude-desktop', 'deepseek-harness-desktop', 'vscode', 'zed', 'zcode', 'workbuddy']);
const quoteShell = value => "'" + value.replaceAll("'", "'\\''") + "'";
const quotePowerShell = value => "'" + value.replaceAll("'", "''") + "'";
const encoded = value => Buffer.from(value, 'utf16le').toString('base64');

async function startDetached(file, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(file, args, { ...options, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function createAgentLauncher({ detect, history = async () => [], openPath, home = os.homedir(),
  platform = process.platform, env = process.env, execute = promisify(execFile), start = startDetached } = {}) {
  // Only a client id crosses IPC. Always resolve the launch target in the main process.
  async function launch(client) {
    if (typeof client !== 'string') throw new Error('请选择需要打开的客户端');
    const item = (await detect()).find(value => value.id === client);
    if (!item?.installed) throw new Error('未检测到已安装的客户端，请重新检测后再打开');
    if (item.bundle) {
      const error = await openPath(item.bundle);
      if (error) throw new Error('打开桌面应用失败：' + error);
      return { kind: 'desktop', message: '已请求打开桌面应用' };
    }
    const file = item.executable;
    if (typeof file !== 'string' || !path.isAbsolute(file) || /[\r\n\0]/.test(file))
      throw new Error('客户端启动路径无效，请重新检测');
    const options = { cwd: home, env: { ...env } };
    if (desktopClients.has(client)) {
      if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(file))
        await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded(`$ErrorActionPreference = 'Stop'\n& ${quotePowerShell(file)}`)], { ...options, timeout: 15000, windowsHide: true });
      else await start(file, [], options);
      return { kind: 'desktop', message: '已请求打开桌面应用' };
    }
    const args = [];
    if (client === 'deepseek-harness') {
      const entry = (await history()).find(value => value.client === client && !value.restored);
      const profile = entry?.dshProfile ?? 'web';
      if (typeof profile !== 'string' || !/^[a-zA-Z0-9][\w-]{0,63}$/.test(profile) || profile.toLowerCase() === 'desktop')
        throw new Error('DSH CLI profile 无效，请重新配置后启动');
      args.push('--profile', profile);
    }
    // Managed shims use an independent runtime; also include it for subprocesses.
    const paths = [path.dirname(file), path.join(home, '.onelinkai/managed/bin'),
      path.join(home, '.onelinkai/managed/runtime', platform === 'win32' ? '' : 'bin')];
    const configEnvironment = Object.entries(env).filter(([name, value]) =>
      ['DSH_HOME', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'GEMINI_CLI_HOME', 'GROK_CONFIG_DIR',
        'OPENCLAW_CONFIG_PATH', 'OPENCLAW_STATE_DIR', 'OPENCLAW_HOME', 'PI_CODING_AGENT_DIR', 'MINIMAX_DATA_DIR', 'HERMES_HOME'].includes(name) && typeof value === 'string');
    if (platform === 'win32') {
      const configScript = configEnvironment.map(([name, value]) => `$env:${name} = ${quotePowerShell(value)}`).join('\n');
      const launchScript = `${configScript}\n$env:Path = ${quotePowerShell(paths.join(';') + ';')} + $env:Path\nSet-Location -LiteralPath ${quotePowerShell(home)}\n& ${[file, ...args].map(quotePowerShell).join(' ')}`;
      const script = `$ErrorActionPreference = 'Stop'\nStart-Process powershell.exe -WorkingDirectory ${quotePowerShell(home)} -ArgumentList @('-NoExit', '-EncodedCommand', '${encoded(launchScript)}')`;
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded(script)], { ...options, timeout: 15000, windowsHide: true });
    } else {
      const assignments = configEnvironment.map(([name, value]) => `${name}=${quoteShell(value)}`).join(' ');
      const command = `cd ${quoteShell(home)} && PATH=${quoteShell(paths.join(':'))}:"$PATH" ${assignments} ${[file, ...args].map(quoteShell).join(' ')}`;
      if (platform === 'darwin') {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-agent-launch-'));
        const script = path.join(dir, 'launch.command');
        const cleanup = `rm -f ${quoteShell(script)}; rmdir ${quoteShell(dir)}`;
        await fs.writeFile(script, `#!/bin/sh\ntrap ${quoteShell(cleanup)} EXIT\n${command}\n`, { mode: 0o700 });
        try { await execute('/usr/bin/open', ['-a', '/System/Applications/Utilities/Terminal.app', script], { ...options, timeout: 15000 }); }
        catch (error) {
          await fs.rm(dir, { recursive: true, force: true });
          throw new Error('打开终端失败：' + (error.stderr || error.message));
        }
      } else {
        await start('x-terminal-emulator', ['-e', 'sh', '-c', command + '; exec sh'], options);
      }
    }
    return { kind: 'terminal', message: client === 'deepseek-harness' ? `已请求在终端启动 DSH CLI · ${args[1]}` : '已请求在终端启动客户端' };
  }
  return { launch };
}
module.exports = { createAgentLauncher };
