// Only called with a command reconstructed from verified installation ownership.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
function authorizationScript(manager, args) {
  const command = [manager, ...args].map(quote).join(' ');
  // AppleScript string escaping is separate from POSIX shell argument escaping.
  const literal = '"' + command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
  return 'do shell script ' + literal + ' with administrator privileges';
}
const psQuote = value => "'" + value.replace(/'/g, "''") + "'";
function windowsAuthorizationScript(manager, args, outputFile) {
  // Only fixed PowerShell switches and an encoded payload cross Start-Process.
  // User paths and npm arguments remain individual PowerShell string literals.
  const child = `$ErrorActionPreference = 'Continue'
$env:Path = ${psQuote(path.dirname(manager) + ';')} + $env:Path
try {
  & ${psQuote(manager)} @(${args.map(psQuote).join(', ')}) 2>&1 | Out-File -LiteralPath ${psQuote(outputFile)} -Encoding utf8 -ErrorAction Stop
  if ($null -eq $LASTEXITCODE) { exit 1 }
  exit $LASTEXITCODE
} catch {
  $_ | Out-File -LiteralPath ${psQuote(outputFile)} -Append -Encoding utf8
  exit 1
}`;
  const encoded = Buffer.from(child, 'utf16le').toString('base64');
  return `$ErrorActionPreference = 'Stop'
try {
  $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', '${encoded}') -Verb RunAs -WindowStyle Hidden -PassThru -Wait
  exit $process.ExitCode
} catch {
  $cause = $_.Exception
  while ($null -ne $cause) {
    if ($cause.NativeErrorCode -eq 1223) {
      [Console]::Error.WriteLine('ONEKEY_AUTHORIZATION_CANCELLED')
      exit 1223
    }
    $cause = $cause.InnerException
  }
  throw
}`;
}
async function runAuthorized(execute, manager, args, platform = 'darwin') {
  if (platform === 'win32') {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onekey-uninstall-'));
    const outputFile = path.join(directory, 'npm-output.log');
    try {
      const script = windowsAuthorizationScript(manager, args, outputFile);
      return await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 180000, windowsHide: true });
    } catch (error) {
      if (error.code === 1223 || /ONEKEY_AUTHORIZATION_CANCELLED/.test([error.message, error.stderr].join(' '))) {
        throw Object.assign(new Error('用户取消 Windows 管理员授权'), { code: 'AUTHORIZATION_CANCELLED' });
      }
      const output = await fs.readFile(outputFile, 'utf8').catch(() => '');
      throw new Error(output.trim().slice(-8000) || error.stderr || error.message || '管理员授权后未能完成卸载');
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }
  return execute('/usr/bin/osascript', ['-e', authorizationScript(manager, args)], { timeout: 180000 });
}
module.exports = { authorizationScript, windowsAuthorizationScript, runAuthorized };
