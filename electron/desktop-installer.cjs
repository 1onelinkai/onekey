const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');

const desktops = {
  vscode: { cask: 'visual-studio-code', app: 'Visual Studio Code.app', host: 'update.code.visualstudio.com' },
  zed: { cask: 'zed', app: 'Zed.app', host: 'github.com' },
  zcode: { cask: 'zcode', app: 'ZCode.app', host: 'cdn-zcode.z.ai' },
  'claude-desktop': { cask: 'claude', app: 'Claude.app', host: 'downloads.claude.ai' },
  workbuddy: { app: 'WorkBuddy.app', host: 'download.codebuddy.cn' },
};

function resolveArtifact(client, metadata, arch) {
  const spec = desktops[client];
  if (!spec || !['x64', 'arm64'].includes(arch)) throw new Error('不支持的桌面安装架构');
  const variant = arch === 'x64' ? metadata.variations?.sonoma || {} : {};
  const url = variant.url || metadata.url;
  const sha256 = variant.sha256 || metadata.sha256;
  if (!url || new URL(url).protocol !== 'https:' || new URL(url).hostname !== spec.host || !/^[a-f0-9]{64}$/.test(sha256 || '')) throw new Error('安装元数据的官方地址或 SHA-256 无效');
  if (arch === 'x64' && /arm64|aarch64/.test(url)) throw new Error('当前版本没有 Intel 安装包');
  if (arch === 'arm64' && /x86_64|macos-x64|\/darwin\/stable/.test(url)) throw new Error('当前版本没有 ARM 安装包');
  return { url, sha256, app: spec.app };
}

async function installDesktop({ client, home, root, system, fetcher, execute, log, state, detect, removeDirectory = fs.rm }) {
  if (system.platform !== 'darwin') throw new Error('桌面自动安装当前仅接入 macOS');
  const spec = desktops[client];
  state.phase = 'network';
  const metadataResponse = await fetcher(client === 'workbuddy' ? 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-' + system.arch : 'https://formulae.brew.sh/api/cask/' + spec.cask + '.json', { signal: AbortSignal.timeout(15000) });
  if (!metadataResponse.ok) throw new Error('安装版本元数据不可用：HTTP ' + metadataResponse.status);
  const metadata = await metadataResponse.json();
  if (client === 'workbuddy') metadata.sha256 = metadata.sha256hash;
  const artifact = resolveArtifact(client, metadata, system.arch);
  const routes = [{ name: '官方 CDN', url: artifact.url }];
  if (new URL(artifact.url).hostname === 'github.com') {
    for (const [name, prefix] of [['GHProxy', 'https://gh-proxy.com/'], ['GHFast', 'https://ghfast.top/']]) routes.push({ name, url: prefix + artifact.url });
  }
  state.routes = { downloads: routes.map(route => ({ ...route, available: false })) };
  const markDownloaded = route => {
    state.routes.downloads = state.routes.downloads.map(item => ({ ...item, selected: item.name === route.name, available: item.name === route.name }));
  };
  async function cleanTemporary(directory) {
    try { await removeDirectory(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (error) { log('临时文件清理未完成（不影响安装结果）：' + directory + '；' + error.message); }
  }
  const stage = await fs.mkdtemp(path.join(root, 'desktop-'));
  const cache = path.join(root, 'downloads');
  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const applications = path.join(home, 'Applications');
  const destination = path.join(applications, artifact.app);
  let mounted = false;
  const mount = path.join(stage, 'mount');
  try {
    const archive = path.join(cache, artifact.sha256 + (/\.zip(?:$|\?)/.test(artifact.url) || client === 'vscode' ? '.zip' : '.dmg'));
    let downloaded = false;
    for (const route of routes) {
      state.phase = 'downloading';
      log('下载安装包：' + route.name);
      try {
        const previous = await fs.lstat(archive).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new Error('下载缓存不是普通文件');
        let offset = previous?.size || 0;
        if (offset) {
          const cachedHash = crypto.createHash('sha256');
          for await (const chunk of createReadStream(archive)) cachedHash.update(chunk);
          if (cachedHash.digest('hex') === artifact.sha256) { log('已校验完整下载缓存'); markDownloaded(route); downloaded = true; break; }
        }
        if (offset) log('尝试断点续传：' + (offset / 1024 ** 2).toFixed(1) + ' MiB');
        const response = await fetcher(route.url, { redirect: 'follow', headers: offset ? { Range: 'bytes=' + offset + '-' } : {}, signal: AbortSignal.timeout(20 * 60 * 1000) });
        if (response.status === 416) {
          const hash = crypto.createHash('sha256');
          for await (const chunk of createReadStream(archive)) hash.update(chunk);
          if (hash.digest('hex') === artifact.sha256) { markDownloaded(route); downloaded = true; break; }
          await fs.rm(archive, { force: true }); throw new Error('下载缓存不完整，已清理，下次重新下载');
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (offset && response.status === 206 && !String(response.headers.get('content-range')).startsWith('bytes ' + offset + '-')) throw new Error('续传响应位置无效');
        if (response.status !== 206) offset = 0;
        const handle = await fs.open(archive, offset ? 'a' : 'w', 0o600);
        const hash = crypto.createHash('sha256');
        if (offset) for await (const chunk of createReadStream(archive)) hash.update(chunk);
        let bytes = offset; let last = 0;
        try {
          for await (const chunk of response.body) {
            bytes += chunk.length;
            if (bytes > 2 * 1024 ** 3) throw new Error('安装包超过 2 GiB 限制');
            hash.update(chunk); await handle.writeFile(chunk);
            if (Date.now() - last > 2000) { log('已下载 ' + (bytes / 1024 ** 2).toFixed(1) + ' MiB'); last = Date.now(); }
          }
        } finally { await handle.close(); }
        if (hash.digest('hex') !== artifact.sha256) { await fs.rm(archive, { force: true }); throw new Error('安装包 SHA-256 不匹配'); }
        markDownloaded(route);
        downloaded = true; break;
      } catch (error) { log(route.name + ' 失败：' + error.message); }
    }
    if (!downloaded) throw new Error('所有安装包线路失败，未写入应用目录');
    state.phase = 'extracting';
    let unpacked;
    if (archive.endsWith('.zip')) {
      unpacked = path.join(stage, 'extracted');
      await execute('/usr/bin/ditto', ['-x', '-k', archive, unpacked], { timeout: 120000 });
    } else {
      await fs.mkdir(mount);
      await execute('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, archive], { timeout: 120000 });
      mounted = true; unpacked = mount;
    }
    const source = path.join(unpacked, artifact.app);
    await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', source], { timeout: 120000 });
    const info = path.join(source, 'Contents/Info.plist');
    const executable = (await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', info], { timeout: 10000 })).trim();
    if (!executable || path.basename(executable) !== executable) throw new Error('应用命令入口无效');
    const binary = path.join(source, 'Contents/MacOS', executable);
    const architectures = await execute('/usr/bin/lipo', ['-archs', binary], { timeout: 30000 });
    if (!architectures.split(/\s+/).includes(system.arch === 'arm64' ? 'arm64' : 'x86_64')) throw new Error('安装包架构与硬件不匹配');
    const version = (await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', info], { timeout: 10000 })).trim();
    if (!/\d+\.\d+/.test(version)) throw new Error('安装包版本无效');
    const minimum = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', info], { timeout: 10000 }).catch(() => '');
    const osVersion = (await execute('/usr/bin/sw_vers', ['-productVersion'], { timeout: 10000 })).trim();
    const parts = value => value.trim().split('.').map(Number);
    const installedOS = parts(osVersion); const requiredOS = parts(minimum);
    if (/^\d+(\.\d+)*$/.test(minimum.trim())) {
      for (let index = 0; index < Math.max(installedOS.length, requiredOS.length); index++) {
        if ((installedOS[index] || 0) > (requiredOS[index] || 0)) break;
        if ((installedOS[index] || 0) < (requiredOS[index] || 0)) throw new Error('此安装包需要 macOS ' + minimum.trim() + '，当前系统 ' + osVersion);
      }
    }
    state.phase = 'installing';
    await fs.mkdir(applications, { recursive: true });
    if (await fs.lstat(destination).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false; })) throw new Error('目标位置已存在应用，停止以避免覆盖：' + destination);
    const temporary = path.join(applications, '.onelink-' + crypto.randomUUID() + '.app');
    try {
      await execute('/usr/bin/ditto', [source, temporary], { timeout: 180000 });
      await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', temporary], { timeout: 120000 });
      await fs.rename(temporary, destination);
    } finally { await cleanTemporary(temporary); }
    state.phase = 'verifying';
    state.detected = (await detect()).find(item => item.id === client && item.installed);
    if (!state.detected) throw new Error('应用已写入，但安装后检测失败：' + destination);
    log('安装完成：' + artifact.app + ' ' + version + '；签名和硬件架构已验证');
  } finally {
    if (mounted) await execute('/usr/bin/hdiutil', ['detach', mount], { timeout: 30000 }).catch(error => log('磁盘映像卸载失败：' + error.message));
    if (!mounted || !await fs.readdir(mount).then(items => items.length, () => 0)) await cleanTemporary(stage);
  }
}
module.exports = { desktops, resolveArtifact, installDesktop };
