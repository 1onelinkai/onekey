const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { windowsGitEnvironment } = require('./windows-git.cjs');
const releaseURL = 'https://api.github.com/repos/git-for-windows/git/releases/latest';
const psQuote = value => "'" + value.replaceAll("'", "''") + "'";
async function ensureWindowsGit({ root, system, env, execute, fetcher, log, state }) {
  const target = path.join(root, 'git');
  try { return await windowsGitEnvironment(env, execute, [target]); }
  catch { log('未找到可用的 Git Bash，准备自动安装官方 Git for Windows'); }
  if (!['x64', 'arm64'].includes(system.arch)) throw new Error('Git for Windows 不支持当前架构');
  // Do not replace an existing tree whose ownership or health is unknown.
  try { await fs.lstat(target); throw new Error('托管 Git 目录已存在但校验未通过，请移走该目录后重试：' + target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = await fs.mkdtemp(path.join(root, 'git-install-'));
  let published = false;
  try {
    state.phase = 'git';
    const response = await fetcher(releaseURL, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error('Git 官方版本接口：HTTP ' + response.status);
    const release = await response.json();
    const suffix = system.arch === 'arm64' ? 'arm64' : '64-bit';
    const asset = release.assets?.find(item => new RegExp('^PortableGit-[0-9.]+-' + suffix + '\\.7z\\.exe$').test(item.name));
    const url = asset && new URL(asset.browser_download_url);
    if (release.draft || release.prerelease || !asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') || url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/git-for-windows/git/releases/download/')) throw new Error('Git 官方安装包信息或 SHA-256 无效');
    log('下载官方 ' + asset.name);
    const download = await fetcher(url.href, { signal: AbortSignal.timeout(5 * 60 * 1000), redirect: 'follow' });
    if (!download.ok) throw new Error('Git 安装包下载：HTTP ' + download.status);
    const installer = path.join(staging, 'PortableGit.exe');
    const handle = await fs.open(installer, 'wx');
    const hash = crypto.createHash('sha256');
    let size = 0;
    try { for await (const chunk of download.body) {
      size += chunk.length;
      if (size > 200 * 1024 ** 2) throw new Error('Git 安装包超过大小限制');
      hash.update(chunk); await handle.writeFile(chunk);
    } } finally { await handle.close(); }
    if (hash.digest('hex') !== asset.digest.slice(7) || (asset.size && size !== asset.size)) throw new Error('Git 安装包 SHA-256 或大小校验失败');
    log('Git 安装包 SHA-256 校验通过，正在解压便携版');
    const extracted = path.join(staging, 'git');
    await execute(installer, ['-y', '-gm2', '-InstallPath=' + extracted], { env, timeout: 5 * 60 * 1000 });
    await windowsGitEnvironment(env, execute, [extracted]);
    // Windows Move-Item refuses an existing destination; no concurrent tree is overwritten.
    const script = "$ErrorActionPreference='Stop'; if(Test-Path -LiteralPath " + psQuote(target) + ") { throw 'Git target already exists' }; Move-Item -LiteralPath " + psQuote(extracted) + ' -Destination ' + psQuote(target);
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, timeout: 30000 });
    published = true;
    const result = await windowsGitEnvironment(env, execute, [target]);
    log('Git for Windows 与 Git Bash 自动安装并验证完成');
    return result;
  } catch (error) {
    if (published) await fs.rm(target, { recursive: true, force: true });
    throw new Error('Git for Windows 自动安装失败：' + error.message + '。可重试或点击“下载 Git for Windows”手动安装。');
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(error => log('Git 临时目录清理失败：' + error.message));
  }
}
module.exports = { ensureWindowsGit, releaseURL };
