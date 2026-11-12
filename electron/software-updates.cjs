// Updates OneLinkAI itself. Agent updates live in agent-updates.cjs.
const DEFAULT_UPDATE_URL = 'https://www.onelinkai.cloud/api/desktop-updates/stable';

function updateFeed(baseURL, platform, arch) {
  const url = new URL(baseURL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('软件更新服务必须使用不含凭据、查询参数的 HTTPS 地址');
  }
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['x64', 'arm64', 'ia32', 'arm'].includes(arch)) {
    throw new Error('当前系统或架构暂不支持软件更新');
  }
  return `${url.href.replace(/\/$/, '')}/${platform}/${arch}/`;
}

function createSoftwareUpdates({ updater, dialog, getWindow = () => null, version,
  enabled = true, baseURL = DEFAULT_UPDATE_URL, apiURL, platform = process.platform, arch = process.arch }) {
  let state = { status: enabled ? 'idle' : 'disabled', currentVersion: version, latestVersion: null, percent: 0, error: null };
  let pending;
  let info;
  let setupError;
  const status = () => ({ ...state });
  const set = patch => { state = { ...state, ...patch }; };
  const failed = error => set({ status: 'error', error: error?.message || '软件更新失败，请重试' });
  const message = options => {
    const parent = getWindow();
    return parent && !parent.isDestroyed() ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
  };

  if (enabled) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableDifferentialDownload = true;
    updater.fullChangelog = false;
    // OS/architecture are selected by the main process, never by renderer input.
    updater.on('error', failed);
    updater.on('download-progress', progress => set({ percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))) }));
    updater.on('update-downloaded', () => set({ status: 'ready', percent: 100, error: null }));
    updater.on('update-preparing', () => set({ status: 'preparing', percent: 100 }));
    try {
      if (platform === 'darwin' && apiURL) {
        const { httpsURL, SoftwareUpdateApiProvider } = require('./software-update-provider.cjs');
        updater.setFeedURL({ provider: 'custom', updateProvider: SoftwareUpdateApiProvider, url: httpsURL(apiURL).href, arch });
      } else {
        updater.setFeedURL({ provider: 'generic', url: updateFeed(baseURL, platform, arch), useMultipleRangeRequest: false });
      }
    } catch (error) { setupError = error; failed(error); }
  }

  async function offerInstall() {
    const result = await message({ type: 'info', title: 'OneLinkAI 软件更新',
      message: `OneLinkAI ${state.latestVersion} 已下载完成`,
      detail: '重启后将使用完整安装包更新 OneLinkAI。请先保存当前工作。你的账号、服务商配置和配置备份会保留。',
      buttons: ['重启并安装', '稍后'], defaultId: 1, cancelId: 1, noLink: true });
    if (result.response === 0) {
      set({ status: 'installing' });
      updater.quitAndInstall(false, true);
    }
  }

  async function offerDownload() {
    const notes = typeof info?.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]*>/g, '').slice(0, 4000) : '';
    const result = await message({ type: 'info', title: 'OneLinkAI 软件更新',
      message: `发现 OneLinkAI 新版本 ${state.latestVersion}`,
      detail: `当前版本：${version}\n将下载完整安装包，完成后可选择重启安装。${notes ? '\n\n' + notes : ''}`,
      buttons: ['下载更新', '稍后'], defaultId: 1, cancelId: 1, noLink: true });
    if (result.response !== 0) return;
    set({ status: 'downloading', percent: 0, error: null });
    await updater.downloadUpdate();
    // Only the updater's verified update-downloaded event permits installation.
    if (state.status === 'ready') await offerInstall();
    else if (['downloading', 'preparing'].includes(state.status)) throw new Error('安装包尚未通过完整校验，请重新检查更新');
  }

  async function performCheck(manual) {
    if (!enabled) return status();
    try {
      if (setupError) throw setupError;
      if (state.status === 'ready') { if (manual) await offerInstall(); return status(); }
      if (state.status === 'available') { if (manual) await offerDownload(); return status(); }
      if (state.status === 'installing') return status();
      set({ status: 'checking', error: null });
      const result = await updater.checkForUpdates();
      if (!result) { set({ status: 'disabled' }); return status(); }
      info = result.updateInfo;
      // electron-updater owns semantic version comparison and prerelease policy.
      if (!result.isUpdateAvailable || require('semver').prerelease(info.version)) {
        set({ status: 'current', latestVersion: info.version });
        return status();
      }
      set({ status: 'available', latestVersion: info.version });
      await offerDownload();
    } catch (error) { failed(error); }
    return status();
  }

  function check(manual = false) {
    // Serialize checks, native dialogs, download and restart confirmation.
    if (!pending) pending = performCheck(manual).finally(() => { pending = null; });
    return pending;
  }
  return { status, check };
}

module.exports = { DEFAULT_UPDATE_URL, updateFeed, createSoftwareUpdates };
