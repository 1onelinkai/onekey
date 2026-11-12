const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const APP_ID = 'cloud.onelinkai.desktop';
const TEAM_ID = '7HHXUC392K';
const removeTemporary = target => fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

// No downloaded executable is run during preparation. All tools are OS binaries.
async function prepareDmgUpdate({ dmgFile, version, arch = process.arch, tempDir = os.tmpdir(), run = execute }) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('不支持的 macOS 更新架构');
  const root = await fs.mkdtemp(path.join(tempDir, 'onelink-dmg-'));
  const mount = path.join(root, 'mount');
  const zipFile = path.join(root, 'OneLinkAI.zip');
  await fs.mkdir(mount);
  let attached = false;
  let prepared = false;
  try {
    // Mark the mount as potentially attached even when hdiutil exits with an error.
    attached = true;
    await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmgFile], { timeout: 120000 });
    const applications = (await fs.readdir(mount, { withFileTypes: true })).filter(entry => entry.name.endsWith('.app'));
    if (applications.length !== 1 || !applications[0].isDirectory() || applications[0].isSymbolicLink()) throw new Error('DMG 必须包含唯一的应用目录');
    const application = path.join(mount, applications[0].name);
    const plist = path.join(application, 'Contents/Info.plist');
    const readPlist = async key => (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { timeout: 10000 })).stdout.trim();
    if (await readPlist('CFBundleIdentifier') !== APP_ID) throw new Error('DMG 内应用标识与 OneLinkAI 不一致');
    if (await readPlist('CFBundleShortVersionString') !== version) throw new Error('DMG 内应用版本与更新信息不一致');
    const executable = await readPlist('CFBundleExecutable');
    if (!executable || path.basename(executable) !== executable || executable.includes('\\') || executable === '..') throw new Error('应用可执行文件路径无效');
    const binary = await fs.realpath(path.join(application, 'Contents/MacOS', executable));
    const canonicalApplication = await fs.realpath(application);
    if (!binary.startsWith(canonicalApplication + path.sep)) throw new Error('应用可执行文件超出应用目录');
    const { stdout } = await run('/usr/bin/lipo', ['-archs', binary], { timeout: 10000 });
    if (!stdout.trim().split(/\s+/).includes(arch === 'x64' ? 'x86_64' : 'arm64')) throw new Error('DMG 内应用不支持当前架构');
    const requirement = `anchor apple generic and identifier "${APP_ID}" and certificate leaf[subject.OU] = "${TEAM_ID}"`;
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', `-R=${requirement}`, application], { timeout: 120000 });
    // ditto preserves bundle resources, symlinks and the existing code signature.
    await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, zipFile], { timeout: 10 * 60 * 1000 });
    prepared = true;
  } finally {
    if (attached) {
      try {
        await run('/usr/bin/hdiutil', ['detach', mount], { timeout: 30000 });
      } catch {
        try {
          await run('/usr/bin/hdiutil', ['detach', '-force', mount], { timeout: 30000 });
        } catch (cause) {
          // Never recursively remove a directory that may still contain a mount.
          const error = new Error(`无法卸载更新镜像，临时目录已保留：${root}`, { cause });
          error.preserveUpdateDirectory = true;
          throw error;
        }
      }
    }
    if (!prepared) await removeTemporary(root);
  }
  return { zipFile, cleanup: () => removeTemporary(root) };
}

// This adapter intentionally targets the pinned electron-updater 6.8.3 bridge.
// Override download/preparation only; Squirrel.Mac still installs the signed app.
function createMacDmgUpdaterClass(Base = require('electron-updater').MacUpdater) {
  return class MacDmgUpdater extends Base {
    constructor(options, app, { prepare = prepareDmgUpdate, tempDir = os.tmpdir(), arch = process.arch } = {}) {
      super(options, app);
      this.prepareDmg = prepare;
      this.preparationTemp = tempDir;
      this.updateArch = arch;
      this.preparedUpdate = null;
      this.activePreparation = null;
      this.currentCancellation = null;
    }

    async disposePreparedUpdate() {
      if (this.activePreparation) {
        this.currentCancellation?.cancel();
        await this.activePreparation.catch(() => {});
      }
      this.closeServerIfExists();
      const previous = this.preparedUpdate;
      this.preparedUpdate = null;
      if (previous) await previous.cleanup();
    }

    async doDownloadUpdate(options) {
      await this.disposePreparedUpdate();
      this.currentCancellation = options.cancellationToken;
      const preparation = this.downloadDmg(options);
      this.activePreparation = preparation;
      try { return await preparation; }
      finally {
        if (this.activePreparation === preparation) {
          this.activePreparation = null;
          this.currentCancellation = null;
        }
      }
    }

    async downloadDmg(options) {
      this.squirrelDownloadedUpdate = false;
      const { info, provider } = options.updateInfoAndProvider;
      const files = provider.resolveFiles(info).filter(file => file.info.format === 'dmg' || file.url.pathname.toLowerCase().endsWith('.dmg'));
      if (files.length !== 1) throw new Error('macOS 软件更新需要唯一的 DMG 安装包');
      const file = files[0];
      if (file.url.protocol !== 'https:' || file.url.username || file.url.password) throw new Error('软件安装包必须使用 HTTPS 下载地址');
      const root = await fs.mkdtemp(path.join(this.preparationTemp, 'onelink-update-download-'));
      const dmgFile = path.join(root, 'OneLinkAI.dmg');
      let prepared;
      try {
        await this.httpExecutor.download(file.url, dmgFile, {
          headers: options.requestHeaders, cancellationToken: options.cancellationToken,
          sha512: file.info.sha512, sha2: file.info.sha256,
          onProgress: progress => this.emit('download-progress', progress),
        });
        const size = (await fs.stat(dmgFile)).size;
        if (options.cancellationToken.cancelled) throw new Error('软件更新已取消');
        if (!size || (file.info.size != null && file.info.size !== size)) throw new Error('DMG 下载大小与更新信息不一致');
        this.emit('update-preparing');
        prepared = await this.prepareDmg({ dmgFile, version: info.version, arch: this.updateArch, tempDir: root });
        if (options.cancellationToken.cancelled) throw new Error('软件更新已取消');
        this.preparedUpdate = { cleanup: async () => { await prepared.cleanup(); await removeTemporary(root); } };
        const zipSize = (await fs.stat(prepared.zipFile)).size;
        if (!zipSize) throw new Error('本地更新包为空');
        // The native bridge receives the LOCAL zip's size, never the DMG's size.
        await this.updateDownloaded({ url: pathToFileURL(prepared.zipFile), info: { size: zipSize } }, { ...info, downloadedFile: prepared.zipFile });
        return [dmgFile];
      } catch (error) {
        this.closeServerIfExists();
        this.preparedUpdate = null;
        if (!error.preserveUpdateDirectory) {
          if (prepared) await prepared.cleanup();
          await removeTemporary(root);
        }
        throw error;
      }
    }
  };
}

module.exports = { APP_ID, TEAM_ID, prepareDmgUpdate, createMacDmgUpdaterClass };
