const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const nodeRoutes = [
  { name: 'Node.js 官方', url: 'https://nodejs.org/dist/' },
  { name: 'npmmirror 国内镜像', url: 'https://npmmirror.com/mirrors/node/' },
  { name: '华为云 Node 镜像', url: 'https://mirrors.huaweicloud.com/nodejs/' },
];
const npmRoutes = [
  { name: 'npm 官方', url: 'https://registry.npmjs.org' },
  { name: 'npmmirror 国内镜像', url: 'https://registry.npmmirror.com' },
  { name: '腾讯云 npm 镜像', url: 'https://mirrors.cloud.tencent.com/npm' },
];

async function probeRoutes(routes, suffix, validate, fetcher = fetch) {
  const results = await Promise.all(routes.map(async route => {
    const start = performance.now();
    try {
      const response = await fetcher(route.url + suffix, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.text();
      if (body.length > 8 * 1024 * 1024 || !validate(body)) throw new Error('响应格式无效');
      return { ...route, available: true, latency: Math.round(performance.now() - start), body };
    } catch (error) {
      return { ...route, available: false, error: error.message };
    }
  }));
  return results.sort((a, b) => Number(b.available) - Number(a.available) || (a.latency || Infinity) - (b.latency || Infinity));
}

const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const psQuote = value => "'" + value.replaceAll("'", "''") + "'";
async function configurePath({ home, bin, platform, execute, log, shell = process.env.SHELL }) {
  if (platform === 'win32') {
    if (/[\r\n%!"]/u.test(bin)) throw new Error('用户路径含不支持的命令字符');
    const script = `
$ErrorActionPreference = 'Stop'
$bin = ${psQuote(bin)}
$old = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @($old -split ';' | Where-Object { $_ })
if (-not ($parts | Where-Object { $_.TrimEnd('\\') -ieq $bin.TrimEnd('\\') })) {
  $backup = ${psQuote(path.join(home, '.onelinkai', 'managed', 'user-path-' + crypto.randomUUID() + '.json'))}
  @{path=$old} | ConvertTo-Json | Set-Content -LiteralPath $backup -Encoding UTF8
  [Environment]::SetEnvironmentVariable('Path', (($parts + $bin) -join ';'), 'User')
}
$saved = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($saved -split ';') | Where-Object { $_.TrimEnd('\\') -ieq $bin.TrimEnd('\\') })) { throw 'PATH verification failed' }
Add-Type -Namespace OneLink -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Auto, SetLastError=true)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr h, uint m, System.UIntPtr w, string l, uint f, uint t, out System.UIntPtr r);'
$result = [UIntPtr]::Zero
[void][OneLink.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
Write-Output 'User PATH verified'
`;
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
    log('已保存 Windows 用户 PATH 并广播环境更新；已打开的终端需重新打开');
    return;
  }
  if (/[\r\n\0]/.test(bin)) throw new Error('用户路径包含无效字符');
  const name = path.basename(shell || '/bin/zsh');
  const configs = name === 'zsh' ? ['.zshrc', '.zprofile'] : name === 'bash' ? ['.bashrc', '.bash_profile'] : [];
  if (!configs.length) throw new Error('当前 Shell 暂不支持自动配置 PATH：' + name);
  const suffix = bin.endsWith(path.join('.onelinkai', 'managed', 'bin')) ? '' : ' ' + crypto.createHash('sha256').update(bin).digest('hex').slice(0, 12);
  const start = '# >>> OneLinkAI managed PATH' + suffix + ' >>>';
  const end = '# <<< OneLinkAI managed PATH' + suffix + ' <<<';
  const block = `${start}\ncase ":$PATH:" in\n  *:${shellQuote(bin)}:*) ;;\n  *) export PATH=${shellQuote(bin)}:"$PATH" ;;\nesac\n${end}`;
  for (const config of configs) {
    const file = path.join(home, config);
    const stat = await fs.lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('Shell 配置不是普通文件，请手动检查：' + file);
    const original = stat ? await fs.readFile(file, 'utf8') : '';
    const first = original.indexOf(start);
    const last = original.indexOf(end);
    if ((first < 0) !== (last < 0) || (first >= 0 && last < first)) throw new Error('PATH 配置标记不完整：' + file);
    const next = first >= 0 ? original.slice(0, first) + block + original.slice(last + end.length) : original + (original.endsWith('\n') || !original ? '' : '\n') + '\n' + block + '\n';
    if (next !== original) {
      if (stat) {
        const backup = path.join(home, '.onelinkai', 'managed', config + '.' + crypto.randomUUID() + '.bak');
        await fs.copyFile(file, backup);
        await fs.chmod(backup, 0o600);
        log('Shell 配置备份：' + backup);
      }
      const tmp = file + '.onelink-' + crypto.randomUUID();
      try {
        await fs.writeFile(tmp, next, { mode: stat ? stat.mode & 0o777 : 0o600 });
        await fs.rename(tmp, file);
      } finally { await fs.rm(tmp, { force: true }); }
    }
    log('已配置用户 PATH：' + file);
  }
  // Verify in a clean shell without executing unrelated user startup commands.
  const output = await execute('/bin/' + name, ['-c', `${block}\nprintf '%s' "$PATH"`], { env: { ...process.env, PATH: '/usr/bin:/bin' } });
  if (!output.split(':').includes(bin)) throw new Error('Shell PATH 验证失败');
  log('Shell PATH 片段已验证；请重新打开终端使环境生效');
}

module.exports = { nodeRoutes, npmRoutes, probeRoutes, configurePath };
